package admin

import (
	"strconv"
	"strings"
	"time"

	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/pkg/timezone"
	"github.com/telagod/subme/internal/service"

	"github.com/gin-gonic/gin"
)

// AffiliateHandler handles admin affiliate (invite-rebate) management:
// listing users with custom settings, updating per-user invite codes
// and exclusive rebate rates, and batch operations.
type AffiliateHandler struct {
	affiliateService *service.AffiliateService
	adminService     service.AdminService
}

// NewAffiliateHandler creates a new admin affiliate handler.
func NewAffiliateHandler(affiliateService *service.AffiliateService, adminService service.AdminService) *AffiliateHandler {
	return &AffiliateHandler{
		affiliateService: affiliateService,
		adminService:     adminService,
	}
}

// ListUsers returns paginated users with custom affiliate settings.
// GET /api/v1/admin/affiliates/users
func (h *AffiliateHandler) ListUsers(c *gin.Context) {
	pg, pgSize := response.ParsePagination(c)
	keyword := c.Query("search")

	rows, totalCount, svcErr := h.affiliateService.AdminListCustomUsers(c.Request.Context(), service.AffiliateAdminFilter{
		Search:   keyword,
		Page:     pg,
		PageSize: pgSize,
	})
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Paginated(c, rows, totalCount, pg, pgSize)
}

// UpdateUserSettings updates a user's affiliate settings.
// PUT /api/v1/admin/affiliates/users/:user_id
//
// Both fields are optional and applied independently.
type UpdateAffiliateUserRequest struct {
	AffCode              *string  `json:"aff_code"`
	AffRebateRatePercent *float64 `json:"aff_rebate_rate_percent"`
	// ClearRebateRate explicitly clears the per-user rate (sets it to NULL).
	// Used to disambiguate from "field not provided".
	ClearRebateRate bool `json:"clear_rebate_rate"`
}

func (h *AffiliateHandler) UpdateUserSettings(c *gin.Context) {
	uid, convErr := strconv.ParseInt(c.Param("user_id"), 10, 64)
	if convErr != nil || uid <= 0 {
		response.BadRequest(c, "user_id is not valid")
		return
	}

	var payload UpdateAffiliateUserRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.BadRequest(c, "Malformed request body: "+bindErr.Error())
		return
	}

	if payload.AffCode != nil {
		if svcErr := h.affiliateService.AdminUpdateUserAffCode(c.Request.Context(), uid, *payload.AffCode); svcErr != nil {
			response.ErrorFrom(c, svcErr)
			return
		}
	}

	if payload.ClearRebateRate {
		if svcErr := h.affiliateService.AdminSetUserRebateRate(c.Request.Context(), uid, nil); svcErr != nil {
			response.ErrorFrom(c, svcErr)
			return
		}
	} else if payload.AffRebateRatePercent != nil {
		if svcErr := h.affiliateService.AdminSetUserRebateRate(c.Request.Context(), uid, payload.AffRebateRatePercent); svcErr != nil {
			response.ErrorFrom(c, svcErr)
			return
		}
	}

	response.Success(c, gin.H{"user_id": uid})
}

// ClearUserSettings removes ALL of a user's custom affiliate settings -- clears
// the exclusive rebate rate AND regenerates the invite code as a new system
// random one. Conceptually this "removes the user from the custom list".
//
// Both writes happen in this handler; failure of one leaves the other applied,
// but the operation is idempotent so the admin can re-run it safely.
// DELETE /api/v1/admin/affiliates/users/:user_id
func (h *AffiliateHandler) ClearUserSettings(c *gin.Context) {
	uid, convErr := strconv.ParseInt(c.Param("user_id"), 10, 64)
	if convErr != nil || uid <= 0 {
		response.BadRequest(c, "user_id is not valid")
		return
	}
	if svcErr := h.affiliateService.AdminSetUserRebateRate(c.Request.Context(), uid, nil); svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	if _, svcErr := h.affiliateService.AdminResetUserAffCode(c.Request.Context(), uid); svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, gin.H{"user_id": uid})
}

// BatchSetRate applies the same rebate rate (or clears it) to multiple users.
//
// Protocol: pass `clear: true` to clear rates (aff_rebate_rate_percent is
// ignored). Otherwise aff_rebate_rate_percent is required and applied to
// every user_id. The explicit `clear` flag exists because Go's JSON unmarshal
// can't distinguish a missing field from `null`, and a silent clear from a
// frontend that forgot to include the rate would be a footgun.
//
// POST /api/v1/admin/affiliates/users/batch-rate
type BatchSetRateRequest struct {
	UserIDs              []int64  `json:"user_ids" binding:"required"`
	AffRebateRatePercent *float64 `json:"aff_rebate_rate_percent"`
	Clear                bool     `json:"clear"`
}

func (h *AffiliateHandler) BatchSetRate(c *gin.Context) {
	var payload BatchSetRateRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.BadRequest(c, "Malformed request body: "+bindErr.Error())
		return
	}
	if len(payload.UserIDs) == 0 {
		response.BadRequest(c, "user_ids must not be empty")
		return
	}
	if !payload.Clear && payload.AffRebateRatePercent == nil {
		response.BadRequest(c, "aff_rebate_rate_percent is required when clear is false")
		return
	}
	targetRate := payload.AffRebateRatePercent
	if payload.Clear {
		targetRate = nil
	}
	if svcErr := h.affiliateService.AdminBatchSetUserRebateRate(c.Request.Context(), payload.UserIDs, targetRate); svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, gin.H{"affected": len(payload.UserIDs)})
}

// AffiliateUserSummary is the minimal user shape returned by LookupUsers,
// shared with the frontend's add-custom-user picker.
type AffiliateUserSummary struct {
	ID       int64  `json:"id"`
	Email    string `json:"email"`
	Username string `json:"username"`
}

// LookupUsers searches users by email/username for the "add custom user" modal.
// GET /api/v1/admin/affiliates/users/lookup?q=
func (h *AffiliateHandler) LookupUsers(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		response.Success(c, []AffiliateUserSummary{})
		return
	}
	matchedUsers, _, svcErr := h.adminService.ListUsers(c.Request.Context(), 1, 20, service.UserListFilters{Search: query}, "email", "asc")
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	summaries := make([]AffiliateUserSummary, len(matchedUsers))
	for idx, usr := range matchedUsers {
		summaries[idx] = AffiliateUserSummary{ID: usr.ID, Email: usr.Email, Username: usr.Username}
	}
	response.Success(c, summaries)
}

// GetUserOverview returns one user's affiliate overview.
// GET /api/v1/admin/affiliates/users/:user_id/overview
func (h *AffiliateHandler) GetUserOverview(c *gin.Context) {
	uid, convErr := strconv.ParseInt(c.Param("user_id"), 10, 64)
	if convErr != nil || uid <= 0 {
		response.BadRequest(c, "user_id is not valid")
		return
	}
	overview, svcErr := h.affiliateService.AdminGetUserOverview(c.Request.Context(), uid)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Success(c, overview)
}

// ListInviteRecords returns all inviter-invitee relationships.
// GET /api/v1/admin/affiliates/invites
func (h *AffiliateHandler) ListInviteRecords(c *gin.Context) {
	pg, pgSize := response.ParsePagination(c)
	recFilter := buildAffiliateRecordFilter(c, pg, pgSize)
	rows, totalCount, svcErr := h.affiliateService.AdminListInviteRecords(c.Request.Context(), recFilter)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Paginated(c, rows, totalCount, recFilter.Page, recFilter.PageSize)
}

// ListRebateRecords returns all order-level affiliate rebate records.
// GET /api/v1/admin/affiliates/rebates
func (h *AffiliateHandler) ListRebateRecords(c *gin.Context) {
	pg, pgSize := response.ParsePagination(c)
	recFilter := buildAffiliateRecordFilter(c, pg, pgSize)
	rows, totalCount, svcErr := h.affiliateService.AdminListRebateRecords(c.Request.Context(), recFilter)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Paginated(c, rows, totalCount, recFilter.Page, recFilter.PageSize)
}

// ListTransferRecords returns all affiliate quota-to-balance transfer records.
// GET /api/v1/admin/affiliates/transfers
func (h *AffiliateHandler) ListTransferRecords(c *gin.Context) {
	pg, pgSize := response.ParsePagination(c)
	recFilter := buildAffiliateRecordFilter(c, pg, pgSize)
	rows, totalCount, svcErr := h.affiliateService.AdminListTransferRecords(c.Request.Context(), recFilter)
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	response.Paginated(c, rows, totalCount, recFilter.Page, recFilter.PageSize)
}

func buildAffiliateRecordFilter(c *gin.Context, pg, pgSize int) service.AffiliateRecordFilter {
	f := service.AffiliateRecordFilter{
		Search:   c.Query("search"),
		Page:     pg,
		PageSize: pgSize,
		SortBy:   c.Query("sort_by"),
		SortDesc: c.Query("sort_order") != "asc",
	}
	if f.PageSize > 100 {
		f.PageSize = 100
	}
	clientTZ := c.Query("timezone")
	if ts := interpretAffiliateStartTime(c.Query("start_at"), clientTZ); ts != nil {
		f.StartAt = ts
	}
	if ts := interpretAffiliateEndTime(c.Query("end_at"), clientTZ); ts != nil {
		f.EndAt = ts
	}
	return f
}

func interpretAffiliateStartTime(raw string, clientTZ string) *time.Time {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if ts, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return &ts
	}
	if ts, err := timezone.ParseInUserLocation("2006-01-02", trimmed, clientTZ); err == nil {
		return &ts
	}
	return nil
}

func interpretAffiliateEndTime(raw string, clientTZ string) *time.Time {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if ts, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return &ts
	}
	if ts, err := timezone.ParseInUserLocation("2006-01-02", trimmed, clientTZ); err == nil {
		endOfDay := ts.AddDate(0, 0, 1).Add(-time.Nanosecond)
		return &endOfDay
	}
	return nil
}
