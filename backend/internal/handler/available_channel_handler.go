package handler

import (
	"sort"

	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/server/middleware"
	"github.com/telagod/subme/internal/service"

	"github.com/gin-gonic/gin"
)

// AvailableChannelHandler serves the user-facing "available channels" query.
//
// The user-side endpoint delegates to ChannelService.ListAvailable and applies
// three filtering layers before returning:
//  1. Row filter: only channels whose status is Active and whose groups
//     intersect with the current user's accessible groups are kept.
//  2. Group filter: each channel's Groups are trimmed to only those the user
//     can access.
//  3. Platform filter: each channel's SupportedModels are trimmed to models
//     whose platform appears in the user's visible groups, preventing cross-
//     platform information leakage (e.g. a channel attached to both antigravity
//     and anthropic groups should not expose anthropic models to a user who
//     only has access to antigravity).
//  4. Field whitelist: only user-relevant fields are returned (internal IDs,
//     BillingModelSource, RestrictModels, Status, etc. are omitted).
type AvailableChannelHandler struct {
	channelService *service.ChannelService
	apiKeyService  *service.APIKeyService
	settingService *service.SettingService
}

// NewAvailableChannelHandler constructs a new user-side available-channel handler.
func NewAvailableChannelHandler(
	channelService *service.ChannelService,
	apiKeyService *service.APIKeyService,
	settingService *service.SettingService,
) *AvailableChannelHandler {
	return &AvailableChannelHandler{
		channelService: channelService,
		apiKeyService:  apiKeyService,
		settingService: settingService,
	}
}

// featureEnabled returns whether the available-channels feature toggle is on. Defaults to off (opt-in).
func (h *AvailableChannelHandler) featureEnabled(c *gin.Context) bool {
	if h.settingService == nil {
		return false
	}
	return h.settingService.GetAvailableChannelsRuntime(c.Request.Context()).Enabled
}

// userAvailableGroup is a whitelisted summary of a group visible to the user.
//
// The frontend uses this to distinguish exclusive vs. public groups (IsExclusive),
// subscription vs. standard groups (SubscriptionType with deeper styling),
// and the default rate multiplier; per-user rates come from /groups/rates.
type userAvailableGroup struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`
	Platform         string  `json:"platform"`
	SubscriptionType string  `json:"subscription_type"`
	RateMultiplier   float64 `json:"rate_multiplier"`
	IsExclusive      bool    `json:"is_exclusive"`
}

// userSupportedModelPricing contains whitelisted pricing fields visible to the user.
type userSupportedModelPricing struct {
	BillingMode      string                   `json:"billing_mode"`
	InputPrice       *float64                 `json:"input_price"`
	OutputPrice      *float64                 `json:"output_price"`
	CacheWritePrice  *float64                 `json:"cache_write_price"`
	CacheReadPrice   *float64                 `json:"cache_read_price"`
	ImageOutputPrice *float64                 `json:"image_output_price"`
	PerRequestPrice  *float64                 `json:"per_request_price"`
	Intervals        []userPricingIntervalDTO `json:"intervals"`
}

// userPricingIntervalDTO is a whitelisted pricing interval (internal IDs and SortOrder are omitted).
type userPricingIntervalDTO struct {
	MinTokens       int      `json:"min_tokens"`
	MaxTokens       *int     `json:"max_tokens"`
	TierLabel       string   `json:"tier_label,omitempty"`
	InputPrice      *float64 `json:"input_price"`
	OutputPrice     *float64 `json:"output_price"`
	CacheWritePrice *float64 `json:"cache_write_price"`
	CacheReadPrice  *float64 `json:"cache_read_price"`
	PerRequestPrice *float64 `json:"per_request_price"`
}

// userSupportedModel is a whitelisted supported-model entry visible to the user.
type userSupportedModel struct {
	Name     string                     `json:"name"`
	Platform string                     `json:"platform"`
	Pricing  *userSupportedModelPricing `json:"pricing"`
}

// userChannelPlatformSection represents a single platform's sub-view within a
// channel: the user-visible groups and the supported models for that platform.
// Grouping by platform lets the frontend render channel name as a row-group
// header with platform sections underneath.
type userChannelPlatformSection struct {
	Platform        string               `json:"platform"`
	Groups          []userAvailableGroup `json:"groups"`
	SupportedModels []userSupportedModel `json:"supported_models"`
}

// userAvailableChannel is the whitelisted channel entry visible to the user.
//
// Each channel is aggregated into a single record with an embedded platforms
// array: each section corresponds to one platform and contains that platform's
// groups and supported_models.
type userAvailableChannel struct {
	Name        string                       `json:"name"`
	Description string                       `json:"description"`
	Platforms   []userChannelPlatformSection `json:"platforms"`
}

// List returns available channels visible to the current user.
// GET /api/v1/channels/available
func (h *AvailableChannelHandler) List(c *gin.Context) {
	authSubject, authenticated := middleware.GetAuthSubjectFromContext(c)
	if !authenticated {
		response.Unauthorized(c, "Authentication required")
		return
	}

	// When the feature is disabled, return an empty array without exposing
	// channel data. The check is placed after auth so unauthenticated
	// callers still receive 401 rather than an empty 200.
	if !h.featureEnabled(c) {
		response.Success(c, []userAvailableChannel{})
		return
	}

	accessibleGroups, grpErr := h.apiKeyService.GetAvailableGroups(c.Request.Context(), authSubject.UserID)
	if grpErr != nil {
		response.ErrorFrom(c, grpErr)
		return
	}
	permittedIDs := make(map[int64]struct{}, len(accessibleGroups))
	for idx := range accessibleGroups {
		permittedIDs[accessibleGroups[idx].ID] = struct{}{}
	}

	allChannels, chErr := h.channelService.ListAvailable(c.Request.Context())
	if chErr != nil {
		response.ErrorFrom(c, chErr)
		return
	}

	result := make([]userAvailableChannel, 0, len(allChannels))
	for _, ch := range allChannels {
		if ch.Status != service.StatusActive {
			continue
		}
		visibleGrps := retainAccessibleGroups(ch.Groups, permittedIDs)
		if len(visibleGrps) == 0 {
			continue
		}
		platformParts := assemblePlatformSections(ch, visibleGrps)
		if len(platformParts) == 0 {
			continue
		}
		result = append(result, userAvailableChannel{
			Name:        ch.Name,
			Description: ch.Description,
			Platforms:   platformParts,
		})
	}

	response.Success(c, result)
}

// assemblePlatformSections splits a channel into ordered platform sections based on
// the visible groups. Each section contains one platform's groups and supported models.
// Output is sorted alphabetically by platform for stable comparison and regression testing.
func assemblePlatformSections(
	ch service.AvailableChannel,
	visibleGrps []userAvailableGroup,
) []userChannelPlatformSection {
	byPlatform := make(map[string][]userAvailableGroup, 4)
	for _, grp := range visibleGrps {
		if grp.Platform == "" {
			continue
		}
		byPlatform[grp.Platform] = append(byPlatform[grp.Platform], grp)
	}
	if len(byPlatform) == 0 {
		return nil
	}

	sortedPlatforms := make([]string, 0, len(byPlatform))
	for p := range byPlatform {
		sortedPlatforms = append(sortedPlatforms, p)
	}
	sort.Strings(sortedPlatforms)

	parts := make([]userChannelPlatformSection, 0, len(sortedPlatforms))
	for _, plat := range sortedPlatforms {
		allowed := map[string]struct{}{plat: {}}
		parts = append(parts, userChannelPlatformSection{
			Platform:        plat,
			Groups:          byPlatform[plat],
			SupportedModels: convertSupportedModels(ch.SupportedModels, allowed),
		})
	}
	return parts
}

// retainAccessibleGroups keeps only the groups the user is permitted to see.
func retainAccessibleGroups(
	allGroups []service.AvailableGroupRef,
	permitted map[int64]struct{},
) []userAvailableGroup {
	kept := make([]userAvailableGroup, 0, len(allGroups))
	for _, grp := range allGroups {
		if _, ok := permitted[grp.ID]; !ok {
			continue
		}
		kept = append(kept, userAvailableGroup{
			ID:               grp.ID,
			Name:             grp.Name,
			Platform:         grp.Platform,
			SubscriptionType: grp.SubscriptionType,
			RateMultiplier:   grp.RateMultiplier,
			IsExclusive:      grp.IsExclusive,
		})
	}
	return kept
}

// convertSupportedModels transforms service-layer models into user DTOs (whitelisted fields).
// Only models whose platform is in allowedPlatforms are included, preventing cross-platform leakage.
// When allowedPlatforms is nil no platform filtering is applied (useful for tests or explicit no-filter scenarios).
func convertSupportedModels(
	models []service.SupportedModel,
	allowedPlatforms map[string]struct{},
) []userSupportedModel {
	converted := make([]userSupportedModel, 0, len(models))
	for idx := range models {
		mdl := models[idx]
		if allowedPlatforms != nil {
			if _, ok := allowedPlatforms[mdl.Platform]; !ok {
				continue
			}
		}
		converted = append(converted, userSupportedModel{
			Name:     mdl.Name,
			Platform: mdl.Platform,
			Pricing:  convertPricing(mdl.Pricing),
		})
	}
	return converted
}

// convertPricing transforms a service-layer pricing struct into a user DTO; returns nil when input is nil.
func convertPricing(src *service.ChannelModelPricing) *userSupportedModelPricing {
	if src == nil {
		return nil
	}
	tiers := make([]userPricingIntervalDTO, 0, len(src.Intervals))
	for _, iv := range src.Intervals {
		tiers = append(tiers, userPricingIntervalDTO{
			MinTokens:       iv.MinTokens,
			MaxTokens:       iv.MaxTokens,
			TierLabel:       iv.TierLabel,
			InputPrice:      iv.InputPrice,
			OutputPrice:     iv.OutputPrice,
			CacheWritePrice: iv.CacheWritePrice,
			CacheReadPrice:  iv.CacheReadPrice,
			PerRequestPrice: iv.PerRequestPrice,
		})
	}
	mode := string(src.BillingMode)
	if mode == "" {
		mode = string(service.BillingModeToken)
	}
	return &userSupportedModelPricing{
		BillingMode:      mode,
		InputPrice:       src.InputPrice,
		OutputPrice:      src.OutputPrice,
		CacheWritePrice:  src.CacheWritePrice,
		CacheReadPrice:   src.CacheReadPrice,
		ImageOutputPrice: src.ImageOutputPrice,
		PerRequestPrice:  src.PerRequestPrice,
		Intervals:        tiers,
	}
}
