package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/telagod/subme/internal/pkg/logger"
	"github.com/telagod/subme/internal/util/responseheaders"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

func (s *OpenAIGatewayService) ForwardEmbeddings(
	ctx context.Context,
	c *gin.Context,
	account *Account,
	body []byte,
	defaultMappedModel string,
) (*OpenAIForwardResult, error) {
	began := time.Now()

	reqModel := strings.TrimSpace(gjson.GetBytes(body, "model").String())
	if reqModel == "" {
		writeOpenAIEmbeddingsError(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return nil, fmt.Errorf("missing model in request")
	}

	billModel := resolveOpenAIForwardModel(account, reqModel, defaultMappedModel)
	upModel := normalizeOpenAIModelForUpstream(account, billModel)
	payload := body
	if upModel != reqModel {
		payload = ReplaceModelInBody(body, upModel)
	}

	logger.L().Debug("openai embeddings: forwarding",
		zap.Int64("account_id", account.ID),
		zap.String("original_model", reqModel),
		zap.String("billing_model", billModel),
		zap.String("upstream_model", upModel),
	)

	authKey := account.GetOpenAIApiKey()
	if authKey == "" {
		return nil, fmt.Errorf("account %d missing api_key", account.ID)
	}
	origin := account.GetOpenAIBaseURL()
	if origin == "" {
		origin = "https://api.openai.com"
	}
	checkedURL, urlErr := s.validateUpstreamBaseURL(origin)
	if urlErr != nil {
		return nil, fmt.Errorf("invalid base_url: %w", urlErr)
	}
	endpoint := buildOpenAIEmbeddingsURL(checkedURL)

	detachedCtx, releaseCtx := decoupleUpstreamContext(ctx)
	req, reqErr := http.NewRequestWithContext(detachedCtx, http.MethodPost, endpoint, bytes.NewReader(payload))
	releaseCtx()
	if reqErr != nil {
		return nil, fmt.Errorf("build upstream request: %w", reqErr)
	}
	req = req.WithContext(WithHTTPUpstreamProfile(req.Context(), HTTPUpstreamProfileOpenAI))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+authKey)
	req.Header.Set("Accept", "application/json")

	for hdr, vals := range c.Request.Header {
		if openaiCCRawAllowedHeaders[strings.ToLower(hdr)] {
			for _, val := range vals {
				req.Header.Add(hdr, val)
			}
		}
	}
	if ua := account.GetOpenAIUserAgent(); ua != "" {
		req.Header.Set("user-agent", ua)
	}

	proxyAddr := ""
	if account.Proxy != nil {
		proxyAddr = account.Proxy.URL()
	}
	resp, doErr := s.httpUpstream.Do(req, proxyAddr, account.ID, account.Concurrency)
	if doErr != nil {
		sanitized := sanitizeUpstreamErrorMessage(doErr.Error())
		setOpsUpstreamError(c, 0, sanitized, "")
		appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
			Platform:           account.Platform,
			AccountID:          account.ID,
			AccountName:        account.Name,
			UpstreamStatusCode: 0,
			Kind:               "request_error",
			Message:            sanitized,
		})
		writeOpenAIEmbeddingsError(c, http.StatusBadGateway, "upstream_error", "Upstream request failed")
		return nil, fmt.Errorf("upstream request failed: %s", sanitized)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		errBody := s.readUpstreamErrorBody(resp)
		_ = resp.Body.Close()
		resp.Body = io.NopCloser(bytes.NewReader(errBody))

		upstreamErrMsg := sanitizeUpstreamErrorMessage(strings.TrimSpace(extractUpstreamErrorMessage(errBody)))
		if s.shouldFailoverOpenAIUpstreamResponse(resp.StatusCode, upstreamErrMsg, errBody) {
			detail := ""
			if s.cfg != nil && s.cfg.Gateway.LogUpstreamErrorBody {
				limit := s.cfg.Gateway.LogUpstreamErrorBodyMaxBytes
				if limit <= 0 {
					limit = 2048
				}
				detail = truncateString(string(errBody), limit)
			}
			appendOpsUpstreamError(c, OpsUpstreamErrorEvent{
				Platform:           account.Platform,
				AccountID:          account.ID,
				AccountName:        account.Name,
				UpstreamStatusCode: resp.StatusCode,
				UpstreamRequestID:  resp.Header.Get("x-request-id"),
				Kind:               "failover",
				Message:            upstreamErrMsg,
				Detail:             detail,
			})
			s.handleOpenAIAccountUpstreamError(ctx, account, resp.StatusCode, resp.Header, errBody, upModel)
			return nil, &UpstreamFailoverError{
				StatusCode:             resp.StatusCode,
				ResponseBody:           errBody,
				RetryableOnSameAccount: account.IsPoolMode() && account.IsPoolModeRetryableStatus(resp.StatusCode),
			}
		}
		writeOpenAIEmbeddingsUpstreamResponse(c, resp, errBody, s.responseHeaderFilter)
		return nil, fmt.Errorf("upstream returned status %d", resp.StatusCode)
	}

	respPayload, readErr := ReadUpstreamResponseBody(resp.Body, s.cfg, c, openAITooLargeError)
	if readErr != nil {
		if !errors.Is(readErr, ErrUpstreamResponseBodyTooLarge) {
			writeOpenAIEmbeddingsError(c, http.StatusBadGateway, "api_error", "Failed to read upstream response")
		}
		return nil, fmt.Errorf("read upstream body: %w", readErr)
	}

	writeOpenAIEmbeddingsUpstreamResponse(c, resp, respPayload, s.responseHeaderFilter)

	return &OpenAIForwardResult{
		RequestID:     firstNonEmptyString(resp.Header.Get("x-request-id"), resp.Header.Get("request-id")),
		Usage:         extractOpenAIEmbeddingsUsage(respPayload),
		Model:         reqModel,
		BillingModel:  billModel,
		UpstreamModel: upModel,
		Stream:        false,
		Duration:      time.Since(began),
	}, nil
}

func writeOpenAIEmbeddingsUpstreamResponse(c *gin.Context, resp *http.Response, payload []byte, headerFilter *responseheaders.CompiledHeaderFilter) {
	if c == nil || resp == nil {
		return
	}
	if c.Writer.Written() {
		return
	}
	if resp.Header != nil {
		responseheaders.WriteFilteredHeaders(c.Writer.Header(), resp.Header, headerFilter)
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Writer.Header().Set("Content-Type", contentType)
	c.Writer.WriteHeader(resp.StatusCode)
	_, _ = c.Writer.Write(payload)
}

func writeOpenAIEmbeddingsError(c *gin.Context, code int, errKind, msg string) {
	c.JSON(code, gin.H{
		"error": gin.H{
			"type":    errKind,
			"message": msg,
		},
	})
}

func extractOpenAIEmbeddingsUsage(payload []byte) OpenAIUsage {
	usageResult := gjson.GetBytes(payload, "usage")
	if !usageResult.Exists() || !usageResult.IsObject() {
		return OpenAIUsage{}
	}
	promptTokens := firstPositiveGJSONInt(
		usageResult.Get("prompt_tokens"),
		usageResult.Get("input_tokens"),
		usageResult.Get("total_tokens"),
	)
	completionTokens := firstPositiveGJSONInt(
		usageResult.Get("completion_tokens"),
		usageResult.Get("output_tokens"),
	)
	cachedRead := firstPositiveGJSONInt(
		usageResult.Get("prompt_tokens_details.cached_tokens"),
		usageResult.Get("input_tokens_details.cached_tokens"),
		usageResult.Get("cache_read_tokens"),
		usageResult.Get("cache_read_input_tokens"),
	)
	cachedCreation := firstPositiveGJSONInt(
		usageResult.Get("cache_creation_tokens"),
		usageResult.Get("cache_creation_input_tokens"),
		usageResult.Get("input_tokens_details.cache_creation_tokens"),
	)
	// 多模态 embedding（如 doubao-embedding-vision）回传图文 token 拆分，
	// 用于图文不同价计费；纯文本 embedding 该字段为 0，行为不变。
	imageInputTokens := firstPositiveGJSONInt(
		usageResult.Get("prompt_tokens_details.image_tokens"),
		usageResult.Get("input_tokens_details.image_tokens"),
	)
	return OpenAIUsage{
		InputTokens:              promptTokens,
		ImageInputTokens:         imageInputTokens,
		OutputTokens:             completionTokens,
		CacheReadInputTokens:     cachedRead,
		CacheCreationInputTokens: cachedCreation,
	}
}

func firstPositiveGJSONInt(results ...gjson.Result) int {
	for _, r := range results {
		if !r.Exists() {
			continue
		}
		val := int(r.Int())
		if val > 0 {
			return val
		}
	}
	return 0
}

func buildOpenAIEmbeddingsURL(base string) string {
	return buildOpenAIEndpointURL(base, "/v1/embeddings")
}
