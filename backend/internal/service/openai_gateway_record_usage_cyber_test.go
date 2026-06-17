//go:build unit

package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// TestOpenAIGatewayServiceRecordUsage_CyberBlockedShortCircuit
// 验证 phase-2 关键不变量：
//   1) RequestType = RequestTypeCyberBlocked（admin 报表可过滤）
//   2) 所有 tokens / costs = 0（安全阻断流量不计费）
//   3) 业务身份字段保留（user / api_key / account / model）
//   4) billing 链路完全跳过——不调 applyUsageBilling（billingRepo.calls == 0）
//   5) usage 日志仍写入（admin 可见来源），且 inserted=true 路径
func TestOpenAIGatewayServiceRecordUsage_CyberBlockedShortCircuit(t *testing.T) {
	usageRepo := &openAIRecordUsageLogRepoStub{inserted: true}
	billingRepo := &openAIRecordUsageBillingRepoStub{result: &UsageBillingApplyResult{Applied: true}}
	userRepo := &openAIRecordUsageUserRepoStub{}
	subRepo := &openAIRecordUsageSubRepoStub{}
	quotaSvc := &openAIRecordUsageAPIKeyQuotaStub{}
	svc := newOpenAIRecordUsageServiceWithBillingRepoForTest(usageRepo, billingRepo, userRepo, subRepo, nil)

	// 即使上游 usage 含 100/200 token，cyber-blocked 短路必须强制 tokens=0。
	err := svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
		Result: &OpenAIForwardResult{
			RequestID: "resp_cyber_blocked",
			Usage: OpenAIUsage{
				InputTokens:  100,
				OutputTokens: 200,
			},
			Model:    "gpt-5.1",
			Duration: time.Second,
		},
		APIKey:           &APIKey{ID: 10, Quota: 100, Group: &Group{RateMultiplier: 1}},
		User:             &User{ID: 20},
		Account:          &Account{ID: 30, Type: AccountTypeAPIKey, Name: "ban-target"},
		InboundEndpoint:  "/v1/responses",
		UpstreamEndpoint: "/v1/responses",
		UserAgent:        "test-ua",
		IPAddress:        "127.0.0.1",
		APIKeyService:    quotaSvc,
		CyberMark: &CyberPolicyMark{
			Verdict:        VerdictBlocked,
			Code:           "cyber_policy",
			Message:        "high-risk",
			UpstreamStatus: 400,
			UpstreamInTok:  100,
			UpstreamOutTok: 200,
		},
	})

	require.NoError(t, err)

	// (4) billing 链路必须 0 次：不计费、不扣余额、不消耗订阅、不更新 quota。
	require.Equal(t, 0, billingRepo.calls, "cyber-blocked must skip billing")
	require.Equal(t, 0, userRepo.deductCalls, "no balance deduction on cyber-blocked")
	require.Equal(t, 0, subRepo.incrementCalls, "no subscription increment on cyber-blocked")
	require.Equal(t, 0, quotaSvc.quotaCalls, "no quota update on cyber-blocked")
	require.Equal(t, 0, quotaSvc.rateLimitCalls, "no rate-limit update on cyber-blocked")

	// (5) usage 日志仍写入：admin 报表可见 cyber 阻断来源。
	require.Equal(t, 1, usageRepo.calls)
	require.NotNil(t, usageRepo.lastLog)
	log := usageRepo.lastLog

	// (3) 业务身份字段：定位"是谁、用哪个 key、哪个 account、哪个 model"。
	require.Equal(t, int64(20), log.UserID, "user_id preserved")
	require.Equal(t, int64(10), log.APIKeyID, "api_key_id preserved")
	require.Equal(t, int64(30), log.AccountID, "account_id preserved")
	require.Equal(t, "gpt-5.1", log.Model, "model preserved")
	require.Equal(t, "gpt-5.1", log.RequestedModel, "requested_model preserved")
	require.Equal(t, "resp_cyber_blocked", log.RequestID)
	require.NotNil(t, log.InboundEndpoint)
	require.Equal(t, "/v1/responses", *log.InboundEndpoint)
	require.NotNil(t, log.UserAgent)
	require.Equal(t, "test-ua", *log.UserAgent)
	require.NotNil(t, log.IPAddress)
	require.Equal(t, "127.0.0.1", *log.IPAddress)

	// (1) RequestType = cyber，覆盖 SyncRequestTypeAndLegacyFields 推断。
	require.Equal(t, RequestTypeCyberBlocked, log.RequestType, "request_type must be cyber")
	require.Equal(t, "cyber", log.RequestType.String())

	// (2) tokens / costs 全 0。
	require.Zero(t, log.InputTokens)
	require.Zero(t, log.OutputTokens)
	require.Zero(t, log.CacheCreationTokens)
	require.Zero(t, log.CacheReadTokens)
	require.Zero(t, log.ImageOutputTokens)
	require.Zero(t, log.InputCost)
	require.Zero(t, log.OutputCost)
	require.Zero(t, log.TotalCost)
	require.Zero(t, log.ActualCost)

	require.NotNil(t, log.BillingMode)
	require.Equal(t, string(BillingModeToken), *log.BillingMode)
}

// 非 Blocked verdict（Suspicious / None / nil CyberMark）必须走正常 billing 路径，
// 防止 phase-2 短路误伤合法流量。
func TestOpenAIGatewayServiceRecordUsage_NonBlockedDoesNotShortCircuit(t *testing.T) {
	cases := []struct {
		name string
		mark *CyberPolicyMark
	}{
		{"nil_mark", nil},
		{"none_verdict", &CyberPolicyMark{Verdict: VerdictNone}},
		{"suspicious_verdict", &CyberPolicyMark{Verdict: VerdictSuspicious}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			usageRepo := &openAIRecordUsageLogRepoStub{inserted: true}
			billingRepo := &openAIRecordUsageBillingRepoStub{result: &UsageBillingApplyResult{Applied: true}}
			userRepo := &openAIRecordUsageUserRepoStub{}
			subRepo := &openAIRecordUsageSubRepoStub{}
			quotaSvc := &openAIRecordUsageAPIKeyQuotaStub{}
			svc := newOpenAIRecordUsageServiceWithBillingRepoForTest(usageRepo, billingRepo, userRepo, subRepo, nil)

			err := svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
				Result: &OpenAIForwardResult{
					RequestID: "resp_normal",
					Usage:     OpenAIUsage{},
					Model:     "gpt-5.1",
					Duration:  time.Second,
				},
				APIKey:        &APIKey{ID: 1, Quota: 100, Group: &Group{RateMultiplier: 1}},
				User:          &User{ID: 2},
				Account:       &Account{ID: 3, Type: AccountTypeAPIKey},
				APIKeyService: quotaSvc,
				CyberMark:     tc.mark,
			})

			require.NoError(t, err)
			require.Equal(t, 1, billingRepo.calls, "normal path: billing must be called")
			require.Equal(t, 1, usageRepo.calls)
			require.NotNil(t, usageRepo.lastLog)
			// 非 cyber 路径 RequestType 不应被强制为 RequestTypeCyberBlocked。
			require.NotEqual(t, RequestTypeCyberBlocked, usageRepo.lastLog.RequestType,
				"non-blocked path must not set request_type=cyber")
		})
	}
}

// recordCyberBlockedUsage 在缺失关键身份字段时返回 error，避免写入"幽灵"日志行。
func TestRecordCyberBlockedUsage_MissingIdentityReturnsError(t *testing.T) {
	usageRepo := &openAIRecordUsageLogRepoStub{inserted: true}
	billingRepo := &openAIRecordUsageBillingRepoStub{result: &UsageBillingApplyResult{Applied: true}}
	userRepo := &openAIRecordUsageUserRepoStub{}
	subRepo := &openAIRecordUsageSubRepoStub{}
	svc := newOpenAIRecordUsageServiceWithBillingRepoForTest(usageRepo, billingRepo, userRepo, subRepo, nil)

	cases := []*OpenAIRecordUsageInput{
		// 缺 APIKey
		{
			Result:    &OpenAIForwardResult{RequestID: "r", Model: "m"},
			User:      &User{ID: 1},
			Account:   &Account{ID: 1},
			CyberMark: &CyberPolicyMark{Verdict: VerdictBlocked},
		},
		// 缺 User
		{
			Result:    &OpenAIForwardResult{RequestID: "r", Model: "m"},
			APIKey:    &APIKey{ID: 1, Group: &Group{RateMultiplier: 1}},
			Account:   &Account{ID: 1},
			CyberMark: &CyberPolicyMark{Verdict: VerdictBlocked},
		},
		// 缺 Account
		{
			Result:    &OpenAIForwardResult{RequestID: "r", Model: "m"},
			APIKey:    &APIKey{ID: 1, Group: &Group{RateMultiplier: 1}},
			User:      &User{ID: 1},
			CyberMark: &CyberPolicyMark{Verdict: VerdictBlocked},
		},
	}

	for i, tc := range cases {
		err := svc.RecordUsage(context.Background(), tc)
		require.Error(t, err, "case %d: must error on missing identity", i)
	}
}
