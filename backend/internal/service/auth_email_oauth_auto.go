package service

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/authidentity"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/logger"
)

type EmailOAuthIdentityInput struct {
	ProviderType     string
	ProviderKey      string
	ProviderSubject  string
	Email            string
	EmailVerified    bool
	Username         string
	DisplayName      string
	AvatarURL        string
	UpstreamMetadata map[string]any
}

func (s *AuthService) LoginOrRegisterVerifiedEmailOAuth(ctx context.Context, input EmailOAuthIdentityInput) (*TokenPair, *User, error) {
	return s.loginOrRegisterVerifiedEmailOAuth(ctx, input, "", "", "")
}

func (s *AuthService) LoginOrRegisterVerifiedEmailOAuthWithInvitation(
	ctx context.Context,
	input EmailOAuthIdentityInput,
	invitationCode string,
	affiliateCode string,
) (*TokenPair, *User, error) {
	return s.loginOrRegisterVerifiedEmailOAuth(ctx, input, invitationCode, affiliateCode, "")
}

// LoginOrRegisterVerifiedEmailOAuthWithSignupCodes 与 invitation 版本一致，
// 但额外接受 promoCode。仅在新用户注册时消费 promo（既有用户登录不消费）。
func (s *AuthService) LoginOrRegisterVerifiedEmailOAuthWithSignupCodes(
	ctx context.Context,
	input EmailOAuthIdentityInput,
	invitationCode string,
	affiliateCode string,
	promoCode string,
) (*TokenPair, *User, error) {
	return s.loginOrRegisterVerifiedEmailOAuth(ctx, input, invitationCode, affiliateCode, promoCode)
}

func (s *AuthService) loginOrRegisterVerifiedEmailOAuth(
	ctx context.Context,
	input EmailOAuthIdentityInput,
	invitationCode string,
	affiliateCode string,
	promoCode string,
) (*TokenPair, *User, error) {
	if s == nil || s.userRepo == nil || s.entClient == nil {
		return nil, nil, ErrServiceUnavailable
	}

	provider := normalizeOAuthSignupSource(input.ProviderType)
	if provider != "github" && provider != "google" && provider != "oidc" {
		return nil, nil, infraerrors.BadRequest("OAUTH_PROVIDER_INVALID", "oauth provider is invalid")
	}
	pKey := strings.TrimSpace(input.ProviderKey)
	if pKey == "" {
		pKey = provider
	}
	pSubject := strings.TrimSpace(input.ProviderSubject)
	if pSubject == "" {
		return nil, nil, infraerrors.BadRequest("OAUTH_SUBJECT_MISSING", "oauth subject is missing")
	}
	if !input.EmailVerified {
		return nil, nil, infraerrors.Forbidden("OAUTH_EMAIL_NOT_VERIFIED", "oauth email is not verified")
	}

	addr := strings.ToLower(strings.TrimSpace(input.Email))
	if addr == "" || len(addr) > 255 {
		return nil, nil, infraerrors.BadRequest("INVALID_EMAIL", "invalid email")
	}
	if _, parseErr := mail.ParseAddress(addr); parseErr != nil {
		return nil, nil, infraerrors.BadRequest("INVALID_EMAIL", "invalid email")
	}
	if isReservedEmail(addr) {
		return nil, nil, ErrEmailReserved
	}
	if policyErr := s.validateRegistrationEmailPolicy(ctx, addr); policyErr != nil {
		return nil, nil, policyErr
	}

	owner, ownerErr := s.findEmailOAuthIdentityOwner(ctx, provider, pKey, pSubject)
	if ownerErr != nil {
		return nil, nil, ownerErr
	}
	if owner != nil && !strings.EqualFold(strings.TrimSpace(owner.Email), addr) {
		return nil, nil, infraerrors.Conflict("AUTH_IDENTITY_EMAIL_MISMATCH", "oauth identity belongs to a different email")
	}

	resolvedUser := owner
	isNewUser := false
	if resolvedUser == nil {
		found, lookupErr := s.userRepo.GetByEmail(ctx, addr)
		if lookupErr != nil {
			if !errors.Is(lookupErr, ErrUserNotFound) {
				logger.LegacyPrintf("service.auth", "[Auth] Database error during %s oauth login: %v", provider, lookupErr)
				return nil, nil, ErrServiceUnavailable
			}
			created, createErr := s.createEmailOAuthUser(ctx, addr, input.Username, provider, invitationCode, affiliateCode)
			if createErr != nil {
				return nil, nil, createErr
			}
			resolvedUser = created
			isNewUser = true
		} else {
			resolvedUser = found
		}
	}

	if !resolvedUser.IsActive() {
		return nil, nil, ErrUserNotActive
	}
	if identErr := s.ensureEmailOAuthIdentity(ctx, resolvedUser.ID, EmailOAuthIdentityInput{
		ProviderType:     provider,
		ProviderKey:      pKey,
		ProviderSubject:  pSubject,
		Email:            addr,
		EmailVerified:    input.EmailVerified,
		Username:         input.Username,
		DisplayName:      input.DisplayName,
		AvatarURL:        input.AvatarURL,
		UpstreamMetadata: input.UpstreamMetadata,
	}); identErr != nil {
		return nil, nil, identErr
	}

	if resolvedUser.Username == "" && strings.TrimSpace(input.Username) != "" {
		resolvedUser.Username = strings.TrimSpace(input.Username)
		if updErr := s.userRepo.Update(ctx, resolvedUser); updErr != nil {
			logger.LegacyPrintf("service.auth", "[Auth] Failed to update username after %s oauth login: %v", provider, updErr)
		}
	}
	if !isNewUser {
		if bindErr := s.ApplyProviderDefaultSettingsOnFirstBind(ctx, resolvedUser.ID, provider); bindErr != nil {
			logger.LegacyPrintf("service.auth", "[Auth] Failed to apply %s first bind defaults: %v", provider, bindErr)
		}
	} else {
		resolvedUser = s.applyOAuthSignupPromoCode(ctx, resolvedUser, promoCode)
	}
	s.RecordSuccessfulLogin(ctx, resolvedUser.ID)

	tokens, tokenErr := s.GenerateTokenPair(ctx, resolvedUser, "")
	if tokenErr != nil {
		return nil, nil, fmt.Errorf("unable to generate token pair: %w", tokenErr)
	}
	return tokens, resolvedUser, nil
}

func (s *AuthService) createEmailOAuthUser(ctx context.Context, email, username, providerType, invitationCode, affiliateCode string) (*User, error) {
	if s.settingService == nil || !s.settingService.IsRegistrationEnabled(ctx) {
		return nil, ErrRegDisabled
	}
	invRedeemCode, invErr := s.validateOAuthRegistrationInvitation(ctx, invitationCode)
	if invErr != nil {
		if errors.Is(invErr, ErrInvitationCodeRequired) {
			return nil, ErrOAuthInvitationRequired
		}
		return nil, invErr
	}

	randomPW, randErr := randomHexString(32)
	if randErr != nil {
		return nil, ErrServiceUnavailable
	}
	pwHash, hashErr := s.HashPassword(randomPW)
	if hashErr != nil {
		return nil, fmt.Errorf("unable to hash password: %w", hashErr)
	}
	grant := s.resolveSignupGrantPlan(ctx, providerType)
	rpmCap := 0
	if s.settingService != nil {
		rpmCap = s.settingService.GetDefaultUserRPMLimit(ctx)
	}
	newUser := &User{
		Email:        email,
		Username:     strings.TrimSpace(username),
		PasswordHash: pwHash,
		Role:         RoleUser,
		Balance:      grant.Balance,
		Concurrency:  grant.Concurrency,
		RPMLimit:     rpmCap,
		Status:       StatusActive,
		SignupSource: providerType,
	}
	if createErr := s.userRepo.Create(ctx, newUser); createErr != nil {
		if errors.Is(createErr, ErrEmailExists) {
			fallback, fallbackErr := s.userRepo.GetByEmail(ctx, email)
			if fallbackErr != nil {
				return nil, ErrServiceUnavailable
			}
			return fallback, nil
		}
		return nil, ErrServiceUnavailable
	}
	s.postAuthUserBootstrap(ctx, newUser, providerType, false)
	s.assignSubscriptions(ctx, newUser.ID, grant.Subscriptions, "auto assigned by signup defaults")
	// snapshot user x platform quota (fail-open)
	_ = s.snapshotPlatformQuotaDefaults(ctx, newUser.ID, &grant)
	s.bindOAuthAffiliate(ctx, newUser.ID, affiliateCode)
	if invRedeemCode != nil {
		if useErr := s.useOAuthRegistrationInvitation(ctx, invRedeemCode.ID, newUser.ID); useErr != nil {
			_ = s.RollbackOAuthEmailAccountCreation(ctx, newUser.ID, invitationCode)
			return nil, ErrInvitationCodeInvalid
		}
	}
	return newUser, nil
}

func (s *AuthService) findEmailOAuthIdentityOwner(ctx context.Context, providerType, providerKey, providerSubject string) (*User, error) {
	row, queryErr := s.entClient.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(providerType),
			authidentity.ProviderKeyEQ(providerKey),
			authidentity.ProviderSubjectEQ(providerSubject),
		).
		Only(ctx)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return nil, nil
		}
		return nil, infraerrors.InternalServer("AUTH_IDENTITY_LOOKUP_FAILED", "failed to inspect auth identity ownership").WithCause(queryErr)
	}
	found, lookupErr := s.userRepo.GetByID(ctx, row.UserID)
	if lookupErr != nil {
		if errors.Is(lookupErr, ErrUserNotFound) {
			return nil, nil
		}
		return nil, ErrServiceUnavailable
	}
	return found, nil
}

func (s *AuthService) ensureEmailOAuthIdentity(ctx context.Context, userID int64, input EmailOAuthIdentityInput) error {
	meta := map[string]any{
		"email":          strings.ToLower(strings.TrimSpace(input.Email)),
		"email_verified": input.EmailVerified,
	}
	for k, v := range input.UpstreamMetadata {
		meta[k] = v
	}
	if trimmedName := strings.TrimSpace(input.Username); trimmedName != "" {
		meta["username"] = trimmedName
	}
	if trimmedDisplay := strings.TrimSpace(input.DisplayName); trimmedDisplay != "" {
		meta["display_name"] = trimmedDisplay
	}
	if trimmedAvatar := strings.TrimSpace(input.AvatarURL); trimmedAvatar != "" {
		meta["avatar_url"] = trimmedAvatar
	}

	provider := normalizeOAuthSignupSource(input.ProviderType)
	pKey := strings.TrimSpace(input.ProviderKey)
	pSubject := strings.TrimSpace(input.ProviderSubject)
	existing, queryErr := s.entClient.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ(provider),
			authidentity.ProviderKeyEQ(pKey),
			authidentity.ProviderSubjectEQ(pSubject),
		).
		Only(ctx)
	if queryErr != nil && !dbent.IsNotFound(queryErr) {
		return infraerrors.InternalServer("AUTH_IDENTITY_LOOKUP_FAILED", "failed to inspect auth identity ownership").WithCause(queryErr)
	}
	if existing != nil {
		if existing.UserID != userID {
			return infraerrors.Conflict("AUTH_IDENTITY_OWNERSHIP_CONFLICT", "auth identity already belongs to another user")
		}
		_, updErr := s.entClient.AuthIdentity.UpdateOneID(existing.ID).
			SetMetadata(meta).
			Save(ctx)
		return updErr
	}
	_, createErr := s.entClient.AuthIdentity.Create().
		SetUserID(userID).
		SetProviderType(provider).
		SetProviderKey(pKey).
		SetProviderSubject(pSubject).
		SetMetadata(meta).
		Save(ctx)
	return createErr
}
