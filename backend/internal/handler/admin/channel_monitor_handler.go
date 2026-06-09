package admin

import (
	"strconv"
	"strings"
	"time"

	"github.com/telagod/subme/internal/handler/dto"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/response"
	middleware2 "github.com/telagod/subme/internal/server/middleware"
	"github.com/telagod/subme/internal/service"

	"github.com/gin-gonic/gin"
)

const (
	// monitorMaxPageSize is the upper bound for list pagination page size.
	monitorMaxPageSize = 100
	// monitorAPIKeyMaskPrefix is the number of leading plaintext characters to keep when masking.
	monitorAPIKeyMaskPrefix = 4
	// monitorAPIKeyMaskSuffix is the placeholder appended after the visible prefix.
	monitorAPIKeyMaskSuffix = "***"
)

// ChannelMonitorHandler serves admin channel-monitor endpoints.
type ChannelMonitorHandler struct {
	monitorService *service.ChannelMonitorService
}

// NewChannelMonitorHandler constructs a new handler instance.
func NewChannelMonitorHandler(monitorService *service.ChannelMonitorService) *ChannelMonitorHandler {
	return &ChannelMonitorHandler{monitorService: monitorService}
}

// --- Request / Response ---

type channelMonitorCreateRequest struct {
	Name             string            `json:"name" binding:"required,max=100"`
	Provider         string            `json:"provider" binding:"required,oneof=openai anthropic gemini"`
	APIMode          string            `json:"api_mode" binding:"omitempty,oneof=chat_completions responses"`
	Endpoint         string            `json:"endpoint" binding:"required,max=500"`
	APIKey           string            `json:"api_key" binding:"required,max=2000"`
	PrimaryModel     string            `json:"primary_model" binding:"required,max=200"`
	ExtraModels      []string          `json:"extra_models"`
	GroupName        string            `json:"group_name" binding:"max=100"`
	Enabled          *bool             `json:"enabled"`
	IntervalSeconds  int               `json:"interval_seconds" binding:"required,min=15,max=3600"`
	TemplateID       *int64            `json:"template_id"`
	ExtraHeaders     map[string]string `json:"extra_headers"`
	BodyOverrideMode string            `json:"body_override_mode" binding:"omitempty,oneof=off merge replace"`
	BodyOverride     map[string]any    `json:"body_override"`
}

type channelMonitorUpdateRequest struct {
	Name             *string            `json:"name" binding:"omitempty,max=100"`
	Provider         *string            `json:"provider" binding:"omitempty,oneof=openai anthropic gemini"`
	APIMode          *string            `json:"api_mode" binding:"omitempty,oneof=chat_completions responses"`
	Endpoint         *string            `json:"endpoint" binding:"omitempty,max=500"`
	APIKey           *string            `json:"api_key" binding:"omitempty,max=2000"`
	PrimaryModel     *string            `json:"primary_model" binding:"omitempty,max=200"`
	ExtraModels      *[]string          `json:"extra_models"`
	GroupName        *string            `json:"group_name" binding:"omitempty,max=100"`
	Enabled          *bool              `json:"enabled"`
	IntervalSeconds  *int               `json:"interval_seconds" binding:"omitempty,min=15,max=3600"`
	TemplateID       *int64             `json:"template_id"`
	ClearTemplate    bool               `json:"clear_template"` // when true, nullifies template_id and ignores TemplateID
	ExtraHeaders     *map[string]string `json:"extra_headers"`
	BodyOverrideMode *string            `json:"body_override_mode" binding:"omitempty,oneof=off merge replace"`
	BodyOverride     *map[string]any    `json:"body_override"`
}

type channelMonitorResponse struct {
	ID                  int64                                `json:"id"`
	Name                string                               `json:"name"`
	Provider            string                               `json:"provider"`
	APIMode             string                               `json:"api_mode"`
	Endpoint            string                               `json:"endpoint"`
	APIKeyMasked        string                               `json:"api_key_masked"`
	APIKeyDecryptFailed bool                                 `json:"api_key_decrypt_failed"`
	PrimaryModel        string                               `json:"primary_model"`
	ExtraModels         []string                             `json:"extra_models"`
	GroupName           string                               `json:"group_name"`
	Enabled             bool                                 `json:"enabled"`
	IntervalSeconds     int                                  `json:"interval_seconds"`
	LastCheckedAt       *string                              `json:"last_checked_at"`
	CreatedBy           int64                                `json:"created_by"`
	CreatedAt           string                               `json:"created_at"`
	UpdatedAt           string                               `json:"updated_at"`
	PrimaryStatus       string                               `json:"primary_status"`
	PrimaryLatencyMs    *int                                 `json:"primary_latency_ms"`
	Availability7d      float64                              `json:"availability_7d"`
	ExtraModelsStatus   []dto.ChannelMonitorExtraModelStatus `json:"extra_models_status"`
	// Request customization snapshot used by the frontend for advanced settings editing.
	TemplateID       *int64            `json:"template_id"`
	ExtraHeaders     map[string]string `json:"extra_headers"`
	BodyOverrideMode string            `json:"body_override_mode"`
	BodyOverride     map[string]any    `json:"body_override"`
}

type channelMonitorCheckResultResponse struct {
	Model         string `json:"model"`
	Status        string `json:"status"`
	LatencyMs     *int   `json:"latency_ms"`
	PingLatencyMs *int   `json:"ping_latency_ms"`
	Message       string `json:"message"`
	CheckedAt     string `json:"checked_at"`
}

type channelMonitorHistoryItemResponse struct {
	ID            int64  `json:"id"`
	Model         string `json:"model"`
	Status        string `json:"status"`
	LatencyMs     *int   `json:"latency_ms"`
	PingLatencyMs *int   `json:"ping_latency_ms"`
	Message       string `json:"message"`
	CheckedAt     string `json:"checked_at"`
}

// maskAPIKey redacts an API key: keeps the first 4 characters followed by "***".
// Keys with 4 or fewer characters are fully masked.
func maskAPIKey(plain string) string {
	if len(plain) <= monitorAPIKeyMaskPrefix {
		return monitorAPIKeyMaskSuffix
	}
	return plain[:monitorAPIKeyMaskPrefix] + monitorAPIKeyMaskSuffix
}

func channelMonitorToResponse(src *service.ChannelMonitor) *channelMonitorResponse {
	if src == nil {
		return nil
	}
	modelList := src.ExtraModels
	if modelList == nil {
		modelList = []string{}
	}
	hdrs := src.ExtraHeaders
	if hdrs == nil {
		hdrs = map[string]string{}
	}
	out := &channelMonitorResponse{
		ID:                  src.ID,
		Name:                src.Name,
		Provider:            src.Provider,
		APIMode:             src.APIMode,
		Endpoint:            src.Endpoint,
		APIKeyMasked:        maskAPIKey(src.APIKey),
		APIKeyDecryptFailed: src.APIKeyDecryptFailed,
		PrimaryModel:        src.PrimaryModel,
		ExtraModels:         modelList,
		GroupName:           src.GroupName,
		Enabled:             src.Enabled,
		IntervalSeconds:     src.IntervalSeconds,
		CreatedBy:           src.CreatedBy,
		CreatedAt:           src.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:           src.UpdatedAt.UTC().Format(time.RFC3339),
		TemplateID:          src.TemplateID,
		ExtraHeaders:        hdrs,
		BodyOverrideMode:    src.BodyOverrideMode,
		BodyOverride:        src.BodyOverride,
		// PrimaryStatus / PrimaryLatencyMs / Availability7d are populated by the List handler during batch aggregation.
	}
	if src.LastCheckedAt != nil {
		formatted := src.LastCheckedAt.UTC().Format(time.RFC3339)
		out.LastCheckedAt = &formatted
	}
	return out
}

func checkResultToResponse(cr *service.CheckResult) channelMonitorCheckResultResponse {
	return channelMonitorCheckResultResponse{
		Model:         cr.Model,
		Status:        cr.Status,
		LatencyMs:     cr.LatencyMs,
		PingLatencyMs: cr.PingLatencyMs,
		Message:       cr.Message,
		CheckedAt:     cr.CheckedAt.UTC().Format(time.RFC3339),
	}
}

func historyEntryToResponse(entry *service.ChannelMonitorHistoryEntry) channelMonitorHistoryItemResponse {
	return channelMonitorHistoryItemResponse{
		ID:            entry.ID,
		Model:         entry.Model,
		Status:        entry.Status,
		LatencyMs:     entry.LatencyMs,
		PingLatencyMs: entry.PingLatencyMs,
		Message:       entry.Message,
		CheckedAt:     entry.CheckedAt.UTC().Format(time.RFC3339),
	}
}

// ParseChannelMonitorID extracts and validates the :id path parameter (shared by admin and user handlers).
// On validation failure it writes a 4xx response; the caller should simply return.
func ParseChannelMonitorID(c *gin.Context) (int64, bool) {
	monitorID, parseErr := strconv.ParseInt(c.Param("id"), 10, 64)
	if parseErr != nil || monitorID <= 0 {
		response.ErrorFrom(c, infraerrors.BadRequest("INVALID_MONITOR_ID", "monitor id is not valid"))
		return 0, false
	}
	return monitorID, true
}

// parseListEnabled converts a raw enabled query value to *bool.
// Recognises true/false, 1/0, yes/no (case-insensitive). Returns nil for empty or unrecognised values.
func parseListEnabled(raw string) *bool {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	switch trimmed {
	case "true", "1", "yes":
		enabled := true
		return &enabled
	case "false", "0", "no":
		disabled := false
		return &disabled
	default:
		return nil
	}
}

// --- Handlers ---

// List GET /api/v1/admin/channel-monitors
func (h *ChannelMonitorHandler) List(c *gin.Context) {
	pg, pgSize := response.ParsePagination(c)
	if pgSize > monitorMaxPageSize {
		pgSize = monitorMaxPageSize
	}

	listParams := service.ChannelMonitorListParams{
		Page:     pg,
		PageSize: pgSize,
		Provider: strings.TrimSpace(c.Query("provider")),
		Enabled:  parseListEnabled(c.Query("enabled")),
		Search:   strings.TrimSpace(c.Query("search")),
	}

	monitors, totalCount, svcErr := h.monitorService.List(c.Request.Context(), listParams)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}

	statusMap := h.collectBatchSummaries(c, monitors)
	results := make([]*channelMonitorResponse, 0, len(monitors))
	for idx := range monitors {
		results = append(results, assembleListRow(monitors[idx], statusMap[monitors[idx].ID]))
	}
	response.Paginated(c, results, totalCount, pg, pgSize)
}

// collectBatchSummaries aggregates latest status and 7-day availability in a single batch query,
// eliminating per-row N+1 SQL calls.
func (h *ChannelMonitorHandler) collectBatchSummaries(c *gin.Context, monitors []*service.ChannelMonitor) map[int64]service.MonitorStatusSummary {
	monitorIDs := make([]int64, 0, len(monitors))
	primaryModelMap := make(map[int64]string, len(monitors))
	extraModelMap := make(map[int64][]string, len(monitors))
	for idx := range monitors {
		mon := monitors[idx]
		monitorIDs = append(monitorIDs, mon.ID)
		primaryModelMap[mon.ID] = mon.PrimaryModel
		extraModelMap[mon.ID] = mon.ExtraModels
	}
	return h.monitorService.BatchMonitorStatusSummary(c.Request.Context(), monitorIDs, primaryModelMap, extraModelMap)
}

// assembleListRow merges a monitor entity with its status summary into a single admin list response row.
func assembleListRow(mon *service.ChannelMonitor, summary service.MonitorStatusSummary) *channelMonitorResponse {
	row := channelMonitorToResponse(mon)
	row.PrimaryStatus = summary.PrimaryStatus
	row.PrimaryLatencyMs = summary.PrimaryLatencyMs
	row.Availability7d = summary.Availability7d
	row.ExtraModelsStatus = make([]dto.ChannelMonitorExtraModelStatus, 0, len(summary.ExtraModels))
	for _, extra := range summary.ExtraModels {
		row.ExtraModelsStatus = append(row.ExtraModelsStatus, dto.ChannelMonitorExtraModelStatus{
			Model:     extra.Model,
			Status:    extra.Status,
			LatencyMs: extra.LatencyMs,
		})
	}
	return row
}

// Get GET /api/v1/admin/channel-monitors/:id
func (h *ChannelMonitorHandler) Get(c *gin.Context) {
	monitorID, valid := ParseChannelMonitorID(c)
	if !valid {
		return
	}
	monitor, svcErr := h.monitorService.Get(c.Request.Context(), monitorID)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, channelMonitorToResponse(monitor))
}

// Create POST /api/v1/admin/channel-monitors
func (h *ChannelMonitorHandler) Create(c *gin.Context) {
	var payload channelMonitorCreateRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", bindErr.Error()))
		return
	}

	authSubject, _ := middleware2.GetAuthSubjectFromContext(c)

	isEnabled := true
	if payload.Enabled != nil {
		isEnabled = *payload.Enabled
	}

	created, svcErr := h.monitorService.Create(c.Request.Context(), service.ChannelMonitorCreateParams{
		Name:             payload.Name,
		Provider:         payload.Provider,
		APIMode:          payload.APIMode,
		Endpoint:         payload.Endpoint,
		APIKey:           payload.APIKey,
		PrimaryModel:     payload.PrimaryModel,
		ExtraModels:      payload.ExtraModels,
		GroupName:        payload.GroupName,
		Enabled:          isEnabled,
		IntervalSeconds:  payload.IntervalSeconds,
		CreatedBy:        authSubject.UserID,
		TemplateID:       payload.TemplateID,
		ExtraHeaders:     payload.ExtraHeaders,
		BodyOverrideMode: payload.BodyOverrideMode,
		BodyOverride:     payload.BodyOverride,
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Created(c, channelMonitorToResponse(created))
}

// Update PUT /api/v1/admin/channel-monitors/:id
func (h *ChannelMonitorHandler) Update(c *gin.Context) {
	monitorID, valid := ParseChannelMonitorID(c)
	if !valid {
		return
	}
	var payload channelMonitorUpdateRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", bindErr.Error()))
		return
	}

	updated, svcErr := h.monitorService.Update(c.Request.Context(), monitorID, service.ChannelMonitorUpdateParams{
		Name:             payload.Name,
		Provider:         payload.Provider,
		APIMode:          payload.APIMode,
		Endpoint:         payload.Endpoint,
		APIKey:           payload.APIKey,
		PrimaryModel:     payload.PrimaryModel,
		ExtraModels:      payload.ExtraModels,
		GroupName:        payload.GroupName,
		Enabled:          payload.Enabled,
		IntervalSeconds:  payload.IntervalSeconds,
		TemplateID:       payload.TemplateID,
		ClearTemplate:    payload.ClearTemplate,
		ExtraHeaders:     payload.ExtraHeaders,
		BodyOverrideMode: payload.BodyOverrideMode,
		BodyOverride:     payload.BodyOverride,
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, channelMonitorToResponse(updated))
}

// Delete DELETE /api/v1/admin/channel-monitors/:id
func (h *ChannelMonitorHandler) Delete(c *gin.Context) {
	monitorID, valid := ParseChannelMonitorID(c)
	if !valid {
		return
	}
	if svcErr := h.monitorService.Delete(c.Request.Context(), monitorID); svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, nil)
}

// Run POST /api/v1/admin/channel-monitors/:id/run
func (h *ChannelMonitorHandler) Run(c *gin.Context) {
	monitorID, valid := ParseChannelMonitorID(c)
	if !valid {
		return
	}
	checkResults, svcErr := h.monitorService.RunCheck(c.Request.Context(), monitorID)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	converted := make([]channelMonitorCheckResultResponse, 0, len(checkResults))
	for idx := range checkResults {
		converted = append(converted, checkResultToResponse(checkResults[idx]))
	}
	response.Success(c, gin.H{"results": converted})
}

// History GET /api/v1/admin/channel-monitors/:id/history
func (h *ChannelMonitorHandler) History(c *gin.Context) {
	monitorID, valid := ParseChannelMonitorID(c)
	if !valid {
		return
	}
	cap := parseHistoryLimit(c.Query("limit"))
	modelFilter := strings.TrimSpace(c.Query("model"))

	historyEntries, svcErr := h.monitorService.ListHistory(c.Request.Context(), monitorID, modelFilter, cap)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	converted := make([]channelMonitorHistoryItemResponse, 0, len(historyEntries))
	for idx := range historyEntries {
		converted = append(converted, historyEntryToResponse(historyEntries[idx]))
	}
	response.Success(c, gin.H{"items": converted})
}

// parseHistoryLimit interprets the raw limit query parameter for the history endpoint.
// Uses the service package's shared boundary constants to avoid duplicating magic values in the handler.
func parseHistoryLimit(raw string) int {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return service.MonitorHistoryDefaultLimit
	}
	parsed, convErr := strconv.Atoi(trimmed)
	if convErr != nil || parsed <= 0 {
		return service.MonitorHistoryDefaultLimit
	}
	if parsed > service.MonitorHistoryMaxLimit {
		return service.MonitorHistoryMaxLimit
	}
	return parsed
}
