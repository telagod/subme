package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/internal/config"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/oauth"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/imroc/req/v3"
	"github.com/tidwall/gjson"
)

const (
	emailOAuthCookiePath      = "/api/v1/auth/oauth"
	emailOAuthStateCookieName = "email_oauth_state"
	emailOAuthRedirectCookie  = "email_oauth_redirect"
	emailOAuthProviderCookie  = "email_oauth_provider"
	emailOAuthAffiliateCookie = "email_oauth_affiliate"
	emailOAuthCookieMaxAgeSec = 10 * 60
	emailOAuthDefaultRedirect = "/dashboard"
)

type emailOAuthTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope,omitempty"`
}

type emailOAuthProfile struct {
	Subject       string
	Email         string
	EmailVerified bool
	Username      string
	DisplayName   string
	AvatarURL     string
	Metadata      map[string]any
}

func (h *AuthHandler) GitHubOAuthStart(c *gin.Context) { h.emailOAuthStart(c, "github") }
func (h *AuthHandler) GoogleOAuthStart(c *gin.Context) { h.emailOAuthStart(c, "google") }

func (h *AuthHandler) GitHubOAuthCallback(c *gin.Context) { h.emailOAuthCallback(c, "github") }
func (h *AuthHandler) GoogleOAuthCallback(c *gin.Context) { h.emailOAuthCallback(c, "google") }
func (h *AuthHandler) CompleteGitHubOAuthRegistration(c *gin.Context) {
	h.completeEmailOAuthRegistration(c, "github")
}
func (h *AuthHandler) CompleteGoogleOAuthRegistration(c *gin.Context) {
	h.completeEmailOAuthRegistration(c, "google")
}

func (h *AuthHandler) emailOAuthStart(c *gin.Context, providerName string) {
	providerCfg, cfgErr := h.getEmailOAuthConfig(c.Request.Context(), providerName)
	if cfgErr != nil {
		response.ErrorFrom(c, cfgErr)
		return
	}
	csrfState, genErr := oauth.GenerateState()
	if genErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_STATE_GEN_FAILED", "could not generate oauth state token").WithCause(genErr))
		return
	}
	destination := sanitizeFrontendRedirectPath(c.Query("redirect"))
	if destination == "" {
		destination = emailOAuthDefaultRedirect
	}

	useSecure := isRequestHTTPS(c)
	emailOAuthSetCookie(c, emailOAuthStateCookieName, encodeCookieValue(csrfState), useSecure)
	emailOAuthSetCookie(c, emailOAuthRedirectCookie, encodeCookieValue(destination), useSecure)
	emailOAuthSetCookie(c, emailOAuthProviderCookie, encodeCookieValue(providerName), useSecure)
	if affCode := strings.TrimSpace(coalesce(c.Query("aff_code"), c.Query("aff"))); affCode != "" {
		emailOAuthSetCookie(c, emailOAuthAffiliateCookie, encodeCookieValue(affCode), useSecure)
	} else {
		emailOAuthClearCookie(c, emailOAuthAffiliateCookie, useSecure)
	}

	authorizeURL, buildErr := buildEmailOAuthAuthorizeURL(providerCfg, csrfState)
	if buildErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("OAUTH_BUILD_URL_FAILED", "could not construct oauth authorization url").WithCause(buildErr))
		return
	}
	c.Redirect(http.StatusFound, authorizeURL)
}

func (h *AuthHandler) emailOAuthCallback(c *gin.Context, providerName string) {
	providerCfg, cfgErr := h.getEmailOAuthConfig(c.Request.Context(), providerName)
	if cfgErr != nil {
		response.ErrorFrom(c, cfgErr)
		return
	}
	uiCallback := strings.TrimSpace(providerCfg.FrontendRedirectURL)
	if uiCallback == "" {
		uiCallback = "/auth/oauth/callback"
	}
	if providerErrStr := strings.TrimSpace(c.Query("error")); providerErrStr != "" {
		redirectOAuthError(c, uiCallback, "provider_error", providerErrStr, c.Query("error_description"))
		return
	}
	authCode := strings.TrimSpace(c.Query("code"))
	csrfState := strings.TrimSpace(c.Query("state"))
	if authCode == "" || csrfState == "" {
		redirectOAuthError(c, uiCallback, "missing_params", "code or state parameter is missing", "")
		return
	}

	useSecure := isRequestHTTPS(c)
	defer func() {
		emailOAuthClearCookie(c, emailOAuthStateCookieName, useSecure)
		emailOAuthClearCookie(c, emailOAuthRedirectCookie, useSecure)
		emailOAuthClearCookie(c, emailOAuthProviderCookie, useSecure)
		emailOAuthClearCookie(c, emailOAuthAffiliateCookie, useSecure)
	}()
	savedState, readErr := readCookieDecoded(c, emailOAuthStateCookieName)
	if readErr != nil || savedState == "" || savedState != csrfState {
		redirectOAuthError(c, uiCallback, "invalid_state", "oauth state mismatch", "")
		return
	}
	savedProvider, _ := readCookieDecoded(c, emailOAuthProviderCookie)
	if !strings.EqualFold(strings.TrimSpace(savedProvider), providerName) {
		redirectOAuthError(c, uiCallback, "invalid_state", "oauth provider mismatch", "")
		return
	}
	postLoginDest, _ := readCookieDecoded(c, emailOAuthRedirectCookie)
	postLoginDest = sanitizeFrontendRedirectPath(postLoginDest)
	if postLoginDest == "" {
		postLoginDest = emailOAuthDefaultRedirect
	}

	tokenResp, exchangeErr := exchangeEmailOAuthCode(c.Request.Context(), providerCfg, authCode)
	if exchangeErr != nil {
		redirectOAuthError(c, uiCallback, "token_exchange_failed", "could not exchange authorization code for token", singleLine(exchangeErr.Error()))
		return
	}
	userProfile, profileErr := fetchEmailOAuthProfile(c.Request.Context(), providerName, providerCfg, tokenResp)
	if profileErr != nil {
		redirectOAuthError(c, uiCallback, "userinfo_failed", "could not retrieve verified email from provider", singleLine(profileErr.Error()))
		return
	}
	h.emailOAuthCallbackWithProfile(c, providerName, providerCfg, uiCallback, postLoginDest, userProfile)
}

func (h *AuthHandler) emailOAuthCallbackWithProfile(
	c *gin.Context,
	providerName string,
	providerCfg config.EmailOAuthProviderConfig,
	uiCallback string,
	postLoginDest string,
	userProfile *emailOAuthProfile,
) {
	identityInput := service.EmailOAuthIdentityInput{
		ProviderType:     providerName,
		ProviderKey:      providerName,
		ProviderSubject:  userProfile.Subject,
		Email:            userProfile.Email,
		EmailVerified:    userProfile.EmailVerified,
		Username:         userProfile.Username,
		DisplayName:      userProfile.DisplayName,
		AvatarURL:        userProfile.AvatarURL,
		UpstreamMetadata: userProfile.Metadata,
	}
	affCode := h.emailOAuthAffiliateCode(c)
	if needsPending, checkErr := h.emailOAuthShouldCreatePendingRegistration(c.Request.Context(), identityInput); checkErr != nil {
		redirectOAuthError(c, uiCallback, infraerrors.Reason(checkErr), infraerrors.Message(checkErr), "")
		return
	} else if needsPending {
		if pendErr := h.createEmailOAuthRegistrationPendingSession(c, providerName, uiCallback, postLoginDest, userProfile); pendErr != nil {
			redirectOAuthError(c, uiCallback, infraerrors.Reason(pendErr), infraerrors.Message(pendErr), "")
			return
		}
		redirectToFrontendCallback(c, uiCallback)
		return
	}

	tokens, loggedInUser, loginErr := h.authService.LoginOrRegisterVerifiedEmailOAuthWithInvitation(c.Request.Context(), identityInput, "", affCode)
	if loginErr != nil {
		if errors.Is(loginErr, service.ErrOAuthInvitationRequired) {
			if pendErr := h.createEmailOAuthRegistrationPendingSession(c, providerName, uiCallback, postLoginDest, userProfile); pendErr != nil {
				redirectOAuthError(c, uiCallback, infraerrors.Reason(pendErr), infraerrors.Message(pendErr), "")
				return
			}
			redirectToFrontendCallback(c, uiCallback)
			return
		}
		redirectOAuthError(c, uiCallback, infraerrors.Reason(loginErr), infraerrors.Message(loginErr), "")
		return
	}
	if blockErr := h.ensureBackendModeAllowsUser(c.Request.Context(), loggedInUser); blockErr != nil {
		redirectOAuthError(c, uiCallback, "login_blocked", infraerrors.Reason(blockErr), infraerrors.Message(blockErr))
		return
	}

	fragmentParams := url.Values{}
	fragmentParams.Set("access_token", tokens.AccessToken)
	fragmentParams.Set("refresh_token", tokens.RefreshToken)
	fragmentParams.Set("expires_in", fmt.Sprintf("%d", tokens.ExpiresIn))
	fragmentParams.Set("token_type", "Bearer")
	fragmentParams.Set("redirect", postLoginDest)
	redirectWithFragment(c, uiCallback, fragmentParams)
}

func (h *AuthHandler) emailOAuthShouldCreatePendingRegistration(ctx context.Context, identityInput service.EmailOAuthIdentityInput) (bool, error) {
	entClient := h.entClient()
	if entClient == nil {
		return false, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth subsystem is not available")
	}
	existingUser, lookupErr := h.findOAuthIdentityUser(ctx, service.PendingAuthIdentityKey{
		ProviderType:    strings.TrimSpace(identityInput.ProviderType),
		ProviderKey:     strings.TrimSpace(identityInput.ProviderKey),
		ProviderSubject: strings.TrimSpace(identityInput.ProviderSubject),
	})
	if lookupErr != nil {
		return false, lookupErr
	}
	normalizedEmail := strings.TrimSpace(strings.ToLower(identityInput.Email))
	if existingUser != nil {
		if !strings.EqualFold(strings.TrimSpace(existingUser.Email), normalizedEmail) {
			return false, infraerrors.Conflict("AUTH_IDENTITY_EMAIL_MISMATCH", "this oauth identity is already linked to a different email address")
		}
		return false, nil
	}
	if _, emailErr := findUserByNormalizedEmail(ctx, entClient, normalizedEmail); emailErr != nil {
		if errors.Is(emailErr, service.ErrUserNotFound) {
			return true, nil
		}
		return false, emailErr
	}
	return false, nil
}

func (h *AuthHandler) emailOAuthAffiliateCode(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if cookieVal, readErr := readCookieDecoded(c, emailOAuthAffiliateCookie); readErr == nil {
		return strings.TrimSpace(cookieVal)
	}
	return ""
}

func (h *AuthHandler) createEmailOAuthRegistrationPendingSession(
	c *gin.Context,
	providerName string,
	uiCallback string,
	postLoginDest string,
	userProfile *emailOAuthProfile,
) error {
	if h == nil || userProfile == nil {
		return infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth subsystem is not available")
	}
	sessionKey, genErr := generateOAuthPendingBrowserSession()
	if genErr != nil {
		return infraerrors.InternalServer("PENDING_AUTH_SESSION_CREATE_FAILED", "could not create pending auth browser session").WithCause(genErr)
	}
	setOAuthPendingBrowserCookie(c, sessionKey, isRequestHTTPS(c))

	normalizedEmail := strings.TrimSpace(strings.ToLower(userProfile.Email))
	normalizedUsername := strings.TrimSpace(userProfile.Username)
	affCode := h.emailOAuthAffiliateCode(c)
	claims := map[string]any{
		"email":            normalizedEmail,
		"email_verified":   userProfile.EmailVerified,
		"username":         normalizedUsername,
		"provider":         providerName,
		"provider_key":     providerName,
		"provider_subject": strings.TrimSpace(userProfile.Subject),
	}
	if trimmedDisplay := strings.TrimSpace(userProfile.DisplayName); trimmedDisplay != "" {
		claims["suggested_display_name"] = trimmedDisplay
	}
	if trimmedAvatar := strings.TrimSpace(userProfile.AvatarURL); trimmedAvatar != "" {
		claims["suggested_avatar_url"] = trimmedAvatar
	}
	if affCode != "" {
		claims["aff_code"] = affCode
	}
	for metaKey, metaVal := range userProfile.Metadata {
		if _, occupied := claims[metaKey]; !occupied {
			claims[metaKey] = metaVal
		}
	}

	inviteRequired := h != nil && h.settingSvc != nil && h.settingSvc.IsInvitationCodeEnabled(c.Request.Context())
	pendingErrCode := "registration_completion_required"
	reason := "registration_completion_required"
	if inviteRequired {
		pendingErrCode = "invitation_required"
		reason = "invitation_required"
	}
	completionPayload := map[string]any{
		"step":                      oauthPendingChoiceStep,
		"error":                     pendingErrCode,
		"choice_reason":             reason,
		"adoption_required":         false,
		"create_account_allowed":    true,
		"existing_account_bindable": false,
		"force_email_on_signup":     true,
		"invitation_required":       inviteRequired,
		"email":                     normalizedEmail,
		"resolved_email":            normalizedEmail,
		"provider":                  providerName,
		"redirect":                  postLoginDest,
	}
	if trimmedCallback := strings.TrimSpace(uiCallback); trimmedCallback != "" {
		completionPayload["frontend_callback"] = trimmedCallback
	}

	return h.createOAuthPendingSession(c, oauthPendingSessionPayload{
		Intent:                 oauthIntentLogin,
		Identity:               service.PendingAuthIdentityKey{ProviderType: providerName, ProviderKey: providerName, ProviderSubject: strings.TrimSpace(userProfile.Subject)},
		ResolvedEmail:          normalizedEmail,
		RedirectTo:             postLoginDest,
		BrowserSessionKey:      sessionKey,
		UpstreamIdentityClaims: claims,
		CompletionResponse:     completionPayload,
	})
}

type completeEmailOAuthRequest struct {
	Password       string `json:"password" binding:"required,min=6"`
	InvitationCode string `json:"invitation_code,omitempty"`
	AffCode        string `json:"aff_code,omitempty"`
}

func (h *AuthHandler) completeEmailOAuthRegistration(c *gin.Context, providerName string) {
	var payload completeEmailOAuthRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.BadRequest(c, "Malformed request body: "+bindErr.Error())
		return
	}

	_, pendingSession, wipeCookies, readErr := readPendingOAuthBrowserSession(c, h)
	if readErr != nil {
		response.ErrorFrom(c, readErr)
		return
	}
	if validErr := ensurePendingOAuthCompleteRegistrationSession(pendingSession); validErr != nil {
		response.ErrorFrom(c, validErr)
		return
	}
	if !strings.EqualFold(strings.TrimSpace(pendingSession.ProviderType), providerName) {
		response.BadRequest(c, "Pending session belongs to a different provider")
		return
	}
	if modeErr := h.ensureBackendModeAllowsNewUserLogin(c.Request.Context()); modeErr != nil {
		response.ErrorFrom(c, modeErr)
		return
	}

	affCode := strings.TrimSpace(payload.AffCode)
	if affCode == "" {
		affCode = pendingSessionStringValue(pendingSession.UpstreamIdentityClaims, "aff_code")
	}

	tokens, newUser, regErr := h.authService.RegisterVerifiedOAuthEmailAccount(
		c.Request.Context(),
		strings.TrimSpace(pendingSession.ResolvedEmail),
		payload.Password,
		strings.TrimSpace(payload.InvitationCode),
		strings.TrimSpace(pendingSession.ProviderType),
	)
	if regErr != nil {
		response.ErrorFrom(c, regErr)
		return
	}

	entClient := h.entClient()
	if entClient == nil {
		response.ErrorFrom(c, infraerrors.ServiceUnavailable("PENDING_AUTH_NOT_READY", "pending auth subsystem is not available"))
		return
	}
	dbTx, txErr := entClient.Tx(c.Request.Context())
	if txErr != nil {
		response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_BIND_APPLY_FAILED", "could not start transaction for pending session").WithCause(txErr))
		return
	}
	defer func() { _ = dbTx.Rollback() }()
	txCtx := dbent.NewTxContext(c.Request.Context(), dbTx)
	sessionCopy := *pendingSession
	sessionCopy.UpstreamIdentityClaims = clonePendingMap(pendingSession.UpstreamIdentityClaims)
	if trimmedInvite := strings.TrimSpace(payload.InvitationCode); trimmedInvite != "" {
		sessionCopy.UpstreamIdentityClaims["invitation_code"] = trimmedInvite
	}
	adoptionDecision, adoptErr := h.ensurePendingOAuthAdoptionDecision(c, pendingSession.ID, oauthAdoptionDecisionRequest{})
	if adoptErr != nil {
		_ = dbTx.Rollback()
		_ = h.authService.RollbackOAuthEmailAccountCreation(c.Request.Context(), newUser.ID, strings.TrimSpace(payload.InvitationCode))
		response.ErrorFrom(c, adoptErr)
		return
	}
	if bindErr := applyPendingOAuthBinding(txCtx, entClient, h.authService, h.userService, &sessionCopy, adoptionDecision, &newUser.ID, true, false); bindErr != nil {
		_ = dbTx.Rollback()
		_ = h.authService.RollbackOAuthEmailAccountCreation(c.Request.Context(), newUser.ID, strings.TrimSpace(payload.InvitationCode))
		respondPendingOAuthBindingApplyError(c, bindErr)
		return
	}
	if finalErr := h.authService.FinalizeOAuthEmailAccount(
		txCtx,
		newUser,
		strings.TrimSpace(payload.InvitationCode),
		strings.TrimSpace(pendingSession.ProviderType),
		affCode,
	); finalErr != nil {
		_ = dbTx.Rollback()
		_ = h.authService.RollbackOAuthEmailAccountCreation(c.Request.Context(), newUser.ID, strings.TrimSpace(payload.InvitationCode))
		response.ErrorFrom(c, finalErr)
		return
	}
	if consumeErr := consumePendingOAuthBrowserSessionTx(c.Request.Context(), dbTx, pendingSession); consumeErr != nil {
		_ = dbTx.Rollback()
		_ = h.authService.RollbackOAuthEmailAccountCreation(c.Request.Context(), newUser.ID, strings.TrimSpace(payload.InvitationCode))
		wipeCookies()
		response.ErrorFrom(c, consumeErr)
		return
	}
	if commitErr := dbTx.Commit(); commitErr != nil {
		_ = h.authService.RollbackOAuthEmailAccountCreation(c.Request.Context(), newUser.ID, strings.TrimSpace(payload.InvitationCode))
		response.ErrorFrom(c, infraerrors.InternalServer("PENDING_AUTH_BIND_APPLY_FAILED", "could not commit pending session transaction").WithCause(commitErr))
		return
	}
	h.authService.RecordSuccessfulLogin(c.Request.Context(), newUser.ID)
	wipeCookies()
	writeOAuthTokenPairResponse(c, tokens)
}

func (h *AuthHandler) getEmailOAuthConfig(ctx context.Context, providerName string) (config.EmailOAuthProviderConfig, error) {
	if h != nil && h.settingSvc != nil {
		return h.settingSvc.GetEmailOAuthProviderConfig(ctx, providerName)
	}
	return config.EmailOAuthProviderConfig{}, infraerrors.ServiceUnavailable("CONFIG_NOT_READY", "configuration has not been loaded yet")
}

func buildEmailOAuthAuthorizeURL(providerCfg config.EmailOAuthProviderConfig, csrfState string) (string, error) {
	parsed, parseErr := url.Parse(providerCfg.AuthorizeURL)
	if parseErr != nil {
		return "", fmt.Errorf("failed to parse authorize_url: %w", parseErr)
	}
	params := parsed.Query()
	params.Set("response_type", "code")
	params.Set("client_id", providerCfg.ClientID)
	params.Set("redirect_uri", providerCfg.RedirectURL)
	params.Set("state", csrfState)
	if trimmedScopes := strings.TrimSpace(providerCfg.Scopes); trimmedScopes != "" {
		params.Set("scope", trimmedScopes)
	}
	parsed.RawQuery = params.Encode()
	return parsed.String(), nil
}

func exchangeEmailOAuthCode(ctx context.Context, providerCfg config.EmailOAuthProviderConfig, authCode string) (*emailOAuthTokenResponse, error) {
	httpResp, httpErr := req.C().
		R().
		SetContext(ctx).
		SetHeader("Accept", "application/json").
		SetFormData(map[string]string{
			"grant_type":    "authorization_code",
			"client_id":     providerCfg.ClientID,
			"client_secret": providerCfg.ClientSecret,
			"code":          authCode,
			"redirect_uri":  providerCfg.RedirectURL,
		}).
		Post(providerCfg.TokenURL)
	if httpErr != nil {
		return nil, httpErr
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return nil, fmt.Errorf("token endpoint returned status %d: %s", httpResp.StatusCode, truncateLogValue(httpResp.String(), 1024))
	}
	var tokenData emailOAuthTokenResponse
	if unmarshalErr := json.Unmarshal(httpResp.Bytes(), &tokenData); unmarshalErr != nil {
		return nil, unmarshalErr
	}
	if strings.TrimSpace(tokenData.AccessToken) == "" {
		return nil, errors.New("token response does not contain an access_token")
	}
	return &tokenData, nil
}

func fetchEmailOAuthProfile(ctx context.Context, providerName string, providerCfg config.EmailOAuthProviderConfig, tokenData *emailOAuthTokenResponse) (*emailOAuthProfile, error) {
	httpResp, httpErr := req.C().
		R().
		SetContext(ctx).
		SetBearerAuthToken(tokenData.AccessToken).
		SetHeader("Accept", "application/json").
		Get(providerCfg.UserInfoURL)
	if httpErr != nil {
		return nil, httpErr
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return nil, fmt.Errorf("userinfo endpoint returned status %d: %s", httpResp.StatusCode, truncateLogValue(httpResp.String(), 1024))
	}
	switch strings.ToLower(strings.TrimSpace(providerName)) {
	case "github":
		return parseGitHubOAuthProfile(ctx, providerCfg, tokenData, httpResp.String())
	case "google":
		return parseGoogleOAuthProfile(httpResp.String())
	default:
		return nil, errors.New("oauth provider is not supported")
	}
}

func parseGitHubOAuthProfile(ctx context.Context, providerCfg config.EmailOAuthProviderConfig, tokenData *emailOAuthTokenResponse, body string) (*emailOAuthProfile, error) {
	ghUserID := strings.TrimSpace(gjson.Get(body, "id").String())
	if ghUserID == "" {
		return nil, errors.New("github response is missing user id")
	}
	emailsEndpoint := strings.TrimSpace(providerCfg.EmailsURL)
	if emailsEndpoint == "" {
		return nil, errors.New("no verified email could be obtained from github")
	}
	verifiedAddr, fetchErr := fetchGitHubPrimaryVerifiedEmail(ctx, emailsEndpoint, tokenData.AccessToken)
	if fetchErr != nil {
		return nil, fetchErr
	}
	if verifiedAddr == "" {
		return nil, errors.New("no verified email could be obtained from github")
	}
	loginName := strings.TrimSpace(gjson.Get(body, "login").String())
	displayName := strings.TrimSpace(gjson.Get(body, "name").String())
	return &emailOAuthProfile{
		Subject:       ghUserID,
		Email:         verifiedAddr,
		EmailVerified: true,
		Username:      coalesce(loginName, displayName, "github_"+ghUserID),
		DisplayName:   coalesce(displayName, loginName),
		AvatarURL:     strings.TrimSpace(gjson.Get(body, "avatar_url").String()),
		Metadata: map[string]any{
			"login": loginName,
		},
	}, nil
}

func fetchGitHubPrimaryVerifiedEmail(ctx context.Context, emailsEndpoint string, accessToken string) (string, error) {
	httpResp, httpErr := req.C().
		R().
		SetContext(ctx).
		SetBearerAuthToken(accessToken).
		SetHeader("Accept", "application/json").
		Get(emailsEndpoint)
	if httpErr != nil {
		return "", httpErr
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return "", fmt.Errorf("github emails endpoint returned status %d: %s", httpResp.StatusCode, truncateLogValue(httpResp.String(), 1024))
	}
	emailRecords := gjson.Parse(httpResp.String()).Array()
	// First pass: look for the primary verified email.
	for _, record := range emailRecords {
		if record.Get("primary").Bool() && record.Get("verified").Bool() {
			if addr := strings.TrimSpace(record.Get("email").String()); addr != "" {
				return addr, nil
			}
		}
	}
	// Second pass: fall back to any verified email.
	for _, record := range emailRecords {
		if record.Get("verified").Bool() {
			if addr := strings.TrimSpace(record.Get("email").String()); addr != "" {
				return addr, nil
			}
		}
	}
	return "", errors.New("no verified email could be obtained from github")
}

func parseGoogleOAuthProfile(body string) (*emailOAuthProfile, error) {
	googleSub := strings.TrimSpace(gjson.Get(body, "sub").String())
	googleEmail := strings.TrimSpace(gjson.Get(body, "email").String())
	isVerified := gjson.Get(body, "email_verified").Bool()
	if googleSub == "" {
		return nil, errors.New("google response is missing subject identifier")
	}
	if googleEmail == "" || !isVerified {
		return nil, errors.New("no verified email could be obtained from google")
	}
	displayName := strings.TrimSpace(gjson.Get(body, "name").String())
	return &emailOAuthProfile{
		Subject:       googleSub,
		Email:         googleEmail,
		EmailVerified: true,
		Username:      coalesce(strings.TrimSpace(gjson.Get(body, "given_name").String()), displayName, googleEmail),
		DisplayName:   displayName,
		AvatarURL:     strings.TrimSpace(gjson.Get(body, "picture").String()),
		Metadata: map[string]any{
			"email_verified": true,
		},
	}, nil
}

func emailOAuthSetCookie(c *gin.Context, cookieName, cookieValue string, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     cookieName,
		Value:    cookieValue,
		Path:     emailOAuthCookiePath,
		MaxAge:   emailOAuthCookieMaxAgeSec,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func emailOAuthClearCookie(c *gin.Context, cookieName string, secure bool) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     emailOAuthCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}
