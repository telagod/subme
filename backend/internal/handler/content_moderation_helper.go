package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/telagod/subme/internal/pkg/ctxkey"
	middleware2 "github.com/telagod/subme/internal/server/middleware"
	"github.com/telagod/subme/internal/service"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func (h *GatewayHandler) checkContentModeration(c *gin.Context, reqLog *zap.Logger, apiKey *service.APIKey, subject middleware2.AuthSubject, protocol string, model string, body []byte) *service.ContentModerationDecision {
	if h == nil || h.contentModerationService == nil {
		return nil
	}
	return runContentModeration(c, reqLog, h.contentModerationService, apiKey, subject, protocol, model, body)
}

func contentModerationStatus(decision *service.ContentModerationDecision) int {
	if decision != nil && decision.StatusCode >= 400 && decision.StatusCode <= 599 {
		return decision.StatusCode
	}
	return http.StatusForbidden
}

func contentModerationErrorCode(decision *service.ContentModerationDecision) string {
	return "content_policy_violation"
}

func (h *OpenAIGatewayHandler) checkContentModeration(c *gin.Context, reqLog *zap.Logger, apiKey *service.APIKey, subject middleware2.AuthSubject, protocol string, model string, body []byte) *service.ContentModerationDecision {
	if h == nil || h.contentModerationService == nil {
		return nil
	}
	return runContentModeration(c, reqLog, h.contentModerationService, apiKey, subject, protocol, model, body)
}

func runContentModeration(c *gin.Context, reqLog *zap.Logger, svc *service.ContentModerationService, apiKey *service.APIKey, subject middleware2.AuthSubject, protocol string, model string, body []byte) *service.ContentModerationDecision {
	if svc == nil || c == nil || c.Request == nil {
		return nil
	}

	moderationInput := assembleModerationInput(c, apiKey, subject, protocol, model, body)

	if reqLog != nil {
		reqLog.Info("content_moderation.gateway_check_start",
			zap.String("request_id", moderationInput.RequestID),
			zap.Int64("user_id", moderationInput.UserID),
			zap.Int64("api_key_id", moderationInput.APIKeyID),
			zap.String("api_key_name", moderationInput.APIKeyName),
			zap.Int64p("group_id", moderationInput.GroupID),
			zap.String("group_name", moderationInput.GroupName),
			zap.String("endpoint", moderationInput.Endpoint),
			zap.String("provider", moderationInput.Provider),
			zap.String("protocol", moderationInput.Protocol),
			zap.String("model", moderationInput.Model),
			zap.Int("body_bytes", len(body)),
		)
	}

	outcome, checkErr := svc.Check(c.Request.Context(), moderationInput)
	if checkErr != nil {
		if reqLog != nil {
			reqLog.Warn("content_moderation.check_failed", zap.Error(checkErr))
		}
		return nil
	}

	if reqLog != nil && outcome != nil {
		reqLog.Info("content_moderation.gateway_check_done",
			zap.String("request_id", moderationInput.RequestID),
			zap.Bool("allowed", outcome.Allowed),
			zap.Bool("blocked", outcome.Blocked),
			zap.Bool("flagged", outcome.Flagged),
			zap.String("action", outcome.Action),
			zap.Int("status_code", outcome.StatusCode),
			zap.String("highest_category", outcome.HighestCategory),
			zap.Float64("highest_score", outcome.HighestScore),
		)
	}
	return outcome
}

func assembleModerationInput(c *gin.Context, apiKey *service.APIKey, subject middleware2.AuthSubject, protocol string, model string, body []byte) service.ContentModerationCheckInput {
	result := service.ContentModerationCheckInput{
		RequestID: extractModerationRequestID(c.Request.Context()),
		UserID:    subject.UserID,
		Endpoint:  GetInboundEndpoint(c),
		Provider:  deriveProviderFromKey(apiKey),
		Model:     strings.TrimSpace(model),
		Protocol:  protocol,
		Body:      body,
	}

	// Override provider when a forced platform is present in context.
	if overridePlatform, found := middleware2.GetForcePlatformFromContext(c); found {
		result.Provider = strings.TrimSpace(overridePlatform)
	}

	if apiKey != nil {
		result.APIKeyID = apiKey.ID
		result.APIKeyName = apiKey.Name

		if apiKey.User != nil {
			result.UserEmail = apiKey.User.Email
		}

		if apiKey.GroupID != nil {
			gid := *apiKey.GroupID
			result.GroupID = &gid
		}

		if apiKey.Group != nil {
			result.GroupName = apiKey.Group.Name
		}
	}

	// Fall back to raw URL path when inbound endpoint is empty.
	if result.Endpoint == "" && c.Request != nil && c.Request.URL != nil {
		result.Endpoint = c.Request.URL.Path
	}

	return result
}

func deriveProviderFromKey(apiKey *service.APIKey) string {
	if apiKey == nil || apiKey.Group == nil {
		return ""
	}
	return strings.TrimSpace(apiKey.Group.Platform)
}

func extractModerationRequestID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if rid, ok := ctx.Value(ctxkey.RequestID).(string); ok {
		return strings.TrimSpace(rid)
	}
	return ""
}
