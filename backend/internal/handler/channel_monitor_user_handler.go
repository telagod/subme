package handler

import (
	"time"

	"github.com/telagod/subme/internal/handler/admin"
	"github.com/telagod/subme/internal/handler/dto"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"

	"github.com/gin-gonic/gin"
)

// ChannelMonitorUserHandler serves read-only channel-monitor endpoints for end users.
type ChannelMonitorUserHandler struct {
	monitorService *service.ChannelMonitorService
	settingService *service.SettingService
}

// NewChannelMonitorUserHandler constructs a new handler.
// settingService is consulted on every request to check the feature toggle;
// when disabled, List/GetStatus return empty/404 immediately.
func NewChannelMonitorUserHandler(
	monitorService *service.ChannelMonitorService,
	settingService *service.SettingService,
) *ChannelMonitorUserHandler {
	return &ChannelMonitorUserHandler{
		monitorService: monitorService,
		settingService: settingService,
	}
}

// featureEnabled reports whether the channel monitor feature is currently on.
// A nil settingService (e.g. in tests) is treated as enabled.
func (h *ChannelMonitorUserHandler) featureEnabled(c *gin.Context) bool {
	if h.settingService == nil {
		return true
	}
	return h.settingService.GetChannelMonitorRuntime(c.Request.Context()).Enabled
}

// --- Response ---

type channelMonitorUserListItem struct {
	ID                   int64                                `json:"id"`
	Name                 string                               `json:"name"`
	Provider             string                               `json:"provider"`
	GroupName            string                               `json:"group_name"`
	PrimaryModel         string                               `json:"primary_model"`
	PrimaryStatus        string                               `json:"primary_status"`
	PrimaryLatencyMs     *int                                 `json:"primary_latency_ms"`
	PrimaryPingLatencyMs *int                                 `json:"primary_ping_latency_ms"`
	Availability7d       float64                              `json:"availability_7d"`
	ExtraModels          []dto.ChannelMonitorExtraModelStatus `json:"extra_models"`
	Timeline             []channelMonitorUserTimelinePoint    `json:"timeline"`
}

// channelMonitorUserTimelinePoint represents a single timeline data point for
// the primary model's most recent check. Used only in the user view list response.
type channelMonitorUserTimelinePoint struct {
	Status        string `json:"status"`
	LatencyMs     *int   `json:"latency_ms"`
	PingLatencyMs *int   `json:"ping_latency_ms"`
	CheckedAt     string `json:"checked_at"`
}

type channelMonitorUserDetailResponse struct {
	ID        int64                         `json:"id"`
	Name      string                        `json:"name"`
	Provider  string                        `json:"provider"`
	GroupName string                        `json:"group_name"`
	Models    []channelMonitorUserModelStat `json:"models"`
}

type channelMonitorUserModelStat struct {
	Model           string  `json:"model"`
	LatestStatus    string  `json:"latest_status"`
	LatestLatencyMs *int    `json:"latest_latency_ms"`
	Availability7d  float64 `json:"availability_7d"`
	Availability15d float64 `json:"availability_15d"`
	Availability30d float64 `json:"availability_30d"`
	AvgLatency7dMs  *int    `json:"avg_latency_7d_ms"`
}

func convertUserMonitorView(src *service.UserMonitorView) channelMonitorUserListItem {
	extraStatuses := make([]dto.ChannelMonitorExtraModelStatus, 0, len(src.ExtraModels))
	for _, em := range src.ExtraModels {
		extraStatuses = append(extraStatuses, dto.ChannelMonitorExtraModelStatus{
			Model:     em.Model,
			Status:    em.Status,
			LatencyMs: em.LatencyMs,
		})
	}
	timelinePoints := make([]channelMonitorUserTimelinePoint, 0, len(src.Timeline))
	for _, pt := range src.Timeline {
		timelinePoints = append(timelinePoints, channelMonitorUserTimelinePoint{
			Status:        pt.Status,
			LatencyMs:     pt.LatencyMs,
			PingLatencyMs: pt.PingLatencyMs,
			CheckedAt:     pt.CheckedAt.UTC().Format(time.RFC3339),
		})
	}
	return channelMonitorUserListItem{
		ID:                   src.ID,
		Name:                 src.Name,
		Provider:             src.Provider,
		GroupName:            src.GroupName,
		PrimaryModel:         src.PrimaryModel,
		PrimaryStatus:        src.PrimaryStatus,
		PrimaryLatencyMs:     src.PrimaryLatencyMs,
		PrimaryPingLatencyMs: src.PrimaryPingLatencyMs,
		Availability7d:       src.Availability7d,
		ExtraModels:          extraStatuses,
		Timeline:             timelinePoints,
	}
}

func convertUserMonitorDetail(src *service.UserMonitorDetail) *channelMonitorUserDetailResponse {
	modelStats := make([]channelMonitorUserModelStat, 0, len(src.Models))
	for _, ms := range src.Models {
		modelStats = append(modelStats, channelMonitorUserModelStat{
			Model:           ms.Model,
			LatestStatus:    ms.LatestStatus,
			LatestLatencyMs: ms.LatestLatencyMs,
			Availability7d:  ms.Availability7d,
			Availability15d: ms.Availability15d,
			Availability30d: ms.Availability30d,
			AvgLatency7dMs:  ms.AvgLatency7dMs,
		})
	}
	return &channelMonitorUserDetailResponse{
		ID:        src.ID,
		Name:      src.Name,
		Provider:  src.Provider,
		GroupName: src.GroupName,
		Models:    modelStats,
	}
}

// --- Handlers ---

// List GET /api/v1/channel-monitors
func (h *ChannelMonitorUserHandler) List(c *gin.Context) {
	if !h.featureEnabled(c) {
		response.Success(c, gin.H{"items": []channelMonitorUserListItem{}})
		return
	}
	monitorViews, svcErr := h.monitorService.ListUserView(c.Request.Context())
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	rows := make([]channelMonitorUserListItem, 0, len(monitorViews))
	for _, mv := range monitorViews {
		rows = append(rows, convertUserMonitorView(mv))
	}
	response.Success(c, gin.H{"items": rows})
}

// GetStatus GET /api/v1/channel-monitors/:id/status
func (h *ChannelMonitorUserHandler) GetStatus(c *gin.Context) {
	if !h.featureEnabled(c) {
		response.ErrorFrom(c, service.ErrChannelMonitorNotFound)
		return
	}
	// Reuse admin.ParseChannelMonitorID to keep error codes and logging consistent.
	monitorID, valid := admin.ParseChannelMonitorID(c)
	if !valid {
		return
	}
	detail, svcErr := h.monitorService.GetUserDetail(c.Request.Context(), monitorID)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, convertUserMonitorDetail(detail))
}
