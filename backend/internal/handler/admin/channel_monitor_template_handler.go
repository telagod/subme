package admin

import (
	"strconv"
	"strings"
	"time"

	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"

	"github.com/gin-gonic/gin"
)

// ChannelMonitorRequestTemplateHandler serves admin request-template management endpoints.
type ChannelMonitorRequestTemplateHandler struct {
	templateService *service.ChannelMonitorRequestTemplateService
}

// NewChannelMonitorRequestTemplateHandler constructs a new handler instance.
func NewChannelMonitorRequestTemplateHandler(templateService *service.ChannelMonitorRequestTemplateService) *ChannelMonitorRequestTemplateHandler {
	return &ChannelMonitorRequestTemplateHandler{templateService: templateService}
}

// --- DTO ---

type channelMonitorTemplateCreateRequest struct {
	Name             string            `json:"name" binding:"required,max=100"`
	Provider         string            `json:"provider" binding:"required,oneof=openai anthropic gemini"`
	APIMode          string            `json:"api_mode" binding:"omitempty,oneof=chat_completions responses"`
	Description      string            `json:"description" binding:"max=500"`
	ExtraHeaders     map[string]string `json:"extra_headers"`
	BodyOverrideMode string            `json:"body_override_mode" binding:"omitempty,oneof=off merge replace"`
	BodyOverride     map[string]any    `json:"body_override"`
}

type channelMonitorTemplateUpdateRequest struct {
	Name             *string            `json:"name" binding:"omitempty,max=100"`
	APIMode          *string            `json:"api_mode" binding:"omitempty,oneof=chat_completions responses"`
	Description      *string            `json:"description" binding:"omitempty,max=500"`
	ExtraHeaders     *map[string]string `json:"extra_headers"`
	BodyOverrideMode *string            `json:"body_override_mode" binding:"omitempty,oneof=off merge replace"`
	BodyOverride     *map[string]any    `json:"body_override"`
}

type channelMonitorTemplateResponse struct {
	ID                 int64             `json:"id"`
	Name               string            `json:"name"`
	Provider           string            `json:"provider"`
	APIMode            string            `json:"api_mode"`
	Description        string            `json:"description"`
	ExtraHeaders       map[string]string `json:"extra_headers"`
	BodyOverrideMode   string            `json:"body_override_mode"`
	BodyOverride       map[string]any    `json:"body_override"`
	CreatedAt          string            `json:"created_at"`
	UpdatedAt          string            `json:"updated_at"`
	AssociatedMonitors int64             `json:"associated_monitors"`
}

func (h *ChannelMonitorRequestTemplateHandler) toResponse(c *gin.Context, tpl *service.ChannelMonitorRequestTemplate) *channelMonitorTemplateResponse {
	if tpl == nil {
		return nil
	}
	hdrs := tpl.ExtraHeaders
	if hdrs == nil {
		hdrs = map[string]string{}
	}
	monitorCount, _ := h.templateService.CountAssociatedMonitors(c.Request.Context(), tpl.ID)
	return &channelMonitorTemplateResponse{
		ID:                 tpl.ID,
		Name:               tpl.Name,
		Provider:           tpl.Provider,
		APIMode:            tpl.APIMode,
		Description:        tpl.Description,
		ExtraHeaders:       hdrs,
		BodyOverrideMode:   tpl.BodyOverrideMode,
		BodyOverride:       tpl.BodyOverride,
		CreatedAt:          tpl.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:          tpl.UpdatedAt.UTC().Format(time.RFC3339),
		AssociatedMonitors: monitorCount,
	}
}

// parseTemplateID extracts and validates the :id path parameter.
func parseTemplateID(c *gin.Context) (int64, bool) {
	tplID, parseErr := strconv.ParseInt(c.Param("id"), 10, 64)
	if parseErr != nil || tplID <= 0 {
		response.ErrorFrom(c, infraerrors.BadRequest("INVALID_TEMPLATE_ID", "template id is not valid"))
		return 0, false
	}
	return tplID, true
}

// --- Handlers ---

// List GET /api/v1/admin/channel-monitor-templates?provider=anthropic
func (h *ChannelMonitorRequestTemplateHandler) List(c *gin.Context) {
	templates, svcErr := h.templateService.List(c.Request.Context(), service.ChannelMonitorRequestTemplateListParams{
		Provider: strings.TrimSpace(c.Query("provider")),
		APIMode:  strings.TrimSpace(c.Query("api_mode")),
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	results := make([]*channelMonitorTemplateResponse, 0, len(templates))
	for _, tpl := range templates {
		results = append(results, h.toResponse(c, tpl))
	}
	response.Success(c, gin.H{"items": results})
}

// Get GET /api/v1/admin/channel-monitor-templates/:id
func (h *ChannelMonitorRequestTemplateHandler) Get(c *gin.Context) {
	tplID, valid := parseTemplateID(c)
	if !valid {
		return
	}
	tpl, svcErr := h.templateService.Get(c.Request.Context(), tplID)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, h.toResponse(c, tpl))
}

// Create POST /api/v1/admin/channel-monitor-templates
func (h *ChannelMonitorRequestTemplateHandler) Create(c *gin.Context) {
	var payload channelMonitorTemplateCreateRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", bindErr.Error()))
		return
	}
	created, svcErr := h.templateService.Create(c.Request.Context(), service.ChannelMonitorRequestTemplateCreateParams{
		Name:             payload.Name,
		Provider:         payload.Provider,
		APIMode:          payload.APIMode,
		Description:      payload.Description,
		ExtraHeaders:     payload.ExtraHeaders,
		BodyOverrideMode: payload.BodyOverrideMode,
		BodyOverride:     payload.BodyOverride,
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Created(c, h.toResponse(c, created))
}

// Update PUT /api/v1/admin/channel-monitor-templates/:id
func (h *ChannelMonitorRequestTemplateHandler) Update(c *gin.Context) {
	tplID, valid := parseTemplateID(c)
	if !valid {
		return
	}
	var payload channelMonitorTemplateUpdateRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", bindErr.Error()))
		return
	}
	updated, svcErr := h.templateService.Update(c.Request.Context(), tplID, service.ChannelMonitorRequestTemplateUpdateParams{
		Name:             payload.Name,
		APIMode:          payload.APIMode,
		Description:      payload.Description,
		ExtraHeaders:     payload.ExtraHeaders,
		BodyOverrideMode: payload.BodyOverrideMode,
		BodyOverride:     payload.BodyOverride,
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, h.toResponse(c, updated))
}

// Delete DELETE /api/v1/admin/channel-monitor-templates/:id
func (h *ChannelMonitorRequestTemplateHandler) Delete(c *gin.Context) {
	tplID, valid := parseTemplateID(c)
	if !valid {
		return
	}
	if svcErr := h.templateService.Delete(c.Request.Context(), tplID); svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, nil)
}

type channelMonitorTemplateApplyRequest struct {
	// MonitorIDs is required and non-empty: the set of monitor IDs selected
	// by the user in the picker UI that should inherit this template's settings.
	// Only monitors whose current template_id equals :id will actually be overwritten.
	MonitorIDs []int64 `json:"monitor_ids" binding:"required,min=1"`
}

// Apply POST /api/v1/admin/channel-monitor-templates/:id/apply
// Propagates the template's current settings to the monitors identified by monitor_ids.
func (h *ChannelMonitorRequestTemplateHandler) Apply(c *gin.Context) {
	tplID, valid := parseTemplateID(c)
	if !valid {
		return
	}
	var payload channelMonitorTemplateApplyRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.ErrorFrom(c, infraerrors.BadRequest("VALIDATION_ERROR", bindErr.Error()))
		return
	}
	rowsAffected, svcErr := h.templateService.ApplyToMonitors(c.Request.Context(), tplID, payload.MonitorIDs)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, gin.H{"affected": rowsAffected})
}

type associatedMonitorBriefResponse struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Provider string `json:"provider"`
	APIMode  string `json:"api_mode"`
	Enabled  bool   `json:"enabled"`
}

// AssociatedMonitors GET /api/v1/admin/channel-monitor-templates/:id/monitors
// Returns the monitors associated with this template (used by the picker modal).
func (h *ChannelMonitorRequestTemplateHandler) AssociatedMonitors(c *gin.Context) {
	tplID, valid := parseTemplateID(c)
	if !valid {
		return
	}
	monitors, svcErr := h.templateService.ListAssociatedMonitors(c.Request.Context(), tplID)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	results := make([]associatedMonitorBriefResponse, 0, len(monitors))
	for _, mon := range monitors {
		results = append(results, associatedMonitorBriefResponse{
			ID: mon.ID, Name: mon.Name, Provider: mon.Provider, APIMode: mon.APIMode, Enabled: mon.Enabled,
		})
	}
	response.Success(c, gin.H{"items": results})
}
