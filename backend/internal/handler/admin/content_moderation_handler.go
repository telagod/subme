package admin

import (
	"strconv"
	"strings"
	"time"

	"github.com/telagod/subme/internal/pkg/pagination"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"
	"github.com/gin-gonic/gin"
)

type ContentModerationHandler struct {
	service *service.ContentModerationService
}

func NewContentModerationHandler(svc *service.ContentModerationService) *ContentModerationHandler {
	return &ContentModerationHandler{service: svc}
}

type contentModerationConfigRequest struct {
	Enabled              *bool                                 `json:"enabled"`
	Mode                 *string                               `json:"mode"`
	BaseURL              *string                               `json:"base_url"`
	Model                *string                               `json:"model"`
	APIKey               *string                               `json:"api_key"`
	APIKeys              *[]string                             `json:"api_keys"`
	APIKeysMode          string                                `json:"api_keys_mode"`
	DeleteAPIKeyHashes   *[]string                             `json:"delete_api_key_hashes"`
	ClearAPIKey          bool                                  `json:"clear_api_key"`
	TimeoutMS            *int                                  `json:"timeout_ms"`
	SampleRate           *int                                  `json:"sample_rate"`
	AllGroups            *bool                                 `json:"all_groups"`
	GroupIDs             *[]int64                              `json:"group_ids"`
	RecordNonHits        *bool                                 `json:"record_non_hits"`
	Thresholds           *map[string]float64                   `json:"thresholds"`
	WorkerCount          *int                                  `json:"worker_count"`
	QueueSize            *int                                  `json:"queue_size"`
	BlockStatus          *int                                  `json:"block_status"`
	BlockMessage         *string                               `json:"block_message"`
	EmailOnHit           *bool                                 `json:"email_on_hit"`
	AutoBanEnabled       *bool                                 `json:"auto_ban_enabled"`
	BanThreshold         *int                                  `json:"ban_threshold"`
	ViolationWindowHours *int                                  `json:"violation_window_hours"`
	RetryCount           *int                                  `json:"retry_count"`
	HitRetentionDays     *int                                  `json:"hit_retention_days"`
	NonHitRetentionDays  *int                                  `json:"non_hit_retention_days"`
	PreHashCheckEnabled  *bool                                 `json:"pre_hash_check_enabled"`
	BlockedKeywords      *[]string                             `json:"blocked_keywords"`
	KeywordBlockingMode  *string                               `json:"keyword_blocking_mode"`
	ModelFilter          *service.ContentModerationModelFilter `json:"model_filter"`
}

type contentModerationAPIKeyTestRequest struct {
	APIKeys   []string `json:"api_keys"`
	BaseURL   string   `json:"base_url"`
	Model     string   `json:"model"`
	TimeoutMS int      `json:"timeout_ms"`
	Prompt    string   `json:"prompt"`
	Images    []string `json:"images"`
}

type contentModerationHashRequest struct {
	InputHash string `json:"input_hash"`
}

func (h *ContentModerationHandler) GetConfig(c *gin.Context) {
	cfg, svcErr := h.service.GetConfig(c.Request.Context())
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, cfg)
}

func (h *ContentModerationHandler) UpdateConfig(c *gin.Context) {
	var payload contentModerationConfigRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.BadRequest(c, "Malformed request body: "+bindErr.Error())
		return
	}
	cfg, svcErr := h.service.UpdateConfig(c.Request.Context(), service.UpdateContentModerationConfigInput{
		Enabled:              payload.Enabled,
		Mode:                 payload.Mode,
		BaseURL:              payload.BaseURL,
		Model:                payload.Model,
		APIKey:               payload.APIKey,
		APIKeys:              payload.APIKeys,
		APIKeysMode:          payload.APIKeysMode,
		DeleteAPIKeyHashes:   payload.DeleteAPIKeyHashes,
		ClearAPIKey:          payload.ClearAPIKey,
		TimeoutMS:            payload.TimeoutMS,
		SampleRate:           payload.SampleRate,
		AllGroups:            payload.AllGroups,
		GroupIDs:             payload.GroupIDs,
		RecordNonHits:        payload.RecordNonHits,
		Thresholds:           payload.Thresholds,
		WorkerCount:          payload.WorkerCount,
		QueueSize:            payload.QueueSize,
		BlockStatus:          payload.BlockStatus,
		BlockMessage:         payload.BlockMessage,
		EmailOnHit:           payload.EmailOnHit,
		AutoBanEnabled:       payload.AutoBanEnabled,
		BanThreshold:         payload.BanThreshold,
		ViolationWindowHours: payload.ViolationWindowHours,
		RetryCount:           payload.RetryCount,
		HitRetentionDays:     payload.HitRetentionDays,
		NonHitRetentionDays:  payload.NonHitRetentionDays,
		PreHashCheckEnabled:  payload.PreHashCheckEnabled,
		BlockedKeywords:      payload.BlockedKeywords,
		KeywordBlockingMode:  payload.KeywordBlockingMode,
		ModelFilter:          payload.ModelFilter,
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, cfg)
}

func (h *ContentModerationHandler) TestAPIKeys(c *gin.Context) {
	var payload contentModerationAPIKeyTestRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.BadRequest(c, "Malformed request body: "+bindErr.Error())
		return
	}
	testResult, svcErr := h.service.TestAPIKeys(c.Request.Context(), service.TestContentModerationAPIKeysInput{
		APIKeys:   payload.APIKeys,
		BaseURL:   payload.BaseURL,
		Model:     payload.Model,
		TimeoutMS: payload.TimeoutMS,
		Prompt:    payload.Prompt,
		Images:    payload.Images,
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, testResult)
}

func (h *ContentModerationHandler) GetStatus(c *gin.Context) {
	statusInfo, svcErr := h.service.GetStatus(c.Request.Context())
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, statusInfo)
}

func (h *ContentModerationHandler) ListLogs(c *gin.Context) {
	pg, pgSize := response.ParsePagination(c)
	logFilter := service.ContentModerationLogFilter{
		Pagination: pagination.PaginationParams{
			Page:      pg,
			PageSize:  pgSize,
			SortOrder: pagination.SortOrderDesc,
		},
		Result:   c.Query("result"),
		Endpoint: c.Query("endpoint"),
		Search:   c.Query("search"),
	}
	if rawGroup := strings.TrimSpace(c.Query("group_id")); rawGroup != "" {
		gid, convErr := strconv.ParseInt(rawGroup, 10, 64)
		if convErr != nil || gid <= 0 {
			response.BadRequest(c, "group_id is not valid")
			return
		}
		logFilter.GroupID = &gid
	}
	if rawFrom := strings.TrimSpace(c.Query("from")); rawFrom != "" {
		fromTime, _, parseErr := interpretModerationDate(rawFrom)
		if parseErr != nil {
			response.BadRequest(c, "from date is not valid")
			return
		}
		logFilter.From = &fromTime
	}
	if rawTo := strings.TrimSpace(c.Query("to")); rawTo != "" {
		toTime, isDateOnly, parseErr := interpretModerationDate(rawTo)
		if parseErr != nil {
			response.BadRequest(c, "to date is not valid")
			return
		}
		if isDateOnly {
			toTime = toTime.Add(24*time.Hour - time.Nanosecond)
		}
		logFilter.To = &toTime
	}
	logEntries, pgResult, svcErr := h.service.ListLogs(c.Request.Context(), logFilter)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Paginated(c, logEntries, pgResult.Total, pgResult.Page, pgResult.PageSize)
}

func (h *ContentModerationHandler) UnbanUser(c *gin.Context) {
	uid, convErr := strconv.ParseInt(strings.TrimSpace(c.Param("user_id")), 10, 64)
	if convErr != nil || uid <= 0 {
		response.BadRequest(c, "user_id is not valid")
		return
	}
	unbanResult, svcErr := h.service.UnbanUser(c.Request.Context(), uid)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, unbanResult)
}

func (h *ContentModerationHandler) DeleteFlaggedHash(c *gin.Context) {
	var payload contentModerationHashRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.BadRequest(c, "Malformed request body: "+bindErr.Error())
		return
	}
	deleteResult, svcErr := h.service.DeleteFlaggedInputHash(c.Request.Context(), payload.InputHash)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, deleteResult)
}

func (h *ContentModerationHandler) ClearFlaggedHashes(c *gin.Context) {
	clearResult, svcErr := h.service.ClearFlaggedInputHashes(c.Request.Context())
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, clearResult)
}

// interpretModerationDate attempts to parse a date string first as RFC3339 then as a bare date.
// Returns (time, isDateOnly, error).
func interpretModerationDate(raw string) (time.Time, bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return time.Time{}, false, nil
	}
	if ts, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return ts, false, nil
	}
	ts, parseErr := time.Parse("2006-01-02", trimmed)
	return ts, parseErr == nil, parseErr
}
