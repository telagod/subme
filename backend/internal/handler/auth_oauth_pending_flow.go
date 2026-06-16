package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/authidentity"
	"github.com/telagod/subme/ent/authidentitychannel"
	"github.com/telagod/subme/ent/identityadoptiondecision"
	"github.com/telagod/subme/ent/predicate"
	dbuser "github.com/telagod/subme/ent/user"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/ip"
	"github.com/telagod/subme/internal/pkg/oauth"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"

	entsql "entgo.io/ent/dialect/sql"
	"github.com/gin-gonic/gin"
)

const (
	oauthPendingBrowserCookiePath = "/api/v1/auth/oauth"
	oauthPendingBrowserCookieName = "oauth_pending_browser_session"
	oauthPendingSessionCookiePath = "/api/v1/auth/oauth"
	oauthPendingSessionCookieName = "oauth_pending_session"
	oauthPromoCodeCookieName      = "oauth_promo_code"
	oauthPendingCookieMaxAgeSec   = 10 * 60
	oauthPendingChoiceStep        = "choose_account_action_required"

	oauthCompletionResponseKey = "completion_response"
	oauthPromoCodeStateKey     = "promo_code"
)

var pendingOAuthCreateAccountPreCommitHook func(context.Context, *dbent.PendingAuthSession) error

type oauthPendingSessionPayload struct {
	Intent                 string
	Identity               service.PendingAuthIdentityKey
	TargetUserID           *int64
	ResolvedEmail          string
	RedirectTo             string
	BrowserSessionKey      string
	UpstreamIdentityClaims map[string]any
	CompletionResponse     map[string]any
}

type oauthAdoptionDecisionRequest struct {
	AdoptDisplayName *bool `json:"adopt_display_name,omitempty"`
	AdoptAvatar      *bool `json:"adopt_avatar,omitempty"`
}

type bindPendingOAuthLoginRequest struct {
	Email            string `json:"email" binding:"required,email"`
	Password         string `json:"password" binding:"required"`
	AdoptDisplayName *bool  `json:"adopt_display_name,omitempty"`
	AdoptAvatar      *bool  `json:"adopt_avatar,omitempty"`
}

type createPendingOAuthAccountRequest struct {
	Email            string `json:"email" binding:"required,email"`
	VerifyCode       string `json:"verify_code,omitempty"`
	Password         string `json:"password" binding:"required,min=6"`
	InvitationCode   string `json:"invitation_code,omitempty"`
	AffCode          string `json:"aff_code,omitempty"`
	AdoptDisplayName *bool  `json:"adopt_display_name,omitempty"`
	AdoptAvatar      *bool  `json:"adopt_avatar,omitempty"`
}

type sendPendingOAuthVerifyCodeRequest struct {
	Email             string `json:"email" binding:"required,email"`
	TurnstileToken    string `json:"turnstile_token,omitempty"`
	PendingAuthToken  string `json:"pending_auth_token,omitempty"`
	PendingOAuthToken string `json:"pending_oauth_token,omitempty"`
}

func (r bindPendingOAuthLoginRequest) adoptionDecision() oauthAdoptionDecisionRequest {
	return oauthAdoptionDecisionRequest{
		AdoptDisplayName: r.AdoptDisplayName,
		AdoptAvatar:      r.AdoptAvatar,
	}
}

func (r createPendingOAuthAccountRequest) adoptionDecision() oauthAdoptionDecisionRequest {
	return oauthAdoptionDecisionRequest{
		AdoptDisplayName: r.AdoptDisplayName,
		AdoptAvatar:      r.AdoptAvatar,
	}
}

func (h *AuthHandler) pendingIdentityService() (*service.AuthPendingIdentityService, error) {
	if h == nil || h.authService == nil || h.authService.EntClient() == nil {
		return nil, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable")
	}
	return service.NewAuthPendingIdentityService(h.authService.EntClient()), nil
}

func generateOAuthPendingBrowserSession() (string, error) {
	return oauth.GenerateState()
}

func setOAuthPendingBrowserCookie(c *gin.Context, sessionKey string, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     oauthPendingBrowserCookieName,
		Value:    encodeCookieValue(sessionKey),
		Path:     oauthPendingBrowserCookiePath,
		MaxAge:   oauthPendingCookieMaxAgeSec,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearOAuthPendingBrowserCookie(c *gin.Context, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     oauthPendingBrowserCookieName,
		Value:    "",
		Path:     oauthPendingBrowserCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func readOAuthPendingBrowserCookie(c *gin.Context) (string, error) {
	return readCookieDecoded(c, oauthPendingBrowserCookieName)
}

func setOAuthPendingSessionCookie(c *gin.Context, sessionToken string, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     oauthPendingSessionCookieName,
		Value:    encodeCookieValue(sessionToken),
		Path:     oauthPendingSessionCookiePath,
		MaxAge:   oauthPendingCookieMaxAgeSec,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearOAuthPendingSessionCookie(c *gin.Context, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     oauthPendingSessionCookieName,
		Value:    "",
		Path:     oauthPendingSessionCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func readOAuthPendingSessionCookie(c *gin.Context) (string, error) {
	return readCookieDecoded(c, oauthPendingSessionCookieName)
}

// captureOAuthPromoCode 在 OAuth start 路径将 query 中的 promo_code 落入 cookie，
// 跨 callback 携带。空值会同时清掉旧 cookie，避免上一轮残留。
func captureOAuthPromoCode(c *gin.Context, secure bool) {
	promoCode := strings.TrimSpace(c.Query("promo_code"))
	if promoCode == "" {
		clearOAuthPromoCodeCookie(c, secure)
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     oauthPromoCodeCookieName,
		Value:    encodeCookieValue(promoCode),
		Path:     oauthPendingBrowserCookiePath,
		MaxAge:   oauthPendingCookieMaxAgeSec,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearOAuthPromoCodeCookie(c *gin.Context, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     oauthPromoCodeCookieName,
		Value:    "",
		Path:     oauthPendingBrowserCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// readOAuthPromoCode 从 cookie 中取出 OAuth start 阶段写入的 promo_code。
func readOAuthPromoCode(c *gin.Context) string {
	if c == nil {
		return ""
	}
	promoCode, err := readCookieDecoded(c, oauthPromoCodeCookieName)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(promoCode)
}

// pendingOAuthPromoCode 从 pending session 的 LocalFlowState 中取出 promo_code。
func pendingOAuthPromoCode(session *dbent.PendingAuthSession) string {
	if session == nil {
		return ""
	}
	return pendingSessionStringValue(session.LocalFlowState, oauthPromoCodeStateKey)
}

func redirectToFrontendCallback(c *gin.Context, frontendCallback string) {
	parsed, parseErr := url.Parse(frontendCallback)
	if parseErr != nil {
		c.Redirect(http.StatusFound, linuxDoOAuthDefaultRedirectTo)
		return
	}
	if parsed.Scheme != "" && !strings.EqualFold(parsed.Scheme, "http") && !strings.EqualFold(parsed.Scheme, "https") {
		c.Redirect(http.StatusFound, linuxDoOAuthDefaultRedirectTo)
		return
	}
	parsed.Fragment = ""
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Redirect(http.StatusFound, parsed.String())
}

func (h *AuthHandler) createOAuthPendingSession(c *gin.Context, payload oauthPendingSessionPayload) error {
	pendingSvc, svcErr := h.pendingIdentityService()
	if svcErr != nil {
		return svcErr
	}

	localFlowState := map[string]any{
		oauthCompletionResponseKey: payload.CompletionResponse,
	}
	if promoCode := readOAuthPromoCode(c); promoCode != "" {
		localFlowState[oauthPromoCodeStateKey] = promoCode
	}

	sess, createErr := pendingSvc.CreatePendingSession(c.Request.Context(), service.CreatePendingAuthSessionInput{
		Intent:                 strings.TrimSpace(payload.Intent),
		Identity:               payload.Identity,
		TargetUserID:           payload.TargetUserID,
		ResolvedEmail:          strings.TrimSpace(payload.ResolvedEmail),
		RedirectTo:             strings.TrimSpace(payload.RedirectTo),
		BrowserSessionKey:      strings.TrimSpace(payload.BrowserSessionKey),
		UpstreamIdentityClaims: payload.UpstreamIdentityClaims,
		LocalFlowState:         localFlowState,
	})
	if createErr != nil {
		slog.Error("failed to create pending auth session",
			"intent", strings.TrimSpace(payload.Intent),
			"provider_type", strings.TrimSpace(payload.Identity.ProviderType),
			"provider_key", strings.TrimSpace(payload.Identity.ProviderKey),
			"provider_subject_len", len(strings.TrimSpace(payload.Identity.ProviderSubject)),
			"resolved_email_len", len(strings.TrimSpace(payload.ResolvedEmail)),
			"has_target_user", payload.TargetUserID != nil,
			"error", createErr.Error())
		return infraerrors.InternalServer("PENDING_AUTH_SESSION_CREATE_FAILED", "could not create pending auth session").WithCause(createErr)
	}

	setOAuthPendingSessionCookie(c, sess.SessionToken, isRequestHTTPS(c))
	return nil
}

func extractCompletionPayload(flowState map[string]any) (map[string]any, bool) {
	if len(flowState) == 0 {
		return nil, false
	}
	raw, exists := flowState[oauthCompletionResponseKey]
	if !exists {
		return nil, false
	}
	typed, ok := raw.(map[string]any)
	if !ok {
		return nil, false
	}
	return typed, true
}

func duplicateMap(src map[string]any) map[string]any {
	if len(src) == 0 {
		return map[string]any{}
	}
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func mergeCompletionPayload(sess *dbent.PendingAuthSession, extra map[string]any) map[string]any {
	existing, _ := extractCompletionPayload(sess.LocalFlowState)
	combined := duplicateMap(existing)
	if strings.TrimSpace(sess.RedirectTo) != "" {
		if _, found := combined["redirect"]; !found {
			combined["redirect"] = sess.RedirectTo
		}
	}
	for k, v := range extra {
		if v == nil {
			delete(combined, k)
			continue
		}
		combined[k] = v
	}
	applySuggestedProfileToCompletionResponse(combined, sess.UpstreamIdentityClaims)
	return combined
}

func extractFlowStateString(data map[string]any, field string) string {
	if len(data) == 0 {
		return ""
	}
	raw, ok := data[field]
	if !ok {
		return ""
	}
	str, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(str)
}

func flowStateIndicatesInvitationRequired(data map[string]any) bool {
	return strings.EqualFold(strings.TrimSpace(extractFlowStateString(data, "error")), "invitation_required")
}

// pendingSessionRequiresEmailCompletion checks whether the callback-produced
// completion payload indicates an "email completion" state.
// DingTalk cross-org / missing staff email enters this state: the frontend
// navigates to an email-completion page; exchange must not trigger adoption.
func pendingSessionRequiresEmailCompletion(data map[string]any) bool {
	if flag, ok := data["requires_email_completion"].(bool); ok && flag {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(extractFlowStateString(data, "step")), "email_completion")
}

// pendingSessionRequiresBindLogin checks whether the callback-produced
// completion payload is in a "must bind existing account" state.
// DingTalk signupBlocked=true (registration off + enterprise exemption off)
// enters this state: the frontend renders a bind_login form; exchange must
// not consume the session so that /pending/bind-login can find it later.
func pendingSessionRequiresBindLogin(data map[string]any) bool {
	return strings.EqualFold(strings.TrimSpace(extractFlowStateString(data, "step")), "bind_login_required")
}

func canIssuePendingOAuthTokenPair(sess *dbent.PendingAuthSession, data map[string]any) bool {
	if sess == nil {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(sess.Intent), oauthIntentLogin) {
		return false
	}
	if sess.TargetUserID == nil || *sess.TargetUserID <= 0 {
		return false
	}
	if flowStateIndicatesInvitationRequired(data) {
		return false
	}
	return strings.TrimSpace(extractFlowStateString(data, "step")) == ""
}

func validatePendingOAuthRegistrationSession(sess *dbent.PendingAuthSession) error {
	if sess == nil {
		return infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending registration session is not valid")
	}
	if strings.TrimSpace(sess.Intent) != oauthIntentLogin {
		return infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending registration session is not valid")
	}
	if sess.TargetUserID != nil && *sess.TargetUserID > 0 {
		return infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending registration session is not valid")
	}
	completion, _ := extractCompletionPayload(sess.LocalFlowState)
	if strings.EqualFold(strings.TrimSpace(extractFlowStateString(completion, "step")), "bind_login_required") {
		return infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending registration session is not valid")
	}
	return nil
}

func composeLegacyRegistrationPendingResponse(
	sess *dbent.PendingAuthSession,
	forceEmail bool,
	verifyRequired bool,
) map[string]any {
	resp := normalizePendingOAuthCompletionResponse(mergeCompletionPayload(sess, map[string]any{
		"step":                   oauthPendingChoiceStep,
		"adoption_required":      true,
		"create_account_allowed": true,
		"force_email_on_signup":  forceEmail,
	}))

	if addr := strings.TrimSpace(sess.ResolvedEmail); addr != "" {
		if _, found := resp["email"]; !found {
			resp["email"] = addr
		}
		if _, found := resp["resolved_email"]; !found {
			resp["resolved_email"] = addr
		}
	}
	if _, found := resp["choice_reason"]; !found {
		switch {
		case forceEmail:
			resp["choice_reason"] = "force_email_on_signup"
		case verifyRequired:
			resp["choice_reason"] = "email_verification_required"
		default:
			resp["choice_reason"] = "third_party_signup"
		}
	}
	return resp
}

func (h *AuthHandler) legacyCompleteRegistrationSessionStatus(
	c *gin.Context,
	sess *dbent.PendingAuthSession,
) (*dbent.PendingAuthSession, bool, error) {
	if sess == nil {
		return nil, false, infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending registration session is not valid")
	}

	normalized := normalizePendingOAuthCompletionResponse(mergeCompletionPayload(sess, nil))
	if step := extractFlowStateString(normalized, "step"); step != "" {
		return sess, true, nil
	}

	verifyEnabled := h != nil && h.authService != nil && h.authService.IsEmailVerifyEnabled(c.Request.Context())
	forceEmail := h.isForceEmailOnThirdPartySignup(c.Request.Context())
	if !verifyEnabled && !forceEmail {
		return sess, false, nil
	}

	entDB := h.entClient()
	if entDB == nil {
		return nil, false, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable")
	}

	updated, updateErr := persistPendingOAuthProgress(
		c.Request.Context(),
		entDB,
		sess,
		strings.TrimSpace(sess.Intent),
		strings.TrimSpace(sess.ResolvedEmail),
		nil,
		composeLegacyRegistrationPendingResponse(sess, forceEmail, verifyEnabled),
	)
	if updateErr != nil {
		return nil, false, infraerrors.InternalServer("PENDING_AUTH_SESSION_UPDATE_FAILED", "could not update pending oauth session").WithCause(updateErr)
	}
	return updated, true, nil
}

func (r oauthAdoptionDecisionRequest) hasDecision() bool {
	return r.AdoptDisplayName != nil || r.AdoptAvatar != nil
}

func bindOptionalOAuthAdoptionDecision(c *gin.Context) (oauthAdoptionDecisionRequest, error) {
	var parsed oauthAdoptionDecisionRequest
	if c == nil || c.Request == nil || c.Request.Body == nil {
		return parsed, nil
	}
	if bindErr := c.ShouldBindJSON(&parsed); bindErr != nil {
		if errors.Is(bindErr, io.EOF) {
			return parsed, nil
		}
		return parsed, bindErr
	}
	return parsed, nil
}

func copyOAuthMetadata(src map[string]any) map[string]any {
	if len(src) == 0 {
		return map[string]any{}
	}
	cp := make(map[string]any, len(src))
	for k, v := range src {
		cp[k] = v
	}
	return cp
}

func overlayOAuthMetadata(base map[string]any, overlay map[string]any) map[string]any {
	result := copyOAuthMetadata(base)
	for k, v := range overlay {
		result[k] = v
	}
	return result
}

func truncateAdoptedDisplayName(name string) string {
	name = strings.TrimSpace(name)
	if len([]rune(name)) > 100 {
		name = string([]rune(name)[:100])
	}
	return name
}

func (h *AuthHandler) entClient() *dbent.Client {
	if h == nil || h.authService == nil {
		return nil
	}
	return h.authService.EntClient()
}

func (h *AuthHandler) isForceEmailOnThirdPartySignup(ctx context.Context) bool {
	if h == nil || h.settingSvc == nil {
		return false
	}
	defaults, readErr := h.settingSvc.GetAuthSourceDefaultSettings(ctx)
	if readErr != nil || defaults == nil {
		return false
	}
	return defaults.ForceEmailOnThirdPartySignup
}

func (h *AuthHandler) findOAuthIdentityUser(ctx context.Context, identity service.PendingAuthIdentityKey) (*dbent.User, error) {
	entDB := h.entClient()
	if entDB == nil {
		return nil, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable")
	}

	rec, queryErr := entDB.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(strings.TrimSpace(identity.ProviderType)),
			authidentity.ProviderKeyEQ(strings.TrimSpace(identity.ProviderKey)),
			authidentity.ProviderSubjectEQ(strings.TrimSpace(identity.ProviderSubject)),
		).
		Only(ctx)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return nil, nil
		}
		return nil, infraerrors.InternalServer("AUTH_IDENTITY_LOOKUP_FAILED", "could not query auth identity ownership").WithCause(queryErr)
	}
	return lookupActiveUser(ctx, entDB, rec.UserID)
}

func (h *AuthHandler) BindLinuxDoOAuthLogin(c *gin.Context) { h.bindPendingOAuthLogin(c, "linuxdo") }
func (h *AuthHandler) BindOIDCOAuthLogin(c *gin.Context)    { h.bindPendingOAuthLogin(c, "oidc") }
func (h *AuthHandler) BindWeChatOAuthLogin(c *gin.Context)  { h.bindPendingOAuthLogin(c, "wechat") }
func (h *AuthHandler) BindPendingOAuthLogin(c *gin.Context) { h.bindPendingOAuthLogin(c, "") }

func (h *AuthHandler) CreateLinuxDoOAuthAccount(c *gin.Context) {
	h.createPendingOAuthAccount(c, "linuxdo")
}

func (h *AuthHandler) CreateOIDCOAuthAccount(c *gin.Context) { h.createPendingOAuthAccount(c, "oidc") }

func (h *AuthHandler) CreateWeChatOAuthAccount(c *gin.Context) {
	h.createPendingOAuthAccount(c, "wechat")
}

func (h *AuthHandler) CreatePendingOAuthAccount(c *gin.Context) {
	h.createPendingOAuthAccount(c, "")
}

// SendPendingOAuthVerifyCode sends a verification code for a browser-bound
// pending OAuth account-creation flow.
// POST /api/v1/auth/oauth/pending/send-verify-code
func (h *AuthHandler) SendPendingOAuthVerifyCode(c *gin.Context) {
	var req sendPendingOAuthVerifyCodeRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		response.BadRequest(c, "Invalid request: "+bindErr.Error())
		return
	}

	if turnstileErr := h.authService.VerifyTurnstile(c.Request.Context(), req.TurnstileToken, ip.GetClientIP(c)); turnstileErr != nil {
		response.ErrorFrom(c, turnstileErr)
		return
	}

	_, sess, _, readErr := loadPendingOAuthBrowserSession(c, h)
	if readErr != nil {
		response.ErrorFrom(c, readErr)
		return
	}
	if valErr := validatePendingOAuthRegistrationSession(sess); valErr != nil {
		response.ErrorFrom(c, valErr)
		return
	}

	entDB := h.entClient()
	if entDB == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable"))
		return
	}

	emailAddr := strings.TrimSpace(strings.ToLower(req.Email))
	if found, lookupErr := lookupUserByCanonicalEmail(c.Request.Context(), entDB, emailAddr); lookupErr == nil && found != nil {
		sess, transErr := h.movePendingOAuthToChoiceState(c, entDB, sess, found, emailAddr)
		if transErr != nil {
			response.ErrorFrom(c, transErr)
			return
		}
		c.JSON(http.StatusOK, pendingOAuthStatusJSON(sess))
		return
	} else if lookupErr != nil && !errors.Is(lookupErr, service.ErrUserNotFound) {
		response.ErrorFrom(c, lookupErr)
		return
	}

	sendResult, sendErr := h.authService.SendPendingOAuthVerifyCode(c.Request.Context(), req.Email, c.GetHeader("Accept-Language"))
	if sendErr != nil {
		response.ErrorFrom(c, sendErr)
		return
	}

	response.Success(c, SendVerifyCodeResponse{
		Message:   "Verification code sent successfully",
		Countdown: sendResult.Countdown,
	})
}

func (h *AuthHandler) upsertPendingOAuthAdoptionDecision(
	c *gin.Context,
	sessionID int64,
	req oauthAdoptionDecisionRequest,
) (*dbent.IdentityAdoptionDecision, error) {
	entDB := h.entClient()
	if entDB == nil {
		return nil, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable")
	}

	current, queryErr := entDB.IdentityAdoptionDecision.Query().
		Where(identityadoptiondecision.PendingAuthSessionIDEQ(sessionID)).
		Only(c.Request.Context())
	if queryErr != nil && !dbent.IsNotFound(queryErr) {
		return nil, infraerrors.InternalServer("PENDING_AUTH_ADOPTION_LOAD_FAILED", "could not load oauth profile adoption preference").WithCause(queryErr)
	}
	if current != nil && !req.hasDecision() {
		return current, nil
	}
	if current == nil && !req.hasDecision() {
		return nil, nil
	}

	inp := service.PendingIdentityAdoptionDecisionInput{
		PendingAuthSessionID: sessionID,
	}
	if current != nil {
		inp.AdoptDisplayName = current.AdoptDisplayName
		inp.AdoptAvatar = current.AdoptAvatar
		inp.IdentityID = current.IdentityID
	}
	if req.AdoptDisplayName != nil {
		inp.AdoptDisplayName = *req.AdoptDisplayName
	}
	if req.AdoptAvatar != nil {
		inp.AdoptAvatar = *req.AdoptAvatar
	}

	pendingSvc, svcErr := h.pendingIdentityService()
	if svcErr != nil {
		return nil, svcErr
	}
	saved, saveErr := pendingSvc.UpsertAdoptionDecision(c.Request.Context(), inp)
	if saveErr != nil {
		return nil, infraerrors.InternalServer("PENDING_AUTH_ADOPTION_SAVE_FAILED", "could not persist oauth profile adoption preference").WithCause(saveErr)
	}
	return saved, nil
}

func (h *AuthHandler) ensurePendingOAuthAdoptionDecision(
	c *gin.Context,
	sessionID int64,
	req oauthAdoptionDecisionRequest,
) (*dbent.IdentityAdoptionDecision, error) {
	dec, upsertErr := h.upsertPendingOAuthAdoptionDecision(c, sessionID, req)
	if upsertErr != nil {
		return nil, upsertErr
	}
	if dec != nil {
		return dec, nil
	}

	pendingSvc, svcErr := h.pendingIdentityService()
	if svcErr != nil {
		return nil, svcErr
	}
	dec, saveErr := pendingSvc.UpsertAdoptionDecision(c.Request.Context(), service.PendingIdentityAdoptionDecisionInput{
		PendingAuthSessionID: sessionID,
	})
	if saveErr != nil {
		return nil, infraerrors.InternalServer("PENDING_AUTH_ADOPTION_SAVE_FAILED", "could not persist oauth profile adoption preference").WithCause(saveErr)
	}
	return dec, nil
}

func persistPendingOAuthProgress(
	ctx context.Context,
	entDB *dbent.Client,
	sess *dbent.PendingAuthSession,
	intent string,
	resolvedEmail string,
	targetUserID *int64,
	completionResp map[string]any,
) (*dbent.PendingAuthSession, error) {
	if entDB == nil || sess == nil {
		return nil, infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending auth session is not valid")
	}

	state := duplicateMap(sess.LocalFlowState)
	state[oauthCompletionResponseKey] = duplicateMap(completionResp)

	mut := entDB.PendingAuthSession.UpdateOneID(sess.ID).
		SetIntent(strings.TrimSpace(intent)).
		SetResolvedEmail(strings.TrimSpace(resolvedEmail)).
		SetLocalFlowState(state)
	if targetUserID != nil && *targetUserID > 0 {
		mut = mut.SetTargetUserID(*targetUserID)
	} else {
		mut = mut.ClearTargetUserID()
	}
	return mut.Save(ctx)
}

func determinePendingOAuthTargetUser(ctx context.Context, entDB *dbent.Client, sess *dbent.PendingAuthSession) (int64, error) {
	if sess == nil {
		return 0, infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending auth session is not valid")
	}
	if sess.TargetUserID != nil && *sess.TargetUserID > 0 {
		return *sess.TargetUserID, nil
	}
	addr := strings.TrimSpace(sess.ResolvedEmail)
	if addr == "" {
		return 0, infraerrors.BadRequest("PENDING_AUTH_TARGET_USER_MISSING", "no target user associated with pending auth session")
	}

	usr, lookupErr := lookupUserByCanonicalEmail(ctx, entDB, addr)
	if lookupErr != nil {
		if errors.Is(lookupErr, service.ErrUserNotFound) {
			return 0, infraerrors.InternalServer("PENDING_AUTH_TARGET_USER_NOT_FOUND", "target user for pending auth session does not exist")
		}
		return 0, lookupErr
	}
	return usr.ID, nil
}

func canonicalEmailPredicate(email string) predicate.User {
	lower := strings.ToLower(strings.TrimSpace(email))
	if lower == "" {
		return dbuser.EmailEQ(email)
	}
	return predicate.User(func(sel *entsql.Selector) {
		sel.Where(entsql.P(func(b *entsql.Builder) {
			b.WriteString("LOWER(TRIM(").
				Ident(sel.C(dbuser.FieldEmail)).
				WriteString(")) = ").
				Arg(lower)
		}))
	})
}

func lookupUserByCanonicalEmail(ctx context.Context, entDB *dbent.Client, email string) (*dbent.User, error) {
	if entDB == nil {
		return nil, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable")
	}

	hits, queryErr := entDB.User.Query().
		Where(canonicalEmailPredicate(email)).
		Order(dbent.Asc(dbuser.FieldID)).
		All(ctx)
	if queryErr != nil {
		return nil, queryErr
	}
	switch len(hits) {
	case 0:
		return nil, service.ErrUserNotFound
	case 1:
		return hits[0], nil
	default:
		return nil, infraerrors.Conflict("USER_EMAIL_CONFLICT", "canonical email resolves to multiple users")
	}
}

func verifyPendingOAuthRegistrationIdentityFree(ctx context.Context, entDB *dbent.Client, sess *dbent.PendingAuthSession) error {
	if entDB == nil || sess == nil {
		return infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending registration session is not valid")
	}

	ident, queryErr := entDB.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(strings.TrimSpace(sess.ProviderType)),
			authidentity.ProviderKeyEQ(strings.TrimSpace(sess.ProviderKey)),
			authidentity.ProviderSubjectEQ(strings.TrimSpace(sess.ProviderSubject)),
		).
		Only(ctx)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return nil
		}
		return queryErr
	}
	if ident == nil || ident.UserID <= 0 {
		return nil
	}

	owner, ownerErr := lookupActiveUser(ctx, entDB, ident.UserID)
	if ownerErr != nil {
		return ownerErr
	}
	if owner != nil {
		return infraerrors.Conflict("AUTH_IDENTITY_OWNERSHIP_CONFLICT", "this identity is already linked to a different user")
	}
	return nil
}

func extractOAuthIdentityIssuer(sess *dbent.PendingAuthSession) *string {
	if sess == nil {
		return nil
	}
	switch strings.TrimSpace(sess.ProviderType) {
	case "oidc":
		iss := strings.TrimSpace(sess.ProviderKey)
		if iss == "" {
			iss = extractFlowStateString(sess.UpstreamIdentityClaims, "issuer")
		}
		if iss == "" {
			return nil
		}
		return &iss
	default:
		iss := extractFlowStateString(sess.UpstreamIdentityClaims, "issuer")
		if iss == "" {
			return nil
		}
		return &iss
	}
}

func linkPendingOAuthIdentityToUser(ctx context.Context, tx *dbent.Tx, sess *dbent.PendingAuthSession, uid int64) (*dbent.AuthIdentity, error) {
	if sess != nil && strings.EqualFold(strings.TrimSpace(sess.ProviderType), "wechat") {
		return linkPendingWeChatIdentityToUser(ctx, tx, sess, uid)
	}

	txClient := tx.Client()
	ident, queryErr := txClient.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(strings.TrimSpace(sess.ProviderType)),
			authidentity.ProviderKeyEQ(strings.TrimSpace(sess.ProviderKey)),
			authidentity.ProviderSubjectEQ(strings.TrimSpace(sess.ProviderSubject)),
		).
		Only(ctx)
	if queryErr != nil && !dbent.IsNotFound(queryErr) {
		return nil, queryErr
	}
	if ident != nil {
		if ident.UserID != uid {
			owner, ownerErr := lookupActiveUser(ctx, txClient, ident.UserID)
			if ownerErr != nil {
				return nil, ownerErr
			}
			if owner != nil {
				return nil, infraerrors.Conflict("AUTH_IDENTITY_OWNERSHIP_CONFLICT", "this identity is already linked to a different user")
			}
			return txClient.AuthIdentity.UpdateOneID(ident.ID).
				SetUserID(uid).
				Save(ctx)
		}
		return ident, nil
	}

	builder := txClient.AuthIdentity.Create().
		SetUserID(uid).
		SetProviderType(strings.TrimSpace(sess.ProviderType)).
		SetProviderKey(strings.TrimSpace(sess.ProviderKey)).
		SetProviderSubject(strings.TrimSpace(sess.ProviderSubject)).
		SetMetadata(copyOAuthMetadata(sess.UpstreamIdentityClaims))
	if iss := extractOAuthIdentityIssuer(sess); iss != nil {
		builder = builder.SetIssuer(strings.TrimSpace(*iss))
	}
	return builder.Save(ctx)
}

func linkPendingWeChatIdentityToUser(ctx context.Context, tx *dbent.Tx, sess *dbent.PendingAuthSession, uid int64) (*dbent.AuthIdentity, error) {
	txClient := tx.Client()
	pType := strings.TrimSpace(sess.ProviderType)
	pKey := strings.TrimSpace(sess.ProviderKey)
	pSubject := strings.TrimSpace(sess.ProviderSubject)
	allKeys := expandWeChatProviderKeys(pKey)
	ch := strings.TrimSpace(extractFlowStateString(sess.UpstreamIdentityClaims, "channel"))
	chAppID := strings.TrimSpace(extractFlowStateString(sess.UpstreamIdentityClaims, "channel_app_id"))
	chSubject := strings.TrimSpace(extractFlowStateString(sess.UpstreamIdentityClaims, "channel_subject"))
	meta := copyOAuthMetadata(sess.UpstreamIdentityClaims)

	identRecs, queryErr := txClient.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(pType),
			authidentity.ProviderKeyIn(allKeys...),
			authidentity.ProviderSubjectEQ(pSubject),
		).
		All(ctx)
	if queryErr != nil {
		return nil, queryErr
	}
	ident, hasCanonical, selectErr := pickWeChatIdentityForUser(ctx, txClient, identRecs, uid, pKey)
	if selectErr != nil {
		return nil, selectErr
	}

	var legacyOpenIDIdent *dbent.AuthIdentity
	if chSubject != "" && chSubject != pSubject {
		legacyRecs, legacyErr := txClient.AuthIdentity.Query().
			Where(
				authidentity.ProviderTypeEQ(pType),
				authidentity.ProviderKeyIn(allKeys...),
				authidentity.ProviderSubjectEQ(chSubject),
			).
			All(ctx)
		if legacyErr != nil {
			return nil, legacyErr
		}
		legacyOpenIDIdent, _, selectErr = pickWeChatIdentityForUser(ctx, txClient, legacyRecs, uid, pKey)
		if selectErr != nil {
			return nil, selectErr
		}
	}

	switch {
	case ident != nil:
		mut := txClient.AuthIdentity.UpdateOneID(ident.ID).
			SetMetadata(overlayOAuthMetadata(ident.Metadata, meta))
		if ident.UserID != uid {
			mut = mut.SetUserID(uid)
		}
		if !strings.EqualFold(strings.TrimSpace(ident.ProviderKey), pKey) && !hasCanonical {
			mut = mut.SetProviderKey(pKey)
		}
		if iss := extractOAuthIdentityIssuer(sess); iss != nil {
			mut = mut.SetIssuer(strings.TrimSpace(*iss))
		}
		var saveErr error
		ident, saveErr = mut.Save(ctx)
		if saveErr != nil {
			return nil, saveErr
		}
	case legacyOpenIDIdent != nil:
		mut := txClient.AuthIdentity.UpdateOneID(legacyOpenIDIdent.ID).
			SetProviderKey(pKey).
			SetProviderSubject(pSubject).
			SetMetadata(overlayOAuthMetadata(legacyOpenIDIdent.Metadata, meta))
		if iss := extractOAuthIdentityIssuer(sess); iss != nil {
			mut = mut.SetIssuer(strings.TrimSpace(*iss))
		}
		var saveErr error
		ident, saveErr = mut.Save(ctx)
		if saveErr != nil {
			return nil, saveErr
		}
	default:
		builder := txClient.AuthIdentity.Create().
			SetUserID(uid).
			SetProviderType(pType).
			SetProviderKey(pKey).
			SetProviderSubject(pSubject).
			SetMetadata(meta)
		if iss := extractOAuthIdentityIssuer(sess); iss != nil {
			builder = builder.SetIssuer(strings.TrimSpace(*iss))
		}
		var createErr error
		ident, createErr = builder.Save(ctx)
		if createErr != nil {
			return nil, createErr
		}
	}

	if ch == "" || chAppID == "" || chSubject == "" {
		return ident, nil
	}

	chRecs, chQueryErr := txClient.AuthIdentityChannel.Query().
		Where(
			authidentitychannel.ProviderTypeEQ(pType),
			authidentitychannel.ProviderKeyIn(allKeys...),
			authidentitychannel.ChannelEQ(ch),
			authidentitychannel.ChannelAppIDEQ(chAppID),
			authidentitychannel.ChannelSubjectEQ(chSubject),
		).
		WithIdentity().
		All(ctx)
	if chQueryErr != nil {
		return nil, chQueryErr
	}
	chRec, hasCanonicalCh, chSelectErr := pickWeChatChannelForUser(ctx, txClient, chRecs, uid, pKey)
	if chSelectErr != nil {
		return nil, chSelectErr
	}

	chMeta := overlayOAuthMetadata(existingChannelMeta(chRec), meta)
	if chRec == nil {
		if _, createErr := txClient.AuthIdentityChannel.Create().
			SetIdentityID(ident.ID).
			SetProviderType(pType).
			SetProviderKey(pKey).
			SetChannel(ch).
			SetChannelAppID(chAppID).
			SetChannelSubject(chSubject).
			SetMetadata(chMeta).
			Save(ctx); createErr != nil {
			return nil, createErr
		}
		return ident, nil
	}

	chMut := txClient.AuthIdentityChannel.UpdateOneID(chRec.ID).
		SetIdentityID(ident.ID).
		SetMetadata(chMeta)
	if !strings.EqualFold(strings.TrimSpace(chRec.ProviderKey), pKey) && !hasCanonicalCh {
		chMut = chMut.SetProviderKey(pKey)
	}
	_, chSaveErr := chMut.Save(ctx)
	if chSaveErr != nil {
		return nil, chSaveErr
	}
	return ident, nil
}

func pickWeChatIdentityForUser(ctx context.Context, entDB *dbent.Client, recs []*dbent.AuthIdentity, uid int64, preferredKey string) (*dbent.AuthIdentity, bool, error) {
	var best *dbent.AuthIdentity
	var alt *dbent.AuthIdentity
	canonicalFound := false
	for _, r := range recs {
		if r == nil {
			continue
		}
		if r.UserID != uid {
			owner, ownerErr := lookupActiveUser(ctx, entDB, r.UserID)
			if ownerErr != nil {
				return nil, false, ownerErr
			}
			if owner != nil {
				return nil, false, infraerrors.Conflict("AUTH_IDENTITY_OWNERSHIP_CONFLICT", "this identity is already linked to a different user")
			}
		}
		if strings.EqualFold(strings.TrimSpace(r.ProviderKey), preferredKey) {
			canonicalFound = true
			if best == nil {
				best = r
			}
			continue
		}
		if alt == nil {
			alt = r
		}
	}
	if best != nil {
		return best, canonicalFound, nil
	}
	return alt, canonicalFound, nil
}

func pickWeChatChannelForUser(ctx context.Context, entDB *dbent.Client, recs []*dbent.AuthIdentityChannel, uid int64, preferredKey string) (*dbent.AuthIdentityChannel, bool, error) {
	var best *dbent.AuthIdentityChannel
	var alt *dbent.AuthIdentityChannel
	canonicalFound := false
	for _, r := range recs {
		if r == nil {
			continue
		}
		if r.Edges.Identity != nil && r.Edges.Identity.UserID != uid {
			owner, ownerErr := lookupActiveUser(ctx, entDB, r.Edges.Identity.UserID)
			if ownerErr != nil {
				return nil, false, ownerErr
			}
			if owner != nil {
				return nil, false, infraerrors.Conflict("AUTH_IDENTITY_CHANNEL_OWNERSHIP_CONFLICT", "this identity channel is already linked to a different user")
			}
		}
		if strings.EqualFold(strings.TrimSpace(r.ProviderKey), preferredKey) {
			canonicalFound = true
			if best == nil {
				best = r
			}
			continue
		}
		if alt == nil {
			alt = r
		}
	}
	if best != nil {
		return best, canonicalFound, nil
	}
	return alt, canonicalFound, nil
}

func lookupActiveUser(ctx context.Context, entDB *dbent.Client, uid int64) (*dbent.User, error) {
	if entDB == nil || uid <= 0 {
		return nil, nil
	}
	usr, queryErr := entDB.User.Get(ctx, uid)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return nil, nil
		}
		return nil, infraerrors.InternalServer("AUTH_IDENTITY_USER_LOOKUP_FAILED", "could not load user for auth identity").WithCause(queryErr)
	}
	if !strings.EqualFold(strings.TrimSpace(usr.Status), service.StatusActive) {
		return nil, service.ErrUserNotActive
	}
	return usr, nil
}

func existingChannelMeta(ch *dbent.AuthIdentityChannel) map[string]any {
	if ch == nil {
		return map[string]any{}
	}
	return copyOAuthMetadata(ch.Metadata)
}

func shouldLinkPendingOAuthIdentity(sess *dbent.PendingAuthSession, dec *dbent.IdentityAdoptionDecision) bool {
	if sess == nil || dec == nil {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(sess.Intent)) {
	case "bind_current_user", "login", "adopt_existing_user_by_email":
		return true
	default:
		return dec.AdoptDisplayName || dec.AdoptAvatar
	}
}

func avatarAdoptionCanBeSkipped(err error) bool {
	return errors.Is(err, service.ErrAvatarInvalid) ||
		errors.Is(err, service.ErrAvatarTooLarge) ||
		errors.Is(err, service.ErrAvatarNotImage)
}

func applyPendingOAuthBinding(
	ctx context.Context,
	entDB *dbent.Client,
	authSvc *service.AuthService,
	userSvc *service.UserService,
	sess *dbent.PendingAuthSession,
	dec *dbent.IdentityAdoptionDecision,
	overrideUID *int64,
	forceBind bool,
	firstBindDefaults bool,
) error {
	if entDB == nil || sess == nil {
		return nil
	}
	if !forceBind && !shouldLinkPendingOAuthIdentity(sess, dec) {
		return nil
	}

	if existingTx := dbent.TxFromContext(ctx); existingTx != nil {
		return executePendingOAuthBindingTx(ctx, existingTx, authSvc, userSvc, sess, dec, overrideUID, forceBind, firstBindDefaults)
	}

	tx, txErr := entDB.Tx(ctx)
	if txErr != nil {
		return txErr
	}
	defer func() { _ = tx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, tx)
	if execErr := executePendingOAuthBindingTx(txCtx, tx, authSvc, userSvc, sess, dec, overrideUID, forceBind, firstBindDefaults); execErr != nil {
		return execErr
	}
	return tx.Commit()
}

func executePendingOAuthBindingTx(
	ctx context.Context,
	tx *dbent.Tx,
	authSvc *service.AuthService,
	userSvc *service.UserService,
	sess *dbent.PendingAuthSession,
	dec *dbent.IdentityAdoptionDecision,
	overrideUID *int64,
	forceBind bool,
	firstBindDefaults bool,
) error {
	if tx == nil || sess == nil {
		return nil
	}
	if !forceBind && !shouldLinkPendingOAuthIdentity(sess, dec) {
		return nil
	}

	uid := int64(0)
	if overrideUID != nil && *overrideUID > 0 {
		uid = *overrideUID
	} else {
		resolved, resolveErr := determinePendingOAuthTargetUser(ctx, tx.Client(), sess)
		if resolveErr != nil {
			return resolveErr
		}
		uid = resolved
	}

	displayName := ""
	if dec != nil && dec.AdoptDisplayName {
		displayName = truncateAdoptedDisplayName(extractFlowStateString(sess.UpstreamIdentityClaims, "suggested_display_name"))
	}
	avatarURL := ""
	if dec != nil && dec.AdoptAvatar {
		avatarURL = extractFlowStateString(sess.UpstreamIdentityClaims, "suggested_avatar_url")
	}
	adoptAvatar := false
	if dec != nil && dec.AdoptAvatar && avatarURL != "" {
		if valErr := service.ValidateUserAvatar(avatarURL); valErr == nil {
			adoptAvatar = true
		} else if !avatarAdoptionCanBeSkipped(valErr) {
			return valErr
		}
	}

	if dec != nil && dec.AdoptDisplayName && displayName != "" {
		if updateErr := tx.Client().User.UpdateOneID(uid).
			SetUsername(displayName).
			Exec(ctx); updateErr != nil {
			return updateErr
		}
	}

	ident, linkErr := linkPendingOAuthIdentityToUser(ctx, tx, sess, uid)
	if linkErr != nil {
		return linkErr
	}

	merged := copyOAuthMetadata(ident.Metadata)
	for k, v := range sess.UpstreamIdentityClaims {
		merged[k] = v
	}
	if dec != nil && dec.AdoptDisplayName && displayName != "" {
		merged["display_name"] = displayName
	}
	if adoptAvatar {
		merged["avatar_url"] = avatarURL
	}

	identMut := tx.Client().AuthIdentity.UpdateOneID(ident.ID).SetMetadata(merged)
	if iss := extractOAuthIdentityIssuer(sess); iss != nil {
		identMut = identMut.SetIssuer(strings.TrimSpace(*iss))
	}
	if _, saveErr := identMut.Save(ctx); saveErr != nil {
		return saveErr
	}

	if dec != nil && (dec.IdentityID == nil || *dec.IdentityID != ident.ID) {
		if _, clearErr := tx.Client().IdentityAdoptionDecision.Update().
			Where(
				identityadoptiondecision.IdentityIDEQ(ident.ID),
				identityadoptiondecision.IDNEQ(dec.ID),
			).
			ClearIdentityID().
			Save(ctx); clearErr != nil {
			return clearErr
		}
		if _, setErr := tx.Client().IdentityAdoptionDecision.UpdateOneID(dec.ID).
			SetIdentityID(ident.ID).
			Save(ctx); setErr != nil {
			return setErr
		}
	}

	if firstBindDefaults && authSvc != nil {
		if applyErr := authSvc.ApplyProviderDefaultSettingsOnFirstBind(ctx, uid, sess.ProviderType); applyErr != nil {
			return applyErr
		}
	}

	if adoptAvatar && userSvc != nil {
		if _, setErr := userSvc.SetAvatar(ctx, uid, avatarURL); setErr != nil {
			return setErr
		}
	}

	return nil
}

func consumePendingBrowserSessionTx(
	ctx context.Context,
	tx *dbent.Tx,
	sess *dbent.PendingAuthSession,
) error {
	if tx == nil || sess == nil {
		return service.ErrPendingAuthSessionNotFound
	}

	live, queryErr := tx.Client().PendingAuthSession.Get(ctx, sess.ID)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return service.ErrPendingAuthSessionNotFound
		}
		return queryErr
	}

	now := time.Now().UTC()
	if live.ConsumedAt != nil {
		return service.ErrPendingAuthSessionConsumed
	}
	if !live.ExpiresAt.IsZero() && now.After(live.ExpiresAt) {
		return service.ErrPendingAuthSessionExpired
	}
	if strings.TrimSpace(live.BrowserSessionKey) != "" &&
		strings.TrimSpace(live.BrowserSessionKey) != strings.TrimSpace(sess.BrowserSessionKey) {
		return service.ErrPendingAuthBrowserMismatch
	}

	if _, updateErr := tx.Client().PendingAuthSession.UpdateOneID(live.ID).
		SetConsumedAt(now).
		SetCompletionCodeHash("").
		ClearCompletionCodeExpiresAt().
		Save(ctx); updateErr != nil {
		return updateErr
	}

	return nil
}

func adoptAndConsumePendingOAuthSession(
	ctx context.Context,
	entDB *dbent.Client,
	authSvc *service.AuthService,
	userSvc *service.UserService,
	sess *dbent.PendingAuthSession,
	dec *dbent.IdentityAdoptionDecision,
	uid int64,
) error {
	if entDB == nil {
		return infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable")
	}
	if sess == nil || uid <= 0 {
		return infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending registration session is not valid")
	}

	tx, txErr := entDB.Tx(ctx)
	if txErr != nil {
		return txErr
	}
	defer func() { _ = tx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, tx)
	if adoptErr := executePendingOAuthAdoption(txCtx, entDB, authSvc, userSvc, sess, dec, &uid); adoptErr != nil {
		return adoptErr
	}
	if consumeErr := consumePendingBrowserSessionTx(txCtx, tx, sess); consumeErr != nil {
		return consumeErr
	}
	return tx.Commit()
}

func executePendingOAuthAdoption(
	ctx context.Context,
	entDB *dbent.Client,
	authSvc *service.AuthService,
	userSvc *service.UserService,
	sess *dbent.PendingAuthSession,
	dec *dbent.IdentityAdoptionDecision,
	overrideUID *int64,
) error {
	return applyPendingOAuthBinding(
		ctx,
		entDB,
		authSvc,
		userSvc,
		sess,
		dec,
		overrideUID,
		false,
		strings.EqualFold(strings.TrimSpace(sess.Intent), "bind_current_user"),
	)
}

func applySuggestedProfileToCompletionResponse(data map[string]any, upstream map[string]any) {
	if len(data) == 0 || len(upstream) == 0 {
		return
	}

	name := extractFlowStateString(upstream, "suggested_display_name")
	avatar := extractFlowStateString(upstream, "suggested_avatar_url")

	if name != "" {
		if _, found := data["suggested_display_name"]; !found {
			data["suggested_display_name"] = name
		}
	}
	if avatar != "" {
		if _, found := data["suggested_avatar_url"]; !found {
			data["suggested_avatar_url"] = avatar
		}
	}
	if name != "" || avatar != "" {
		data["adoption_required"] = true
	}
}

func pendingOAuthIdentityExistsForUser(
	ctx context.Context,
	entDB *dbent.Client,
	sess *dbent.PendingAuthSession,
	uid int64,
) (bool, error) {
	if entDB == nil || sess == nil || uid <= 0 {
		return false, nil
	}

	pType := strings.TrimSpace(sess.ProviderType)
	pKey := strings.TrimSpace(sess.ProviderKey)
	pSubject := strings.TrimSpace(sess.ProviderSubject)
	if pType == "" || pSubject == "" {
		return false, nil
	}

	q := entDB.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(pType),
			authidentity.ProviderSubjectEQ(pSubject),
			authidentity.UserIDEQ(uid),
		)
	if strings.EqualFold(pType, "wechat") {
		q = q.Where(authidentity.ProviderKeyIn(expandWeChatProviderKeys(pKey)...))
	} else if pKey != "" {
		q = q.Where(authidentity.ProviderKeyEQ(pKey))
	}

	n, countErr := q.Count(ctx)
	if countErr != nil {
		return false, infraerrors.InternalServer("AUTH_IDENTITY_LOOKUP_FAILED", "could not query auth identity ownership").WithCause(countErr)
	}
	return n > 0, nil
}

func (h *AuthHandler) shouldSkipPendingOAuthAdoptionPrompt(
	ctx context.Context,
	sess *dbent.PendingAuthSession,
	data map[string]any,
) (bool, error) {
	if sess == nil || len(data) == 0 {
		return false, nil
	}
	if !canIssuePendingOAuthTokenPair(sess, data) {
		return false, nil
	}
	if extractFlowStateString(sess.UpstreamIdentityClaims, "suggested_display_name") == "" &&
		extractFlowStateString(sess.UpstreamIdentityClaims, "suggested_avatar_url") == "" {
		return false, nil
	}

	return pendingOAuthIdentityExistsForUser(ctx, h.entClient(), sess, *sess.TargetUserID)
}

func loadPendingOAuthBrowserSession(c *gin.Context, h *AuthHandler) (*service.AuthPendingIdentityService, *dbent.PendingAuthSession, func(), error) {
	secureCookie := isRequestHTTPS(c)
	wipeCookies := func() {
		clearOAuthPendingSessionCookie(c, secureCookie)
		clearOAuthPendingBrowserCookie(c, secureCookie)
	}

	sessToken, tokenErr := readOAuthPendingSessionCookie(c)
	if tokenErr != nil || strings.TrimSpace(sessToken) == "" {
		wipeCookies()
		return nil, nil, wipeCookies, service.ErrPendingAuthSessionNotFound
	}
	browserKey, browserErr := readOAuthPendingBrowserCookie(c)
	if browserErr != nil || strings.TrimSpace(browserKey) == "" {
		wipeCookies()
		return nil, nil, wipeCookies, service.ErrPendingAuthBrowserMismatch
	}

	pendingSvc, svcErr := h.pendingIdentityService()
	if svcErr != nil {
		wipeCookies()
		return nil, nil, wipeCookies, svcErr
	}

	sess, sessErr := pendingSvc.GetBrowserSession(c.Request.Context(), sessToken, browserKey)
	if sessErr != nil {
		wipeCookies()
		return nil, nil, wipeCookies, sessErr
	}

	return pendingSvc, sess, wipeCookies, nil
}

func (h *AuthHandler) consumePendingOAuthSessionOnLogout(c *gin.Context) {
	if c == nil || c.Request == nil {
		return
	}

	sessToken, tokenErr := readOAuthPendingSessionCookie(c)
	if tokenErr != nil || strings.TrimSpace(sessToken) == "" {
		return
	}
	browserKey, browserErr := readOAuthPendingBrowserCookie(c)
	if browserErr != nil || strings.TrimSpace(browserKey) == "" {
		return
	}

	pendingSvc, svcErr := h.pendingIdentityService()
	if svcErr != nil {
		return
	}
	_, _ = pendingSvc.ConsumeBrowserSession(c.Request.Context(), sessToken, browserKey)
}

func clearOAuthLogoutCookies(c *gin.Context) {
	secureCookie := isRequestHTTPS(c)

	clearOAuthPendingSessionCookie(c, secureCookie)
	clearOAuthPendingBrowserCookie(c, secureCookie)
	clearBindCookie(c, secureCookie)

	clearCookie(c, linuxDoOAuthStateCookieName, secureCookie)
	clearCookie(c, linuxDoOAuthVerifierCookie, secureCookie)
	clearCookie(c, linuxDoOAuthRedirectCookie, secureCookie)
	clearCookie(c, linuxDoOAuthIntentCookieName, secureCookie)
	clearCookie(c, linuxDoOAuthBindUserCookieName, secureCookie)

	oidcClearCookie(c, oidcOAuthStateCookieName, secureCookie)
	oidcClearCookie(c, oidcOAuthVerifierCookie, secureCookie)
	oidcClearCookie(c, oidcOAuthRedirectCookie, secureCookie)
	oidcClearCookie(c, oidcOAuthNonceCookie, secureCookie)
	oidcClearCookie(c, oidcOAuthIntentCookieName, secureCookie)
	oidcClearCookie(c, oidcOAuthBindUserCookieName, secureCookie)

	removeWeChatCookie(c, wechatOAuthStateCookieName, secureCookie)
	removeWeChatCookie(c, wechatOAuthRedirectCookieName, secureCookie)
	removeWeChatCookie(c, wechatOAuthIntentCookieName, secureCookie)
	removeWeChatCookie(c, wechatOAuthModeCookieName, secureCookie)
	removeWeChatCookie(c, wechatOAuthBindUserCookieName, secureCookie)

	clearWxPaymentCookie(c, wechatPaymentOAuthStateName, secureCookie)
	clearWxPaymentCookie(c, wechatPaymentOAuthRedirect, secureCookie)
	clearWxPaymentCookie(c, wechatPaymentOAuthContextName, secureCookie)
	clearWxPaymentCookie(c, wechatPaymentOAuthScope, secureCookie)
}

func pendingOAuthStatusJSON(sess *dbent.PendingAuthSession) gin.H {
	resp := normalizePendingOAuthCompletionResponse(mergeCompletionPayload(sess, nil))
	out := gin.H{
		"auth_result": "pending_session",
		"provider":    strings.TrimSpace(sess.ProviderType),
		"intent":      strings.TrimSpace(sess.Intent),
	}
	for k, v := range resp {
		out[k] = v
	}
	if addr := strings.TrimSpace(sess.ResolvedEmail); addr != "" {
		out["email"] = addr
	}
	return out
}

func normalizePendingOAuthCompletionResponse(data map[string]any) map[string]any {
	normalized := duplicateMap(data)
	for _, k := range []string{"access_token", "refresh_token", "expires_in", "token_type"} {
		delete(normalized, k)
	}
	step := strings.ToLower(strings.TrimSpace(extractFlowStateString(normalized, "step")))
	// Unify the various choice aliases into the canonical step;
	// bind_login_required is a separate terminal state (frontend renders
	// needsBindLogin instead of needsChooser) and must not be merged.
	switch step {
	case "choice", "choose_account_action", "choose_account", "choose", "email_required":
		normalized["step"] = oauthPendingChoiceStep
	}
	if strings.EqualFold(strings.TrimSpace(extractFlowStateString(normalized, "step")), oauthPendingChoiceStep) {
		normalized["adoption_required"] = true
	}
	if _, found := normalized["adoption_required"]; !found {
		if _, hasBindField := normalized["email_binding_required"]; hasBindField {
			normalized["adoption_required"] = true
		}
	}
	return normalized
}

func composeChoiceCompletionPayload(sess *dbent.PendingAuthSession, email string) map[string]any {
	resp := mergeCompletionPayload(sess, map[string]any{
		"step":                      oauthPendingChoiceStep,
		"adoption_required":         true,
		"force_email_on_signup":     true,
		"email_binding_required":    true,
		"existing_account_bindable": true,
	})
	if email = strings.TrimSpace(email); email != "" {
		resp["email"] = email
		resp["resolved_email"] = email
	}
	return resp
}

func (h *AuthHandler) movePendingOAuthToChoiceState(
	c *gin.Context,
	entDB *dbent.Client,
	sess *dbent.PendingAuthSession,
	targetUser *dbent.User,
	email string,
) (*dbent.PendingAuthSession, error) {
	resp := composeChoiceCompletionPayload(sess, email)
	var targetUID *int64
	if targetUser != nil && targetUser.ID > 0 {
		targetUID = &targetUser.ID
	}
	updated, updateErr := persistPendingOAuthProgress(
		c.Request.Context(),
		entDB,
		sess,
		strings.TrimSpace(sess.Intent),
		email,
		targetUID,
		resp,
	)
	if updateErr != nil {
		return nil, infraerrors.InternalServer("PENDING_AUTH_SESSION_UPDATE_FAILED", "could not update pending oauth session").WithCause(updateErr)
	}
	return updated, nil
}

func writeOAuthTokenPairResponse(c *gin.Context, tokenPair *service.TokenPair) {
	c.JSON(http.StatusOK, gin.H{
		"access_token":  tokenPair.AccessToken,
		"refresh_token": tokenPair.RefreshToken,
		"expires_in":    tokenPair.ExpiresIn,
		"token_type":    "Bearer",
	})
}

func (h *AuthHandler) bindPendingOAuthLogin(c *gin.Context, provider string) {
	var req bindPendingOAuthLoginRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		response.BadRequest(c, "Invalid request: "+bindErr.Error())
		return
	}

	pendingSvc, sess, wipeCookies, readErr := loadPendingOAuthBrowserSession(c, h)
	if readErr != nil {
		response.ErrorFrom(c, readErr)
		return
	}
	if strings.TrimSpace(provider) != "" && !strings.EqualFold(strings.TrimSpace(sess.ProviderType), provider) {
		response.BadRequest(c, "Pending oauth session provider mismatch")
		return
	}

	usr, authErr := h.authService.ValidatePasswordCredentials(c.Request.Context(), strings.TrimSpace(req.Email), req.Password)
	if authErr != nil {
		response.ErrorFrom(c, authErr)
		return
	}
	if sess.TargetUserID != nil && *sess.TargetUserID > 0 && usr.ID != *sess.TargetUserID {
		response.ErrorFrom(c, infraerrors.Conflict("PENDING_AUTH_TARGET_USER_MISMATCH", "this pending oauth session must be completed by the targeted user"))
		return
	}
	if modeErr := h.ensureBackendModeAllowsUser(c.Request.Context(), usr); modeErr != nil {
		response.ErrorFrom(c, modeErr)
		return
	}

	dec, decErr := h.ensurePendingOAuthAdoptionDecision(c, sess.ID, req.adoptionDecision())
	if decErr != nil {
		response.ErrorFrom(c, decErr)
		return
	}
	if h.totpService != nil && h.settingSvc.IsTotpEnabled(c.Request.Context()) && usr.TotpEnabled {
		tempTok, totpErr := h.totpService.CreatePendingOAuthBindLoginSession(
			c.Request.Context(),
			usr.ID,
			usr.Email,
			sess.SessionToken,
			sess.BrowserSessionKey,
		)
		if totpErr != nil {
			response.InternalError(c, "Failed to initiate 2FA verification")
			return
		}
		response.Success(c, TotpLoginResponse{
			Requires2FA:     true,
			TempToken:       tempTok,
			UserEmailMasked: service.MaskEmail(usr.Email),
		})
		return
	}
	if applyErr := applyPendingOAuthBinding(c.Request.Context(), h.entClient(), h.authService, h.userService, sess, dec, &usr.ID, true, true); applyErr != nil {
		replyPendingOAuthBindError(c, applyErr)
		return
	}

	h.authService.RecordSuccessfulLogin(c.Request.Context(), usr.ID)
	if h.postLoginSyncer != nil {
		h.postLoginSyncer.SyncAfterLogin(c.Request.Context(), sess.ProviderType, usr.ID, sess.UpstreamIdentityClaims)
	}
	tokens, tokenErr := h.authService.GenerateTokenPair(c.Request.Context(), usr, "")
	if tokenErr != nil {
		response.InternalError(c, "Token generation failed")
		return
	}
	if _, consumeErr := pendingSvc.ConsumeBrowserSession(c.Request.Context(), sess.SessionToken, sess.BrowserSessionKey); consumeErr != nil {
		wipeCookies()
		response.ErrorFrom(c, consumeErr)
		return
	}

	wipeCookies()
	writeOAuthTokenPairResponse(c, tokens)
}

func replyPendingOAuthBindError(c *gin.Context, err error) {
	if code := infraerrors.Code(err); code >= http.StatusBadRequest && code < http.StatusInternalServerError {
		response.ErrorFrom(c, err)
		return
	}
	response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_BIND_APPLY_FAILED", "could not bind pending oauth identity").WithCause(err))
}

func (h *AuthHandler) createPendingOAuthAccount(c *gin.Context, provider string) {
	var req createPendingOAuthAccountRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		response.BadRequest(c, "Invalid request: "+bindErr.Error())
		return
	}

	_, sess, wipeCookies, readErr := loadPendingOAuthBrowserSession(c, h)
	if readErr != nil {
		response.ErrorFrom(c, readErr)
		return
	}
	if valErr := validatePendingOAuthRegistrationSession(sess); valErr != nil {
		response.ErrorFrom(c, valErr)
		return
	}
	if strings.TrimSpace(provider) != "" && !strings.EqualFold(strings.TrimSpace(sess.ProviderType), provider) {
		response.BadRequest(c, "Pending oauth session provider mismatch")
		return
	}

	entDB := h.entClient()
	if entDB == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending identity service unavailable"))
		return
	}

	emailAddr := strings.TrimSpace(strings.ToLower(req.Email))
	found, lookupErr := lookupUserByCanonicalEmail(c.Request.Context(), entDB, emailAddr)
	if lookupErr != nil {
		switch {
		case errors.Is(lookupErr, service.ErrUserNotFound):
			found = nil
		case infraerrors.Code(lookupErr) >= http.StatusBadRequest && infraerrors.Code(lookupErr) < http.StatusInternalServerError:
			response.ErrorFrom(c, lookupErr)
			return
		default:
			response.ErrorFrom(c, infraerrors.ServiceUnavailable("SERVICE_UNAVAILABLE", "service temporarily unavailable"))
			return
		}
	}
	if found != nil {
		sess, transErr := h.movePendingOAuthToChoiceState(c, entDB, sess, found, emailAddr)
		if transErr != nil {
			response.ErrorFrom(c, transErr)
			return
		}
		c.JSON(http.StatusOK, pendingOAuthStatusJSON(sess))
		return
	}
	if modeErr := h.ensureBackendModeAllowsNewUserLogin(c.Request.Context()); modeErr != nil {
		response.ErrorFrom(c, modeErr)
		return
	}

	tokens, newUser, regErr := h.authService.RegisterOAuthEmailAccount(
		c.Request.Context(),
		emailAddr,
		req.Password,
		strings.TrimSpace(req.VerifyCode),
		strings.TrimSpace(req.InvitationCode),
		strings.TrimSpace(sess.ProviderType),
	)
	if regErr != nil {
		if errors.Is(regErr, service.ErrEmailExists) {
			existing, dupErr := lookupUserByCanonicalEmail(c.Request.Context(), entDB, emailAddr)
			if dupErr != nil {
				response.ErrorFrom(c, dupErr)
				return
			}
			sess, transErr := h.movePendingOAuthToChoiceState(c, entDB, sess, existing, emailAddr)
			if transErr != nil {
				response.ErrorFrom(c, transErr)
				return
			}
			c.JSON(http.StatusOK, pendingOAuthStatusJSON(sess))
			return
		}
		response.ErrorFrom(c, regErr)
		return
	}

	undoCreatedUser := func(cause error) bool {
		if newUser == nil || newUser.ID <= 0 {
			return false
		}
		if rollbackErr := h.authService.RollbackOAuthEmailAccountCreation(
			c.Request.Context(),
			newUser.ID,
			strings.TrimSpace(req.InvitationCode),
		); rollbackErr != nil {
			response.ErrorFrom(c, infraerrors.InternalServer(
				"PENDING_AUTH_ACCOUNT_ROLLBACK_FAILED",
				"could not roll back pending oauth account creation",
			).WithCause(fmt.Errorf("original: %w; rollback: %v", cause, rollbackErr)))
			return true
		}
		newUser = nil
		return false
	}

	dec, decErr := h.ensurePendingOAuthAdoptionDecision(c, sess.ID, req.adoptionDecision())
	if decErr != nil {
		if undoCreatedUser(decErr) {
			return
		}
		response.ErrorFrom(c, decErr)
		return
	}

	tx, txErr := entDB.Tx(c.Request.Context())
	if txErr != nil {
		if undoCreatedUser(txErr) {
			return
		}
		response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_BIND_APPLY_FAILED", "could not bind pending oauth identity").WithCause(txErr))
		return
	}
	defer func() { _ = tx.Rollback() }()
	txCtx := dbent.NewTxContext(c.Request.Context(), tx)

	if applyErr := applyPendingOAuthBinding(txCtx, entDB, h.authService, h.userService, sess, dec, &newUser.ID, true, false); applyErr != nil {
		_ = tx.Rollback()
		if undoCreatedUser(applyErr) {
			return
		}
		replyPendingOAuthBindError(c, applyErr)
		return
	}

	if finalErr := h.authService.FinalizeOAuthEmailAccount(
		txCtx,
		newUser,
		strings.TrimSpace(req.InvitationCode),
		strings.TrimSpace(sess.ProviderType),
		strings.TrimSpace(req.AffCode),
	); finalErr != nil {
		_ = tx.Rollback()
		if undoCreatedUser(finalErr) {
			return
		}
		response.ErrorFrom(c, finalErr)
		return
	}

	if consumeErr := consumePendingBrowserSessionTx(txCtx, tx, sess); consumeErr != nil {
		_ = tx.Rollback()
		if undoCreatedUser(consumeErr) {
			return
		}
		wipeCookies()
		response.ErrorFrom(c, consumeErr)
		return
	}

	if pendingOAuthCreateAccountPreCommitHook != nil {
		if hookErr := pendingOAuthCreateAccountPreCommitHook(txCtx, sess); hookErr != nil {
			_ = tx.Rollback()
			if undoCreatedUser(hookErr) {
				return
			}
			replyPendingOAuthBindError(c, hookErr)
			return
		}
	}

	if commitErr := tx.Commit(); commitErr != nil {
		if undoCreatedUser(commitErr) {
			return
		}
		response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_BIND_APPLY_FAILED", "could not bind pending oauth identity").WithCause(commitErr))
		return
	}

	h.authService.ApplyOAuthSignupPromoCode(c.Request.Context(), newUser.ID, pendingOAuthPromoCode(sess))
	h.authService.RecordSuccessfulLogin(c.Request.Context(), newUser.ID)
	if h.postLoginSyncer != nil {
		h.postLoginSyncer.SyncAfterRegistration(c.Request.Context(), sess.ProviderType, newUser.ID, sess.UpstreamIdentityClaims)
	}
	wipeCookies()
	writeOAuthTokenPairResponse(c, tokens)
}

// ExchangePendingOAuthCompletion redeems a pending OAuth browser session into a frontend-safe payload.
// POST /api/v1/auth/oauth/pending/exchange
func (h *AuthHandler) ExchangePendingOAuthCompletion(c *gin.Context) {
	secureCookie := isRequestHTTPS(c)
	wipeCookies := func() {
		clearOAuthPendingSessionCookie(c, secureCookie)
		clearOAuthPendingBrowserCookie(c, secureCookie)
	}
	adoptReq, bindErr := bindOptionalOAuthAdoptionDecision(c)
	if bindErr != nil {
		response.BadRequest(c, "Invalid request: "+bindErr.Error())
		return
	}

	sessToken, tokenErr := readOAuthPendingSessionCookie(c)
	if tokenErr != nil || strings.TrimSpace(sessToken) == "" {
		wipeCookies()
		response.ErrorFrom(c, service.ErrPendingAuthSessionNotFound)
		return
	}
	browserKey, browserErr := readOAuthPendingBrowserCookie(c)
	if browserErr != nil || strings.TrimSpace(browserKey) == "" {
		wipeCookies()
		response.ErrorFrom(c, service.ErrPendingAuthBrowserMismatch)
		return
	}

	pendingSvc, svcErr := h.pendingIdentityService()
	if svcErr != nil {
		wipeCookies()
		response.ErrorFrom(c, svcErr)
		return
	}

	sess, sessErr := pendingSvc.GetBrowserSession(c.Request.Context(), sessToken, browserKey)
	if sessErr != nil {
		wipeCookies()
		response.ErrorFrom(c, sessErr)
		return
	}

	completionData, ok := extractCompletionPayload(sess.LocalFlowState)
	if !ok {
		wipeCookies()
		response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_COMPLETION_INVALID", "pending auth completion data is malformed"))
		return
	}
	completionData = normalizePendingOAuthCompletionResponse(completionData)
	if strings.TrimSpace(sess.RedirectTo) != "" {
		if _, found := completionData["redirect"]; !found {
			completionData["redirect"] = sess.RedirectTo
		}
	}
	applySuggestedProfileToCompletionResponse(completionData, sess.UpstreamIdentityClaims)

	canIssue := canIssuePendingOAuthTokenPair(sess, completionData)
	var loginUser *service.User
	if canIssue {
		var lookupErr error
		loginUser, lookupErr = h.userService.GetByID(c.Request.Context(), *sess.TargetUserID)
		if lookupErr != nil {
			wipeCookies()
			response.ErrorFrom(c, lookupErr)
			return
		}
		if activeErr := ensureLoginUserActive(loginUser); activeErr != nil {
			wipeCookies()
			response.ErrorFrom(c, activeErr)
			return
		}
		if modeErr := h.ensureBackendModeAllowsUser(c.Request.Context(), loginUser); modeErr != nil {
			wipeCookies()
			response.ErrorFrom(c, modeErr)
			return
		}
	}
	skipPrompt, skipErr := h.shouldSkipPendingOAuthAdoptionPrompt(c.Request.Context(), sess, completionData)
	if skipErr != nil {
		wipeCookies()
		response.ErrorFrom(c, skipErr)
		return
	}
	if skipPrompt {
		delete(completionData, "adoption_required")
	}

	if flowStateIndicatesInvitationRequired(completionData) {
		if adoptReq.hasDecision() {
			_, _ = h.upsertPendingOAuthAdoptionDecision(c, sess.ID, adoptReq)
		}
		response.Success(c, completionData)
		return
	}
	if pendingSessionRequiresEmailCompletion(completionData) {
		response.Success(c, completionData)
		return
	}
	if pendingSessionRequiresBindLogin(completionData) {
		response.Success(c, completionData)
		return
	}
	if !adoptReq.hasDecision() {
		if needsAdoption, _ := completionData["adoption_required"].(bool); needsAdoption {
			response.Success(c, completionData)
			return
		}
	}

	effectiveReq := adoptReq
	if !effectiveReq.hasDecision() {
		no := false
		effectiveReq = oauthAdoptionDecisionRequest{
			AdoptDisplayName: &no,
			AdoptAvatar:      &no,
		}
	}

	dec, decErr := h.ensurePendingOAuthAdoptionDecision(c, sess.ID, effectiveReq)
	if decErr != nil {
		response.ErrorFrom(c, decErr)
		return
	}
	if adoptErr := executePendingOAuthAdoption(c.Request.Context(), h.entClient(), h.authService, h.userService, sess, dec, sess.TargetUserID); adoptErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_ADOPTION_APPLY_FAILED", "could not apply oauth profile adoption").WithCause(adoptErr))
		return
	}

	if _, consumeErr := pendingSvc.ConsumeBrowserSession(c.Request.Context(), sessToken, browserKey); consumeErr != nil {
		wipeCookies()
		response.ErrorFrom(c, consumeErr)
		return
	}

	if canIssue {
		tokens, tokenErr := h.authService.GenerateTokenPair(c.Request.Context(), loginUser, "")
		if tokenErr != nil {
			wipeCookies()
			response.InternalError(c, "Token generation failed")
			return
		}
		h.authService.RecordSuccessfulLogin(c.Request.Context(), loginUser.ID)
		completionData["access_token"] = tokens.AccessToken
		completionData["refresh_token"] = tokens.RefreshToken
		completionData["expires_in"] = tokens.ExpiresIn
		completionData["token_type"] = "Bearer"
	}

	wipeCookies()
	response.Success(c, completionData)
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases for callers in other handler files
// (linuxdo, oidc, dingtalk, wechat, email, tests) that reference the
// original unexported names.
// ---------------------------------------------------------------------------

func userNormalizedEmailPredicate(email string) predicate.User {
	return canonicalEmailPredicate(email)
}

func findUserByNormalizedEmail(ctx context.Context, entDB *dbent.Client, email string) (*dbent.User, error) {
	return lookupUserByCanonicalEmail(ctx, entDB, email)
}

func readPendingOAuthBrowserSession(c *gin.Context, h *AuthHandler) (*service.AuthPendingIdentityService, *dbent.PendingAuthSession, func(), error) {
	return loadPendingOAuthBrowserSession(c, h)
}

func ensurePendingOAuthCompleteRegistrationSession(sess *dbent.PendingAuthSession) error {
	return validatePendingOAuthRegistrationSession(sess)
}

func buildPendingOAuthSessionStatusPayload(sess *dbent.PendingAuthSession) gin.H {
	return pendingOAuthStatusJSON(sess)
}

func pendingSessionStringValue(data map[string]any, key string) string {
	return extractFlowStateString(data, key)
}

func ensurePendingOAuthRegistrationIdentityAvailable(ctx context.Context, entDB *dbent.Client, sess *dbent.PendingAuthSession) error {
	return verifyPendingOAuthRegistrationIdentityFree(ctx, entDB, sess)
}

func respondPendingOAuthBindingApplyError(c *gin.Context, err error) {
	replyPendingOAuthBindError(c, err)
}

func applyPendingOAuthAdoptionAndConsumeSession(
	ctx context.Context,
	entDB *dbent.Client,
	authSvc *service.AuthService,
	userSvc *service.UserService,
	sess *dbent.PendingAuthSession,
	dec *dbent.IdentityAdoptionDecision,
	uid int64,
) error {
	return adoptAndConsumePendingOAuthSession(ctx, entDB, authSvc, userSvc, sess, dec, uid)
}

func readCompletionResponse(flowState map[string]any) (map[string]any, bool) {
	return extractCompletionPayload(flowState)
}

func clonePendingMap(src map[string]any) map[string]any {
	return duplicateMap(src)
}

func resolvePendingOAuthTargetUserID(ctx context.Context, entDB *dbent.Client, sess *dbent.PendingAuthSession) (int64, error) {
	return determinePendingOAuthTargetUser(ctx, entDB, sess)
}

func findActiveUserByID(ctx context.Context, entDB *dbent.Client, uid int64) (*dbent.User, error) {
	return lookupActiveUser(ctx, entDB, uid)
}

func cloneOAuthMetadata(src map[string]any) map[string]any {
	return copyOAuthMetadata(src)
}

func consumePendingOAuthBrowserSessionTx(ctx context.Context, tx *dbent.Tx, sess *dbent.PendingAuthSession) error {
	return consumePendingBrowserSessionTx(ctx, tx, sess)
}

func applyPendingOAuthAdoption(
	ctx context.Context,
	entDB *dbent.Client,
	authSvc *service.AuthService,
	userSvc *service.UserService,
	sess *dbent.PendingAuthSession,
	dec *dbent.IdentityAdoptionDecision,
	overrideUID *int64,
) error {
	return executePendingOAuthAdoption(ctx, entDB, authSvc, userSvc, sess, dec, overrideUID)
}

func ensurePendingOAuthIdentityForUser(ctx context.Context, tx *dbent.Tx, sess *dbent.PendingAuthSession, uid int64) (*dbent.AuthIdentity, error) {
	return linkPendingOAuthIdentityToUser(ctx, tx, sess, uid)
}
