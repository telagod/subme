//go:build unit

package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/imroc/req/v3"
	"github.com/stretchr/testify/require"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
)

// quotaAccountRepoStub satisfies AccountRepository via embedding; only GetByID
// is implemented because that's all OpenAIQuotaService.prepareUpstreamCall reads.
type quotaAccountRepoStub struct {
	AccountRepository // embed: unimplemented methods panic if invoked

	account *Account
	err     error
}

func (s *quotaAccountRepoStub) GetByID(_ context.Context, _ int64) (*Account, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.account, nil
}

// quotaTestProvider builds an OpenAIQuotaService wired to a stub repo + a
// no-op (or controllable) privacy client factory. The token provider is left
// nil — every test that needs a token configures the service directly.
func quotaServiceWithFactory(
	repo AccountRepository,
	tokenProvider *OpenAITokenProvider,
	factory PrivacyClientFactory,
) *OpenAIQuotaService {
	return &OpenAIQuotaService{
		accountRepo:          repo,
		proxyRepo:            nil,
		tokenProvider:        tokenProvider,
		privacyClientFactory: factory,
	}
}

// applicationErrorReason returns the stable reason string from an
// infraerrors.ApplicationError, or empty string if the type is wrong.
func applicationErrorReason(err error) string {
	var appErr *infraerrors.ApplicationError
	if errors.As(err, &appErr) {
		return appErr.Reason
	}
	return ""
}

func TestOpenAIQuotaService_QueryUsage_NotConfigured(t *testing.T) {
	// A zero service has nil deps → must surface OPENAI_QUOTA_NOT_CONFIGURED.
	svc := &OpenAIQuotaService{}
	_, err := svc.QueryUsage(context.Background(), 1)
	require.Error(t, err)
	require.Equal(t, "OPENAI_QUOTA_NOT_CONFIGURED", applicationErrorReason(err))
}

func TestOpenAIQuotaService_QueryUsage_AccountNotFound(t *testing.T) {
	repo := &quotaAccountRepoStub{account: nil}
	// Provide a non-nil token provider + factory so the nil-deps guard passes
	// and the AccountNotFound branch is the one tested.
	svc := quotaServiceWithFactory(
		repo,
		&OpenAITokenProvider{},
		func(_ string) (*req.Client, error) { return nil, errors.New("unused") },
	)

	_, err := svc.QueryUsage(context.Background(), 42)
	require.Error(t, err)
	require.Equal(t, "OPENAI_QUOTA_ACCOUNT_NOT_FOUND", applicationErrorReason(err))
}

func TestOpenAIQuotaService_QueryUsage_RejectsNonOpenAIPlatform(t *testing.T) {
	repo := &quotaAccountRepoStub{
		account: &Account{
			ID:       1,
			Platform: PlatformAnthropic, // wrong platform
			Type:     AccountTypeOAuth,
		},
	}
	svc := quotaServiceWithFactory(
		repo,
		&OpenAITokenProvider{},
		func(_ string) (*req.Client, error) { return nil, errors.New("unused") },
	)

	_, err := svc.QueryUsage(context.Background(), 1)
	require.Error(t, err)
	require.Equal(t, "OPENAI_QUOTA_INVALID_PLATFORM", applicationErrorReason(err))
}

func TestOpenAIQuotaService_QueryUsage_RejectsNonOAuthType(t *testing.T) {
	repo := &quotaAccountRepoStub{
		account: &Account{
			ID:       1,
			Platform: PlatformOpenAI,
			Type:     AccountTypeAPIKey, // wrong type
		},
	}
	svc := quotaServiceWithFactory(
		repo,
		&OpenAITokenProvider{},
		func(_ string) (*req.Client, error) { return nil, errors.New("unused") },
	)

	_, err := svc.QueryUsage(context.Background(), 1)
	require.Error(t, err)
	require.Equal(t, "OPENAI_QUOTA_INVALID_TYPE", applicationErrorReason(err))
}

func TestOpenAIQuotaService_QueryUsage_MissingChatGPTAccountID(t *testing.T) {
	repo := &quotaAccountRepoStub{
		account: &Account{
			ID:          1,
			Platform:    PlatformOpenAI,
			Type:        AccountTypeOAuth,
			Credentials: map[string]any{"access_token": "tok"}, // no account id
		},
	}
	svc := quotaServiceWithFactory(
		repo,
		&OpenAITokenProvider{},
		func(_ string) (*req.Client, error) { return nil, errors.New("unused") },
	)

	_, err := svc.QueryUsage(context.Background(), 1)
	require.Error(t, err)
	require.Equal(t, "OPENAI_QUOTA_MISSING_ACCOUNT_ID", applicationErrorReason(err))
}

func TestOpenAIQuotaService_QueryUsage_MissingChatGPTAccountIDFallsBackToOrgID(t *testing.T) {
	// organization_id should be used when chatgpt_account_id is empty. We don't
	// drive the full upstream flow here — verify that validation does not block
	// when only organization_id is present, by asserting we get a downstream
	// error (token / client) instead of MISSING_ACCOUNT_ID.
	repo := &quotaAccountRepoStub{
		account: &Account{
			ID:       1,
			Platform: PlatformOpenAI,
			Type:     AccountTypeOAuth,
			Credentials: map[string]any{
				"access_token":    "tok",
				"organization_id": "org-legacy",
				"expires_at":      "2099-01-01T00:00:00Z",
			},
		},
	}
	// Real token provider with no cache & no oauth: GetAccessToken should fall
	// through to credentials and return the embedded access_token.
	svc := quotaServiceWithFactory(
		repo,
		NewOpenAITokenProvider(nil, nil, nil),
		// Privacy factory returns an error to stop the flow before hitting
		// the network — we just need to know we passed the validation gate.
		func(_ string) (*req.Client, error) { return nil, errors.New("factory short-circuit") },
	)

	_, err := svc.QueryUsage(context.Background(), 1)
	require.Error(t, err)
	// We expect the error to come from the privacy client factory, NOT from
	// the missing account id validation.
	require.NotEqual(t, "OPENAI_QUOTA_MISSING_ACCOUNT_ID", applicationErrorReason(err))
	require.Equal(t, "OPENAI_QUOTA_CLIENT_ERROR", applicationErrorReason(err))
}

func TestOpenAIQuotaService_QueryUsage_SuccessParsesPayload(t *testing.T) {
	// Stand up a local HTTP server that mimics /wham/usage and verify that we
	// parse the credit count + rate-limit envelope.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sanity check key headers.
		require.Equal(t, "Bearer test-token", r.Header.Get("authorization"))
		require.Equal(t, "acct-1", r.Header.Get("chatgpt-account-id"))
		require.Equal(t, openaiQuotaCodexOriginator, r.Header.Get("originator"))

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"user_id": "u-1",
			"account_id": "acct-1",
			"email": "x@y",
			"plan_type": "plus",
			"rate_limit": {"allowed": true, "limit_reached": false},
			"rate_limit_reset_credits": {"available_count": 3}
		}`))
	}))
	defer server.Close()

	// Redirect chatGPTUsageURL via a custom test variant: we cannot reassign
	// the const, so instead we just hit the server directly through our
	// service by overriding the privacy factory to return a client that
	// rewrites every request URL to point at the test server. Simpler than
	// patching consts.
	svc := newQuotaServiceWithEndpointOverride(t, server.URL+"/wham/usage", "")

	usage, err := svc.QueryUsage(context.Background(), 1)
	require.NoError(t, err)
	require.NotNil(t, usage)
	require.NotNil(t, usage.RateLimitResetCredits)
	require.Equal(t, 3, usage.RateLimitResetCredits.AvailableCount)
	require.Equal(t, "plus", usage.PlanType)
	require.Positive(t, usage.FetchedAt)
}

func TestOpenAIQuotaService_QueryUsage_UpstreamUnauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"detail":"bad token"}`, http.StatusUnauthorized)
	}))
	defer server.Close()

	svc := newQuotaServiceWithEndpointOverride(t, server.URL+"/wham/usage", "")
	_, err := svc.QueryUsage(context.Background(), 1)
	require.Error(t, err)
	require.Equal(t, "OPENAI_QUOTA_UPSTREAM_ERROR", applicationErrorReason(err))
}

func TestOpenAIQuotaService_ResetCredit_SuccessConsumesOneCredit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "application/json", r.Header.Get("content-type"))
		require.Equal(t, "Bearer test-token", r.Header.Get("authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"code": "ok",
			"credit": {"id": "c-1", "reset_type": "rate_limit", "status": "redeemed"},
			"windows_reset": 2
		}`))
	}))
	defer server.Close()

	svc := newQuotaServiceWithEndpointOverride(t, "", server.URL+"/wham/rate-limit-reset-credits/consume")
	result, err := svc.ResetCredit(context.Background(), 1)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "ok", result.Code)
	require.Equal(t, 2, result.WindowsReset)
	require.NotNil(t, result.Credit)
	require.Equal(t, "c-1", result.Credit.ID)
}

// --- helpers ---

// newQuotaServiceWithEndpointOverride returns a quota service whose privacy
// client factory rewrites the upstream chatgpt.com URLs to the supplied test
// endpoints. Pass empty string to keep the real (unused) URL.
func newQuotaServiceWithEndpointOverride(t *testing.T, usageURL, resetURL string) *OpenAIQuotaService {
	t.Helper()
	repo := &quotaAccountRepoStub{
		account: &Account{
			ID:       1,
			Platform: PlatformOpenAI,
			Type:     AccountTypeOAuth,
			Credentials: map[string]any{
				"access_token":       "test-token",
				"chatgpt_account_id": "acct-1",
				"expires_at":         "2099-01-01T00:00:00Z",
			},
		},
	}
	factory := func(_ string) (*req.Client, error) {
		client := req.C()
		client.OnBeforeRequest(func(_ *req.Client, r *req.Request) error {
			// Redirect upstream URL to local test server transparently.
			switch {
			case usageURL != "" && strings.HasPrefix(r.RawURL, chatGPTUsageURL):
				r.RawURL = usageURL
			case resetURL != "" && strings.HasPrefix(r.RawURL, chatGPTRateLimitResetURL):
				r.RawURL = resetURL
			}
			return nil
		})
		return client, nil
	}
	return quotaServiceWithFactory(repo, NewOpenAITokenProvider(nil, nil, nil), factory)
}
