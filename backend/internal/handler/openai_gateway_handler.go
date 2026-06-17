package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/telagod/subme/internal/config"
	"github.com/telagod/subme/internal/pkg/ctxkey"
	pkghttputil "github.com/telagod/subme/internal/pkg/httputil"
	"github.com/telagod/subme/internal/pkg/ip"
	"github.com/telagod/subme/internal/pkg/logger"
	middleware2 "github.com/telagod/subme/internal/server/middleware"
	"github.com/telagod/subme/internal/service"

	coderws "github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// OpenAIGatewayHandler handles OpenAI API gateway requests
type OpenAIGatewayHandler struct {
	gatewayService           *service.OpenAIGatewayService
	billingCacheService      *service.BillingCacheService
	apiKeyService            *service.APIKeyService
	usageRecordWorkerPool    *service.UsageRecordWorkerPool
	errorPassthroughService  *service.ErrorPassthroughService
	contentModerationService *service.ContentModerationService
	concurrencyHelper        *ConcurrencyHelper
	imageLimiter             *imageConcurrencyLimiter
	maxAccountSwitches       int
	cfg                      *config.Config
}

type modelBodyReplacer func([]byte, string) []byte

func newMappedBodyCache(original []byte, replace modelBodyReplacer) func(mapped bool, model string) []byte {
	cache := make(map[string][]byte)
	return func(mapped bool, model string) []byte {
		if !mapped {
			return original
		}
		if b, ok := cache[model]; ok {
			return b
		}
		b := replace(original, model)
		cache[model] = b
		return b
	}
}

func lookupOpenAIMessagesDispatchMappedModel(apiKey *service.APIKey, requestedModel string) string {
	if apiKey == nil || apiKey.Group == nil {
		return ""
	}
	return strings.TrimSpace(apiKey.Group.ResolveMessagesDispatchModel(requestedModel))
}

func buildUsageRecordContext(parent context.Context, base context.Context) context.Context {
	if base == nil {
		base = context.Background()
	}
	if parent == nil {
		return base
	}
	if cid, _ := parent.Value(ctxkey.ClientRequestID).(string); strings.TrimSpace(cid) != "" {
		base = context.WithValue(base, ctxkey.ClientRequestID, strings.TrimSpace(cid))
	}
	if rid, _ := parent.Value(ctxkey.RequestID).(string); strings.TrimSpace(rid) != "" {
		base = context.WithValue(base, ctxkey.RequestID, strings.TrimSpace(rid))
	}
	return base
}

func enrichUsageRecordTask(parent context.Context, task service.UsageRecordTask) service.UsageRecordTask {
	if task == nil {
		return nil
	}
	return func(ctx context.Context) {
		task(buildUsageRecordContext(parent, ctx))
	}
}

// NewOpenAIGatewayHandler creates a new OpenAIGatewayHandler
func NewOpenAIGatewayHandler(
	gatewayService *service.OpenAIGatewayService,
	concurrencyService *service.ConcurrencyService,
	billingCacheService *service.BillingCacheService,
	apiKeyService *service.APIKeyService,
	usageRecordWorkerPool *service.UsageRecordWorkerPool,
	errorPassthroughService *service.ErrorPassthroughService,
	contentModerationService *service.ContentModerationService,
	cfg *config.Config,
) *OpenAIGatewayHandler {
	heartbeatInterval := time.Duration(0)
	accountRetries := 3
	if cfg != nil {
		heartbeatInterval = time.Duration(cfg.Concurrency.PingInterval) * time.Second
		if cfg.Gateway.MaxAccountSwitches > 0 {
			accountRetries = cfg.Gateway.MaxAccountSwitches
		}
	}
	return &OpenAIGatewayHandler{
		gatewayService:           gatewayService,
		billingCacheService:      billingCacheService,
		apiKeyService:            apiKeyService,
		usageRecordWorkerPool:    usageRecordWorkerPool,
		errorPassthroughService:  errorPassthroughService,
		contentModerationService: contentModerationService,
		concurrencyHelper:        NewConcurrencyHelper(concurrencyService, SSEPingFormatComment, heartbeatInterval),
		imageLimiter:             &imageConcurrencyLimiter{},
		maxAccountSwitches:       accountRetries,
		cfg:                      cfg,
	}
}

// Responses handles OpenAI Responses API endpoint
// POST /openai/v1/responses
func (h *OpenAIGatewayHandler) Responses(c *gin.Context) {
	// Local panic guard: prevent any panic inside this handler from
	// propagating to the process-level recovery.
	streamStarted := false
	defer h.recoverResponsesPanic(c, &streamStarted)
	compactStart := time.Now()
	defer h.logOpenAIRemoteCompactOutcome(c, compactStart)
	setOpenAIClientTransportHTTP(c)

	reqStart := time.Now()

	// Authenticate via middleware-injected API key
	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}

	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "User context not found")
		return
	}
	reqLog := requestLogger(
		c,
		"handler.openai_gateway.responses",
		zap.Int64("user_id", subject.UserID),
		zap.Int64("api_key_id", apiKey.ID),
		zap.Any("group_id", apiKey.GroupID),
	)
	if !h.ensureResponsesDependencies(c, reqLog) {
		return
	}

	// Read the request payload
	rawBody, readErr := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if readErr != nil {
		if maxErr, ok := extractMaxBytesError(readErr); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return
	}

	if len(rawBody) == 0 {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body is empty")
		return
	}

	assignOpsRequestContext(c, "", false)
	hashInput := rawBody
	if service.IsOpenAIResponsesCompactPathForTest(c) {
		if seed := strings.TrimSpace(gjson.GetBytes(rawBody, "prompt_cache_key").String()); seed != "" {
			c.Set(service.OpenAICompactSessionSeedKeyForTest(), seed)
		}
		normalized, wasNormalized, normErr := service.NormalizeOpenAICompactRequestBodyForTest(rawBody)
		if normErr != nil {
			h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to normalize compact request body")
			return
		}
		if wasNormalized {
			rawBody = normalized
		}
	}

	// Validate JSON structure
	if !gjson.ValidBytes(rawBody) {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse request body")
		return
	}

	// Extract the model field using gjson (read-only, avoids full unmarshal)
	modelField := gjson.GetBytes(rawBody, "model")
	if !modelField.Exists() || modelField.Type != gjson.String || modelField.String() == "" {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return
	}
	requestedModel := modelField.String()

	isStream, ok := parseOpenAICompatibleStream(rawBody)
	if !ok {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", invalidStreamFieldTypeMessage)
		return
	}
	reqLog = reqLog.With(zap.String("model", requestedModel), zap.Bool("stream", isStream))
	prevRespID := strings.TrimSpace(gjson.GetBytes(rawBody, "previous_response_id").String())
	if prevRespID != "" {
		idKind := service.ClassifyOpenAIPreviousResponseIDKind(prevRespID)
		reqLog = reqLog.With(
			zap.Bool("has_previous_response_id", true),
			zap.String("previous_response_id_kind", idKind),
			zap.Int("previous_response_id_len", len(prevRespID)),
		)
		if idKind == service.OpenAIPreviousResponseIDKindMessageID {
			reqLog.Warn("openai.request_validation_failed",
				zap.String("reason", "previous_response_id_looks_like_message_id"),
			)
			h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "previous_response_id must be a response.id (resp_*), not a message id")
			return
		}
		reqLog.Warn("openai.request_validation_failed",
			zap.String("reason", "previous_response_id_requires_wsv2"),
		)
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "previous_response_id is only supported on Responses WebSocket v2")
		return
	}

	assignOpsRequestContext(c, requestedModel, isStream)
	setOpsEndpointContext(c, "", int16(service.RequestTypeFromLegacy(isStream, false)))

	if verdict := h.checkContentModeration(c, reqLog, apiKey, subject, service.ContentModerationProtocolOpenAIResponses, requestedModel, rawBody); verdict != nil && verdict.Blocked {
		h.errorResponse(c, contentModerationStatus(verdict), contentModerationErrorCode(verdict), verdict.Message)
		return
	}

	wantsImage := service.IsImageGenerationIntent("/v1/responses", requestedModel, rawBody)
	if wantsImage && !service.GroupAllowsImageGeneration(apiKey.Group) {
		h.errorResponse(c, http.StatusForbidden, "permission_error", service.ImageGenerationPermissionMessage())
		return
	}
	var imgRelease func()
	if wantsImage {
		var imgOK bool
		imgRelease, imgOK = h.acquireImageGenerationSlot(c, streamStarted)
		if !imgOK {
			return
		}
		if imgRelease != nil {
			defer imgRelease()
		}
	}

	// Resolve channel-level model mapping
	channelMap, _ := h.gatewayService.ResolveChannelMappingAndRestrict(c.Request.Context(), apiKey.GroupID, requestedModel)
	fwdBodyForResponses := rawBody
	if channelMap.Mapped {
		fwdBodyForResponses = h.gatewayService.ReplaceModelInBody(rawBody, channelMap.MappedModel)
	}

	// Pre-validate function_call_output context to avoid upstream 400s.
	if !h.validateFunctionCallOutputRequest(c, rawBody, reqLog) {
		return
	}

	// Bind error passthrough service so the service layer can apply passthrough rules.
	if h.errorPassthroughService != nil {
		service.BindErrorPassthroughService(c, h.errorPassthroughService)
	}

	// Get subscription info (may be nil)
	subscription, _ := middleware2.GetSubscriptionFromContext(c)

	service.SetOpsLatencyMs(c, service.OpsAuthLatencyMsKey, time.Since(reqStart).Milliseconds())
	routeStart := time.Now()

	userRelease, slotOK := h.acquireResponsesUserSlot(c, subject.UserID, subject.Concurrency, isStream, &streamStarted, reqLog)
	if !slotOK {
		return
	}
	// Release user slot on request cancellation to prevent leaks on long-lived connections.
	if userRelease != nil {
		defer userRelease()
	}

	// Re-check billing after wait
	if billingErr := h.billingCacheService.CheckBillingEligibility(c.Request.Context(), apiKey.User, apiKey, apiKey.Group, subscription, service.QuotaPlatform(c.Request.Context(), apiKey)); billingErr != nil {
		reqLog.Info("openai.billing_eligibility_check_failed", zap.Error(billingErr))
		code, errType, msg, retry := billingErrorDetails(billingErr)
		if retry > 0 {
			c.Header("Retry-After", strconv.Itoa(retry))
		}
		h.handleStreamingAwareError(c, code, errType, msg, streamStarted)
		return
	}

	// Generate session hash (header first; fallback to prompt_cache_key)
	sessHash := h.gatewayService.GenerateSessionHash(c, hashInput)
	needsCompact := isOpenAIRemoteCompactPath(c)

	retryLimit := h.maxAccountSwitches
	switchesDone := 0
	excludedAccounts := make(map[int64]struct{})
	perAccountRetries := make(map[int64]int)
	var lastFailover *service.UpstreamFailoverError

	for {
		// Select an account that supports the requested model
		reqLog.Debug("openai.account_selecting", zap.Int("excluded_account_count", len(excludedAccounts)))
		picked, scheduleMeta, selectErr := h.gatewayService.SelectAccountWithSchedulerForCapability(
			c.Request.Context(),
			apiKey.GroupID,
			prevRespID,
			sessHash,
			requestedModel,
			excludedAccounts,
			service.OpenAIUpstreamTransportAny,
			service.OpenAIEndpointCapabilityChatCompletions,
			needsCompact,
		)
		if selectErr != nil {
			reqLog.Warn("openai.account_select_failed",
				zap.Error(selectErr),
				zap.Int("excluded_account_count", len(excludedAccounts)),
			)
			if len(excludedAccounts) == 0 {
				markOpsRoutingCapacityLimitedIfNoAvailableV2(c, selectErr)
				if errors.Is(selectErr, service.ErrNoAvailableCompactAccounts) {
					h.handleStreamingAwareError(c, http.StatusServiceUnavailable, "compact_not_supported", "No available OpenAI accounts support /responses/compact", streamStarted)
					return
				}
				h.handleStreamingAwareError(c, http.StatusServiceUnavailable, "api_error", "Service temporarily unavailable", streamStarted)
				return
			}
			if lastFailover != nil {
				h.handleFailoverExhausted(c, lastFailover, streamStarted)
			} else {
				h.handleFailoverExhaustedSimple(c, 502, streamStarted)
			}
			return
		}
		if picked == nil || picked.Account == nil {
			markOpsRoutingCapacityLimitedV2(c)
			h.handleStreamingAwareError(c, http.StatusServiceUnavailable, "api_error", "No available accounts", streamStarted)
			return
		}
		if prevRespID != "" && picked != nil && picked.Account != nil {
			reqLog.Debug("openai.account_selected_with_previous_response_id", zap.Int64("account_id", picked.Account.ID))
		}
		reqLog.Debug("openai.account_schedule_decision",
			zap.String("layer", scheduleMeta.Layer),
			zap.Bool("sticky_previous_hit", scheduleMeta.StickyPreviousHit),
			zap.Bool("sticky_session_hit", scheduleMeta.StickySessionHit),
			zap.Int("candidate_count", scheduleMeta.CandidateCount),
			zap.Int("top_k", scheduleMeta.TopK),
			zap.Int64("latency_ms", scheduleMeta.LatencyMs),
			zap.Float64("load_skew", scheduleMeta.LoadSkew),
		)
		acct := picked.Account
		sessHash = ensureOpenAIPoolModeSessionHash(sessHash, acct)
		reqLog.Debug("openai.account_selected", zap.Int64("account_id", acct.ID), zap.String("account_name", acct.Name))
		setOpsSelectedAccount(c, acct.ID, acct.Platform)

		acctRelease, acctOK := h.acquireResponsesAccountSlot(c, apiKey.GroupID, sessHash, picked, isStream, &streamStarted, reqLog)
		if !acctOK {
			return
		}

		// Forward the request
		service.SetOpsLatencyMs(c, service.OpsRoutingLatencyMsKey, time.Since(routeStart).Milliseconds())
		fwdStart := time.Now()
		writerSizeBefore := c.Writer.Size()
		fwdResult, fwdErr := func() (*service.OpenAIForwardResult, error) {
			defer func() {
				if acctRelease != nil {
					acctRelease()
				}
			}()
			return h.gatewayService.Forward(c.Request.Context(), c, acct, fwdBodyForResponses)
		}()
		fwdDuration := time.Since(fwdStart).Milliseconds()
		upstreamMs, _ := getContextInt64(c, service.OpsUpstreamLatencyMsKey)
		responseMs := fwdDuration
		if upstreamMs > 0 && fwdDuration > upstreamMs {
			responseMs = fwdDuration - upstreamMs
		}
		service.SetOpsLatencyMs(c, service.OpsResponseLatencyMsKey, responseMs)
		if fwdErr == nil && fwdResult != nil && fwdResult.FirstTokenMs != nil {
			service.SetOpsLatencyMs(c, service.OpsTimeToFirstTokenMsKey, int64(*fwdResult.FirstTokenMs))
		}
		if fwdErr != nil {
			if fwdResult != nil && fwdResult.ImageCount > 0 {
				reqLog.Warn("openai.forward_partial_error_with_image_result",
					zap.Int64("account_id", acct.ID),
					zap.Int("image_count", fwdResult.ImageCount),
					zap.Error(fwdErr),
				)
			} else {
				var failoverErr *service.UpstreamFailoverError
				if errors.As(fwdErr, &failoverErr) {
					if c.Writer.Size() != writerSizeBefore {
						h.handleFailoverExhausted(c, failoverErr, true)
						return
					}
					h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, false, nil)
					// Pool mode: same-account retry
					if failoverErr.RetryableOnSameAccount {
						limit := acct.GetPoolModeRetryCount()
						if perAccountRetries[acct.ID] < limit {
							perAccountRetries[acct.ID]++
							reqLog.Warn("openai.pool_mode_same_account_retry",
								zap.Int64("account_id", acct.ID),
								zap.Int("upstream_status", failoverErr.StatusCode),
								zap.Int("retry_limit", limit),
								zap.Int("retry_count", perAccountRetries[acct.ID]),
							)
							select {
							case <-c.Request.Context().Done():
								return
							case <-time.After(sameAccountRetryDelay):
							}
							continue
						}
					}
					h.gatewayService.RecordOpenAIAccountSwitch()
					excludedAccounts[acct.ID] = struct{}{}
					lastFailover = failoverErr
					if switchesDone >= retryLimit {
						h.handleFailoverExhausted(c, failoverErr, streamStarted)
						return
					}
					switchesDone++
					if h.gatewayService.ShouldStopOpenAIOAuth429Failover(acct, failoverErr.StatusCode, switchesDone) {
						h.handleFailoverExhausted(c, failoverErr, streamStarted)
						return
					}
					reqLog.Warn("openai.upstream_failover_switching",
						zap.Int64("account_id", acct.ID),
						zap.Int("upstream_status", failoverErr.StatusCode),
						zap.Int("switch_count", switchesDone),
						zap.Int("max_switches", retryLimit),
					)
					continue
				}
				h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, false, nil)
				alreadySent := openAIForwardErrorAlreadyCommunicatedV2(c, writerSizeBefore, fwdErr)
				sentFallback := false
				if !alreadySent {
					sentFallback = h.ensureForwardErrorResponse(c, streamStarted)
				}
				fields := []zap.Field{
					zap.Int64("account_id", acct.ID),
					zap.Bool("fallback_error_response_written", sentFallback),
					zap.Bool("upstream_error_response_already_written", alreadySent),
					zap.Error(fwdErr),
				}
				if shouldLogOpenAIForwardFailureAsWarn(c, sentFallback) {
					reqLog.Warn("openai.forward_failed", fields...)
					return
				}
				reqLog.Error("openai.forward_failed", fields...)
				return
			}
		}
		if fwdResult != nil {
			if acct.Type == service.AccountTypeOAuth {
				h.gatewayService.UpdateCodexUsageSnapshotFromHeaders(c.Request.Context(), acct.ID, fwdResult.ResponseHeaders)
			}
			h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, true, fwdResult.FirstTokenMs)
		} else {
			h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, true, nil)
		}

		// Capture per-request info for async usage recording (avoid gin.Context in goroutine).
		ua := c.GetHeader("User-Agent")
		clientAddr := ip.GetClientIP(c)
		bodyHash := service.HashUsageRequestPayload(rawBody)
		inbound := GetInboundEndpoint(c)
		upstream := GetUpstreamEndpoint(c, acct.Platform)
		// cyber_policy phase-2：捕获 mark 后投递给异步 worker pool；mark 是 ptr，gin.Context 不进 goroutine。
		cyberMark := service.GetOpsCyberPolicy(c)

		// Submit usage record via bounded worker pool to avoid unbounded goroutines.
		h.submitOpenAIUsageRecordTask(c.Request.Context(), fwdResult, func(ctx context.Context) {
			if recErr := h.gatewayService.RecordUsage(ctx, &service.OpenAIRecordUsageInput{
				Result:             fwdResult,
				APIKey:             apiKey,
				User:               apiKey.User,
				Account:            acct,
				Subscription:       subscription,
				InboundEndpoint:    inbound,
				UpstreamEndpoint:   upstream,
				UserAgent:          ua,
				IPAddress:          clientAddr,
				RequestPayloadHash: bodyHash,
				APIKeyService:      h.apiKeyService,
				CyberMark:          cyberMark,
				ChannelUsageFields: channelMap.ToUsageFields(requestedModel, fwdResult.UpstreamModel),
			}); recErr != nil {
				logger.L().With(
					zap.String("component", "handler.openai_gateway.responses"),
					zap.Int64("user_id", subject.UserID),
					zap.Int64("api_key_id", apiKey.ID),
					zap.Any("group_id", apiKey.GroupID),
					zap.String("model", requestedModel),
					zap.Int64("account_id", acct.ID),
				).Error("openai.record_usage_failed", zap.Error(recErr))
			}
		})
		reqLog.Debug("openai.request_completed",
			zap.Int64("account_id", acct.ID),
			zap.Int("switch_count", switchesDone),
		)
		return
	}
}

func isOpenAIRemoteCompactPath(c *gin.Context) bool {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return false
	}
	trimmed := strings.TrimRight(strings.TrimSpace(c.Request.URL.Path), "/")
	return strings.HasSuffix(trimmed, "/responses/compact")
}

func (h *OpenAIGatewayHandler) logOpenAIRemoteCompactOutcome(c *gin.Context, startedAt time.Time) {
	if !isOpenAIRemoteCompactPath(c) {
		return
	}

	var (
		bgCtx      = context.Background()
		reqPath    string
		respStatus int
	)
	if c != nil {
		if c.Request != nil {
			bgCtx = c.Request.Context()
			if c.Request.URL != nil {
				reqPath = strings.TrimSpace(c.Request.URL.Path)
			}
		}
		if c.Writer != nil {
			respStatus = c.Writer.Status()
		}
	}

	result := "failed"
	if respStatus >= 200 && respStatus < 300 {
		result = "succeeded"
	}
	elapsed := time.Since(startedAt).Milliseconds()
	if elapsed < 0 {
		elapsed = 0
	}

	logFields := []zap.Field{
		zap.String("component", "handler.openai_gateway.responses"),
		zap.Bool("remote_compact", true),
		zap.String("compact_outcome", result),
		zap.Int("status_code", respStatus),
		zap.Int64("latency_ms", elapsed),
		zap.String("path", reqPath),
		zap.Bool("force_codex_cli", h != nil && h.cfg != nil && h.cfg.Gateway.ForceCodexCLI),
	}

	if c != nil {
		if ua := strings.TrimSpace(c.GetHeader("User-Agent")); ua != "" {
			logFields = append(logFields, zap.String("request_user_agent", ua))
		}
		if v, ok := c.Get(opsModelKey); ok {
			if mdl, ok := v.(string); ok && strings.TrimSpace(mdl) != "" {
				logFields = append(logFields, zap.String("request_model", strings.TrimSpace(mdl)))
			}
		}
		if v, ok := c.Get(opsAccountIDKey); ok {
			if aid, ok := v.(int64); ok && aid > 0 {
				logFields = append(logFields, zap.Int64("account_id", aid))
			}
		}
		if c.Writer != nil {
			if xReqID := strings.TrimSpace(c.Writer.Header().Get("x-request-id")); xReqID != "" {
				logFields = append(logFields, zap.String("upstream_request_id", xReqID))
			} else if xReqID := strings.TrimSpace(c.Writer.Header().Get("X-Request-Id")); xReqID != "" {
				logFields = append(logFields, zap.String("upstream_request_id", xReqID))
			}
		}
	}

	entry := logger.FromContext(bgCtx).With(logFields...)
	if result == "succeeded" {
		entry.Info("codex.remote_compact.succeeded")
		return
	}
	entry.Warn("codex.remote_compact.failed")
}

// Messages handles Anthropic Messages API requests routed to OpenAI platform.
// POST /v1/messages (when group platform is OpenAI)
func (h *OpenAIGatewayHandler) Messages(c *gin.Context) {
	streamStarted := false
	defer h.recoverAnthropicMessagesPanic(c, &streamStarted)

	reqStart := time.Now()

	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.anthropicErrorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}

	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		h.anthropicErrorResponse(c, http.StatusInternalServerError, "api_error", "User context not found")
		return
	}
	reqLog := requestLogger(
		c,
		"handler.openai_gateway.messages",
		zap.Int64("user_id", subject.UserID),
		zap.Int64("api_key_id", apiKey.ID),
		zap.Any("group_id", apiKey.GroupID),
	)

	// Check whether the group allows /v1/messages dispatch
	if apiKey.Group != nil && !apiKey.Group.AllowMessagesDispatch {
		h.anthropicErrorResponse(c, http.StatusForbidden, "permission_error",
			"This group does not allow /v1/messages dispatch")
		return
	}

	if !h.ensureResponsesDependencies(c, reqLog) {
		return
	}

	rawBody, readErr := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if readErr != nil {
		if maxErr, ok := extractMaxBytesError(readErr); ok {
			h.anthropicErrorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return
		}
		h.anthropicErrorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return
	}
	if len(rawBody) == 0 {
		h.anthropicErrorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body is empty")
		return
	}

	if !gjson.ValidBytes(rawBody) {
		h.anthropicErrorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse request body")
		return
	}

	modelField := gjson.GetBytes(rawBody, "model")
	if !modelField.Exists() || modelField.Type != gjson.String || modelField.String() == "" {
		h.anthropicErrorResponse(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return
	}
	requestedModel := modelField.String()
	routingTarget := service.NormalizeOpenAICompatRequestedModel(requestedModel)
	mappedModel := lookupOpenAIMessagesDispatchMappedModel(apiKey, requestedModel)
	isStream := gjson.GetBytes(rawBody, "stream").Bool()

	reqLog = reqLog.With(zap.String("model", requestedModel), zap.Bool("stream", isStream))

	assignOpsRequestContext(c, requestedModel, isStream)
	setOpsEndpointContext(c, "", int16(service.RequestTypeFromLegacy(isStream, false)))

	if verdict := h.checkContentModeration(c, reqLog, apiKey, subject, service.ContentModerationProtocolAnthropicMessages, requestedModel, rawBody); verdict != nil && verdict.Blocked {
		h.anthropicErrorResponse(c, contentModerationStatus(verdict), contentModerationErrorCode(verdict), verdict.Message)
		return
	}

	// Resolve channel-level model mapping
	channelMapMsg, _ := h.gatewayService.ResolveChannelMappingAndRestrict(c.Request.Context(), apiKey.GroupID, requestedModel)
	mappedBodyCache := newMappedBodyCache(rawBody, h.gatewayService.ReplaceModelInBody)

	// Bind error passthrough service for service-layer reuse.
	if h.errorPassthroughService != nil {
		service.BindErrorPassthroughService(c, h.errorPassthroughService)
	}

	subscription, _ := middleware2.GetSubscriptionFromContext(c)

	service.SetOpsLatencyMs(c, service.OpsAuthLatencyMsKey, time.Since(reqStart).Milliseconds())
	routeStart := time.Now()

	userRelease, slotOK := h.acquireResponsesUserSlot(c, subject.UserID, subject.Concurrency, isStream, &streamStarted, reqLog)
	if !slotOK {
		return
	}
	if userRelease != nil {
		defer userRelease()
	}

	if billingErr := h.billingCacheService.CheckBillingEligibility(c.Request.Context(), apiKey.User, apiKey, apiKey.Group, subscription, service.QuotaPlatform(c.Request.Context(), apiKey)); billingErr != nil {
		reqLog.Info("openai_messages.billing_eligibility_check_failed", zap.Error(billingErr))
		code, errType, msg, retry := billingErrorDetails(billingErr)
		if retry > 0 {
			c.Header("Retry-After", strconv.Itoa(retry))
		}
		h.anthropicStreamingAwareError(c, code, errType, msg, streamStarted)
		return
	}

	sessHash := h.gatewayService.GenerateSessionHash(c, rawBody)
	cacheKey := h.gatewayService.ExtractSessionID(c, rawBody)
	sessHash, cacheKey = resolveMessagesMetadataSession(sessHash, cacheKey, requestedModel, rawBody)

	retryLimit := h.maxAccountSwitches
	switchesDone := 0
	excludedAccounts := make(map[int64]struct{})
	perAccountRetries := make(map[int64]int)
	var lastFailover *service.UpstreamFailoverError
	activeMappedModel := mappedModel

	for {
		effectiveRouting := routingTarget
		if activeMappedModel != "" {
			effectiveRouting = activeMappedModel
		}
		reqLog.Debug("openai_messages.account_selecting", zap.Int("excluded_account_count", len(excludedAccounts)))
		picked, scheduleMeta, selectErr := h.gatewayService.SelectAccountWithSchedulerForCapability(
			c.Request.Context(),
			apiKey.GroupID,
			"", // no previous_response_id
			sessHash,
			effectiveRouting,
			excludedAccounts,
			service.OpenAIUpstreamTransportAny,
			service.OpenAIEndpointCapabilityChatCompletions,
			false,
		)
		if selectErr != nil {
			reqLog.Warn("openai_messages.account_select_failed",
				zap.Error(selectErr),
				zap.Int("excluded_account_count", len(excludedAccounts)),
			)
			if len(excludedAccounts) == 0 {
				if selectErr != nil {
					markOpsRoutingCapacityLimitedIfNoAvailableV2(c, selectErr)
					h.anthropicStreamingAwareError(c, http.StatusServiceUnavailable, "api_error", "Service temporarily unavailable", streamStarted)
					return
				}
			} else {
				if lastFailover != nil {
					h.handleAnthropicFailoverExhausted(c, lastFailover, streamStarted)
				} else {
					h.anthropicStreamingAwareError(c, http.StatusBadGateway, "api_error", "Upstream request failed", streamStarted)
				}
				return
			}
		}
		if picked == nil || picked.Account == nil {
			markOpsRoutingCapacityLimitedV2(c)
			h.anthropicStreamingAwareError(c, http.StatusServiceUnavailable, "api_error", "No available accounts", streamStarted)
			return
		}
		acct := picked.Account
		sessHash = ensureOpenAIPoolModeSessionHash(sessHash, acct)
		reqLog.Debug("openai_messages.account_selected", zap.Int64("account_id", acct.ID), zap.String("account_name", acct.Name))
		_ = scheduleMeta
		setOpsSelectedAccount(c, acct.ID, acct.Platform)

		acctRelease, acctOK := h.acquireResponsesAccountSlot(c, apiKey.GroupID, sessHash, picked, isStream, &streamStarted, reqLog)
		if !acctOK {
			return
		}

		service.SetOpsLatencyMs(c, service.OpsRoutingLatencyMsKey, time.Since(routeStart).Milliseconds())
		fwdStart := time.Now()

		resolvedMapped := strings.TrimSpace(activeMappedModel)
		fwdBody := mappedBodyCache(channelMapMsg.Mapped, channelMapMsg.MappedModel)
		writerSizeBefore := c.Writer.Size()
		fwdResult, fwdErr := func() (*service.OpenAIForwardResult, error) {
			defer func() {
				if acctRelease != nil {
					acctRelease()
				}
			}()
			return h.gatewayService.ForwardAsAnthropic(c.Request.Context(), c, acct, fwdBody, cacheKey, resolvedMapped)
		}()

		fwdDuration := time.Since(fwdStart).Milliseconds()
		upstreamMs, _ := getContextInt64(c, service.OpsUpstreamLatencyMsKey)
		responseMs := fwdDuration
		if upstreamMs > 0 && fwdDuration > upstreamMs {
			responseMs = fwdDuration - upstreamMs
		}
		service.SetOpsLatencyMs(c, service.OpsResponseLatencyMsKey, responseMs)
		if fwdErr == nil && fwdResult != nil && fwdResult.FirstTokenMs != nil {
			service.SetOpsLatencyMs(c, service.OpsTimeToFirstTokenMsKey, int64(*fwdResult.FirstTokenMs))
		}
		if fwdErr != nil {
			if fwdResult != nil && fwdResult.ImageCount > 0 {
				reqLog.Warn("openai_messages.forward_partial_error_with_image_result",
					zap.Int64("account_id", acct.ID),
					zap.Int("image_count", fwdResult.ImageCount),
					zap.Error(fwdErr),
				)
			} else {
				var failoverErr *service.UpstreamFailoverError
				if errors.As(fwdErr, &failoverErr) {
					if c.Writer.Size() != writerSizeBefore {
						h.handleAnthropicFailoverExhausted(c, failoverErr, true)
						return
					}
					h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, false, nil)
					// Pool mode: same-account retry
					if failoverErr.RetryableOnSameAccount {
						limit := acct.GetPoolModeRetryCount()
						if perAccountRetries[acct.ID] < limit {
							perAccountRetries[acct.ID]++
							reqLog.Warn("openai_messages.pool_mode_same_account_retry",
								zap.Int64("account_id", acct.ID),
								zap.Int("upstream_status", failoverErr.StatusCode),
								zap.Int("retry_limit", limit),
								zap.Int("retry_count", perAccountRetries[acct.ID]),
							)
							select {
							case <-c.Request.Context().Done():
								return
							case <-time.After(sameAccountRetryDelay):
							}
							continue
						}
					}
					h.gatewayService.RecordOpenAIAccountSwitch()
					excludedAccounts[acct.ID] = struct{}{}
					lastFailover = failoverErr
					if switchesDone >= retryLimit {
						h.handleAnthropicFailoverExhausted(c, failoverErr, streamStarted)
						return
					}
					switchesDone++
					if h.gatewayService.ShouldStopOpenAIOAuth429Failover(acct, failoverErr.StatusCode, switchesDone) {
						h.handleAnthropicFailoverExhausted(c, failoverErr, streamStarted)
						return
					}
					reqLog.Warn("openai_messages.upstream_failover_switching",
						zap.Int64("account_id", acct.ID),
						zap.Int("upstream_status", failoverErr.StatusCode),
						zap.Int("switch_count", switchesDone),
						zap.Int("max_switches", retryLimit),
					)
					continue
				}
				if fwdResult != nil && fwdResult.ClientDisconnect {
					reqLog.Info("openai_messages.client_disconnected",
						zap.Int64("account_id", acct.ID),
						zap.Error(fwdErr),
					)
					return
				}
				h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, false, nil)
				sentFallback := h.ensureAnthropicErrorResponse(c, streamStarted)
				reqLog.Warn("openai_messages.forward_failed",
					zap.Int64("account_id", acct.ID),
					zap.Bool("fallback_error_response_written", sentFallback),
					zap.Error(fwdErr),
				)
				return
			}
		}
		if fwdResult != nil {
			h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, true, fwdResult.FirstTokenMs)
		} else {
			h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, true, nil)
		}

		ua := c.GetHeader("User-Agent")
		clientAddr := ip.GetClientIP(c)
		bodyHash := service.HashUsageRequestPayload(rawBody)
		inbound := GetInboundEndpoint(c)
		upstreamEP := GetUpstreamEndpoint(c, acct.Platform)
		// cyber_policy phase-2：捕获 mark 后投递给异步 worker pool；mark 是 ptr，gin.Context 不进 goroutine。
		cyberMark := service.GetOpsCyberPolicy(c)

		h.submitOpenAIUsageRecordTask(c.Request.Context(), fwdResult, func(ctx context.Context) {
			if recErr := h.gatewayService.RecordUsage(ctx, &service.OpenAIRecordUsageInput{
				Result:             fwdResult,
				APIKey:             apiKey,
				User:               apiKey.User,
				Account:            acct,
				Subscription:       subscription,
				InboundEndpoint:    inbound,
				UpstreamEndpoint:   upstreamEP,
				UserAgent:          ua,
				IPAddress:          clientAddr,
				RequestPayloadHash: bodyHash,
				APIKeyService:      h.apiKeyService,
				CyberMark:          cyberMark,
				ChannelUsageFields: channelMapMsg.ToUsageFields(requestedModel, fwdResult.UpstreamModel),
			}); recErr != nil {
				logger.L().With(
					zap.String("component", "handler.openai_gateway.messages"),
					zap.Int64("user_id", subject.UserID),
					zap.Int64("api_key_id", apiKey.ID),
					zap.Any("group_id", apiKey.GroupID),
					zap.String("model", requestedModel),
					zap.Int64("account_id", acct.ID),
				).Error("openai_messages.record_usage_failed", zap.Error(recErr))
			}
		})
		reqLog.Debug("openai_messages.request_completed",
			zap.Int64("account_id", acct.ID),
			zap.Int("switch_count", switchesDone),
		)
		return
	}
}

func resolveMessagesMetadataSession(sessHash, cacheKey, model string, body []byte) (string, string) {
	// Anthropic metadata.user_id serves only as an account-stickiness signal.
	// Upstream GPT/Codex cache keys are derived by ForwardAsAnthropic from
	// cache_control or a full message digest, so a fixed metadata key must
	// not pin subsequent turns.
	if sessHash != "" {
		return sessHash, cacheKey
	}
	if uid := strings.TrimSpace(gjson.GetBytes(body, "metadata.user_id").String()); uid != "" {
		seed := model + "-" + uid
		sessHash = service.DeriveSessionHashFromSeed(seed)
	}
	return sessHash, cacheKey
}

// anthropicErrorResponse writes an error in Anthropic Messages API format.
func (h *OpenAIGatewayHandler) anthropicErrorResponse(c *gin.Context, status int, errType, message string) {
	c.JSON(status, gin.H{
		"type": "error",
		"error": gin.H{
			"type":    errType,
			"message": message,
		},
	})
}

// anthropicStreamingAwareError handles errors that may occur during streaming,
// using Anthropic SSE error format.
func (h *OpenAIGatewayHandler) anthropicStreamingAwareError(c *gin.Context, status int, errType, message string, streamStarted bool) {
	if streamStarted {
		flusher, ok := c.Writer.(http.Flusher)
		if ok {
			blob, _ := json.Marshal(gin.H{
				"type": "error",
				"error": gin.H{
					"type":    errType,
					"message": message,
				},
			})
			fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", blob) //nolint:errcheck
			flusher.Flush()
		}
		return
	}
	h.anthropicErrorResponse(c, status, errType, message)
}

// handleAnthropicFailoverExhausted maps upstream failover errors to Anthropic format.
func (h *OpenAIGatewayHandler) handleAnthropicFailoverExhausted(c *gin.Context, failoverErr *service.UpstreamFailoverError, streamStarted bool) {
	code, errType, msg := h.mapUpstreamError(failoverErr.StatusCode)
	h.anthropicStreamingAwareError(c, code, errType, msg, streamStarted)
}

// ensureAnthropicErrorResponse writes a fallback Anthropic error if no response was written.
func (h *OpenAIGatewayHandler) ensureAnthropicErrorResponse(c *gin.Context, streamStarted bool) bool {
	if c == nil || c.Writer == nil || c.Writer.Written() {
		return false
	}
	h.anthropicStreamingAwareError(c, http.StatusBadGateway, "api_error", "Upstream request failed", streamStarted)
	return true
}

func (h *OpenAIGatewayHandler) validateFunctionCallOutputRequest(c *gin.Context, body []byte, reqLog *zap.Logger) bool {
	if !gjson.GetBytes(body, `input.#(type=="function_call_output")`).Exists() {
		return true
	}

	check := service.ValidateFunctionCallOutputContextBytes(body)
	if !check.HasFunctionCallOutput {
		return true
	}

	prevID := gjson.GetBytes(body, "previous_response_id").String()
	if strings.TrimSpace(prevID) != "" || check.HasToolCallContext {
		return true
	}

	if check.HasFunctionCallOutputMissingCallID {
		reqLog.Warn("openai.request_validation_failed",
			zap.String("reason", "function_call_output_missing_call_id"),
		)
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "function_call_output requires call_id on HTTP requests; continuation via previous_response_id is only supported on Responses WebSocket v2")
		return false
	}
	if check.HasItemReferenceForAllCallIDs {
		return true
	}

	reqLog.Warn("openai.request_validation_failed",
		zap.String("reason", "function_call_output_missing_item_reference"),
	)
	h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "function_call_output requires item_reference ids matching each call_id on HTTP requests; continuation via previous_response_id is only supported on Responses WebSocket v2")
	return false
}

func (h *OpenAIGatewayHandler) acquireResponsesUserSlot(
	c *gin.Context,
	uid int64,
	maxConcurrency int,
	isStream bool,
	streamStarted *bool,
	reqLog *zap.Logger,
) (func(), bool) {
	ctx := c.Request.Context()
	// wait queue 计数由 helper 内部统一接管：fast path 零计数器，slow path 排队闸门 + defer Decrement。
	releaseFunc, err := h.concurrencyHelper.AcquireUserSlotWithWait(c, uid, maxConcurrency, isStream, streamStarted)
	if err != nil {
		reqLog.Warn("openai.user_slot_acquire_failed", zap.Error(err))
		h.handleConcurrencyError(c, err, "user", *streamStarted)
		return nil, false
	}
	return wrapReleaseOnDone(ctx, releaseFunc), true
}

func (h *OpenAIGatewayHandler) acquireResponsesAccountSlot(
	c *gin.Context,
	groupID *int64,
	sessHash string,
	picked *service.AccountSelectionResult,
	isStream bool,
	streamStarted *bool,
	reqLog *zap.Logger,
) (func(), bool) {
	if picked == nil || picked.Account == nil {
		markOpsRoutingCapacityLimitedV2(c)
		h.handleStreamingAwareError(c, http.StatusServiceUnavailable, "api_error", "No available accounts", *streamStarted)
		return nil, false
	}

	ctx := c.Request.Context()
	acct := picked.Account
	if picked.Acquired {
		return wrapReleaseOnDone(ctx, picked.ReleaseFunc), true
	}
	if picked.WaitPlan == nil {
		markOpsRoutingCapacityLimitedV2(c)
		h.handleStreamingAwareError(c, http.StatusServiceUnavailable, "api_error", "No available accounts", *streamStarted)
		return nil, false
	}

	quickRelease, quickOK, quickErr := h.concurrencyHelper.TryAcquireAccountSlot(
		ctx,
		acct.ID,
		picked.WaitPlan.MaxConcurrency,
	)
	if quickErr != nil {
		reqLog.Warn("openai.account_slot_quick_acquire_failed", zap.Int64("account_id", acct.ID), zap.Error(quickErr))
		h.handleConcurrencyError(c, quickErr, "account", *streamStarted)
		return nil, false
	}
	if quickOK {
		if bindErr := h.gatewayService.BindStickySession(ctx, groupID, sessHash, acct.ID); bindErr != nil {
			reqLog.Warn("openai.bind_sticky_session_failed", zap.Int64("account_id", acct.ID), zap.Error(bindErr))
		}
		return wrapReleaseOnDone(ctx, quickRelease), true
	}

	canEnqueue, enqueueErr := h.concurrencyHelper.IncrementAccountWaitCount(ctx, acct.ID, picked.WaitPlan.MaxWaiting)
	if enqueueErr != nil {
		reqLog.Warn("openai.account_wait_counter_increment_failed", zap.Int64("account_id", acct.ID), zap.Error(enqueueErr))
	} else if !canEnqueue {
		reqLog.Info("openai.account_wait_queue_full",
			zap.Int64("account_id", acct.ID),
			zap.Int("max_waiting", picked.WaitPlan.MaxWaiting),
		)
		h.handleStreamingAwareError(c, http.StatusTooManyRequests, "rate_limit_error", "Too many pending requests, please retry later", *streamStarted)
		return nil, false
	}

	enqueued := enqueueErr == nil && canEnqueue
	exitWait := func() {
		if enqueued {
			h.concurrencyHelper.DecrementAccountWaitCount(ctx, acct.ID)
			enqueued = false
		}
	}
	defer exitWait()

	acctRelease, waitErr := h.concurrencyHelper.AcquireAccountSlotWithWaitTimeout(
		c,
		acct.ID,
		picked.WaitPlan.MaxConcurrency,
		picked.WaitPlan.Timeout,
		isStream,
		streamStarted,
	)
	if waitErr != nil {
		reqLog.Warn("openai.account_slot_acquire_failed", zap.Int64("account_id", acct.ID), zap.Error(waitErr))
		h.handleConcurrencyError(c, waitErr, "account", *streamStarted)
		return nil, false
	}

	// Slot acquired: no longer waiting in queue.
	exitWait()
	if bindErr := h.gatewayService.BindStickySession(ctx, groupID, sessHash, acct.ID); bindErr != nil {
		reqLog.Warn("openai.bind_sticky_session_failed", zap.Int64("account_id", acct.ID), zap.Error(bindErr))
	}
	return wrapReleaseOnDone(ctx, acctRelease), true
}

// ResponsesWebSocket handles OpenAI Responses API WebSocket ingress endpoint
// GET /openai/v1/responses (Upgrade: websocket)
func (h *OpenAIGatewayHandler) ResponsesWebSocket(c *gin.Context) {
	if !isOpenAIWSUpgradeRequest(c.Request) {
		h.errorResponse(c, http.StatusUpgradeRequired, "invalid_request_error", "WebSocket upgrade required (Upgrade: websocket)")
		return
	}
	setOpenAIClientTransportWS(c)

	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "User context not found")
		return
	}

	reqLog := requestLogger(
		c,
		"handler.openai_gateway.responses_ws",
		zap.Int64("user_id", subject.UserID),
		zap.Int64("api_key_id", apiKey.ID),
		zap.Any("group_id", apiKey.GroupID),
		zap.Bool("openai_ws_mode", true),
	)
	if !h.ensureResponsesDependencies(c, reqLog) {
		return
	}
	reqLog.Info("openai.websocket_ingress_started")
	clientAddr := ip.GetClientIP(c)
	ua := strings.TrimSpace(c.GetHeader("User-Agent"))

	conn, wsErr := coderws.Accept(c.Writer, c.Request, &coderws.AcceptOptions{
		CompressionMode: coderws.CompressionContextTakeover,
	})
	if wsErr != nil {
		reqLog.Warn("openai.websocket_accept_failed",
			zap.Error(wsErr),
			zap.String("client_ip", clientAddr),
			zap.String("request_user_agent", ua),
			zap.String("upgrade_header", strings.TrimSpace(c.GetHeader("Upgrade"))),
			zap.String("connection_header", strings.TrimSpace(c.GetHeader("Connection"))),
			zap.String("sec_websocket_version", strings.TrimSpace(c.GetHeader("Sec-WebSocket-Version"))),
			zap.Bool("has_sec_websocket_key", strings.TrimSpace(c.GetHeader("Sec-WebSocket-Key")) != ""),
		)
		return
	}
	defer func() {
		_ = conn.CloseNow()
	}()
	conn.SetReadLimit(service.ResolveOpenAIWSClientReadLimitBytes(h.cfg))

	ctx := c.Request.Context()
	readCtx, readCancel := context.WithTimeout(ctx, 30*time.Second)
	msgType, firstMsg, readErr := conn.Read(readCtx)
	readCancel()
	if readErr != nil {
		closeCode, closeReason := summarizeWSCloseErrorForLog(readErr)
		reqLog.Warn("openai.websocket_read_first_message_failed",
			zap.Error(readErr),
			zap.String("client_ip", clientAddr),
			zap.String("close_status", closeCode),
			zap.String("close_reason", closeReason),
			zap.Duration("read_timeout", 30*time.Second),
		)
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, "missing first response.create message")
		return
	}
	if msgType != coderws.MessageText && msgType != coderws.MessageBinary {
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, "unsupported websocket message type")
		return
	}
	if !gjson.ValidBytes(firstMsg) {
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, "invalid JSON payload")
		return
	}

	requestedModel := strings.TrimSpace(gjson.GetBytes(firstMsg, "model").String())
	if requestedModel == "" {
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, "model is required in first response.create payload")
		return
	}
	prevRespID := strings.TrimSpace(gjson.GetBytes(firstMsg, "previous_response_id").String())
	prevRespIDKind := service.ClassifyOpenAIPreviousResponseIDKind(prevRespID)
	if prevRespID != "" && prevRespIDKind == service.OpenAIPreviousResponseIDKindMessageID {
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, "previous_response_id must be a response.id (resp_*), not a message id")
		return
	}
	reqLog = reqLog.With(
		zap.Bool("ws_ingress", true),
		zap.String("model", requestedModel),
		zap.Bool("has_previous_response_id", prevRespID != ""),
		zap.String("previous_response_id_kind", prevRespIDKind),
	)
	assignOpsRequestContext(c, requestedModel, true)
	setOpsEndpointContext(c, "", int16(service.RequestTypeWSV2))

	if verdict := h.checkContentModeration(c, reqLog, apiKey, subject, service.ContentModerationProtocolOpenAIResponses, requestedModel, firstMsg); verdict != nil && verdict.Blocked {
		emitContentModerationWSError(ctx, conn, verdict)
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, verdict.Message)
		return
	}

	if service.IsImageGenerationIntent("/v1/responses", requestedModel, firstMsg) && !service.GroupAllowsImageGeneration(apiKey.Group) {
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, service.ImageGenerationPermissionMessage())
		return
	}

	// Resolve channel-level model mapping
	channelMapWS, _ := h.gatewayService.ResolveChannelMappingAndRestrict(ctx, apiKey.GroupID, requestedModel)

	var activeUserRelease func()
	var activeAcctRelease func()
	freeAcctSlot := func() {
		if activeAcctRelease != nil {
			activeAcctRelease()
			activeAcctRelease = nil
		}
	}
	freeTurnSlots := func() {
		freeAcctSlot()
		if activeUserRelease != nil {
			activeUserRelease()
			activeUserRelease = nil
		}
	}
	// Register early so that any early return releases acquired slots.
	defer freeTurnSlots()

	userRelease, userOK, userErr := h.concurrencyHelper.TryAcquireUserSlot(ctx, subject.UserID, subject.Concurrency)
	if userErr != nil {
		reqLog.Warn("openai.websocket_user_slot_acquire_failed", zap.Error(userErr))
		closeOpenAIClientWS(conn, coderws.StatusInternalError, "failed to acquire user concurrency slot")
		return
	}
	if !userOK {
		closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "too many concurrent requests, please retry later")
		return
	}
	activeUserRelease = wrapReleaseOnDone(ctx, userRelease)
	reacquireUserSlot := func() bool {
		if activeUserRelease != nil {
			return true
		}
		rel, ok, err := h.concurrencyHelper.TryAcquireUserSlot(ctx, subject.UserID, subject.Concurrency)
		if err != nil {
			reqLog.Warn("openai.websocket_user_slot_reacquire_failed", zap.Error(err))
			closeOpenAIClientWS(conn, coderws.StatusInternalError, "failed to acquire user concurrency slot")
			return false
		}
		if !ok {
			closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "too many concurrent requests, please retry later")
			return false
		}
		activeUserRelease = wrapReleaseOnDone(ctx, rel)
		return true
	}

	subscription, _ := middleware2.GetSubscriptionFromContext(c)
	if billingErr := h.billingCacheService.CheckBillingEligibility(ctx, apiKey.User, apiKey, apiKey.Group, subscription, service.QuotaPlatform(c.Request.Context(), apiKey)); billingErr != nil {
		reqLog.Info("openai.websocket_billing_eligibility_check_failed", zap.Error(billingErr))
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, "billing check failed")
		return
	}

	sessHash := h.gatewayService.GenerateSessionHashWithFallback(
		c,
		firstMsg,
		openAIWSIngressFallbackSessionSeed(subject.UserID, apiKey.ID, apiKey.GroupID),
	)
	retryLimit := h.maxAccountSwitches
	switchesDone := 0
	excludedAccounts := make(map[int64]struct{})
	var lastFailover *service.UpstreamFailoverError

	for {
		reqLog.Debug("openai.websocket_account_selecting", zap.Int("excluded_account_count", len(excludedAccounts)))
		picked, scheduleMeta, selectErr := h.gatewayService.SelectAccountWithSchedulerForCapability(
			ctx,
			apiKey.GroupID,
			prevRespID,
			sessHash,
			requestedModel,
			excludedAccounts,
			service.OpenAIUpstreamTransportResponsesWebsocketV2,
			service.OpenAIEndpointCapabilityChatCompletions,
			false,
		)
		if selectErr != nil {
			reqLog.Warn("openai.websocket_account_select_failed",
				zap.Error(selectErr),
				zap.Int("excluded_account_count", len(excludedAccounts)),
			)
			if lastFailover != nil {
				shutOpenAIWSFailoverExhausted(conn, lastFailover)
			} else {
				closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "no available account")
			}
			return
		}
		if picked == nil || picked.Account == nil {
			if lastFailover != nil {
				shutOpenAIWSFailoverExhausted(conn, lastFailover)
			} else {
				closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "no available account")
			}
			return
		}

		acct := picked.Account
		acctMaxConcurrency := acct.Concurrency
		if picked.WaitPlan != nil && picked.WaitPlan.MaxConcurrency > 0 {
			acctMaxConcurrency = picked.WaitPlan.MaxConcurrency
		}
		acctRelease := picked.ReleaseFunc
		if !picked.Acquired {
			if picked.WaitPlan == nil {
				closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "account is busy, please retry later")
				return
			}
			quickRelease, quickOK, quickErr := h.concurrencyHelper.TryAcquireAccountSlot(
				ctx,
				acct.ID,
				picked.WaitPlan.MaxConcurrency,
			)
			if quickErr != nil {
				reqLog.Warn("openai.websocket_account_slot_acquire_failed", zap.Int64("account_id", acct.ID), zap.Error(quickErr))
				closeOpenAIClientWS(conn, coderws.StatusInternalError, "failed to acquire account concurrency slot")
				return
			}
			if !quickOK {
				closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "account is busy, please retry later")
				return
			}
			acctRelease = quickRelease
		}
		activeAcctRelease = wrapReleaseOnDone(ctx, acctRelease)
		if bindErr := h.gatewayService.BindStickySession(ctx, apiKey.GroupID, sessHash, acct.ID); bindErr != nil {
			reqLog.Warn("openai.websocket_bind_sticky_session_failed", zap.Int64("account_id", acct.ID), zap.Error(bindErr))
		}

		tok, _, tokenErr := h.gatewayService.GetAccessToken(ctx, acct)
		if tokenErr != nil {
			reqLog.Warn("openai.websocket_get_access_token_failed", zap.Int64("account_id", acct.ID), zap.Error(tokenErr))
			closeOpenAIClientWS(conn, coderws.StatusInternalError, "failed to get access token")
			return
		}

		reqLog.Debug("openai.websocket_account_selected",
			zap.Int64("account_id", acct.ID),
			zap.String("account_name", acct.Name),
			zap.String("schedule_layer", scheduleMeta.Layer),
			zap.Int("candidate_count", scheduleMeta.CandidateCount),
		)

		var bodyHash string
		hooks := &service.OpenAIWSIngressHooks{
			InitialRequestModel: requestedModel,
			BeforeRequest: func(turn int, payload []byte, origModel string) error {
				if turn == 1 {
					return nil
				}
				if !gjson.ValidBytes(payload) {
					return service.NewOpenAIWSClientCloseError(coderws.StatusPolicyViolation, "invalid websocket request payload", errors.New("invalid json"))
				}
				mdl := strings.TrimSpace(origModel)
				if mdl == "" {
					mdl = strings.TrimSpace(gjson.GetBytes(payload, "model").String())
				}
				if mdl == "" {
					mdl = requestedModel
				}
				if verdict := h.checkContentModeration(c, reqLog, apiKey, subject, service.ContentModerationProtocolOpenAIResponses, mdl, payload); verdict != nil && verdict.Blocked {
					emitContentModerationWSError(ctx, conn, verdict)
					return service.NewOpenAIWSClientCloseError(coderws.StatusPolicyViolation, verdict.Message, nil)
				}
				return nil
			},
			BeforeTurn: func(turn int) error {
				if turn == 1 {
					return nil
				}
				// Defensive cleanup: prevent leaked slots from prior abnormal paths.
				freeTurnSlots()
				// Non-first turns must re-acquire concurrency slots to avoid
				// idle long-lived connections hogging capacity.
				uRel, uOK, uErr := h.concurrencyHelper.TryAcquireUserSlot(ctx, subject.UserID, subject.Concurrency)
				if uErr != nil {
					return service.NewOpenAIWSClientCloseError(coderws.StatusInternalError, "failed to acquire user concurrency slot", uErr)
				}
				if !uOK {
					return service.NewOpenAIWSClientCloseError(coderws.StatusTryAgainLater, "too many concurrent requests, please retry later", nil)
				}
				aRel, aOK, aErr := h.concurrencyHelper.TryAcquireAccountSlot(ctx, acct.ID, acctMaxConcurrency)
				if aErr != nil {
					if uRel != nil {
						uRel()
					}
					return service.NewOpenAIWSClientCloseError(coderws.StatusInternalError, "failed to acquire account concurrency slot", aErr)
				}
				if !aOK {
					if uRel != nil {
						uRel()
					}
					return service.NewOpenAIWSClientCloseError(coderws.StatusTryAgainLater, "account is busy, please retry later", nil)
				}
				activeUserRelease = wrapReleaseOnDone(ctx, uRel)
				activeAcctRelease = wrapReleaseOnDone(ctx, aRel)
				return nil
			},
			AfterTurn: func(turn int, result *service.OpenAIForwardResult, turnErr error) {
				freeTurnSlots()
				if turnErr != nil {
					if result == nil || result.ImageCount <= 0 {
						return
					}
					reqLog.Warn("openai.websocket_partial_error_with_image_result",
						zap.Int64("account_id", acct.ID),
						zap.Int("image_count", result.ImageCount),
						zap.Error(turnErr),
					)
				}
				if result == nil {
					return
				}
				if acct.Type == service.AccountTypeOAuth {
					h.gatewayService.UpdateCodexUsageSnapshotFromHeaders(ctx, acct.ID, result.ResponseHeaders)
				}
				h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, true, result.FirstTokenMs)
				inbound := GetInboundEndpoint(c)
				upstreamEP := GetUpstreamEndpoint(c, acct.Platform)
				// cyber_policy phase-2：捕获 mark（若 WS 多轮路径在后续 phase-3 接入，可直接生效）。
				cyberMark := service.GetOpsCyberPolicy(c)
				h.submitOpenAIUsageRecordTask(ctx, result, func(taskCtx context.Context) {
					if recErr := h.gatewayService.RecordUsage(taskCtx, &service.OpenAIRecordUsageInput{
						Result:             result,
						APIKey:             apiKey,
						User:               apiKey.User,
						Account:            acct,
						Subscription:       subscription,
						InboundEndpoint:    inbound,
						UpstreamEndpoint:   upstreamEP,
						UserAgent:          ua,
						IPAddress:          clientAddr,
						RequestPayloadHash: bodyHash,
						APIKeyService:      h.apiKeyService,
						CyberMark:          cyberMark,
						ChannelUsageFields: channelMapWS.ToUsageFields(requestedModel, result.UpstreamModel),
					}); recErr != nil {
						reqLog.Error("openai.websocket_record_usage_failed",
							zap.Int64("account_id", acct.ID),
							zap.String("request_id", result.RequestID),
							zap.Error(recErr),
						)
					}
				})
			},
		}

		// Apply channel model mapping to the WS first message
		wsMsg := firstMsg
		if channelMapWS.Mapped {
			wsMsg = h.gatewayService.ReplaceModelInBody(firstMsg, channelMapWS.MappedModel)
		}
		// Cross-group/session mismatch protection: if previous_response_id was
		// not resolved to the current account (StickyPreviousHit=false), strip
		// it from the first payload and rely on inline input for context.
		// Tool continuation (function_call_output) cannot be rebuilt and is
		// forwarded as-is. Only applies to the first turn's first message.
		if prevRespID != "" && !scheduleMeta.StickyPreviousHit &&
			!service.ValidateFunctionCallOutputContextBytes(wsMsg).HasFunctionCallOutput {
			wsMsg = service.RemovePreviousResponseIDFromBody(wsMsg)
			reqLog.Debug("openai.websocket_previous_response_id_stripped_cross_group",
				zap.Int64("account_id", acct.ID),
				zap.String("schedule_layer", scheduleMeta.Layer),
			)
		}

		// Hash the first message before entering the hooks to avoid the
		// AfterTurn closure keeping the full request body alive.
		bodyHash = service.HashUsageRequestPayload(wsMsg)

		if proxyErr := h.gatewayService.ProxyResponsesWebSocketFromClient(ctx, c, conn, acct, tok, wsMsg, hooks); proxyErr != nil {
			var failoverErr *service.UpstreamFailoverError
			if errors.As(proxyErr, &failoverErr) {
				h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, false, nil)
				freeAcctSlot()
				excludedAccounts[acct.ID] = struct{}{}
				lastFailover = failoverErr
				if switchesDone >= retryLimit {
					shutOpenAIWSFailoverExhausted(conn, failoverErr)
					return
				}
				switchesDone++
				if h.gatewayService.ShouldStopOpenAIOAuth429Failover(acct, failoverErr.StatusCode, switchesDone) {
					shutOpenAIWSFailoverExhausted(conn, failoverErr)
					return
				}
				h.gatewayService.RecordOpenAIAccountSwitch()
				reqLog.Warn("openai.websocket_upstream_failover_switching",
					zap.Int64("account_id", acct.ID),
					zap.Int("upstream_status", failoverErr.StatusCode),
					zap.Int("switch_count", switchesDone),
					zap.Int("max_switches", retryLimit),
				)
				if !reacquireUserSlot() {
					return
				}
				continue
			}

			h.gatewayService.ReportOpenAIAccountScheduleResult(acct.ID, false, nil)
			closeCode, closeReason := summarizeWSCloseErrorForLog(proxyErr)
			reqLog.Warn("openai.websocket_proxy_failed",
				zap.Int64("account_id", acct.ID),
				zap.Error(proxyErr),
				zap.String("close_status", closeCode),
				zap.String("close_reason", closeReason),
			)
			var clientCloseErr *service.OpenAIWSClientCloseError
			if errors.As(proxyErr, &clientCloseErr) {
				closeOpenAIClientWS(conn, clientCloseErr.StatusCode(), clientCloseErr.Reason())
				return
			}
			closeOpenAIClientWS(conn, coderws.StatusInternalError, "upstream websocket proxy failed")
			return
		}
		reqLog.Info("openai.websocket_ingress_closed", zap.Int64("account_id", acct.ID))
		return
	}

}

func (h *OpenAIGatewayHandler) recoverResponsesPanic(c *gin.Context, streamStarted *bool) {
	r := recover()
	if r == nil {
		return
	}

	started := streamStarted != nil && *streamStarted
	sentFallback := h.ensureForwardErrorResponse(c, started)
	requestLogger(c, "handler.openai_gateway.responses").Error(
		"openai.responses_panic_recovered",
		zap.Bool("fallback_error_response_written", sentFallback),
		zap.Any("panic", r),
		zap.ByteString("stack", debug.Stack()),
	)
}

// recoverAnthropicMessagesPanic recovers from panics in the Anthropic Messages
// handler and returns an Anthropic-formatted error response.
func (h *OpenAIGatewayHandler) recoverAnthropicMessagesPanic(c *gin.Context, streamStarted *bool) {
	r := recover()
	if r == nil {
		return
	}

	started := streamStarted != nil && *streamStarted
	requestLogger(c, "handler.openai_gateway.messages").Error(
		"openai.messages_panic_recovered",
		zap.Bool("stream_started", started),
		zap.Any("panic", r),
		zap.ByteString("stack", debug.Stack()),
	)
	if !started {
		h.anthropicErrorResponse(c, http.StatusInternalServerError, "api_error", "Internal server error")
	}
}

func (h *OpenAIGatewayHandler) ensureResponsesDependencies(c *gin.Context, reqLog *zap.Logger) bool {
	absent := h.listMissingDependencies()
	if len(absent) == 0 {
		return true
	}

	if reqLog == nil {
		reqLog = requestLogger(c, "handler.openai_gateway.responses")
	}
	reqLog.Error("openai.handler_dependencies_missing", zap.Strings("missing_dependencies", absent))

	if c != nil && c.Writer != nil && !c.Writer.Written() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": gin.H{
				"type":    "api_error",
				"message": "Service temporarily unavailable",
			},
		})
	}
	return false
}

func (h *OpenAIGatewayHandler) listMissingDependencies() []string {
	result := make([]string, 0, 5)
	if h == nil {
		return append(result, "handler")
	}
	if h.gatewayService == nil {
		result = append(result, "gatewayService")
	}
	if h.billingCacheService == nil {
		result = append(result, "billingCacheService")
	}
	if h.apiKeyService == nil {
		result = append(result, "apiKeyService")
	}
	if h.concurrencyHelper == nil || h.concurrencyHelper.concurrencyService == nil {
		result = append(result, "concurrencyHelper")
	}
	return result
}

func getContextInt64(c *gin.Context, key string) (int64, bool) {
	if c == nil || key == "" {
		return 0, false
	}
	v, ok := c.Get(key)
	if !ok {
		return 0, false
	}
	switch val := v.(type) {
	case int64:
		return val, true
	case int:
		return int64(val), true
	case int32:
		return int64(val), true
	case float64:
		return int64(val), true
	default:
		return 0, false
	}
}

func (h *OpenAIGatewayHandler) dispatchUsageRecord(parent context.Context, task service.UsageRecordTask) {
	if task == nil {
		return
	}
	task = enrichUsageRecordTask(parent, task)
	if h.usageRecordWorkerPool != nil {
		h.usageRecordWorkerPool.Submit(task)
		return
	}
	// Fallback: worker pool not injected; run synchronously to avoid unbounded goroutines.
	fallbackCtx, fallbackCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer fallbackCancel()
	defer func() {
		if rec := recover(); rec != nil {
			logger.L().With(
				zap.String("component", "handler.openai_gateway.responses"),
				zap.Any("panic", rec),
			).Error("openai.usage_record_task_panic_recovered")
		}
	}()
	task(fallbackCtx)
}

func (h *OpenAIGatewayHandler) submitOpenAIUsageRecordTask(parent context.Context, result *service.OpenAIForwardResult, task service.UsageRecordTask) {
	if result != nil && result.ImageCount > 0 {
		h.dispatchMandatoryUsageRecord(parent, task)
		return
	}
	h.dispatchUsageRecord(parent, task)
}

func (h *OpenAIGatewayHandler) dispatchMandatoryUsageRecord(parent context.Context, task service.UsageRecordTask) {
	if task == nil {
		return
	}
	task = enrichUsageRecordTask(parent, task)
	if h.usageRecordWorkerPool != nil {
		if mode := h.usageRecordWorkerPool.Submit(task); mode != service.UsageRecordSubmitModeDropped {
			return
		}
		logger.L().With(
			zap.String("component", "handler.openai_gateway.usage"),
		).Warn("openai.usage_record_task_mandatory_sync_fallback")
	}
	fallbackCtx, fallbackCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer fallbackCancel()
	defer func() {
		if rec := recover(); rec != nil {
			logger.L().With(
				zap.String("component", "handler.openai_gateway.usage"),
				zap.Any("panic", rec),
			).Error("openai.usage_record_task_panic_recovered")
		}
	}()
	task(fallbackCtx)
}

func (h *OpenAIGatewayHandler) acquireImageGenerationSlot(c *gin.Context, streamStarted bool) (func(), bool) {
	if h == nil || h.cfg == nil || h.imageLimiter == nil {
		return nil, true
	}
	imgCfg := h.cfg.Gateway.ImageConcurrency
	useWait := strings.TrimSpace(imgCfg.OverflowMode) == config.ImageConcurrencyOverflowModeWait
	releaseFunc, acquired := h.imageLimiter.Acquire(
		c.Request.Context(),
		imgCfg.Enabled,
		imgCfg.MaxConcurrentRequests,
		useWait,
		time.Duration(imgCfg.WaitTimeoutSeconds)*time.Second,
		imgCfg.MaxWaitingRequests,
	)
	if acquired {
		return releaseFunc, true
	}
	h.handleStreamingAwareError(c, http.StatusTooManyRequests, "rate_limit_error", "Image generation concurrency limit exceeded, please retry later", streamStarted)
	return nil, false
}

// handleConcurrencyError handles concurrency-related acquire errors.
func (h *OpenAIGatewayHandler) handleConcurrencyError(c *gin.Context, err error, slotType string, streamStarted bool) {
	code, errType, msg := concurrencyErrorResponse(err, slotType)
	h.handleStreamingAwareError(c, code, errType, msg, streamStarted)
}

func (h *OpenAIGatewayHandler) handleFailoverExhausted(c *gin.Context, failoverErr *service.UpstreamFailoverError, streamStarted bool) {
	upstreamStatus := failoverErr.StatusCode
	respBody := failoverErr.ResponseBody
	if service.IsOpenAISilentRefusalErrorBody(respBody) {
		service.SetOpsUpstreamError(c, upstreamStatus, service.OpenAISilentRefusalClientMessage(), "")
		h.handleStreamingAwareError(c, http.StatusBadGateway, "upstream_error", service.OpenAISilentRefusalClientMessage(), streamStarted)
		return
	}

	// Check passthrough rules first
	if h.errorPassthroughService != nil && len(respBody) > 0 {
		if rule := h.errorPassthroughService.MatchRule("openai", upstreamStatus, respBody); rule != nil {
			statusToSend := upstreamStatus
			if !rule.PassthroughCode && rule.ResponseCode != nil {
				statusToSend = *rule.ResponseCode
			}

			displayMsg := service.ExtractUpstreamErrorMessage(respBody)
			if !rule.PassthroughBody && rule.CustomMessage != nil {
				displayMsg = *rule.CustomMessage
			}

			if rule.SkipMonitoring {
				c.Set(service.OpsSkipPassthroughKey, true)
			}

			h.handleStreamingAwareError(c, statusToSend, "upstream_error", displayMsg, streamStarted)
			return
		}
	}

	// Record the raw upstream status for ops error logging
	upstreamMsg := service.ExtractUpstreamErrorMessage(respBody)
	service.SetOpsUpstreamError(c, upstreamStatus, upstreamMsg, "")

	// Apply the default error mapping
	code, errType, msg := h.mapUpstreamError(upstreamStatus)
	h.handleStreamingAwareError(c, code, errType, msg, streamStarted)
}

// handleFailoverExhaustedSimple is a simplified version for cases with no response body.
func (h *OpenAIGatewayHandler) handleFailoverExhaustedSimple(c *gin.Context, statusCode int, streamStarted bool) {
	code, errType, msg := h.mapUpstreamError(statusCode)
	service.SetOpsUpstreamError(c, statusCode, msg, "")
	h.handleStreamingAwareError(c, code, errType, msg, streamStarted)
}

func (h *OpenAIGatewayHandler) mapUpstreamError(statusCode int) (int, string, string) {
	switch statusCode {
	case 401:
		return http.StatusBadGateway, "upstream_error", "Upstream authentication failed, please contact administrator"
	case 403:
		return http.StatusBadGateway, "upstream_error", "Upstream access forbidden, please contact administrator"
	case 429:
		return http.StatusTooManyRequests, "rate_limit_error", "Upstream rate limit exceeded, please retry later"
	case 529:
		return http.StatusServiceUnavailable, "upstream_error", "Upstream service overloaded, please retry later"
	case 500, 502, 503, 504:
		return http.StatusBadGateway, "upstream_error", "Upstream service temporarily unavailable"
	default:
		return http.StatusBadGateway, "upstream_error", "Upstream request failed"
	}
}

// handleStreamingAwareError handles errors that may occur after streaming has started
func (h *OpenAIGatewayHandler) handleStreamingAwareError(c *gin.Context, status int, errType, message string, streamStarted bool) {
	if streamStarted {
		// Strict SDKs (e.g., Codex CLI) for /v1/responses require a terminal
		// event from the set {response.completed, failed, incomplete, cancelled}.
		// A generic `event: error` frame is not recognized as terminal and
		// triggers "stream closed before response.completed".
		if inboundIsResponses(c) {
			if writeResponsesFailedSSE(c, errType, message) {
				return
			}
		}
		// Stream already started: send error as SSE event then close.
		flusher, ok := c.Writer.(http.Flusher)
		if ok {
			// Build SSE error event with minimal allocation via Quote.
			errorEvent := "event: error\ndata: " + `{"error":{"type":` + strconv.Quote(errType) + `,"message":` + strconv.Quote(message) + `}}` + "\n\n"
			if _, writeErr := fmt.Fprint(c.Writer, errorEvent); writeErr != nil {
				_ = c.Error(writeErr)
			}
			flusher.Flush()
		}
		return
	}

	// Normal case: return JSON response with proper status code
	h.errorResponse(c, status, errType, message)
}

// ensureForwardErrorResponse writes a unified error response when Forward
// returns an error but nothing was written to the client yet.
func (h *OpenAIGatewayHandler) ensureForwardErrorResponse(c *gin.Context, streamStarted bool) bool {
	if c == nil || c.Writer == nil {
		return false
	}
	if service.IsResponseCommitted(c) {
		return false
	}
	if c.Writer.Written() {
		streamStarted = true
	}
	h.handleStreamingAwareError(c, http.StatusBadGateway, "upstream_error", "Upstream request failed", streamStarted)
	return true
}

func shouldLogOpenAIForwardFailureAsWarn(c *gin.Context, sentFallback bool) bool {
	if sentFallback {
		return false
	}
	if c == nil || c.Writer == nil {
		return false
	}
	return c.Writer.Written()
}

// openAIForwardErrorAlreadyCommunicatedV2 reports whether Forward returned an
// error after it had already written the upstream terminal error response to
// the client.
//
// This matters for Responses streams: upstream may return HTTP 200 with a
// non-retryable `response.failed` event (for example a policy/safety rejection).
// The service layer forwards that terminal event verbatim, then returns an
// error so the caller can log/account for the failed upstream response. The
// handler must not append its generic fallback `response.failed`, otherwise
// strict clients may see the useful upstream message replaced by "Upstream
// request failed" or receive duplicate terminal events.
func openAIForwardErrorAlreadyCommunicatedV2(c *gin.Context, writerSizeBefore int, err error) bool {
	if err == nil || c == nil || c.Writer == nil {
		return false
	}
	if c.Writer.Size() == writerSizeBefore {
		return false
	}

	errMsg := strings.TrimSpace(err.Error())
	for _, prefix := range []string{
		"upstream response failed:",
		"non-streaming openai protocol error:",
	} {
		if strings.HasPrefix(errMsg, prefix) {
			return true
		}
	}
	return false
}

// errorResponse returns OpenAI API format error response
func (h *OpenAIGatewayHandler) errorResponse(c *gin.Context, status int, errType, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"type":    errType,
			"message": message,
		},
	})
}

func setOpenAIClientTransportHTTP(c *gin.Context) {
	service.SetOpenAIClientTransport(c, service.OpenAIClientTransportHTTP)
}

func setOpenAIClientTransportWS(c *gin.Context) {
	service.SetOpenAIClientTransport(c, service.OpenAIClientTransportWS)
}

func ensureOpenAIPoolModeSessionHash(sessHash string, acct *service.Account) string {
	if sessHash != "" || acct == nil || !acct.IsPoolMode() {
		return sessHash
	}
	// Generate a one-time sticky key so same-account retries do not
	// re-enter load balancing.
	return "openai-pool-retry-" + uuid.NewString()
}

func openAIWSIngressFallbackSessionSeed(userID, apiKeyID int64, groupID *int64) string {
	gid := int64(0)
	if groupID != nil {
		gid = *groupID
	}
	return fmt.Sprintf("openai_ws_ingress:%d:%d:%d", gid, userID, apiKeyID)
}

func isOpenAIWSUpgradeRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(r.Header.Get("Upgrade")), "websocket") {
		return false
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(r.Header.Get("Connection"))), "upgrade")
}

func closeOpenAIClientWS(conn *coderws.Conn, status coderws.StatusCode, reason string) {
	if conn == nil {
		return
	}
	reason = strings.TrimSpace(reason)
	if len(reason) > 120 {
		reason = reason[:120]
	}
	_ = conn.Close(status, reason)
	_ = conn.CloseNow()
}

func shutOpenAIWSFailoverExhausted(conn *coderws.Conn, failoverErr *service.UpstreamFailoverError) {
	if failoverErr == nil {
		closeOpenAIClientWS(conn, coderws.StatusInternalError, "upstream websocket proxy failed")
		return
	}
	switch failoverErr.StatusCode {
	case http.StatusTooManyRequests:
		closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "upstream rate limit exceeded, please retry later")
	case 529, http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		closeOpenAIClientWS(conn, coderws.StatusTryAgainLater, "upstream service temporarily unavailable")
	case http.StatusUnauthorized, http.StatusForbidden:
		closeOpenAIClientWS(conn, coderws.StatusPolicyViolation, "upstream websocket authentication failed")
	default:
		closeOpenAIClientWS(conn, coderws.StatusInternalError, "upstream websocket proxy failed")
	}
}

func emitContentModerationWSError(ctx context.Context, conn *coderws.Conn, decision *service.ContentModerationDecision) {
	if conn == nil || decision == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	displayMsg := strings.TrimSpace(decision.Message)
	if displayMsg == "" {
		displayMsg = "content moderation blocked this request"
	}
	blob, marshalErr := json.Marshal(gin.H{
		"event_id": "evt_content_moderation_blocked",
		"type":     "error",
		"error": gin.H{
			"type":    "invalid_request_error",
			"code":    contentModerationErrorCode(decision),
			"message": displayMsg,
		},
	})
	if marshalErr != nil {
		blob = []byte(`{"event_id":"evt_content_moderation_blocked","type":"error","error":{"type":"invalid_request_error","code":"content_policy_violation","message":"content moderation blocked this request"}}`)
	}
	writeCtx, writeCancel := context.WithTimeout(ctx, 2*time.Second)
	defer writeCancel()
	_ = conn.Write(writeCtx, coderws.MessageText, blob)
}

// Backward-compatible aliases for callers in other handler files and tests.

func wrapUsageRecordTaskContextV2(parent context.Context, task service.UsageRecordTask) service.UsageRecordTask {
	return enrichUsageRecordTask(parent, task)
}

func (h *OpenAIGatewayHandler) submitUsageRecordTask(parent context.Context, task service.UsageRecordTask) {
	h.dispatchUsageRecord(parent, task)
}

func (h *OpenAIGatewayHandler) submitMandatoryUsageRecordTask(parent context.Context, task service.UsageRecordTask) {
	h.dispatchMandatoryUsageRecord(parent, task)
}

func (h *OpenAIGatewayHandler) missingResponsesDependencies() []string {
	return h.listMissingDependencies()
}

func lookupOpenAIMessagesMetadataSession(sessHash, cacheKey, model string, body []byte) (string, string) {
	return resolveMessagesMetadataSession(sessHash, cacheKey, model, body)
}

func summarizeWSCloseErrorForLog(err error) (string, string) {
	if err == nil {
		return "-", "-"
	}
	code := coderws.CloseStatus(err)
	if code == -1 {
		return "-", "-"
	}
	statusStr := fmt.Sprintf("%d(%s)", int(code), code.String())
	reasonStr := "-"
	var ce coderws.CloseError
	if errors.As(err, &ce) {
		if r := strings.TrimSpace(ce.Reason); r != "" {
			reasonStr = r
		}
	}
	return statusStr, reasonStr
}
