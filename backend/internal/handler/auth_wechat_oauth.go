package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/authidentity"
	"github.com/telagod/subme/ent/authidentitychannel"
	"github.com/telagod/subme/internal/payment"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/oauth"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"

	"github.com/gin-gonic/gin"
)

const (
	wechatOAuthCookiePath         = "/api/v1/auth/oauth/wechat"
	wechatOAuthCookieMaxAgeSec    = 10 * 60
	wechatOAuthStateCookieName    = "wechat_oauth_state"
	wechatOAuthRedirectCookieName = "wechat_oauth_redirect"
	wechatOAuthIntentCookieName   = "wechat_oauth_intent"
	wechatOAuthModeCookieName     = "wechat_oauth_mode"
	wechatOAuthBindUserCookieName = "wechat_oauth_bind_user"
	wechatOAuthDefaultRedirectTo  = "/dashboard"
	wechatOAuthDefaultFrontendCB  = "/auth/wechat/callback"
	wechatOAuthProviderKey        = "wechat-main"
	wechatOAuthLegacyProviderKey  = "wechat"
	wechatPaymentOAuthCookiePath  = "/api/v1/auth/oauth/wechat/payment"
	wechatPaymentOAuthStateName   = "wechat_payment_oauth_state"
	wechatPaymentOAuthRedirect    = "wechat_payment_oauth_redirect"
	wechatPaymentOAuthContextName = "wechat_payment_oauth_context"
	wechatPaymentOAuthScope       = "wechat_payment_oauth_scope"
	wechatPaymentOAuthDefaultTo   = "/purchase"
	wechatPaymentOAuthFrontendCB  = "/auth/wechat/payment/callback"

	wechatOAuthIntentLogin      = "login"
	wechatOAuthIntentBind       = "bind_current_user"
	wechatOAuthIntentAdoptEmail = "adopt_existing_user_by_email"
)

var (
	wechatOAuthAccessTokenURL = "https://api.weixin.qq.com/sns/oauth2/access_token"
	wechatOAuthUserInfoURL    = "https://api.weixin.qq.com/sns/userinfo"
)

type wechatOAuthConfig struct {
	mode             string
	appID            string
	appSecret        string
	authorizeURL     string
	scope            string
	redirectURI      string
	frontendCallback string
	openEnabled      bool
	mpEnabled        bool
}

type wechatOAuthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int64  `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	OpenID       string `json:"openid"`
	Scope        string `json:"scope"`
	UnionID      string `json:"unionid"`
	ErrCode      int64  `json:"errcode"`
	ErrMsg       string `json:"errmsg"`
}

type wechatOAuthUserInfoResponse struct {
	OpenID     string `json:"openid"`
	Nickname   string `json:"nickname"`
	HeadImgURL string `json:"headimgurl"`
	UnionID    string `json:"unionid"`
	ErrCode    int64  `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

type wechatPaymentOAuthContext struct {
	PaymentType string `json:"payment_type"`
	Amount      string `json:"amount,omitempty"`
	OrderType   string `json:"order_type,omitempty"`
	PlanID      int64  `json:"plan_id,omitempty"`
}

// WeChatOAuthStart initiates the WeChat OAuth login flow, storing transient
// browser cookies for the pending-auth bridge.
func (h *AuthHandler) WeChatOAuthStart(c *gin.Context) {
	oauthCfg, cfgErr := h.loadWeChatOAuthConfig(c.Request.Context(), c.Query("mode"), c)
	if cfgErr != nil {
		response.ErrorFrom(c, cfgErr)
		return
	}

	csrfToken, genErr := oauth.GenerateState()
	if genErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_STATE_GEN_FAILED", "could not generate oauth state token").WithCause(genErr))
		return
	}

	destination := sanitizeFrontendRedirectPath(c.Query("redirect"))
	if destination == "" {
		destination = wechatOAuthDefaultRedirectTo
	}

	browserKey, keyErr := generateOAuthPendingBrowserSession()
	if keyErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_BROWSER_SESSION_GEN_FAILED", "could not generate browser session key").WithCause(keyErr))
		return
	}

	loginIntent := resolveWeChatLoginIntent(c.Query("intent"))
	useSecure := isRequestHTTPS(c)
	persistWeChatCookie(c, wechatOAuthStateCookieName, encodeCookieValue(csrfToken), wechatOAuthCookieMaxAgeSec, useSecure)
	persistWeChatCookie(c, wechatOAuthRedirectCookieName, encodeCookieValue(destination), wechatOAuthCookieMaxAgeSec, useSecure)
	persistWeChatCookie(c, wechatOAuthIntentCookieName, encodeCookieValue(loginIntent), wechatOAuthCookieMaxAgeSec, useSecure)
	persistWeChatCookie(c, wechatOAuthModeCookieName, encodeCookieValue(oauthCfg.mode), wechatOAuthCookieMaxAgeSec, useSecure)
	captureOAuthPromoCode(c, useSecure)
	setOAuthPendingBrowserCookie(c, browserKey, useSecure)
	clearOAuthPendingSessionCookie(c, useSecure)
	if loginIntent == oauthIntentBindCurrentUser {
		bindValue, bindErr := h.buildOAuthBindUserCookieFromContext(c)
		if bindErr != nil {
			response.ErrorFrom(c, bindErr)
			return
		}
		persistWeChatCookie(c, wechatOAuthBindUserCookieName, encodeCookieValue(bindValue), wechatOAuthCookieMaxAgeSec, useSecure)
	} else {
		removeWeChatCookie(c, wechatOAuthBindUserCookieName, useSecure)
	}

	authEndpoint, buildErr := assembleWeChatAuthorizeURL(oauthCfg, csrfToken)
	if buildErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_BUILD_URL_FAILED", "could not construct oauth authorization url").WithCause(buildErr))
		return
	}

	c.Redirect(http.StatusFound, authEndpoint)
}

// WeChatOAuthCallback exchanges the authorization code with WeChat, resolves
// the provider identity, and stores the result in the unified pending-auth flow.
func (h *AuthHandler) WeChatOAuthCallback(c *gin.Context) {
	uiCallbackPath := h.resolveWeChatFrontendCallback(c.Request.Context())

	if providerErrMsg := strings.TrimSpace(c.Query("error")); providerErrMsg != "" {
		redirectOAuthError(c, uiCallbackPath, "provider_error", providerErrMsg, c.Query("error_description"))
		return
	}

	authCode := strings.TrimSpace(c.Query("code"))
	csrfState := strings.TrimSpace(c.Query("state"))
	if authCode == "" || csrfState == "" {
		redirectOAuthError(c, uiCallbackPath, "missing_params", "authorization code or state is missing", "")
		return
	}

	useSecure := isRequestHTTPS(c)
	defer func() {
		removeWeChatCookie(c, wechatOAuthStateCookieName, useSecure)
		removeWeChatCookie(c, wechatOAuthRedirectCookieName, useSecure)
		removeWeChatCookie(c, wechatOAuthIntentCookieName, useSecure)
		removeWeChatCookie(c, wechatOAuthModeCookieName, useSecure)
		removeWeChatCookie(c, wechatOAuthBindUserCookieName, useSecure)
		clearOAuthPromoCodeCookie(c, useSecure)
	}()

	savedCSRF, readErr := readCookieDecoded(c, wechatOAuthStateCookieName)
	if readErr != nil || savedCSRF == "" || csrfState != savedCSRF {
		redirectOAuthError(c, uiCallbackPath, "invalid_state", "oauth state mismatch", "")
		return
	}

	destination, _ := readCookieDecoded(c, wechatOAuthRedirectCookieName)
	destination = sanitizeFrontendRedirectPath(destination)
	if destination == "" {
		destination = wechatOAuthDefaultRedirectTo
	}
	browserKey, _ := readOAuthPendingBrowserCookie(c)
	if strings.TrimSpace(browserKey) == "" {
		redirectOAuthError(c, uiCallbackPath, "missing_browser_session", "browser session key is absent", "")
		return
	}

	rawIntent, _ := readCookieDecoded(c, wechatOAuthIntentCookieName)
	oauthMode, modeErr := readCookieDecoded(c, wechatOAuthModeCookieName)
	if modeErr != nil || strings.TrimSpace(oauthMode) == "" {
		redirectOAuthError(c, uiCallbackPath, "invalid_state", "oauth mode is absent", "")
		return
	}

	oauthCfg, cfgErr := h.loadWeChatOAuthConfig(c.Request.Context(), oauthMode, c)
	if cfgErr != nil {
		redirectOAuthError(c, uiCallbackPath, "provider_error", infraerrors.Reason(cfgErr), infraerrors.Message(cfgErr))
		return
	}

	tokenData, profile, identityErr := retrieveWeChatIdentity(c.Request.Context(), oauthCfg, authCode)
	if identityErr != nil {
		redirectOAuthError(c, uiCallbackPath, "provider_error", "wechat_identity_fetch_failed", singleLine(identityErr.Error()))
		return
	}

	resolvedUnionID := strings.TrimSpace(coalesce(profile.UnionID, tokenData.UnionID))
	resolvedOpenID := strings.TrimSpace(coalesce(profile.OpenID, tokenData.OpenID))
	subject := resolvedUnionID
	if subject == "" {
		if oauthCfg.needsUnionID() {
			redirectOAuthError(c, uiCallbackPath, "provider_error", "wechat_missing_unionid", "")
			return
		}
		subject = resolvedOpenID
	}
	if subject == "" {
		redirectOAuthError(c, uiCallbackPath, "provider_error", "wechat_missing_unionid", "")
		return
	}

	displayName := coalesce(profile.Nickname, generateWeChatFallbackUsername(subject))
	syntheticAddr := generateWeChatSyntheticEmail(subject)
	providerClaims := map[string]any{
		"email":                  syntheticAddr,
		"username":               displayName,
		"subject":                subject,
		"openid":                 resolvedOpenID,
		"unionid":                resolvedUnionID,
		"mode":                   oauthCfg.mode,
		"channel":                oauthCfg.mode,
		"channel_app_id":         strings.TrimSpace(oauthCfg.appID),
		"channel_subject":        resolvedOpenID,
		"suggested_display_name": strings.TrimSpace(profile.Nickname),
		"suggested_avatar_url":   strings.TrimSpace(profile.HeadImgURL),
	}
	identityRef := service.PendingAuthIdentityKey{
		ProviderType:    "wechat",
		ProviderKey:     wechatOAuthProviderKey,
		ProviderSubject: subject,
	}

	loginIntent := resolveWeChatLoginIntent(rawIntent)
	if loginIntent == wechatOAuthIntentBind {
		if bindErr := h.initWeChatBindPendingSession(c, oauthCfg, subject, resolvedOpenID, destination, browserKey, providerClaims); bindErr != nil {
			switch infraerrors.Code(bindErr) {
			case http.StatusConflict:
				redirectOAuthError(c, uiCallbackPath, "ownership_conflict", infraerrors.Reason(bindErr), infraerrors.Message(bindErr))
			case http.StatusUnauthorized, http.StatusForbidden:
				redirectOAuthError(c, uiCallbackPath, "auth_required", infraerrors.Reason(bindErr), infraerrors.Message(bindErr))
			default:
				redirectOAuthError(c, uiCallbackPath, "session_error", infraerrors.Reason(bindErr), infraerrors.Message(bindErr))
			}
			return
		}
		redirectToFrontendCallback(c, uiCallbackPath)
		return
	}

	matchedUser, lookupErr := h.findOAuthIdentityUser(c.Request.Context(), identityRef)
	if lookupErr != nil {
		redirectOAuthError(c, uiCallbackPath, "session_error", infraerrors.Reason(lookupErr), infraerrors.Message(lookupErr))
		return
	}
	if matchedUser == nil {
		matchedUser, lookupErr = h.discoverWeChatUserByLegacyOpenID(c.Request.Context(), identityRef, oauthCfg, resolvedOpenID)
		if lookupErr != nil {
			redirectOAuthError(c, uiCallbackPath, "session_error", infraerrors.Reason(lookupErr), infraerrors.Message(lookupErr))
			return
		}
	}
	if matchedUser != nil {
		if repairErr := h.repairWeChatIdentityBinding(c.Request.Context(), matchedUser.ID, identityRef, providerClaims); repairErr != nil {
			redirectOAuthError(c, uiCallbackPath, "session_error", infraerrors.Reason(repairErr), infraerrors.Message(repairErr))
			return
		}
		if sessionErr := h.storeWeChatPendingSession(c, loginIntent, subject, matchedUser.Email, destination, browserKey, providerClaims, nil, nil, &matchedUser.ID); sessionErr != nil {
			redirectOAuthError(c, uiCallbackPath, "session_error", "could not continue oauth login", "")
			return
		}
		redirectToFrontendCallback(c, uiCallbackPath)
		return
	}

	if h.isForceEmailOnThirdPartySignup(c.Request.Context()) {
		if sessionErr := h.storeWeChatChoicePendingSession(
			c,
			identityRef,
			syntheticAddr,
			syntheticAddr,
			destination,
			browserKey,
			providerClaims,
			"",
			nil,
			true,
		); sessionErr != nil {
			redirectOAuthError(c, uiCallbackPath, "session_error", "could not continue oauth login", "")
			return
		}
		redirectToFrontendCallback(c, uiCallbackPath)
		return
	}

	if sessionErr := h.storeWeChatChoicePendingSession(
		c,
		identityRef,
		syntheticAddr,
		syntheticAddr,
		destination,
		browserKey,
		providerClaims,
		"",
		nil,
		false,
	); sessionErr != nil {
		redirectOAuthError(c, uiCallbackPath, "session_error", "could not continue oauth login", "")
		return
	}
	redirectToFrontendCallback(c, uiCallbackPath)
}

// WeChatPaymentOAuthStart initiates the WeChat payment-specific OAuth flow.
// GET /api/v1/auth/oauth/wechat/payment/start?payment_type=wxpay&redirect=/purchase
func (h *AuthHandler) WeChatPaymentOAuthStart(c *gin.Context) {
	oauthCfg, cfgErr := h.loadWeChatOAuthConfig(c.Request.Context(), "mp", c)
	if cfgErr != nil {
		response.ErrorFrom(c, cfgErr)
		return
	}

	payType := normalizeWxPaymentType(c.Query("payment_type"))
	if payType == "" {
		response.BadRequest(c, "Invalid payment type")
		return
	}

	csrfToken, genErr := oauth.GenerateState()
	if genErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_STATE_GEN_FAILED", "could not generate oauth state token").WithCause(genErr))
		return
	}

	destination := normalizeWxPaymentRedirect(sanitizeFrontendRedirectPath(c.Query("redirect")))
	if destination == "" {
		destination = wechatPaymentOAuthDefaultTo
	}
	serializedCtx, encodeErr := serializeWxPaymentOAuthContext(wechatPaymentOAuthContext{
		PaymentType: payType,
		Amount:      strings.TrimSpace(c.Query("amount")),
		OrderType:   strings.TrimSpace(c.Query("order_type")),
		PlanID:      parseWxPaymentPlanID(c.Query("plan_id")),
	})
	if encodeErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_CONTEXT_ENCODE_FAILED", "could not serialize oauth context").WithCause(encodeErr))
		return
	}

	reqScope := normalizeWxPaymentScope(c.Query("scope"))
	useSecure := isRequestHTTPS(c)
	setWxPaymentCookie(c, wechatPaymentOAuthStateName, encodeCookieValue(csrfToken), wechatOAuthCookieMaxAgeSec, useSecure)
	setWxPaymentCookie(c, wechatPaymentOAuthRedirect, encodeCookieValue(destination), wechatOAuthCookieMaxAgeSec, useSecure)
	setWxPaymentCookie(c, wechatPaymentOAuthContextName, encodeCookieValue(serializedCtx), wechatOAuthCookieMaxAgeSec, useSecure)
	setWxPaymentCookie(c, wechatPaymentOAuthScope, encodeCookieValue(reqScope), wechatOAuthCookieMaxAgeSec, useSecure)

	oauthCfg.redirectURI = h.resolveWxPaymentCallbackURL(c.Request.Context(), c)
	oauthCfg.scope = reqScope
	authEndpoint, buildErr := assembleWeChatAuthorizeURL(oauthCfg, csrfToken)
	if buildErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_BUILD_URL_FAILED", "could not construct oauth authorization url").WithCause(buildErr))
		return
	}

	c.Redirect(http.StatusFound, authEndpoint)
}

// WeChatPaymentOAuthCallback exchanges a payment OAuth code for an OpenID and
// redirects the browser back to the frontend callback route.
func (h *AuthHandler) WeChatPaymentOAuthCallback(c *gin.Context) {
	uiCallbackPath := wechatPaymentOAuthFrontendCB

	if providerErrMsg := strings.TrimSpace(c.Query("error")); providerErrMsg != "" {
		redirectOAuthError(c, uiCallbackPath, "provider_error", providerErrMsg, c.Query("error_description"))
		return
	}

	authCode := strings.TrimSpace(c.Query("code"))
	csrfState := strings.TrimSpace(c.Query("state"))
	if authCode == "" || csrfState == "" {
		redirectOAuthError(c, uiCallbackPath, "missing_params", "authorization code or state is missing", "")
		return
	}

	useSecure := isRequestHTTPS(c)
	defer func() {
		clearWxPaymentCookie(c, wechatPaymentOAuthStateName, useSecure)
		clearWxPaymentCookie(c, wechatPaymentOAuthRedirect, useSecure)
		clearWxPaymentCookie(c, wechatPaymentOAuthContextName, useSecure)
		clearWxPaymentCookie(c, wechatPaymentOAuthScope, useSecure)
	}()

	savedCSRF, readErr := readCookieDecoded(c, wechatPaymentOAuthStateName)
	if readErr != nil || savedCSRF == "" || csrfState != savedCSRF {
		redirectOAuthError(c, uiCallbackPath, "invalid_state", "oauth state mismatch", "")
		return
	}

	destination, _ := readCookieDecoded(c, wechatPaymentOAuthRedirect)
	destination = normalizeWxPaymentRedirect(sanitizeFrontendRedirectPath(destination))
	if destination == "" {
		destination = wechatPaymentOAuthDefaultTo
	}

	serializedCtx, _ := readCookieDecoded(c, wechatPaymentOAuthContextName)
	payCtx, decodeErr := deserializeWxPaymentOAuthContext(serializedCtx)
	if decodeErr != nil {
		redirectOAuthError(c, uiCallbackPath, "invalid_context", "could not decode payment oauth context", "")
		return
	}
	if payCtx.PaymentType == "" {
		payCtx.PaymentType = payment.TypeWxpay
	}

	scopeVal, _ := readCookieDecoded(c, wechatPaymentOAuthScope)
	scopeVal = normalizeWxPaymentScope(scopeVal)

	oauthCfg, cfgErr := h.loadWeChatOAuthConfig(c.Request.Context(), "mp", c)
	if cfgErr != nil {
		redirectOAuthError(c, uiCallbackPath, "provider_error", infraerrors.Reason(cfgErr), infraerrors.Message(cfgErr))
		return
	}
	oauthCfg.redirectURI = h.resolveWxPaymentCallbackURL(c.Request.Context(), c)
	tokenData, exchangeErr := requestWeChatAccessToken(c.Request.Context(), oauthCfg, authCode)
	if exchangeErr != nil {
		redirectOAuthError(c, uiCallbackPath, "token_exchange_failed", "could not exchange authorization code for token", exchangeErr.Error())
		return
	}

	resolvedOpenID := strings.TrimSpace(tokenData.OpenID)
	if resolvedOpenID == "" {
		redirectOAuthError(c, uiCallbackPath, "missing_openid", "provider did not return openid", "")
		return
	}
	if strings.TrimSpace(tokenData.Scope) != "" {
		scopeVal = strings.TrimSpace(tokenData.Scope)
	}

	resumeToken, mintErr := h.wechatPaymentResumeService().CreateWeChatPaymentResumeToken(service.WeChatPaymentResumeClaims{
		OpenID:      resolvedOpenID,
		PaymentType: payCtx.PaymentType,
		Amount:      payCtx.Amount,
		OrderType:   payCtx.OrderType,
		PlanID:      payCtx.PlanID,
		RedirectTo:  destination,
		Scope:       scopeVal,
	})
	if mintErr != nil {
		redirectOAuthError(c, uiCallbackPath, "invalid_context", "could not encode payment resume context", "")
		return
	}

	fragmentParams := url.Values{}
	fragmentParams.Set("wechat_resume_token", resumeToken)
	fragmentParams.Set("redirect", destination)
	redirectWithFragment(c, uiCallbackPath, fragmentParams)
}

func (h *AuthHandler) wechatPaymentResumeService() *service.PaymentResumeService {
	var legacyEncKey []byte
	derivedKey, deriveErr := payment.ProvideEncryptionKey(h.cfg)
	if deriveErr == nil {
		legacyEncKey = []byte(derivedKey)
	}
	return service.NewLegacyAwarePaymentResumeService(legacyEncKey)
}

type completeWeChatOAuthRequest struct {
	InvitationCode   string `json:"invitation_code" binding:"required"`
	AffCode          string `json:"aff_code,omitempty"`
	AdoptDisplayName *bool  `json:"adopt_display_name,omitempty"`
	AdoptAvatar      *bool  `json:"adopt_avatar,omitempty"`
}

// CompleteWeChatOAuthRegistration finishes a pending WeChat OAuth registration by
// validating the invitation code and consuming the current pending browser session.
// POST /api/v1/auth/oauth/wechat/complete-registration
func (h *AuthHandler) CompleteWeChatOAuthRegistration(c *gin.Context) {
	var payload completeWeChatOAuthRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "INVALID_REQUEST", "message": bindErr.Error()})
		return
	}

	useSecure := isRequestHTTPS(c)
	sessionToken, readErr := readOAuthPendingSessionCookie(c)
	if readErr != nil {
		clearOAuthPendingSessionCookie(c, useSecure)
		clearOAuthPendingBrowserCookie(c, useSecure)
		response.ErrorFrom(c, service.ErrPendingAuthSessionNotFound)
		return
	}
	browserKey, keyErr := readOAuthPendingBrowserCookie(c)
	if keyErr != nil {
		clearOAuthPendingSessionCookie(c, useSecure)
		clearOAuthPendingBrowserCookie(c, useSecure)
		response.ErrorFrom(c, service.ErrPendingAuthBrowserMismatch)
		return
	}
	pendingSvc, svcErr := h.pendingIdentityService()
	if svcErr != nil {
		response.ErrorFrom(c, svcErr)
		return
	}
	pendingSession, fetchErr := pendingSvc.GetBrowserSession(c.Request.Context(), sessionToken, browserKey)
	if fetchErr != nil {
		clearOAuthPendingSessionCookie(c, useSecure)
		clearOAuthPendingBrowserCookie(c, useSecure)
		response.ErrorFrom(c, fetchErr)
		return
	}
	if validErr := ensurePendingOAuthCompleteRegistrationSession(pendingSession); validErr != nil {
		response.ErrorFrom(c, validErr)
		return
	}
	if refreshedSession, alreadyHandled, transErr := h.legacyCompleteRegistrationSessionStatus(c, pendingSession); transErr != nil {
		response.ErrorFrom(c, transErr)
		return
	} else if alreadyHandled {
		c.JSON(http.StatusOK, buildPendingOAuthSessionStatusPayload(refreshedSession))
		return
	} else {
		pendingSession = refreshedSession
	}
	if modeErr := h.ensureBackendModeAllowsNewUserLogin(c.Request.Context()); modeErr != nil {
		response.ErrorFrom(c, modeErr)
		return
	}

	resolvedEmail := strings.TrimSpace(pendingSession.ResolvedEmail)
	resolvedUsername := pendingSessionStringValue(pendingSession.UpstreamIdentityClaims, "username")
	if resolvedEmail == "" || resolvedUsername == "" {
		response.ErrorFrom(c, infraerrors.BadRequest("PENDING_AUTH_SESSION_INVALID", "pending auth registration context is incomplete"))
		return
	}

	tokens, registeredUser, regErr := h.authService.LoginOrRegisterOAuthWithTokenPairAndPromoCode(
		c.Request.Context(),
		resolvedEmail,
		resolvedUsername,
		payload.InvitationCode,
		payload.AffCode,
		pendingOAuthPromoCode(pendingSession),
		"wechat",
	)
	if regErr != nil {
		response.ErrorFrom(c, regErr)
		return
	}
	adoptDecision, adoptErr := h.ensurePendingOAuthAdoptionDecision(c, pendingSession.ID, oauthAdoptionDecisionRequest{
		AdoptDisplayName: payload.AdoptDisplayName,
		AdoptAvatar:      payload.AdoptAvatar,
	})
	if adoptErr != nil {
		response.ErrorFrom(c, adoptErr)
		return
	}
	if applyErr := applyPendingOAuthAdoption(c.Request.Context(), h.entClient(), h.authService, h.userService, pendingSession, adoptDecision, &registeredUser.ID); applyErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_ADOPTION_APPLY_FAILED", "could not apply oauth profile adoption").WithCause(applyErr))
		return
	}
	h.authService.RecordSuccessfulLogin(c.Request.Context(), registeredUser.ID)
	if _, consumeErr := pendingSvc.ConsumeBrowserSession(c.Request.Context(), sessionToken, browserKey); consumeErr != nil {
		clearOAuthPendingSessionCookie(c, useSecure)
		clearOAuthPendingBrowserCookie(c, useSecure)
		response.ErrorFrom(c, consumeErr)
		return
	}
	clearOAuthPendingSessionCookie(c, useSecure)
	clearOAuthPendingBrowserCookie(c, useSecure)

	c.JSON(http.StatusOK, gin.H{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"expires_in":    tokens.ExpiresIn,
		"token_type":    "Bearer",
	})
}

func (h *AuthHandler) storeWeChatPendingSession(
	c *gin.Context,
	loginIntent string,
	subject string,
	emailAddr string,
	destination string,
	browserKey string,
	providerClaims map[string]any,
	tokens *service.TokenPair,
	loginErr error,
	linkedUserID *int64,
) error {
	completionPayload := map[string]any{
		"redirect": destination,
	}
	if loginErr != nil {
		if errors.Is(loginErr, service.ErrOAuthInvitationRequired) {
			completionPayload["error"] = "invitation_required"
		} else {
			return loginErr
		}
	} else if tokens != nil {
		completionPayload["access_token"] = tokens.AccessToken
		completionPayload["refresh_token"] = tokens.RefreshToken
		completionPayload["expires_in"] = tokens.ExpiresIn
		completionPayload["token_type"] = "Bearer"
	}

	return h.createOAuthPendingSession(c, oauthPendingSessionPayload{
		Intent: loginIntent,
		Identity: service.PendingAuthIdentityKey{
			ProviderType:    "wechat",
			ProviderKey:     wechatOAuthProviderKey,
			ProviderSubject: subject,
		},
		TargetUserID:           linkedUserID,
		ResolvedEmail:          emailAddr,
		RedirectTo:             destination,
		BrowserSessionKey:      browserKey,
		UpstreamIdentityClaims: providerClaims,
		CompletionResponse:     completionPayload,
	})
}

func (h *AuthHandler) storeWeChatChoicePendingSession(
	c *gin.Context,
	identityRef service.PendingAuthIdentityKey,
	suggestedEmail string,
	resolvedEmail string,
	destination string,
	browserKey string,
	providerClaims map[string]any,
	compatAddr string,
	compatUser *dbent.User,
	requireEmailOnSignup bool,
) error {
	candidateEmail := strings.TrimSpace(suggestedEmail)
	canonicalEmail := strings.TrimSpace(resolvedEmail)
	if candidateEmail == "" {
		candidateEmail = canonicalEmail
	}

	completionPayload := map[string]any{
		"step":                      oauthPendingChoiceStep,
		"adoption_required":         true,
		"redirect":                  strings.TrimSpace(destination),
		"email":                     candidateEmail,
		"resolved_email":            canonicalEmail,
		"existing_account_email":    "",
		"existing_account_bindable": false,
		"create_account_allowed":    true,
		"force_email_on_signup":     requireEmailOnSignup,
		"choice_reason":             "third_party_signup",
	}
	if strings.TrimSpace(compatAddr) != "" {
		completionPayload["compat_email"] = strings.TrimSpace(compatAddr)
	}
	if compatUser != nil {
		completionPayload["email"] = strings.TrimSpace(compatUser.Email)
		completionPayload["existing_account_email"] = strings.TrimSpace(compatUser.Email)
		completionPayload["existing_account_bindable"] = true
		completionPayload["choice_reason"] = "compat_email_match"
	}
	if requireEmailOnSignup {
		completionPayload["choice_reason"] = "force_email_on_signup"
	}

	choiceEmail := candidateEmail
	if compatUser != nil {
		choiceEmail = strings.TrimSpace(compatUser.Email)
	}

	return h.createOAuthPendingSession(c, oauthPendingSessionPayload{
		Intent:                 oauthIntentLogin,
		Identity:               identityRef,
		ResolvedEmail:          choiceEmail,
		RedirectTo:             destination,
		BrowserSessionKey:      browserKey,
		UpstreamIdentityClaims: providerClaims,
		CompletionResponse:     completionPayload,
	})
}

func (h *AuthHandler) initWeChatBindPendingSession(
	c *gin.Context,
	oauthCfg wechatOAuthConfig,
	subject string,
	channelOpenID string,
	destination string,
	browserKey string,
	providerClaims map[string]any,
) error {
	targetUser, lookupErr := h.loadOAuthBindTargetUser(c, wechatOAuthBindUserCookieName)
	if lookupErr != nil {
		return lookupErr
	}
	if ownerErr := h.verifyWeChatBindOwnership(c.Request.Context(), targetUser.ID, subject, oauthCfg, channelOpenID); ownerErr != nil {
		return ownerErr
	}
	return h.storeWeChatPendingSession(
		c,
		wechatOAuthIntentBind,
		subject,
		targetUser.Email,
		destination,
		browserKey,
		providerClaims,
		nil,
		nil,
		&targetUser.ID,
	)
}

func (h *AuthHandler) loadOAuthBindTargetUser(c *gin.Context, cookieName string) (*dbent.User, error) {
	dbClient := h.entClient()
	if dbClient == nil {
		return nil, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth subsystem is not available")
	}
	bindUserID, idErr := h.readOAuthBindUserIDFromCookie(c, cookieName)
	if idErr != nil {
		return nil, infraerrors.Unauthorized("AUTH_REQUIRED", "authenticated user is required to bind wechat account")
	}
	userEntity, fetchErr := dbClient.User.Get(c.Request.Context(), bindUserID)
	if fetchErr != nil {
		if dbent.IsNotFound(fetchErr) {
			return nil, infraerrors.Unauthorized("AUTH_REQUIRED", "authenticated user is required to bind wechat account")
		}
		return nil, infraerrors.InternalServer("WECHAT_BIND_USER_LOOKUP_FAILED", "could not load authenticated user record").WithCause(fetchErr)
	}
	return userEntity, nil
}

func (h *AuthHandler) verifyWeChatBindOwnership(
	ctx context.Context,
	currentUserID int64,
	subject string,
	oauthCfg wechatOAuthConfig,
	channelOpenID string,
) error {
	dbClient := h.entClient()
	if dbClient == nil {
		return infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth subsystem is not available")
	}

	existingIdentities, queryErr := dbClient.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ("wechat"),
			authidentity.ProviderKeyIn(expandWeChatProviderKeys(wechatOAuthProviderKey)...),
			authidentity.ProviderSubjectEQ(strings.TrimSpace(subject)),
		).
		All(ctx)
	if queryErr != nil {
		return infraerrors.InternalServer("WECHAT_BIND_LOOKUP_FAILED", "could not check wechat identity ownership").WithCause(queryErr)
	}
	for _, ident := range existingIdentities {
		if ident != nil && ident.UserID != currentUserID {
			activeOwner, ownerErr := findActiveUserByID(ctx, dbClient, ident.UserID)
			if ownerErr != nil {
				return ownerErr
			}
			if activeOwner != nil {
				return infraerrors.Conflict("AUTH_IDENTITY_OWNERSHIP_CONFLICT", "this wechat identity is already linked to another account")
			}
		}
	}

	channelOpenID = strings.TrimSpace(channelOpenID)
	appID := strings.TrimSpace(oauthCfg.appID)
	if channelOpenID == "" || appID == "" {
		return nil
	}

	channelRecords, chanErr := dbClient.AuthIdentityChannel.Query().
		Where(
			authidentitychannel.ProviderTypeEQ("wechat"),
			authidentitychannel.ProviderKeyIn(expandWeChatProviderKeys(wechatOAuthProviderKey)...),
			authidentitychannel.ChannelEQ(strings.TrimSpace(oauthCfg.mode)),
			authidentitychannel.ChannelAppIDEQ(appID),
			authidentitychannel.ChannelSubjectEQ(channelOpenID),
		).
		WithIdentity().
		All(ctx)
	if chanErr != nil {
		return infraerrors.InternalServer("WECHAT_BIND_CHANNEL_LOOKUP_FAILED", "could not check wechat channel ownership").WithCause(chanErr)
	}
	for _, ch := range channelRecords {
		if ch != nil && ch.Edges.Identity != nil && ch.Edges.Identity.UserID != currentUserID {
			activeOwner, ownerErr := findActiveUserByID(ctx, dbClient, ch.Edges.Identity.UserID)
			if ownerErr != nil {
				return ownerErr
			}
			if activeOwner != nil {
				return infraerrors.Conflict("AUTH_IDENTITY_CHANNEL_OWNERSHIP_CONFLICT", "this wechat channel identity is already linked to another account")
			}
		}
	}
	return nil
}

func (h *AuthHandler) discoverWeChatUserByLegacyOpenID(
	ctx context.Context,
	identityRef service.PendingAuthIdentityKey,
	oauthCfg wechatOAuthConfig,
	openID string,
) (*dbent.User, error) {
	dbClient := h.entClient()
	if dbClient == nil {
		return nil, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth subsystem is not available")
	}

	provType := strings.TrimSpace(identityRef.ProviderType)
	provSubject := strings.TrimSpace(identityRef.ProviderSubject)
	provKeys := expandWeChatProviderKeys(identityRef.ProviderKey)
	if provSubject != "" {
		identityRows, queryErr := dbClient.AuthIdentity.Query().
			Where(
				authidentity.ProviderTypeEQ(provType),
				authidentity.ProviderKeyIn(provKeys...),
				authidentity.ProviderSubjectEQ(provSubject),
			).
			WithUser().
			All(ctx)
		if queryErr != nil {
			return nil, infraerrors.InternalServer("AUTH_IDENTITY_LOOKUP_FAILED", "could not inspect auth identity ownership").WithCause(queryErr)
		}
		if resolvedUser, resolveErr := pickSingleWeChatIdentityOwner(identityRows); resolveErr != nil || resolvedUser != nil {
			if resolveErr != nil || resolvedUser == nil {
				return resolvedUser, resolveErr
			}
			return findActiveUserByID(ctx, dbClient, resolvedUser.ID)
		}
	}

	openID = strings.TrimSpace(openID)
	chanMode := strings.TrimSpace(oauthCfg.mode)
	chanAppID := strings.TrimSpace(oauthCfg.appID)
	if openID != "" && chanMode != "" && chanAppID != "" {
		channelRows, chanErr := dbClient.AuthIdentityChannel.Query().
			Where(
				authidentitychannel.ProviderTypeEQ(provType),
				authidentitychannel.ProviderKeyIn(provKeys...),
				authidentitychannel.ChannelEQ(chanMode),
				authidentitychannel.ChannelAppIDEQ(chanAppID),
				authidentitychannel.ChannelSubjectEQ(openID),
			).
			WithIdentity(func(q *dbent.AuthIdentityQuery) {
				q.WithUser()
			}).
			All(ctx)
		if chanErr != nil {
			return nil, infraerrors.InternalServer("AUTH_IDENTITY_CHANNEL_LOOKUP_FAILED", "could not inspect auth identity channel ownership").WithCause(chanErr)
		}
		if resolvedUser, resolveErr := pickSingleWeChatChannelOwner(channelRows); resolveErr != nil || resolvedUser != nil {
			if resolveErr != nil || resolvedUser == nil {
				return resolvedUser, resolveErr
			}
			return findActiveUserByID(ctx, dbClient, resolvedUser.ID)
		}
	}

	if openID == "" {
		return nil, nil
	}

	identityRows, queryErr := dbClient.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(provType),
			authidentity.ProviderKeyIn(provKeys...),
			authidentity.ProviderSubjectEQ(openID),
		).
		WithUser().
		All(ctx)
	if queryErr != nil {
		return nil, infraerrors.InternalServer("AUTH_IDENTITY_LOOKUP_FAILED", "could not inspect auth identity ownership").WithCause(queryErr)
	}
	resolvedUser, resolveErr := pickSingleWeChatIdentityOwner(identityRows)
	if resolveErr != nil || resolvedUser == nil {
		return resolvedUser, resolveErr
	}
	return findActiveUserByID(ctx, dbClient, resolvedUser.ID)
}

func expandWeChatProviderKeys(primaryKey string) []string {
	preferred := strings.TrimSpace(primaryKey)
	if preferred == "" {
		preferred = wechatOAuthProviderKey
	}
	keyList := []string{preferred}
	if !strings.EqualFold(preferred, wechatOAuthLegacyProviderKey) {
		keyList = append(keyList, wechatOAuthLegacyProviderKey)
	}
	return keyList
}

func pickSingleWeChatIdentityOwner(rows []*dbent.AuthIdentity) (*dbent.User, error) {
	var found *dbent.User
	for _, row := range rows {
		if row == nil || row.Edges.User == nil {
			continue
		}
		if found == nil {
			found = row.Edges.User
			continue
		}
		if found.ID != row.Edges.User.ID {
			return nil, infraerrors.Conflict("AUTH_IDENTITY_OWNERSHIP_CONFLICT", "this wechat identity is linked to multiple accounts")
		}
	}
	return found, nil
}

func pickSingleWeChatChannelOwner(rows []*dbent.AuthIdentityChannel) (*dbent.User, error) {
	var found *dbent.User
	for _, row := range rows {
		if row == nil || row.Edges.Identity == nil || row.Edges.Identity.Edges.User == nil {
			continue
		}
		if found == nil {
			found = row.Edges.Identity.Edges.User
			continue
		}
		if found.ID != row.Edges.Identity.Edges.User.ID {
			return nil, infraerrors.Conflict("AUTH_IDENTITY_CHANNEL_OWNERSHIP_CONFLICT", "this wechat channel identity is linked to multiple accounts")
		}
	}
	return found, nil
}

func (h *AuthHandler) repairWeChatIdentityBinding(
	ctx context.Context,
	userID int64,
	identityRef service.PendingAuthIdentityKey,
	providerClaims map[string]any,
) error {
	dbClient := h.entClient()
	if dbClient == nil {
		return infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth subsystem is not available")
	}

	dbTx, txErr := dbClient.Tx(ctx)
	if txErr != nil {
		return infraerrors.InternalServer("AUTH_IDENTITY_BIND_FAILED", "could not start identity repair transaction").WithCause(txErr)
	}
	defer func() { _ = dbTx.Rollback() }()

	_, repairErr := ensurePendingOAuthIdentityForUser(dbent.NewTxContext(ctx, dbTx), dbTx, &dbent.PendingAuthSession{
		ProviderType:           strings.TrimSpace(identityRef.ProviderType),
		ProviderKey:            strings.TrimSpace(identityRef.ProviderKey),
		ProviderSubject:        strings.TrimSpace(identityRef.ProviderSubject),
		UpstreamIdentityClaims: cloneOAuthMetadata(providerClaims),
	}, userID)
	if repairErr != nil {
		return repairErr
	}
	return dbTx.Commit()
}

func (h *AuthHandler) loadWeChatOAuthConfig(ctx context.Context, rawMode string, c *gin.Context) (wechatOAuthConfig, error) {
	selectedMode, modeErr := determineWeChatOAuthMode(rawMode, c)
	if modeErr != nil {
		return wechatOAuthConfig{}, modeErr
	}

	if h == nil || h.settingSvc == nil {
		return wechatOAuthConfig{}, infraerrors.ServiceUnavailable("CONFIG_NOT_READY", "wechat oauth configuration is not available")
	}

	siteBaseURL := ""
	if h != nil && h.settingSvc != nil {
		allSettings, readErr := h.settingSvc.GetAllSettings(ctx)
		if readErr == nil && allSettings != nil {
			siteBaseURL = strings.TrimSpace(allSettings.APIBaseURL)
		}
	}

	providerSettings, fetchErr := h.settingSvc.GetWeChatConnectOAuthConfig(ctx)
	if fetchErr != nil {
		return wechatOAuthConfig{}, fetchErr
	}
	if !providerSettings.SupportsMode(selectedMode) {
		return wechatOAuthConfig{}, infraerrors.NotFound("OAUTH_DISABLED", "wechat oauth is not enabled for the requested mode")
	}

	result := wechatOAuthConfig{
		mode:             selectedMode,
		appID:            strings.TrimSpace(providerSettings.AppIDForMode(selectedMode)),
		appSecret:        strings.TrimSpace(providerSettings.AppSecretForMode(selectedMode)),
		redirectURI:      coalesce(strings.TrimSpace(providerSettings.RedirectURL), buildWeChatAbsoluteCallbackURL(siteBaseURL, c, "/api/v1/auth/oauth/wechat/callback")),
		frontendCallback: coalesce(strings.TrimSpace(providerSettings.FrontendRedirectURL), wechatOAuthDefaultFrontendCB),
		scope:            providerSettings.ScopeForMode(selectedMode),
		openEnabled:      providerSettings.OpenEnabled,
		mpEnabled:        providerSettings.MPEnabled,
	}

	switch selectedMode {
	case "mp":
		result.authorizeURL = "https://open.weixin.qq.com/connect/oauth2/authorize"
	default:
		result.authorizeURL = "https://open.weixin.qq.com/connect/qrconnect"
	}
	if strings.TrimSpace(result.redirectURI) == "" {
		return wechatOAuthConfig{}, infraerrors.InternalServer("OAUTH_CONFIG_INVALID", "wechat oauth redirect url has not been configured")
	}

	return result, nil
}

func (cfg wechatOAuthConfig) needsUnionID() bool {
	return cfg.openEnabled && cfg.mpEnabled
}

func (h *AuthHandler) resolveWeChatFrontendCallback(ctx context.Context) string {
	if h != nil && h.settingSvc != nil {
		providerSettings, fetchErr := h.settingSvc.GetWeChatConnectOAuthConfig(ctx)
		if fetchErr == nil && strings.TrimSpace(providerSettings.FrontendRedirectURL) != "" {
			return strings.TrimSpace(providerSettings.FrontendRedirectURL)
		}
	}
	return wechatOAuthDefaultFrontendCB
}

func determineWeChatOAuthMode(rawMode string, c *gin.Context) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(rawMode))
	if normalized == "" {
		if isWeChatInAppBrowser(c) {
			return "mp", nil
		}
		return "open", nil
	}
	if normalized != "open" && normalized != "mp" {
		return "", infraerrors.BadRequest("INVALID_MODE", "wechat oauth mode must be either open or mp")
	}
	return normalized, nil
}

func isWeChatInAppBrowser(c *gin.Context) bool {
	if c == nil || c.Request == nil {
		return false
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(c.GetHeader("User-Agent"))), "micromessenger")
}

func resolveWeChatLoginIntent(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "login":
		return wechatOAuthIntentLogin
	case "bind", "bind_current_user":
		return wechatOAuthIntentBind
	case "adopt", "adopt_existing_user_by_email":
		return wechatOAuthIntentAdoptEmail
	default:
		return wechatOAuthIntentLogin
	}
}

func assembleWeChatAuthorizeURL(cfg wechatOAuthConfig, csrfState string) (string, error) {
	parsed, parseErr := url.Parse(cfg.authorizeURL)
	if parseErr != nil {
		return "", fmt.Errorf("could not parse authorize endpoint: %w", parseErr)
	}
	params := parsed.Query()
	params.Set("appid", cfg.appID)
	params.Set("redirect_uri", cfg.redirectURI)
	params.Set("response_type", "code")
	params.Set("scope", cfg.scope)
	params.Set("state", csrfState)
	parsed.RawQuery = params.Encode()
	parsed.Fragment = "wechat_redirect"
	return parsed.String(), nil
}

func buildWeChatAbsoluteCallbackURL(siteBaseURL string, c *gin.Context, callbackPath string) string {
	callbackPath = strings.TrimSpace(callbackPath)
	if callbackPath == "" {
		return ""
	}

	if trimmedBase := strings.TrimSpace(siteBaseURL); trimmedBase != "" {
		if parsed, parseErr := url.Parse(trimmedBase); parseErr == nil && parsed.Scheme != "" && parsed.Host != "" {
			existingPath := strings.TrimRight(parsed.EscapedPath(), "/")
			targetPath := callbackPath
			if existingPath != "" && strings.HasSuffix(existingPath, "/api/v1") && strings.HasPrefix(callbackPath, "/api/v1") {
				targetPath = existingPath + strings.TrimPrefix(callbackPath, "/api/v1")
			} else if existingPath != "" {
				targetPath = existingPath + callbackPath
			}
			return parsed.Scheme + "://" + parsed.Host + targetPath
		}
	}

	if c == nil || c.Request == nil {
		return ""
	}
	proto := "http"
	if isRequestHTTPS(c) {
		proto = "https"
	}
	hostname := strings.TrimSpace(c.Request.Host)
	if fwdHost := strings.TrimSpace(c.GetHeader("X-Forwarded-Host")); fwdHost != "" {
		hostname = fwdHost
	}
	if hostname == "" {
		return ""
	}
	return proto + "://" + hostname + callbackPath
}

func retrieveWeChatIdentity(ctx context.Context, cfg wechatOAuthConfig, authCode string) (*wechatOAuthTokenResponse, *wechatOAuthUserInfoResponse, error) {
	tokenData, tokenErr := requestWeChatAccessToken(ctx, cfg, authCode)
	if tokenErr != nil {
		return nil, nil, tokenErr
	}
	profile, profileErr := requestWeChatUserProfile(ctx, tokenData)
	if profileErr != nil {
		return nil, nil, profileErr
	}
	return tokenData, profile, nil
}

func requestWeChatAccessToken(ctx context.Context, cfg wechatOAuthConfig, authCode string) (*wechatOAuthTokenResponse, error) {
	tokenEndpoint, parseErr := url.Parse(wechatOAuthAccessTokenURL)
	if parseErr != nil {
		return nil, fmt.Errorf("could not parse wechat token endpoint: %w", parseErr)
	}

	params := tokenEndpoint.Query()
	params.Set("appid", cfg.appID)
	params.Set("secret", cfg.appSecret)
	params.Set("code", strings.TrimSpace(authCode))
	params.Set("grant_type", "authorization_code")
	tokenEndpoint.RawQuery = params.Encode()

	httpReq, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, tokenEndpoint.String(), nil)
	if reqErr != nil {
		return nil, fmt.Errorf("could not build wechat token request: %w", reqErr)
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	httpResp, doErr := httpClient.Do(httpReq)
	if doErr != nil {
		return nil, fmt.Errorf("wechat token request failed: %w", doErr)
	}
	defer func() { _ = httpResp.Body.Close() }()

	respBody, readErr := io.ReadAll(httpResp.Body)
	if readErr != nil {
		return nil, fmt.Errorf("could not read wechat token response: %w", readErr)
	}
	if httpResp.StatusCode < http.StatusOK || httpResp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("wechat token endpoint returned status %d", httpResp.StatusCode)
	}

	var tokenData wechatOAuthTokenResponse
	if unmarshalErr := json.Unmarshal(respBody, &tokenData); unmarshalErr != nil {
		return nil, fmt.Errorf("could not decode wechat token response: %w", unmarshalErr)
	}
	if tokenData.ErrCode != 0 {
		return nil, fmt.Errorf("wechat token error code=%d detail=%s", tokenData.ErrCode, strings.TrimSpace(tokenData.ErrMsg))
	}
	if strings.TrimSpace(tokenData.AccessToken) == "" {
		return nil, fmt.Errorf("wechat token response is missing access_token")
	}
	return &tokenData, nil
}

func requestWeChatUserProfile(ctx context.Context, tokenData *wechatOAuthTokenResponse) (*wechatOAuthUserInfoResponse, error) {
	if tokenData == nil {
		return nil, fmt.Errorf("wechat token data is nil")
	}

	profileEndpoint, parseErr := url.Parse(wechatOAuthUserInfoURL)
	if parseErr != nil {
		return nil, fmt.Errorf("could not parse wechat userinfo endpoint: %w", parseErr)
	}
	params := profileEndpoint.Query()
	params.Set("access_token", strings.TrimSpace(tokenData.AccessToken))
	params.Set("openid", strings.TrimSpace(tokenData.OpenID))
	params.Set("lang", "zh_CN")
	profileEndpoint.RawQuery = params.Encode()

	httpReq, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, profileEndpoint.String(), nil)
	if reqErr != nil {
		return nil, fmt.Errorf("could not build wechat userinfo request: %w", reqErr)
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	httpResp, doErr := httpClient.Do(httpReq)
	if doErr != nil {
		return nil, fmt.Errorf("wechat userinfo request failed: %w", doErr)
	}
	defer func() { _ = httpResp.Body.Close() }()

	respBody, readErr := io.ReadAll(httpResp.Body)
	if readErr != nil {
		return nil, fmt.Errorf("could not read wechat userinfo response: %w", readErr)
	}
	if httpResp.StatusCode < http.StatusOK || httpResp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("wechat userinfo endpoint returned status %d", httpResp.StatusCode)
	}

	var profile wechatOAuthUserInfoResponse
	if unmarshalErr := json.Unmarshal(respBody, &profile); unmarshalErr != nil {
		return nil, fmt.Errorf("could not decode wechat userinfo response: %w", unmarshalErr)
	}
	if profile.ErrCode != 0 {
		return nil, fmt.Errorf("wechat userinfo error code=%d detail=%s", profile.ErrCode, strings.TrimSpace(profile.ErrMsg))
	}
	return &profile, nil
}

func generateWeChatSyntheticEmail(subject string) string {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return ""
	}
	return "wechat-" + subject + service.WeChatConnectSyntheticEmailDomain
}

func generateWeChatFallbackUsername(subject string) string {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return "wechat_user"
	}
	return "wechat_" + truncateFragmentValue(subject)
}

func persistWeChatCookie(c *gin.Context, cookieName string, cookieValue string, maxAge int, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     cookieName,
		Value:    cookieValue,
		Path:     wechatOAuthCookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func removeWeChatCookie(c *gin.Context, cookieName string, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     wechatOAuthCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func normalizeWxPaymentType(raw string) string {
	switch strings.TrimSpace(raw) {
	case payment.TypeWxpay, payment.TypeWxpayDirect:
		return strings.TrimSpace(raw)
	default:
		return ""
	}
}

func normalizeWxPaymentScope(raw string) string {
	for _, segment := range strings.FieldsFunc(strings.TrimSpace(raw), func(ch rune) bool {
		return ch == ',' || ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
	}) {
		switch strings.TrimSpace(segment) {
		case "snsapi_userinfo":
			return "snsapi_userinfo"
		case "snsapi_base":
			return "snsapi_base"
		}
	}
	return "snsapi_base"
}

func normalizeWxPaymentRedirect(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return wechatPaymentOAuthDefaultTo
	}
	if path == "/payment" {
		return "/purchase"
	}
	if strings.HasPrefix(path, "/payment?") {
		return "/purchase" + strings.TrimPrefix(path, "/payment")
	}
	return path
}

func (h *AuthHandler) resolveWxPaymentCallbackURL(ctx context.Context, c *gin.Context) string {
	siteBaseURL := ""
	if h != nil && h.settingSvc != nil {
		if allSettings, readErr := h.settingSvc.GetAllSettings(ctx); readErr == nil && allSettings != nil {
			siteBaseURL = strings.TrimSpace(allSettings.APIBaseURL)
		}
	}
	return buildWeChatAbsoluteCallbackURL(siteBaseURL, c, "/api/v1/auth/oauth/wechat/payment/callback")
}

func serializeWxPaymentOAuthContext(payCtx wechatPaymentOAuthContext) (string, error) {
	serialized, marshalErr := json.Marshal(payCtx)
	if marshalErr != nil {
		return "", marshalErr
	}
	return string(serialized), nil
}

func deserializeWxPaymentOAuthContext(raw string) (wechatPaymentOAuthContext, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return wechatPaymentOAuthContext{}, nil
	}
	var payCtx wechatPaymentOAuthContext
	if unmarshalErr := json.Unmarshal([]byte(raw), &payCtx); unmarshalErr != nil {
		return wechatPaymentOAuthContext{}, unmarshalErr
	}
	return payCtx, nil
}

func parseWxPaymentPlanID(raw string) int64 {
	parsed, _ := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	return parsed
}

func setWxPaymentCookie(c *gin.Context, cookieName string, cookieValue string, maxAge int, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     cookieName,
		Value:    cookieValue,
		Path:     wechatPaymentOAuthCookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearWxPaymentCookie(c *gin.Context, cookieName string, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     wechatPaymentOAuthCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}
