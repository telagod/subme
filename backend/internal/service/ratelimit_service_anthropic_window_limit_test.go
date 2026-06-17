//go:build unit

package service

import (
	"context"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// anthropicWindowLimitRepo 在 mockAccountRepoForGemini 之上覆写 SetRateLimited /
// SetTempUnschedulable，便于断言官方 window 限流优先于本地 temp-unsched 规则。
type anthropicWindowLimitRepo struct {
	mockAccountRepoForGemini
	rateLimitCalls     int
	tempUnschedCalls   int
	lastRateLimitReset time.Time
}

func (r *anthropicWindowLimitRepo) SetRateLimited(_ context.Context, _ int64, resetAt time.Time) error {
	r.rateLimitCalls++
	r.lastRateLimitReset = resetAt
	return nil
}

func (r *anthropicWindowLimitRepo) SetTempUnschedulable(_ context.Context, _ int64, _ time.Time, _ string) error {
	r.tempUnschedCalls++
	return nil
}

// TestHandleUpstreamError_AnthropicWindowLimitPreemptsTempUnschedRule 验证：
// 当 Anthropic 5h window 已 surpassed 阈值且带合法 reset 头时，
// 哪怕用户配置了一条匹配 429 + "rate limit" 关键字的 10 分钟 temp-unsched 规则，
// 也必须走 SetRateLimited 长冷却，而非被压成 10 分钟短停。
func TestHandleUpstreamError_AnthropicWindowLimitPreemptsTempUnschedRule(t *testing.T) {
	resetAt := time.Now().Add(3 * time.Hour).Truncate(time.Second)
	headers := http.Header{}
	headers.Set("anthropic-ratelimit-unified-5h-utilization", "1.02")
	headers.Set("anthropic-ratelimit-unified-5h-reset", strconv.FormatInt(resetAt.Unix(), 10))

	repo := &anthropicWindowLimitRepo{}
	svc := NewRateLimitService(repo, nil, nil, nil, nil)
	account := &Account{
		ID:       42,
		Type:     AccountTypeOAuth,
		Platform: PlatformAnthropic,
		Credentials: map[string]any{
			"temp_unschedulable_enabled": true,
			"temp_unschedulable_rules": []any{
				map[string]any{
					"error_code":       float64(http.StatusTooManyRequests),
					"keywords":         []any{"rate limit"},
					"duration_minutes": float64(10),
				},
			},
		},
	}

	svc.HandleUpstreamError(
		context.Background(),
		account,
		http.StatusTooManyRequests,
		headers,
		[]byte(`{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your account's rate limit. Please try again later."}}`),
	)

	require.Zero(t, repo.tempUnschedCalls, "official Anthropic window limits should not be shortened by local temp-unsched rules")
	require.Equal(t, 1, repo.rateLimitCalls)
	require.Equal(t, resetAt, repo.lastRateLimitReset)
}

// TestSelectAnthropicExhaustedWindow_Prefers7dOver5h 验证 7d 与 5h 同时耗尽时选 7d。
func TestSelectAnthropicExhaustedWindow_Prefers7dOver5h(t *testing.T) {
	now := time.Now()
	reset5h := now.Add(2 * time.Hour).Truncate(time.Second)
	reset7d := now.Add(5 * 24 * time.Hour).Truncate(time.Second)

	headers := http.Header{}
	headers.Set("anthropic-ratelimit-unified-5h-utilization", "1.0")
	headers.Set("anthropic-ratelimit-unified-5h-reset", strconv.FormatInt(reset5h.Unix(), 10))
	headers.Set("anthropic-ratelimit-unified-7d-utilization", "1.0")
	headers.Set("anthropic-ratelimit-unified-7d-reset", strconv.FormatInt(reset7d.Unix(), 10))

	got := selectAnthropicExhaustedWindow(headers, now)
	require.NotNil(t, got)
	require.Equal(t, "7d", got.window)
	require.Equal(t, reset7d, got.resetAt)
}

// TestSelectAnthropicExhaustedWindow_5hRejectedStatus 验证 5h-status=rejected 也能触发。
func TestSelectAnthropicExhaustedWindow_5hRejectedStatus(t *testing.T) {
	now := time.Now()
	reset5h := now.Add(45 * time.Minute).Truncate(time.Second)

	headers := http.Header{}
	headers.Set("anthropic-ratelimit-unified-5h-status", "rejected")
	headers.Set("anthropic-ratelimit-unified-5h-reset", strconv.FormatInt(reset5h.Unix(), 10))

	got := selectAnthropicExhaustedWindow(headers, now)
	require.NotNil(t, got)
	require.Equal(t, "5h", got.window)
	require.Equal(t, reset5h, got.resetAt)
}

// TestSelectAnthropicExhaustedWindow_NoSignal 验证：没有任何耗尽信号时返回 nil。
func TestSelectAnthropicExhaustedWindow_NoSignal(t *testing.T) {
	now := time.Now()
	headers := http.Header{}
	headers.Set("anthropic-ratelimit-unified-5h-utilization", "0.3")
	headers.Set("anthropic-ratelimit-unified-5h-reset", strconv.FormatInt(now.Add(1*time.Hour).Unix(), 10))

	got := selectAnthropicExhaustedWindow(headers, now)
	require.Nil(t, got)
}

// TestParseAnthropicWindowReset_OutOfBoundsRejected 验证脏的超长 reset 被丢弃，
// 避免一次解析错误把账号锁很久。
func TestParseAnthropicWindowReset_OutOfBoundsRejected(t *testing.T) {
	now := time.Now()
	// 5h window 上限是 6h；这里给 12h 应被拒。
	tooFar := now.Add(12 * time.Hour)
	headers := http.Header{}
	headers.Set("anthropic-ratelimit-unified-5h-reset", strconv.FormatInt(tooFar.Unix(), 10))

	_, ok := parseAnthropicWindowReset(headers, "5h", now)
	require.False(t, ok)
}

// TestParseAnthropicWindowReset_AcceptsMilliseconds 验证毫秒级时间戳被正确折算。
func TestParseAnthropicWindowReset_AcceptsMilliseconds(t *testing.T) {
	now := time.Now()
	reset := now.Add(30 * time.Minute).Truncate(time.Second)
	headers := http.Header{}
	headers.Set("anthropic-ratelimit-unified-5h-reset", strconv.FormatInt(reset.UnixMilli(), 10))

	got, ok := parseAnthropicWindowReset(headers, "5h", now)
	require.True(t, ok)
	require.Equal(t, reset, got)
}

// TestShouldPersistAnthropicWindowLimit_KeepsLongerExistingCooldown 验证：
// 当现有 reset 已经比官方 window 更晚时，不应被覆写为更短的值。
func TestShouldPersistAnthropicWindowLimit_KeepsLongerExistingCooldown(t *testing.T) {
	now := time.Now()
	longer := now.Add(8 * time.Hour)
	limit := &anthropicWindowLimit{
		window:  "5h",
		resetAt: now.Add(2 * time.Hour),
		reason:  "anthropic_5h_window_exhausted",
	}
	account := &Account{
		ID:               42,
		Platform:         PlatformAnthropic,
		RateLimitResetAt: &longer,
	}
	require.False(t, shouldPersistAnthropicWindowLimit(account, limit, now))
}
