package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/telagod/subme/internal/pkg/antigravity"
	"github.com/telagod/subme/internal/pkg/claude"
	"github.com/telagod/subme/internal/pkg/geminicli"
)

const upstreamModelsBodyLimit int64 = 8 << 20

// UpstreamModelSyncErrorKind classifies model sync failures for safe HTTP mapping.
type UpstreamModelSyncErrorKind string

const (
	// UpstreamModelSyncErrorConfiguration means the account or server configuration cannot perform the sync.
	UpstreamModelSyncErrorConfiguration UpstreamModelSyncErrorKind = "configuration"
	// UpstreamModelSyncErrorUnsupported means the account format is intentionally unsupported for live model sync.
	UpstreamModelSyncErrorUnsupported UpstreamModelSyncErrorKind = "unsupported"
	// UpstreamModelSyncErrorUpstream means the configured upstream failed or returned an unusable response.
	UpstreamModelSyncErrorUpstream UpstreamModelSyncErrorKind = "upstream"
)

// UpstreamModelSyncError keeps internal failure details wrapped while exposing a safe client message.
type UpstreamModelSyncError struct {
	Kind    UpstreamModelSyncErrorKind
	Message string
	Err     error
}

func (e *UpstreamModelSyncError) Error() string {
	if e == nil {
		return ""
	}
	if e.Err == nil {
		return e.Message
	}
	return e.Message + ": " + e.Err.Error()
}

func (e *UpstreamModelSyncError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

// SafeMessage returns the sanitized message that can be sent to API clients.
func (e *UpstreamModelSyncError) SafeMessage() string {
	if e == nil || strings.TrimSpace(e.Message) == "" {
		return "Failed to sync upstream models"
	}
	return e.Message
}

func newUpstreamModelSyncConfigError(message string, err error) error {
	return &UpstreamModelSyncError{Kind: UpstreamModelSyncErrorConfiguration, Message: message, Err: err}
}

func newUpstreamModelSyncUnsupportedError(message string, err error) error {
	return &UpstreamModelSyncError{Kind: UpstreamModelSyncErrorUnsupported, Message: message, Err: err}
}

func newUpstreamModelSyncUpstreamError(message string, err error) error {
	return &UpstreamModelSyncError{Kind: UpstreamModelSyncErrorUpstream, Message: message, Err: err}
}

// FetchUpstreamSupportedModels fetches the live model list from the account's upstream API format.
func (s *AccountTestService) FetchUpstreamSupportedModels(ctx context.Context, account *Account) ([]string, error) {
	if s == nil {
		return nil, newUpstreamModelSyncConfigError("Account test service is not configured", nil)
	}
	if account == nil {
		return nil, newUpstreamModelSyncConfigError("Account is required", nil)
	}

	if account.Platform == PlatformAntigravity && account.Type != AccountTypeAPIKey {
		return s.fetchAntigravityOAuthUpstreamModels(ctx, account)
	}

	if s.httpUpstream == nil {
		return nil, newUpstreamModelSyncConfigError("Upstream HTTP client is not configured", nil)
	}

	req, buildErr := s.buildUpstreamModelsRequest(ctx, account)
	if buildErr != nil {
		return nil, buildErr
	}

	proxyAddr := resolveUpstreamModelsProxy(account)
	resp, doErr := s.executeUpstreamModelsRequest(req, proxyAddr, account)
	if doErr != nil {
		return nil, newUpstreamModelSyncUpstreamError("Failed to request upstream model list", doErr)
	}
	defer func() { _ = resp.Body.Close() }()

	payload, readErr := io.ReadAll(io.LimitReader(resp.Body, upstreamModelsBodyLimit+1))
	if readErr != nil {
		return nil, newUpstreamModelSyncUpstreamError("Failed to read upstream model list", readErr)
	}
	if int64(len(payload)) > upstreamModelsBodyLimit {
		return nil, newUpstreamModelSyncUpstreamError("Upstream model list response is too large", fmt.Errorf("response exceeds %d bytes", upstreamModelsBodyLimit))
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, newUpstreamModelSyncUpstreamError(
			fmt.Sprintf("Upstream model list request failed with HTTP %d", resp.StatusCode),
			fmt.Errorf("upstream model list returned HTTP %d", resp.StatusCode),
		)
	}

	ids, parseErr := parseUpstreamModelIDs(payload)
	if parseErr != nil {
		return nil, newUpstreamModelSyncUpstreamError("Upstream model list response was not valid JSON", parseErr)
	}
	if len(ids) == 0 {
		return nil, newUpstreamModelSyncUpstreamError("Upstream returned no supported models", nil)
	}

	return ids, nil
}

func (s *AccountTestService) buildUpstreamModelsRequest(ctx context.Context, account *Account) (*http.Request, error) {
	switch {
	case account.Platform == PlatformAntigravity:
		return s.buildAntigravityAPIKeyModelsRequest(ctx, account)
	case account.IsOpenAI():
		return s.buildOpenAIUpstreamModelsRequest(ctx, account)
	case account.IsGemini():
		return s.buildGeminiUpstreamModelsRequest(ctx, account)
	case account.IsAnthropic():
		return s.buildAnthropicUpstreamModelsRequest(ctx, account)
	default:
		return nil, newUpstreamModelSyncUnsupportedError(
			fmt.Sprintf("Unsupported platform for upstream model sync: %s", account.Platform), nil,
		)
	}
}

func (s *AccountTestService) buildAnthropicUpstreamModelsRequest(ctx context.Context, account *Account) (*http.Request, error) {
	if account.IsBedrock() || account.Type == AccountTypeServiceAccount {
		return nil, newUpstreamModelSyncUnsupportedError(
			fmt.Sprintf("Unsupported Anthropic account type for upstream model sync: %s", account.Type), nil,
		)
	}

	endpoint := "https://api.anthropic.com"
	authKey := ""
	authVal := ""
	betaFlag := ""

	if account.IsOAuth() {
		token := strings.TrimSpace(account.GetCredential("access_token"))
		if token == "" && s.claudeTokenProvider != nil {
			refreshed, refreshErr := s.claudeTokenProvider.GetAccessToken(ctx, account)
			if refreshErr != nil {
				return nil, newUpstreamModelSyncUpstreamError("Failed to get Anthropic access token", refreshErr)
			}
			token = strings.TrimSpace(refreshed)
		}
		if token == "" {
			return nil, newUpstreamModelSyncConfigError("No Anthropic access token is available", nil)
		}
		authKey = "Authorization"
		authVal = "Bearer " + token
		betaFlag = claude.DefaultBetaHeader
	} else if account.Type == AccountTypeAPIKey {
		apiKey := strings.TrimSpace(account.GetCredential("api_key"))
		if apiKey == "" {
			return nil, newUpstreamModelSyncConfigError("No Anthropic API key is available", nil)
		}
		endpoint = account.GetBaseURL()
		if strings.TrimSpace(endpoint) == "" {
			endpoint = "https://api.anthropic.com"
		}
		authKey = "x-api-key"
		authVal = apiKey
		betaFlag = claude.APIKeyBetaHeader
	} else {
		return nil, newUpstreamModelSyncUnsupportedError(
			fmt.Sprintf("Unsupported Anthropic account type for upstream model sync: %s", account.Type), nil,
		)
	}

	cleanEndpoint, validateErr := s.validateUpstreamBaseURL(endpoint)
	if validateErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid Anthropic base URL", validateErr)
	}
	req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, assembleV1ModelsURL(cleanEndpoint), nil)
	if reqErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid Anthropic model list URL", reqErr)
	}
	for hdr, hdrVal := range claude.DefaultHeaders {
		req.Header.Set(hdr, hdrVal)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("anthropic-beta", betaFlag)
	req.Header.Set(authKey, authVal)
	return req, nil
}

func (s *AccountTestService) buildAntigravityAPIKeyModelsRequest(ctx context.Context, account *Account) (*http.Request, error) {
	if account.Type != AccountTypeAPIKey {
		return nil, newUpstreamModelSyncUnsupportedError(
			fmt.Sprintf("Unsupported Antigravity account type for upstream model sync: %s", account.Type), nil,
		)
	}
	apiKey := strings.TrimSpace(account.GetCredential("api_key"))
	if apiKey == "" {
		return nil, newUpstreamModelSyncConfigError("No Antigravity API key is available", nil)
	}

	endpoint := strings.TrimRight(strings.TrimSpace(account.GetCredential("base_url")), "/")
	if endpoint == "" {
		return nil, newUpstreamModelSyncConfigError("Antigravity API-key base URL is required for upstream model sync", nil)
	}
	if !strings.HasSuffix(strings.ToLower(endpoint), "/antigravity") {
		return nil, newUpstreamModelSyncUnsupportedError(
			"Antigravity API-key upstream model sync requires a compatible gateway base URL ending in /antigravity; use Antigravity OAuth for official Cloud Code upstreams",
			nil,
		)
	}
	cleanEndpoint, validateErr := s.validateUpstreamBaseURL(endpoint)
	if validateErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid Antigravity base URL", validateErr)
	}

	req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, assembleV1ModelsURL(cleanEndpoint), nil)
	if reqErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid Antigravity model list URL", reqErr)
	}
	for hdr, hdrVal := range claude.DefaultHeaders {
		req.Header.Set(hdr, hdrVal)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("anthropic-beta", claude.APIKeyBetaHeader)
	req.Header.Set("x-api-key", apiKey)
	return req, nil
}

func (s *AccountTestService) buildOpenAIUpstreamModelsRequest(ctx context.Context, account *Account) (*http.Request, error) {
	if account.Type != AccountTypeAPIKey {
		return nil, newUpstreamModelSyncUnsupportedError(
			fmt.Sprintf("Unsupported OpenAI account type for upstream model sync: %s", account.Type), nil,
		)
	}
	apiKey := strings.TrimSpace(account.GetOpenAIApiKey())
	if apiKey == "" {
		return nil, newUpstreamModelSyncConfigError("No OpenAI API key is available", nil)
	}

	endpoint := account.GetOpenAIBaseURL()
	if strings.TrimSpace(endpoint) == "" {
		endpoint = "https://api.openai.com"
	}
	cleanEndpoint, validateErr := s.validateUpstreamBaseURL(endpoint)
	if validateErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid OpenAI base URL", validateErr)
	}

	req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, assembleOpenAIModelsURL(cleanEndpoint), nil)
	if reqErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid OpenAI model list URL", reqErr)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	return req, nil
}

func (s *AccountTestService) buildGeminiUpstreamModelsRequest(ctx context.Context, account *Account) (*http.Request, error) {
	endpoint := account.GetGeminiBaseURL(geminicli.AIStudioBaseURL)
	if strings.TrimSpace(endpoint) == "" {
		endpoint = geminicli.AIStudioBaseURL
	}
	cleanEndpoint, validateErr := s.validateUpstreamBaseURL(endpoint)
	if validateErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid Gemini base URL", validateErr)
	}

	req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, assembleGeminiModelsURL(cleanEndpoint), nil)
	if reqErr != nil {
		return nil, newUpstreamModelSyncConfigError("Invalid Gemini model list URL", reqErr)
	}
	req.Header.Set("Accept", "application/json")

	switch account.Type {
	case AccountTypeAPIKey:
		apiKey := strings.TrimSpace(account.GetCredential("api_key"))
		if apiKey == "" {
			return nil, newUpstreamModelSyncConfigError("No Gemini API key is available", nil)
		}
		req.Header.Set("x-goog-api-key", apiKey)
	case AccountTypeOAuth:
		if strings.TrimSpace(account.GetCredential("project_id")) != "" {
			return nil, newUpstreamModelSyncUnsupportedError("Gemini Code Assist model listing is not supported by this sync button", nil)
		}
		if s.geminiTokenProvider == nil {
			return nil, newUpstreamModelSyncConfigError("Gemini token provider is not configured", nil)
		}
		token, tokenErr := s.geminiTokenProvider.GetAccessToken(ctx, account)
		if tokenErr != nil {
			return nil, newUpstreamModelSyncUpstreamError("Failed to get Gemini access token", tokenErr)
		}
		token = strings.TrimSpace(token)
		if token == "" {
			return nil, newUpstreamModelSyncConfigError("No Gemini access token is available", nil)
		}
		req.Header.Set("Authorization", "Bearer "+token)
	default:
		return nil, newUpstreamModelSyncUnsupportedError(
			fmt.Sprintf("Unsupported Gemini account type for upstream model sync: %s", account.Type), nil,
		)
	}

	return req, nil
}

func (s *AccountTestService) fetchAntigravityOAuthUpstreamModels(ctx context.Context, account *Account) ([]string, error) {
	if s.antigravityGatewayService == nil || s.antigravityGatewayService.GetTokenProvider() == nil {
		return nil, newUpstreamModelSyncConfigError("Antigravity token provider is not configured", nil)
	}

	token, tokenErr := s.antigravityGatewayService.GetTokenProvider().GetAccessToken(ctx, account)
	if tokenErr != nil {
		return nil, newUpstreamModelSyncUpstreamError("Failed to get Antigravity access token", tokenErr)
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, newUpstreamModelSyncConfigError("No Antigravity access token is available", nil)
	}

	agClient, clientErr := antigravity.NewClient(resolveUpstreamModelsProxy(account))
	if clientErr != nil {
		return nil, newUpstreamModelSyncConfigError("Failed to configure Antigravity client", clientErr)
	}
	modelsResp, _, fetchErr := agClient.FetchAvailableModels(ctx, token, strings.TrimSpace(account.GetCredential("project_id")))
	if fetchErr != nil {
		return nil, newUpstreamModelSyncUpstreamError("Failed to fetch Antigravity available models", fetchErr)
	}
	if modelsResp == nil || len(modelsResp.Models) == 0 {
		return nil, newUpstreamModelSyncUpstreamError("Upstream returned no supported models", nil)
	}

	collected := make([]string, 0, len(modelsResp.Models))
	for modelID := range modelsResp.Models {
		collected = append(collected, strings.TrimSpace(modelID))
	}
	return uniqueSortedModelIDs(collected), nil
}

func (s *AccountTestService) executeUpstreamModelsRequest(req *http.Request, proxyAddr string, account *Account) (*http.Response, error) {
	if s.tlsFPProfileService == nil {
		return s.httpUpstream.DoWithTLS(req, proxyAddr, account.ID, account.Concurrency, nil)
	}
	return s.httpUpstream.DoWithTLS(req, proxyAddr, account.ID, account.Concurrency, s.tlsFPProfileService.ResolveTLSProfile(account))
}

func resolveUpstreamModelsProxy(account *Account) string {
	if account != nil && account.ProxyID != nil && account.Proxy != nil {
		return account.Proxy.URL()
	}
	return ""
}

func assembleV1ModelsURL(base string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(trimmed, "/v1/models") {
		return trimmed
	}
	if strings.HasSuffix(trimmed, "/v1") {
		return trimmed + "/models"
	}
	return trimmed + "/v1/models"
}

func assembleOpenAIModelsURL(base string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(trimmed, "/v1/models") {
		return trimmed
	}
	if strings.HasSuffix(trimmed, "/v1") {
		return trimmed + "/models"
	}
	return trimmed + "/v1/models"
}

func assembleGeminiModelsURL(base string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(trimmed, "/v1beta/models") {
		return trimmed
	}
	if strings.HasSuffix(trimmed, "/v1beta") {
		return trimmed + "/models"
	}
	return trimmed + "/v1beta/models"
}

type upstreamModelEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func parseUpstreamModelIDs(body []byte) ([]string, error) {
	var structured struct {
		Data   []upstreamModelEntry `json:"data"`
		Models []upstreamModelEntry `json:"models"`
	}
	if unmarshalErr := json.Unmarshal(body, &structured); unmarshalErr != nil {
		var flat []upstreamModelEntry
		if flatErr := json.Unmarshal(body, &flat); flatErr != nil {
			return nil, fmt.Errorf("unable to parse upstream model list: %w", unmarshalErr)
		}

		ids := make([]string, 0, len(flat))
		for _, entry := range flat {
			ids = append(ids, resolveModelEntryID(entry))
		}
		return uniqueSortedModelIDs(ids), nil
	}

	ids := make([]string, 0, len(structured.Data)+len(structured.Models))
	for _, entry := range structured.Data {
		ids = append(ids, resolveModelEntryID(entry))
	}
	for _, entry := range structured.Models {
		ids = append(ids, resolveModelEntryID(entry))
	}

	if len(ids) == 0 {
		var flat []upstreamModelEntry
		if flatErr := json.Unmarshal(body, &flat); flatErr == nil {
			for _, entry := range flat {
				ids = append(ids, resolveModelEntryID(entry))
			}
		}
	}

	return uniqueSortedModelIDs(ids), nil
}

func resolveModelEntryID(entry upstreamModelEntry) string {
	id := strings.TrimSpace(entry.ID)
	if id == "" {
		id = strings.TrimSpace(entry.Name)
	}
	return strings.TrimPrefix(id, "models/")
}

func uniqueSortedModelIDs(ids []string) []string {
	visited := make(map[string]struct{}, len(ids))
	deduplicated := make([]string, 0, len(ids))
	for _, id := range ids {
		trimmed := strings.TrimSpace(id)
		if trimmed == "" {
			continue
		}
		if _, already := visited[trimmed]; already {
			continue
		}
		visited[trimmed] = struct{}{}
		deduplicated = append(deduplicated, trimmed)
	}
	sort.Strings(deduplicated)
	return deduplicated
}
