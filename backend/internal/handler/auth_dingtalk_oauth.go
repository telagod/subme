package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	dbent "github.com/telagod/subme/ent"
	dbuser "github.com/telagod/subme/ent/user"
	"github.com/telagod/subme/internal/config"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/oauth"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"

	"github.com/telagod/subme/internal/pkg/dingtalk"

	"github.com/gin-gonic/gin"
)

const (
	dtCookiePath        = "/api/v1/auth/oauth/dingtalk"
	dtStateCookie       = "dingtalk_oauth_state"
	dtRedirectCookie    = "dingtalk_oauth_redirect"
	dtIntentCookie      = "dingtalk_oauth_intent"
	dtBindUserCookie    = "dingtalk_oauth_bind_user"
	dtCookieMaxAge      = 600
	dtDefaultRedirect   = "/dashboard"
	dtDefaultFrontendCB = "/auth/dingtalk/callback"
	dtSyntheticDomain   = service.DingTalkConnectSyntheticEmailDomain
)

func setDTCookie(c *gin.Context, name, value string, maxAge int, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: name, Value: value, Path: dtCookiePath,
		MaxAge: maxAge, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

func clearDTCookie(c *gin.Context, name string, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: name, Value: "", Path: dtCookiePath,
		MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) dtConfig(ctx context.Context) (config.DingTalkConnectConfig, error) {
	if h != nil && h.settingSvc != nil {
		return h.settingSvc.GetDingTalkConnectOAuthConfig(ctx)
	}
	if h == nil || h.cfg == nil {
		return config.DingTalkConnectConfig{}, infraerrors.ServiceUnavailable("CONFIG_NOT_READY", "config not loaded")
	}
	if !h.cfg.DingTalk.Enabled {
		return config.DingTalkConnectConfig{}, infraerrors.NotFound("OAUTH_DISABLED", "dingtalk oauth login is disabled")
	}
	return h.cfg.DingTalk, nil
}

func (h *AuthHandler) dtClient(cfg config.DingTalkConnectConfig) *dingtalk.Client {
	h.dtClientMu.Lock()
	defer h.dtClientMu.Unlock()
	key := cfg.ClientID + "|" + cfg.ClientSecret + "|" + cfg.TokenURL + "|" + cfg.UserInfoURL
	if h.dtClientKey != key {
		h.dtClientInstance = dingtalk.NewClient(dingtalk.ClientConfig{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			TokenURL:     cfg.TokenURL,
			UserInfoURL:  cfg.UserInfoURL,
		}, nil)
		h.dtClientKey = key
	}
	return h.dtClientInstance
}

func dtBuildAuthURL(cfg config.DingTalkConnectConfig, state string) (string, error) {
	base := strings.TrimSpace(cfg.AuthorizeURL)
	if base == "" {
		return "", infraerrors.InternalServer("DINGTALK_AUTHORIZE_URL_EMPTY", "dingtalk authorize_url not configured")
	}
	redirect := strings.TrimSpace(cfg.RedirectURL)
	if redirect == "" {
		return "", infraerrors.InternalServer("DINGTALK_REDIRECT_URL_EMPTY", "dingtalk redirect_url not configured")
	}
	u, err := url.Parse(base)
	if err != nil {
		return "", infraerrors.InternalServer("DINGTALK_AUTHORIZE_URL_PARSE_FAILED", "failed to parse dingtalk authorize_url").WithCause(err)
	}
	scopes := strings.TrimSpace(cfg.Scopes)
	if scopes == "" {
		scopes = "openid"
	}
	q := u.Query()
	q.Set("client_id", cfg.ClientID)
	q.Set("redirect_uri", redirect)
	q.Set("response_type", "code")
	q.Set("scope", scopes)
	q.Set("state", state)
	q.Set("prompt", "consent")
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func dtSyntheticEmail(unionID string) string {
	return "dingtalk-" + strings.ToLower(strings.TrimSpace(unionID)) + dtSyntheticDomain
}

func dtUpstreamClaims(staff *dingtalk.StaffInfo, unionID, corpID string) map[string]any {
	primaryDept := int64(0)
	if len(staff.DeptIDs) > 0 {
		primaryDept = staff.DeptIDs[0]
	}
	return map[string]any{
		"email":           staff.Email,
		"username":        staff.Name,
		"nickname":        staff.Nickname,
		"subject":         unionID,
		"corp_user_id":    staff.UserID,
		"union_id":        unionID,
		"corp_id":         corpID,
		"primary_dept_id": primaryDept,
	}
}

func dtMapErrorCode(err error) string {
	var apiErr *dingtalk.APIError
	if !errors.As(err, &apiErr) {
		return "upstream_error"
	}
	switch apiErr.Code {
	case "60011", "60121":
		return "corp_rejected"
	default:
		return "upstream_error"
	}
}

func dtUpstreamRedirect(c *gin.Context, frontendCB, step string, err error) {
	var apiErr *dingtalk.APIError
	dtCode, dtMsg := "", ""
	dtHTTP := 0
	if errors.As(err, &apiErr) {
		dtCode = apiErr.Code
		dtMsg = apiErr.Message
		dtHTTP = apiErr.HTTPStatus
	}
	slog.Error("dingtalk upstream call failed",
		"step", step, "dingtalk_code", dtCode, "dingtalk_msg", dtMsg,
		"http_status", dtHTTP, "error", err.Error())
	msg := dtMsg
	if strings.TrimSpace(msg) == "" {
		msg = infraerrors.Message(err)
	}
	if strings.TrimSpace(dtCode) != "" {
		msg = "dingtalk[" + dtCode + "] " + msg
	}
	redirectOAuthError(c, frontendCB, dtMapErrorCode(err), msg, "")
}

func (h *AuthHandler) DingTalkOAuthStart(c *gin.Context) {
	cfg, err := h.dtConfig(c.Request.Context())
	if err != nil {
		redirectOAuthError(c, dtDefaultFrontendCB, "dingtalk_not_enabled", "", "")
		return
	}
	state, err := oauth.GenerateState()
	if err != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_STATE_GEN_FAILED", "failed to generate oauth state").WithCause(err))
		return
	}
	redirectTo := sanitizeFrontendRedirectPath(c.Query("redirect"))
	if redirectTo == "" {
		redirectTo = dtDefaultRedirect
	}
	browserKey, err := generateOAuthPendingBrowserSession()
	if err != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_BROWSER_SESSION_GEN_FAILED", "failed to generate browser session").WithCause(err))
		return
	}
	secure := isRequestHTTPS(c)
	setDTCookie(c, dtStateCookie, encodeCookieValue(state), dtCookieMaxAge, secure)
	setDTCookie(c, dtRedirectCookie, encodeCookieValue(redirectTo), dtCookieMaxAge, secure)
	intent := sanitizeOAuthIntent(c.Query("intent"))
	setDTCookie(c, dtIntentCookie, encodeCookieValue(intent), dtCookieMaxAge, secure)
	captureOAuthPromoCode(c, secure)
	setOAuthPendingBrowserCookie(c, browserKey, secure)
	clearOAuthPendingSessionCookie(c, secure)
	if intent == oauthIntentBindCurrentUser {
		val, err := h.buildOAuthBindUserCookieFromContext(c)
		if err != nil {
			response.ErrorFrom(c, err)
			return
		}
		setDTCookie(c, dtBindUserCookie, encodeCookieValue(val), dtCookieMaxAge, secure)
	} else {
		clearDTCookie(c, dtBindUserCookie, secure)
	}
	authURL, err := dtBuildAuthURL(cfg, state)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	c.Redirect(http.StatusFound, authURL)
}

func (h *AuthHandler) DingTalkOAuthCallback(c *gin.Context) {
	cfg, cfgErr := h.dtConfig(c.Request.Context())
	if cfgErr != nil {
		response.ErrorFrom(c, cfgErr)
		return
	}
	frontendCB := strings.TrimSpace(cfg.FrontendRedirectURL)
	if frontendCB == "" {
		frontendCB = dtDefaultFrontendCB
	}
	if pe := strings.TrimSpace(c.Query("error")); pe != "" {
		redirectOAuthError(c, frontendCB, "provider_error", pe, c.Query("error_description"))
		return
	}
	code := strings.TrimSpace(c.Query("code"))
	state := strings.TrimSpace(c.Query("state"))
	if code == "" || state == "" {
		redirectOAuthError(c, frontendCB, "missing_params", "missing code/state", "")
		return
	}
	secure := isRequestHTTPS(c)
	defer func() {
		clearDTCookie(c, dtStateCookie, secure)
		clearDTCookie(c, dtRedirectCookie, secure)
		clearDTCookie(c, dtIntentCookie, secure)
		clearOAuthPromoCodeCookie(c, secure)
	}()
	expected, err := readCookieDecoded(c, dtStateCookie)
	if err != nil || state != expected {
		redirectOAuthError(c, frontendCB, "csrf", "state mismatch", "")
		return
	}
	redirectTo, _ := readCookieDecoded(c, dtRedirectCookie)
	intent, _ := readCookieDecoded(c, dtIntentCookie)
	intent = sanitizeOAuthIntent(intent)
	browserKey, _ := readOAuthPendingBrowserCookie(c)
	if strings.TrimSpace(browserKey) == "" {
		redirectOAuthError(c, frontendCB, "missing_browser_session", "missing browser session cookie", "")
		return
	}
	forceEmail := h.isForceEmailOnThirdPartySignup(c.Request.Context())

	client := h.dtClient(cfg)
	ctx := c.Request.Context()

	userToken, err := client.ExchangeCode(ctx, code)
	if err != nil {
		dtUpstreamRedirect(c, frontendCB, "exchange_code", err)
		return
	}
	corpID := strings.TrimSpace(userToken.CorpID)
	if !dtCorpAllowed(cfg, corpID) {
		redirectOAuthError(c, frontendCB, "corp_rejected", "", "")
		return
	}
	unionID, oauthNick, err := client.GetUserByToken(ctx, userToken.AccessToken)
	if err != nil {
		dtUpstreamRedirect(c, frontendCB, "get_union_id", err)
		return
	}
	identityKey := service.PendingAuthIdentityKey{ProviderType: "dingtalk", ProviderKey: "dingtalk", ProviderSubject: unionID}

	staff := h.dtFetchStaff(ctx, cfg, client, unionID, frontendCB, c)
	if staff == nil {
		return
	}
	if strings.TrimSpace(oauthNick) != "" {
		staff.Nickname = strings.TrimSpace(oauthNick)
	}
	claims := dtUpstreamClaims(staff, unionID, corpID)

	if intent == oauthIntentBindCurrentUser {
		h.dtHandleBind(c, cfg, client, identityKey, staff, claims, redirectTo, browserKey, frontendCB, secure, unionID)
		return
	}
	if existing, _ := h.findOAuthIdentityUser(ctx, identityKey); existing != nil {
		h.dtRunSyncAsync(ctx, cfg, client, existing.ID, staff, false)
		if err := h.createOAuthPendingSession(c, oauthPendingSessionPayload{
			Intent: oauthIntentLogin, Identity: identityKey, TargetUserID: &existing.ID,
			ResolvedEmail: existing.Email, RedirectTo: redirectTo, BrowserSessionKey: browserKey,
			UpstreamIdentityClaims: claims,
			CompletionResponse:     map[string]any{"redirect": redirectTo},
		}); err != nil {
			redirectOAuthError(c, frontendCB, "session_error", infraerrors.Reason(err), infraerrors.Message(err))
			return
		}
		redirectToFrontendCallback(c, frontendCB)
		return
	}
	signupBlocked := h.dtSignupBlocked(ctx, cfg)
	if !cfg.RequireEmail {
		h.dtHandleNoEmailRequired(c, cfg, identityKey, claims, unionID, redirectTo, browserKey, frontendCB, signupBlocked)
		return
	}
	if staff.Email == "" {
		h.dtHandleEmailCompletion(c, identityKey, claims, redirectTo, browserKey, frontendCB, signupBlocked)
		return
	}
	h.dtHandleWithEmail(c, cfg, identityKey, staff, claims, redirectTo, browserKey, frontendCB, forceEmail, signupBlocked)
}

func (h *AuthHandler) dtFetchStaff(ctx context.Context, cfg config.DingTalkConnectConfig, client *dingtalk.Client, unionID, frontendCB string, c *gin.Context) *dingtalk.StaffInfo {
	switch cfg.CorpRestrictionPolicy {
	case "internal_only":
		uid, err := client.GetUserIDByUnionID(ctx, unionID)
		if err != nil {
			dtUpstreamRedirect(c, frontendCB, "get_user_id", err)
			return nil
		}
		info, err := client.GetStaffByUserID(ctx, uid)
		if err != nil {
			dtUpstreamRedirect(c, frontendCB, "get_staff_info", err)
			return nil
		}
		return info
	default:
		uid, err := client.GetUserIDByUnionID(ctx, unionID)
		if err != nil {
			slog.Debug("dingtalk step3 fallback", "union_id", unionID, "err", err.Error())
			return &dingtalk.StaffInfo{}
		}
		info, err := client.GetStaffByUserID(ctx, uid)
		if err != nil {
			slog.Debug("dingtalk step4 fallback", "union_id", unionID, "err", err.Error())
			return &dingtalk.StaffInfo{}
		}
		return info
	}
}

func (h *AuthHandler) dtHandleBind(c *gin.Context, cfg config.DingTalkConnectConfig, client *dingtalk.Client, identity service.PendingAuthIdentityKey, staff *dingtalk.StaffInfo, claims map[string]any, redirectTo, browserKey, frontendCB string, secure bool, unionID string) {
	targetUserID, err := h.readOAuthBindUserIDFromCookie(c, dtBindUserCookie)
	if err != nil {
		redirectOAuthError(c, frontendCB, "invalid_state", "invalid bind user cookie", "")
		return
	}
	email := staff.Email
	if email == "" {
		email = dtSyntheticEmail(unionID)
	}
	if err := h.createOAuthPendingSession(c, oauthPendingSessionPayload{
		Intent: oauthIntentBindCurrentUser, Identity: identity,
		TargetUserID: &targetUserID, ResolvedEmail: email,
		RedirectTo: redirectTo, BrowserSessionKey: browserKey,
		UpstreamIdentityClaims: claims,
		CompletionResponse:     map[string]any{"redirect": redirectTo},
	}); err != nil {
		redirectOAuthError(c, frontendCB, "session_error", infraerrors.Reason(err), infraerrors.Message(err))
		return
	}
	clearDTCookie(c, dtBindUserCookie, secure)
	redirectToFrontendCallback(c, frontendCB)
}

func (h *AuthHandler) dtHandleNoEmailRequired(c *gin.Context, cfg config.DingTalkConnectConfig, identity service.PendingAuthIdentityKey, claims map[string]any, unionID, redirectTo, browserKey, frontendCB string, signupBlocked bool) {
	if signupBlocked {
		if err := h.createOAuthPendingSession(c, oauthPendingSessionPayload{
			Intent: oauthIntentLogin, Identity: identity, TargetUserID: nil,
			ResolvedEmail: "", RedirectTo: redirectTo, BrowserSessionKey: browserKey,
			UpstreamIdentityClaims: claims,
			CompletionResponse:     dtBindLoginResponse(redirectTo),
		}); err != nil {
			redirectOAuthError(c, frontendCB, "session_error", infraerrors.Reason(err), infraerrors.Message(err))
			return
		}
		redirectToFrontendCallback(c, frontendCB)
		return
	}
	synEmail := dtSyntheticEmail(unionID)
	if err := h.createOAuthPendingSession(c, oauthPendingSessionPayload{
		Intent: oauthIntentLogin, Identity: identity, TargetUserID: nil,
		ResolvedEmail: synEmail, RedirectTo: redirectTo, BrowserSessionKey: browserKey,
		UpstreamIdentityClaims: claims,
		CompletionResponse:     map[string]any{"redirect": redirectTo, "synthetic_email": synEmail},
	}); err != nil {
		redirectOAuthError(c, frontendCB, "session_error", infraerrors.Reason(err), infraerrors.Message(err))
		return
	}
	redirectToFrontendCallback(c, frontendCB)
}

func (h *AuthHandler) dtHandleEmailCompletion(c *gin.Context, identity service.PendingAuthIdentityKey, claims map[string]any, redirectTo, browserKey, frontendCB string, signupBlocked bool) {
	cr := map[string]any{
		"step":                      "email_completion",
		"requires_email_completion": true,
		"redirect":                  redirectTo,
	}
	if signupBlocked {
		cr = dtBindLoginResponse(redirectTo)
	}
	if err := h.createOAuthPendingSession(c, oauthPendingSessionPayload{
		Intent: oauthIntentLogin, Identity: identity, TargetUserID: nil,
		ResolvedEmail: "", RedirectTo: redirectTo, BrowserSessionKey: browserKey,
		UpstreamIdentityClaims: claims, CompletionResponse: cr,
	}); err != nil {
		redirectOAuthError(c, frontendCB, "session_error", infraerrors.Reason(err), infraerrors.Message(err))
		return
	}
	redirectToFrontendCallback(c, frontendCB)
}

func (h *AuthHandler) dtHandleWithEmail(c *gin.Context, cfg config.DingTalkConnectConfig, identity service.PendingAuthIdentityKey, staff *dingtalk.StaffInfo, claims map[string]any, redirectTo, browserKey, frontendCB string, forceEmail, signupBlocked bool) {
	var compatUser *dbent.User
	if staff.Email != "" {
		compatUser, _ = h.dtFindCompatEmailUser(c.Request.Context(), staff.Email)
	}
	h.dtCreateChoiceSession(c, identity, staff.Email, staff.Email, redirectTo, browserKey, claims, staff.Email, compatUser, forceEmail, signupBlocked, frontendCB)
}

func (h *AuthHandler) dtFindCompatEmailUser(ctx context.Context, email string) (*dbent.User, error) {
	client := h.entClient()
	if client == nil {
		return nil, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth service not ready")
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" ||
		strings.HasSuffix(email, service.DingTalkConnectSyntheticEmailDomain) ||
		strings.HasSuffix(email, service.LinuxDoConnectSyntheticEmailDomain) ||
		strings.HasSuffix(email, service.OIDCConnectSyntheticEmailDomain) ||
		strings.HasSuffix(email, service.WeChatConnectSyntheticEmailDomain) {
		return nil, nil
	}
	users, err := client.User.Query().
		Where(userNormalizedEmailPredicate(email)).
		Order(dbent.Asc(dbuser.FieldID)).
		All(ctx)
	if err != nil {
		return nil, infraerrors.InternalServer("COMPAT_EMAIL_LOOKUP_FAILED", "failed to look up compat email user").WithCause(err)
	}
	switch len(users) {
	case 0:
		return nil, nil
	case 1:
		return users[0], nil
	default:
		return nil, infraerrors.Conflict("USER_EMAIL_CONFLICT", "normalized email matched multiple users")
	}
}

func (h *AuthHandler) dtCreateChoiceSession(c *gin.Context, identity service.PendingAuthIdentityKey, suggestedEmail, resolvedEmail, redirectTo, browserKey string, claims map[string]any, compatEmail string, compatUser *dbent.User, forceEmail, signupBlocked bool, frontendCB string) {
	suggestion := strings.TrimSpace(suggestedEmail)
	canonical := strings.TrimSpace(resolvedEmail)
	if suggestion == "" {
		suggestion = canonical
	}
	cr := map[string]any{
		"step":                      oauthPendingChoiceStep,
		"adoption_required":         true,
		"redirect":                  strings.TrimSpace(redirectTo),
		"email":                     suggestion,
		"resolved_email":            canonical,
		"existing_account_email":    "",
		"existing_account_bindable": false,
		"create_account_allowed":    !signupBlocked,
		"force_email_on_signup":     forceEmail,
		"choice_reason":             "third_party_signup",
	}
	if strings.TrimSpace(compatEmail) != "" {
		cr["compat_email"] = strings.TrimSpace(compatEmail)
	}
	choiceEmail := suggestion
	if compatUser != nil {
		cr["email"] = strings.TrimSpace(compatUser.Email)
		cr["existing_account_email"] = strings.TrimSpace(compatUser.Email)
		cr["existing_account_bindable"] = true
		cr["choice_reason"] = "compat_email_match"
		choiceEmail = strings.TrimSpace(compatUser.Email)
	}
	if forceEmail && compatUser == nil {
		cr["choice_reason"] = "force_email_on_signup"
	}
	if signupBlocked {
		cr["step"] = "bind_login_required"
		cr["existing_account_bindable"] = true
		cr["choice_reason"] = "signup_blocked_redirect_to_bind"
	}
	var targetID *int64
	if compatUser != nil && compatUser.ID > 0 {
		targetID = &compatUser.ID
	}
	if err := h.createOAuthPendingSession(c, oauthPendingSessionPayload{
		Intent: oauthIntentLogin, Identity: identity,
		TargetUserID: targetID, ResolvedEmail: choiceEmail,
		RedirectTo: redirectTo, BrowserSessionKey: browserKey,
		UpstreamIdentityClaims: claims, CompletionResponse: cr,
	}); err != nil {
		redirectOAuthError(c, frontendCB, "session_error", infraerrors.Reason(err), infraerrors.Message(err))
		return
	}
	redirectToFrontendCallback(c, frontendCB)
}

type completeDingTalkOAuthRequest struct {
	InvitationCode   string `json:"invitation_code" binding:"required"`
	AffCode          string `json:"aff_code,omitempty"`
	AdoptDisplayName *bool  `json:"adopt_display_name,omitempty"`
	AdoptAvatar      *bool  `json:"adopt_avatar,omitempty"`
}

func (h *AuthHandler) CompleteDingTalkOAuthRegistration(c *gin.Context) {
	var req completeDingTalkOAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_REQUEST", "message": err.Error()})
		return
	}
	secure := isRequestHTTPS(c)
	sessionToken, err := readOAuthPendingSessionCookie(c)
	if err != nil {
		clearOAuthPendingSessionCookie(c, secure)
		clearOAuthPendingBrowserCookie(c, secure)
		response.ErrorFrom(c, service.ErrPendingAuthSessionNotFound)
		return
	}
	browserKey, err := readOAuthPendingBrowserCookie(c)
	if err != nil {
		clearOAuthPendingSessionCookie(c, secure)
		clearOAuthPendingBrowserCookie(c, secure)
		response.ErrorFrom(c, service.ErrPendingAuthBrowserMismatch)
		return
	}
	pendingSvc, err := h.pendingIdentityService()
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	session, err := pendingSvc.GetBrowserSession(c.Request.Context(), sessionToken, browserKey)
	if err != nil {
		clearOAuthPendingSessionCookie(c, secure)
		clearOAuthPendingBrowserCookie(c, secure)
		response.ErrorFrom(c, err)
		return
	}
	if err := ensurePendingOAuthCompleteRegistrationSession(session); err != nil {
		response.ErrorFrom(c, err)
		return
	}
	if updated, handled, err := h.legacyCompleteRegistrationSessionStatus(c, session); err != nil {
		response.ErrorFrom(c, err)
		return
	} else if handled {
		c.JSON(http.StatusOK, buildPendingOAuthSessionStatusPayload(updated))
		return
	} else {
		session = updated
	}
	if err := h.ensureBackendModeAllowsNewUserLogin(c.Request.Context()); err != nil {
		response.ErrorFrom(c, err)
		return
	}
	email := strings.TrimSpace(session.ResolvedEmail)
	username := pendingSessionStringValue(session.UpstreamIdentityClaims, "username")
	if username == "" {
		if at := strings.Index(email, "@"); at > 0 {
			username = email[:at]
		} else {
			username = email
		}
	}
	if email == "" || username == "" {
		response.ErrorFrom(c, infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending auth registration context is invalid"))
		return
	}
	client := h.entClient()
	if client == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth service not ready"))
		return
	}
	if err := ensurePendingOAuthRegistrationIdentityAvailable(c.Request.Context(), client, session); err != nil {
		respondPendingOAuthBindingApplyError(c, err)
		return
	}
	decision, err := h.ensurePendingOAuthAdoptionDecision(c, session.ID, oauthAdoptionDecisionRequest{
		AdoptDisplayName: req.AdoptDisplayName,
		AdoptAvatar:      req.AdoptAvatar,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	tokenPair, user, err := h.authService.LoginOrRegisterOAuthWithTokenPairAndPromoCode(
		c.Request.Context(),
		email,
		username,
		req.InvitationCode,
		req.AffCode,
		pendingOAuthPromoCode(session),
		"dingtalk",
	)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	if err := applyPendingOAuthAdoptionAndConsumeSession(c.Request.Context(), client, h.authService, h.userService, session, decision, user.ID); err != nil {
		respondPendingOAuthBindingApplyError(c, err)
		return
	}
	if completionCfg, cfgErr := h.dtConfig(c.Request.Context()); cfgErr == nil {
		dtClient := h.dtClient(completionCfg)
		sessionClaims := session.UpstreamIdentityClaims
		h.dtRunSyncAsync(c.Request.Context(), completionCfg, dtClient, user.ID, nil, true, sessionClaims)
	}
	h.authService.RecordSuccessfulLogin(c.Request.Context(), user.ID)
	clearOAuthPendingSessionCookie(c, secure)
	clearOAuthPendingBrowserCookie(c, secure)
	c.JSON(http.StatusOK, gin.H{
		"access_token":  tokenPair.AccessToken,
		"refresh_token": tokenPair.RefreshToken,
		"expires_in":    tokenPair.ExpiresIn,
		"token_type":    "Bearer",
	})
}

func (h *AuthHandler) CreateDingTalkOAuthAccount(c *gin.Context) {
	h.createPendingOAuthAccount(c, "dingtalk")
}

func (h *AuthHandler) BindDingTalkOAuthLogin(c *gin.Context) {
	h.bindPendingOAuthLogin(c, "dingtalk")
}

func dtCorpAllowed(cfg config.DingTalkConnectConfig, corpID string) bool {
	switch cfg.CorpRestrictionPolicy {
	case "internal_only", "none", "":
		return true
	default:
		return false
	}
}

func (h *AuthHandler) dtSignupBlocked(ctx context.Context, cfg config.DingTalkConnectConfig) bool {
	if h.settingSvc == nil {
		return false
	}
	if h.settingSvc.IsRegistrationEnabled(ctx) {
		return false
	}
	if cfg.BypassRegistration && cfg.CorpRestrictionPolicy == "internal_only" {
		return false
	}
	return true
}

func dtBindLoginResponse(redirectTo string) map[string]any {
	return map[string]any{
		"step":                      "bind_login_required",
		"existing_account_bindable": true,
		"create_account_allowed":    false,
		"redirect":                  redirectTo,
	}
}

func (h *AuthHandler) dtRunSyncAsync(parent context.Context, cfg config.DingTalkConnectConfig, client *dingtalk.Client, userID int64, staff *dingtalk.StaffInfo, syncUsername bool, claims ...map[string]any) {
	base := context.WithoutCancel(parent)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("dingtalk sync: panic recovered", "panic", r)
			}
		}()
		ctx, cancel := context.WithTimeout(base, 30*time.Second)
		defer cancel()
		if staff == nil && len(claims) > 0 {
			staff = dtStaffFromClaims(claims[0])
		}
		h.dtSyncIdentity(ctx, cfg, client, userID, staff, syncUsername)
	}()
}

func dtStaffFromClaims(claims map[string]any) *dingtalk.StaffInfo {
	if claims == nil {
		return &dingtalk.StaffInfo{}
	}
	s := &dingtalk.StaffInfo{}
	if v, ok := claims["username"].(string); ok {
		s.Name = v
	}
	if v, ok := claims["nickname"].(string); ok {
		s.Nickname = v
	}
	if v, ok := claims["email"].(string); ok {
		s.Email = v
	}
	if v, ok := claims["corp_user_id"].(string); ok {
		s.UserID = v
	}
	switch v := claims["primary_dept_id"].(type) {
	case int64:
		if v > 0 {
			s.DeptIDs = []int64{v}
		}
	case float64:
		if id := int64(v); id > 0 {
			s.DeptIDs = []int64{id}
		}
	}
	return s
}

func (h *AuthHandler) dtSyncIdentity(ctx context.Context, cfg config.DingTalkConnectConfig, client *dingtalk.Client, userID int64, staff *dingtalk.StaffInfo, syncUsername bool) {
	if cfg.CorpRestrictionPolicy != "internal_only" || staff == nil {
		return
	}
	if !cfg.SyncCorpEmail && !cfg.SyncDisplayName && !cfg.SyncDept {
		return
	}
	if h.userAttributeService == nil {
		slog.Warn("dingtalk sync: userAttributeService not available")
		return
	}
	if syncUsername && cfg.SyncDisplayName {
		username := strings.TrimSpace(staff.Nickname)
		if username == "" {
			username = strings.TrimSpace(staff.Name)
		}
		if username != "" && h.userService != nil {
			if _, err := h.userService.UpdateProfile(ctx, userID, service.UpdateProfileRequest{Username: &username}); err != nil {
				slog.Warn("dingtalk sync: failed to update username", "user_id", userID, "err", err)
			}
		}
	}
	type field struct{ key, val string }
	var fields []field
	if cfg.SyncDisplayName && strings.TrimSpace(staff.Name) != "" {
		fields = append(fields, field{cfg.SyncDisplayNameAttrKey, strings.TrimSpace(staff.Name)})
	}
	if cfg.SyncCorpEmail && strings.TrimSpace(staff.Email) != "" {
		fields = append(fields, field{cfg.SyncCorpEmailAttrKey, strings.TrimSpace(staff.Email)})
	}
	if cfg.SyncDept && len(staff.DeptIDs) > 0 {
		primaryDept := int64(0)
		for _, id := range staff.DeptIDs {
			if id > 1 {
				primaryDept = id
				break
			}
		}
		if primaryDept == 0 {
			primaryDept = staff.DeptIDs[0]
		}
		path, err := h.dtResolveDeptPath(ctx, client, primaryDept)
		if err != nil {
			slog.Warn("dingtalk sync: failed to resolve dept path", "user_id", userID, "dept_id", primaryDept, "err", err)
		} else {
			fields = append(fields, field{cfg.SyncDeptAttrKey, path})
		}
	}
	for _, f := range fields {
		h.dtSetAttr(ctx, userID, f.key, f.val)
	}
}

func (h *AuthHandler) dtResolveDeptPath(ctx context.Context, client *dingtalk.Client, deptID int64) (string, error) {
	const maxDepth = 50
	visited := make(map[int64]bool, maxDepth)
	var parts []string
	current := deptID
	for i := 0; i < maxDepth; i++ {
		if current < 1 || visited[current] {
			break
		}
		visited[current] = true
		info, err := client.GetDeptInfo(ctx, current)
		if err != nil {
			return "", fmt.Errorf("get dept info %d: %w", current, err)
		}
		if strings.TrimSpace(info.Name) != "" {
			parts = append([]string{strings.TrimSpace(info.Name)}, parts...)
		}
		if info.ParentID < 1 || info.ParentID == current {
			break
		}
		current = info.ParentID
	}
	if len(parts) > 0 {
		parts = parts[1:]
	}
	return strings.Join(parts, "/"), nil
}

func (h *AuthHandler) dtSetAttr(ctx context.Context, userID int64, key, value string) {
	def, err := h.userAttributeService.GetDefinitionByKey(ctx, key)
	if err != nil {
		slog.Warn("dingtalk sync: attribute definition not found", "key", key, "err", err.Error())
		return
	}
	if err := h.userAttributeService.UpdateUserAttributes(ctx, userID, []service.UpdateUserAttributeInput{
		{AttributeID: def.ID, Value: value},
	}); err != nil {
		slog.Warn("dingtalk sync: failed to set attribute", "user_id", userID, "key", key, "err", err)
	}
}

// dingTalkSyncer implements oauthsync.PostLoginSyncer for DingTalk identity sync
type dingTalkSyncer struct {
	handler *AuthHandler
}

func (s *dingTalkSyncer) SyncAfterLogin(ctx context.Context, providerType string, userID int64, claims map[string]any) {
	if providerType != "dingtalk" {
		return
	}
	cfg, err := s.handler.dtConfig(ctx)
	if err != nil {
		return
	}
	client := s.handler.dtClient(cfg)
	s.handler.dtRunSyncAsync(ctx, cfg, client, userID, nil, false, claims)
}

func (s *dingTalkSyncer) SyncAfterRegistration(ctx context.Context, providerType string, userID int64, claims map[string]any) {
	if providerType != "dingtalk" {
		return
	}
	cfg, err := s.handler.dtConfig(ctx)
	if err != nil {
		return
	}
	client := s.handler.dtClient(cfg)
	s.handler.dtRunSyncAsync(ctx, cfg, client, userID, nil, true, claims)
}

func NewDingTalkSyncer(handler *AuthHandler) *dingTalkSyncer {
	return &dingTalkSyncer{handler: handler}
}
