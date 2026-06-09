package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	pkghttputil "github.com/telagod/subme/internal/pkg/httputil"
	"github.com/telagod/subme/internal/pkg/ip"
	"github.com/telagod/subme/internal/pkg/logger"
	middleware2 "github.com/telagod/subme/internal/server/middleware"
	"github.com/telagod/subme/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// Embeddings handles the OpenAI-compatible Embeddings API.
// POST /v1/embeddings
func (h *OpenAIGatewayHandler) Embeddings(c *gin.Context) {
	sseStarted := false
	reqStart := time.Now()

	callerKey, keyOK := middleware2.GetAPIKeyFromContext(c)
	if !keyOK {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "API key is missing or invalid")
		return
	}

	authSubject, subjectOK := middleware2.GetAuthSubjectFromContext(c)
	if !subjectOK {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "Could not resolve user context")
		return
	}
	log := requestLogger(
		c,
		"handler.openai_gateway.embeddings",
		zap.Int64("user_id", authSubject.UserID),
		zap.Int64("api_key_id", callerKey.ID),
		zap.Any("group_id", callerKey.GroupID),
	)
	if !h.ensureResponsesDependencies(c, log) {
		return
	}

	rawBody, readErr := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if readErr != nil {
		if sizeErr, ok := extractMaxBytesError(readErr); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(sizeErr.Limit))
			return
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Could not read request body")
		return
	}
	if len(rawBody) == 0 {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body must not be empty")
		return
	}
	if !gjson.ValidBytes(rawBody) {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body is not valid JSON")
		return
	}

	modelField := gjson.GetBytes(rawBody, "model")
	if !modelField.Exists() || modelField.Type != gjson.String || strings.TrimSpace(modelField.String()) == "" {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return
	}
	requestedModel := modelField.String()
	log = log.With(zap.String("model", requestedModel))
	assignOpsRequestContext(c, requestedModel, false)
	setOpsEndpointContext(c, "", int16(service.RequestTypeSync))

	mapping, _ := h.gatewayService.ResolveChannelMappingAndRestrict(c.Request.Context(), callerKey.GroupID, requestedModel)

	activeSub, _ := middleware2.GetSubscriptionFromContext(c)
	service.SetOpsLatencyMs(c, service.OpsAuthLatencyMsKey, time.Since(reqStart).Milliseconds())

	slotRelease, slotOK := h.acquireResponsesUserSlot(c, authSubject.UserID, authSubject.Concurrency, false, &sseStarted, log)
	if !slotOK {
		return
	}
	if slotRelease != nil {
		defer slotRelease()
	}

	if billingErr := h.billingCacheService.CheckBillingEligibility(c.Request.Context(), callerKey.User, callerKey, callerKey.Group, activeSub, service.QuotaPlatform(c.Request.Context(), callerKey)); billingErr != nil {
		log.Info("openai_embeddings.billing_check_failed", zap.Error(billingErr))
		httpStatus, errCode, errMsg, retryDelay := billingErrorDetails(billingErr)
		if retryDelay > 0 {
			c.Header("Retry-After", strconv.Itoa(retryDelay))
		}
		h.errorResponse(c, httpStatus, errCode, errMsg)
		return
	}

	excludedAccounts := make(map[int64]struct{})
	var prevFailoverErr *service.UpstreamFailoverError
	switchAttempts := 0
	maxSwitches := h.maxAccountSwitches
	if maxSwitches <= 0 {
		maxSwitches = 3
	}
	routeStart := time.Now()

	for {
		picked, _, selectErr := h.gatewayService.SelectAccountWithSchedulerForCapability(
			c.Request.Context(),
			callerKey.GroupID,
			"",
			"",
			requestedModel,
			excludedAccounts,
			service.OpenAIUpstreamTransportHTTPSSE,
			service.OpenAIEndpointCapabilityEmbeddings,
			false,
		)
		if selectErr != nil {
			log.Warn("openai_embeddings.account_select_failed",
				zap.Error(selectErr),
				zap.Int("excluded_account_count", len(excludedAccounts)),
			)
			if len(excludedAccounts) == 0 {
				markOpsRoutingCapacityLimitedIfNoAvailableV2(c, selectErr)
				h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "All upstream accounts are temporarily unavailable")
				return
			}
			if prevFailoverErr != nil {
				h.handleFailoverExhausted(c, prevFailoverErr, false)
			} else {
				h.errorResponse(c, http.StatusBadGateway, "api_error", "Upstream request could not be completed")
			}
			return
		}
		if picked == nil || picked.Account == nil {
			markOpsRoutingCapacityLimitedV2(c)
			h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "No upstream accounts available for this request")
			return
		}
		upstreamAccount := picked.Account
		setOpsSelectedAccount(c, upstreamAccount.ID, upstreamAccount.Platform)

		acctSlotRelease, acctSlotOK := h.acquireResponsesAccountSlot(c, callerKey.GroupID, "", picked, false, &sseStarted, log)
		if !acctSlotOK {
			return
		}

		service.SetOpsLatencyMs(c, service.OpsRoutingLatencyMsKey, time.Since(routeStart).Milliseconds())
		fwdStart := time.Now()

		bodyToForward := rawBody
		if mapping.Mapped {
			bodyToForward = h.gatewayService.ReplaceModelInBody(rawBody, mapping.MappedModel)
		}
		writerSizeSnapshot := c.Writer.Size()
		fwdResult, fwdErr := func() (*service.OpenAIForwardResult, error) {
			defer func() {
				if acctSlotRelease != nil {
					acctSlotRelease()
				}
			}()
			return h.gatewayService.ForwardEmbeddings(c.Request.Context(), c, upstreamAccount, bodyToForward, "")
		}()

		fwdDuration := time.Since(fwdStart).Milliseconds()
		upstreamLatency, _ := getContextInt64(c, service.OpsUpstreamLatencyMsKey)
		respLatency := fwdDuration
		if upstreamLatency > 0 && fwdDuration > upstreamLatency {
			respLatency = fwdDuration - upstreamLatency
		}
		service.SetOpsLatencyMs(c, service.OpsResponseLatencyMsKey, respLatency)

		if fwdErr != nil {
			var failoverErr *service.UpstreamFailoverError
			if errors.As(fwdErr, &failoverErr) {
				if c.Writer.Size() != writerSizeSnapshot {
					h.handleFailoverExhausted(c, failoverErr, true)
					return
				}
				h.gatewayService.ReportOpenAIAccountScheduleResult(upstreamAccount.ID, false, nil)
				h.gatewayService.RecordOpenAIAccountSwitch()
				excludedAccounts[upstreamAccount.ID] = struct{}{}
				prevFailoverErr = failoverErr
				if switchAttempts >= maxSwitches {
					h.handleFailoverExhausted(c, failoverErr, false)
					return
				}
				switchAttempts++
				log.Warn("openai_embeddings.upstream_failover_switching",
					zap.Int64("account_id", upstreamAccount.ID),
					zap.Int("upstream_status", failoverErr.StatusCode),
					zap.Int("switch_count", switchAttempts),
					zap.Int("max_switches", maxSwitches),
				)
				continue
			}
			h.gatewayService.ReportOpenAIAccountScheduleResult(upstreamAccount.ID, false, nil)
			if c.Writer.Size() == writerSizeSnapshot {
				h.errorResponse(c, http.StatusBadGateway, "upstream_error", "Upstream request could not be completed")
			}
			log.Warn("openai_embeddings.forward_failed",
				zap.Int64("account_id", upstreamAccount.ID),
				zap.Error(fwdErr),
			)
			return
		}

		h.gatewayService.ReportOpenAIAccountScheduleResult(upstreamAccount.ID, true, nil)
		callerUA := c.GetHeader("User-Agent")
		callerIP := ip.GetClientIP(c)
		inEndpoint := GetInboundEndpoint(c)
		outEndpoint := GetUpstreamEndpoint(c, upstreamAccount.Platform)

		h.submitOpenAIUsageRecordTask(c.Request.Context(), fwdResult, func(bgCtx context.Context) {
			if recErr := h.gatewayService.RecordUsage(bgCtx, &service.OpenAIRecordUsageInput{
				Result:             fwdResult,
				APIKey:             callerKey,
				User:               callerKey.User,
				Account:            upstreamAccount,
				Subscription:       activeSub,
				InboundEndpoint:    inEndpoint,
				UpstreamEndpoint:   outEndpoint,
				UserAgent:          callerUA,
				IPAddress:          callerIP,
				APIKeyService:      h.apiKeyService,
				ChannelUsageFields: mapping.ToUsageFields(requestedModel, fwdResult.UpstreamModel),
			}); recErr != nil {
				logger.L().With(
					zap.String("component", "handler.openai_gateway.embeddings"),
					zap.Int64("user_id", authSubject.UserID),
					zap.Int64("api_key_id", callerKey.ID),
					zap.Any("group_id", callerKey.GroupID),
					zap.String("model", requestedModel),
					zap.Int64("account_id", upstreamAccount.ID),
				).Error("openai_embeddings.record_usage_failed", zap.Error(recErr))
			}
		})
		log.Debug("openai_embeddings.request_completed",
			zap.Int64("account_id", upstreamAccount.ID),
			zap.Int("switch_count", switchAttempts),
		)
		return
	}
}
