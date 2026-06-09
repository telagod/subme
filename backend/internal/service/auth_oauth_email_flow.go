package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"time"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/redeemcode"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
)

func normalizeOAuthSignupSource(signupSource string) string {
	src := strings.ToLower(strings.TrimSpace(signupSource))
	switch src {
	case "linuxdo", "wechat", "oidc", "github", "google", "dingtalk":
		return src
	default:
		return "email"
	}
}

// SendPendingOAuthVerifyCode sends a local verification code for pending OAuth
// account-creation flows without relying on the public registration gate.
func (s *AuthService) SendPendingOAuthVerifyCode(ctx context.Context, email string, locale ...string) (*SendVerifyCodeResult, error) {
	addr := strings.ToLower(strings.TrimSpace(email))
	if addr == "" {
		return nil, ErrEmailVerifyRequired
	}
	if _, parseErr := mail.ParseAddress(addr); parseErr != nil {
		return nil, ErrEmailVerifyRequired
	}
	if isReservedEmail(addr) {
		return nil, ErrEmailReserved
	}
	if s == nil || s.emailService == nil {
		return nil, ErrServiceUnavailable
	}

	displayName := "Sub2API"
	if s.settingService != nil {
		displayName = s.settingService.GetSiteName(ctx)
	}
	if sendErr := s.emailService.SendVerifyCode(ctx, addr, displayName, firstEmailLocaleV2(locale)); sendErr != nil {
		return nil, sendErr
	}
	return &SendVerifyCodeResult{
		Countdown: int(verifyCodeCooldown / time.Second),
	}, nil
}

func (s *AuthService) validateOAuthRegistrationInvitation(ctx context.Context, invitationCode string) (*RedeemCode, error) {
	if s == nil || s.settingService == nil || !s.settingService.IsInvitationCodeEnabled(ctx) {
		return nil, nil
	}
	if s.redeemRepo == nil && s.oauthEmailFlowClient(ctx) == nil {
		return nil, ErrServiceUnavailable
	}

	code := strings.TrimSpace(invitationCode)
	if code == "" {
		return nil, ErrInvitationCodeRequired
	}

	loaded, loadErr := s.loadOAuthRegistrationInvitation(ctx, code)
	if loadErr != nil {
		return nil, ErrInvitationCodeInvalid
	}
	if loaded.Type != RedeemTypeInvitation || !loaded.CanUse() {
		return nil, ErrInvitationCodeInvalid
	}
	return loaded, nil
}

// VerifyOAuthEmailCode verifies the locally entered email verification code for
// third-party signup and binding flows. This is intentionally independent from
// the global registration email verification toggle.
func (s *AuthService) VerifyOAuthEmailCode(ctx context.Context, email, verifyCode string) error {
	addr := strings.ToLower(strings.TrimSpace(email))
	trimmedCode := strings.TrimSpace(verifyCode)

	if addr == "" {
		return ErrEmailVerifyRequired
	}
	if trimmedCode == "" {
		return ErrEmailVerifyRequired
	}
	if s == nil || s.emailService == nil {
		return ErrServiceUnavailable
	}
	return s.emailService.VerifyCode(ctx, addr, trimmedCode)
}

// RegisterOAuthEmailAccount creates a local account from a third-party first
// login after the user has verified a local email address.
func (s *AuthService) RegisterOAuthEmailAccount(
	ctx context.Context,
	email string,
	password string,
	verifyCode string,
	invitationCode string,
	signupSource string,
) (*TokenPair, *User, error) {
	if s == nil {
		return nil, nil, ErrServiceUnavailable
	}
	if s.settingService == nil || (!s.settingService.IsRegistrationEnabled(ctx) && !s.canBypassRegistrationDisabledForOAuth(ctx, signupSource)) {
		return nil, nil, ErrRegDisabled
	}

	addr := strings.ToLower(strings.TrimSpace(email))
	if isReservedEmail(addr) {
		return nil, nil, ErrEmailReserved
	}
	if policyErr := s.validateRegistrationEmailPolicy(ctx, addr); policyErr != nil {
		slog.Error("oauth email registration blocked by policy", "email", addr, "error", policyErr.Error())
		return nil, nil, policyErr
	}
	if codeErr := s.VerifyOAuthEmailCode(ctx, addr, verifyCode); codeErr != nil {
		slog.Error("oauth email registration code verification failed", "email", addr, "error", codeErr.Error())
		return nil, nil, codeErr
	}

	if _, invErr := s.validateOAuthRegistrationInvitation(ctx, invitationCode); invErr != nil {
		slog.Error("oauth email registration invitation validation failed", "email", addr, "error", invErr.Error())
		return nil, nil, invErr
	}

	emailTaken, checkErr := s.userRepo.ExistsByEmail(ctx, addr)
	if checkErr != nil {
		slog.Error("oauth email registration existence check failed", "email", addr, "error", checkErr.Error())
		return nil, nil, ErrServiceUnavailable
	}
	if emailTaken {
		return nil, nil, ErrEmailExists
	}

	pwHash, hashErr := s.HashPassword(password)
	if hashErr != nil {
		return nil, nil, fmt.Errorf("unable to hash password: %w", hashErr)
	}

	src := normalizeOAuthSignupSource(signupSource)
	grant := s.resolveSignupGrantPlan(ctx, src)

	newUser := &User{
		Email:        addr,
		PasswordHash: pwHash,
		Role:         RoleUser,
		Balance:      grant.Balance,
		Concurrency:  grant.Concurrency,
		Status:       StatusActive,
		SignupSource: src,
	}

	if createErr := s.userRepo.Create(ctx, newUser); createErr != nil {
		if errors.Is(createErr, ErrEmailExists) {
			return nil, nil, ErrEmailExists
		}
		slog.Error("oauth email registration user creation failed", "email", addr, "signup_source", src, "error", createErr.Error())
		return nil, nil, ErrServiceUnavailable
	}

	tokens, tokenErr := s.GenerateTokenPair(ctx, newUser, "")
	if tokenErr != nil {
		_ = s.RollbackOAuthEmailAccountCreation(ctx, newUser.ID, "")
		return nil, nil, fmt.Errorf("unable to generate token pair: %w", tokenErr)
	}
	return tokens, newUser, nil
}

// RegisterVerifiedOAuthEmailAccount creates a local account from an OAuth
// provider that has already returned a verified email address.
func (s *AuthService) RegisterVerifiedOAuthEmailAccount(
	ctx context.Context,
	email string,
	password string,
	invitationCode string,
	signupSource string,
) (*TokenPair, *User, error) {
	if s == nil {
		return nil, nil, ErrServiceUnavailable
	}
	if s.settingService == nil || (!s.settingService.IsRegistrationEnabled(ctx) && !s.canBypassRegistrationDisabledForOAuth(ctx, signupSource)) {
		return nil, nil, ErrRegDisabled
	}

	addr := strings.ToLower(strings.TrimSpace(email))
	if addr == "" || len(addr) > 255 {
		return nil, nil, ErrEmailVerifyRequired
	}
	if _, parseErr := mail.ParseAddress(addr); parseErr != nil {
		return nil, nil, ErrEmailVerifyRequired
	}
	if isReservedEmail(addr) {
		return nil, nil, ErrEmailReserved
	}
	if policyErr := s.validateRegistrationEmailPolicy(ctx, addr); policyErr != nil {
		return nil, nil, policyErr
	}
	if strings.TrimSpace(password) == "" {
		return nil, nil, infraerrors.BadRequest("PASSWORD_REQUIRED", "password is required")
	}
	if _, invErr := s.validateOAuthRegistrationInvitation(ctx, invitationCode); invErr != nil {
		return nil, nil, invErr
	}

	emailTaken, checkErr := s.userRepo.ExistsByEmail(ctx, addr)
	if checkErr != nil {
		return nil, nil, ErrServiceUnavailable
	}
	if emailTaken {
		return nil, nil, ErrEmailExists
	}

	pwHash, hashErr := s.HashPassword(password)
	if hashErr != nil {
		return nil, nil, fmt.Errorf("unable to hash password: %w", hashErr)
	}

	src := normalizeOAuthSignupSource(signupSource)
	grant := s.resolveSignupGrantPlan(ctx, src)
	rpmCap := 0
	if s.settingService != nil {
		rpmCap = s.settingService.GetDefaultUserRPMLimit(ctx)
	}
	newUser := &User{
		Email:        addr,
		PasswordHash: pwHash,
		Role:         RoleUser,
		Balance:      grant.Balance,
		Concurrency:  grant.Concurrency,
		RPMLimit:     rpmCap,
		Status:       StatusActive,
		SignupSource: src,
	}

	if createErr := s.userRepo.Create(ctx, newUser); createErr != nil {
		if errors.Is(createErr, ErrEmailExists) {
			return nil, nil, ErrEmailExists
		}
		return nil, nil, ErrServiceUnavailable
	}

	tokens, tokenErr := s.GenerateTokenPair(ctx, newUser, "")
	if tokenErr != nil {
		_ = s.RollbackOAuthEmailAccountCreation(ctx, newUser.ID, "")
		return nil, nil, fmt.Errorf("unable to generate token pair: %w", tokenErr)
	}
	return tokens, newUser, nil
}

// FinalizeOAuthEmailAccount applies invitation usage and normal signup bootstrap
// only after the pending OAuth flow has fully reached its last reversible step.
func (s *AuthService) FinalizeOAuthEmailAccount(
	ctx context.Context,
	user *User,
	invitationCode string,
	signupSource string,
	affiliateCode string,
) error {
	if s == nil || user == nil || user.ID <= 0 {
		return ErrServiceUnavailable
	}

	src := normalizeOAuthSignupSource(signupSource)
	invRedeemCode, invErr := s.validateOAuthRegistrationInvitation(ctx, invitationCode)
	if invErr != nil {
		return invErr
	}
	if invRedeemCode != nil {
		if useErr := s.useOAuthRegistrationInvitation(ctx, invRedeemCode.ID, user.ID); useErr != nil {
			return ErrInvitationCodeInvalid
		}
	}

	s.updateOAuthSignupSource(ctx, user.ID, src)
	grant := s.resolveSignupGrantPlan(ctx, src)
	s.assignSubscriptions(ctx, user.ID, grant.Subscriptions, "auto assigned by signup defaults")
	// snapshot user x platform quota (fail-open)
	_ = s.snapshotPlatformQuotaDefaults(ctx, user.ID, &grant)
	s.bindOAuthAffiliate(ctx, user.ID, affiliateCode)
	return nil
}

// RollbackOAuthEmailAccountCreation removes a partially-created local account
// and restores any invitation code already consumed by that account.
func (s *AuthService) RollbackOAuthEmailAccountCreation(ctx context.Context, userID int64, invitationCode string) error {
	if s == nil || s.userRepo == nil || userID <= 0 {
		return ErrServiceUnavailable
	}
	if restoreErr := s.restoreOAuthRegistrationInvitation(ctx, invitationCode, userID); restoreErr != nil {
		return restoreErr
	}
	if delErr := s.userRepo.Delete(ctx, userID); delErr != nil {
		return fmt.Errorf("failed to remove partially-created oauth user: %w", delErr)
	}
	return nil
}

func (s *AuthService) restoreOAuthRegistrationInvitation(ctx context.Context, invitationCode string, userID int64) error {
	if s == nil || s.settingService == nil || !s.settingService.IsInvitationCodeEnabled(ctx) {
		return nil
	}
	if s.redeemRepo == nil && s.oauthEmailFlowClient(ctx) == nil {
		return ErrServiceUnavailable
	}

	code := strings.TrimSpace(invitationCode)
	if code == "" || userID <= 0 {
		return nil
	}

	loaded, loadErr := s.loadOAuthRegistrationInvitation(ctx, code)
	if loadErr != nil {
		if errors.Is(loadErr, ErrRedeemCodeNotFound) {
			return nil
		}
		return fmt.Errorf("failed to load invitation code for restoration: %w", loadErr)
	}
	if loaded.Type != RedeemTypeInvitation || loaded.Status != StatusUsed || loaded.UsedBy == nil || *loaded.UsedBy != userID {
		return nil
	}

	loaded.Status = StatusUnused
	loaded.UsedBy = nil
	loaded.UsedAt = nil
	if updateErr := s.updateOAuthRegistrationInvitation(ctx, loaded); updateErr != nil {
		return fmt.Errorf("failed to restore invitation code: %w", updateErr)
	}
	return nil
}

func (s *AuthService) oauthEmailFlowClient(ctx context.Context) *dbent.Client {
	if s == nil || s.entClient == nil {
		return nil
	}
	if activeTx := dbent.TxFromContext(ctx); activeTx != nil {
		return activeTx.Client()
	}
	return s.entClient
}

func (s *AuthService) loadOAuthRegistrationInvitation(ctx context.Context, invitationCode string) (*RedeemCode, error) {
	if dbClient := s.oauthEmailFlowClient(ctx); dbClient != nil {
		row, queryErr := dbClient.RedeemCode.Query().Where(redeemcode.CodeEQ(invitationCode)).Only(ctx)
		if queryErr != nil {
			if dbent.IsNotFound(queryErr) {
				return nil, ErrRedeemCodeNotFound
			}
			return nil, queryErr
		}
		return &RedeemCode{
			ID:           row.ID,
			Code:         row.Code,
			Type:         row.Type,
			Value:        row.Value,
			Status:       row.Status,
			UsedBy:       row.UsedBy,
			UsedAt:       row.UsedAt,
			Notes:        oauthEmailFlowStringValue(row.Notes),
			CreatedAt:    row.CreatedAt,
			ExpiresAt:    row.ExpiresAt,
			GroupID:      row.GroupID,
			ValidityDays: row.ValidityDays,
		}, nil
	}
	return s.redeemRepo.GetByCode(ctx, invitationCode)
}

func (s *AuthService) useOAuthRegistrationInvitation(ctx context.Context, invitationID, userID int64) error {
	if dbClient := s.oauthEmailFlowClient(ctx); dbClient != nil {
		now := time.Now().UTC()
		rowsAffected, updateErr := dbClient.RedeemCode.Update().
			Where(
				redeemcode.IDEQ(invitationID),
				redeemcode.StatusEQ(StatusUnused),
				redeemcode.Or(redeemcode.ExpiresAtIsNil(), redeemcode.ExpiresAtGT(now)),
			).
			SetStatus(StatusUsed).
			SetUsedBy(userID).
			SetUsedAt(now).
			Save(ctx)
		if updateErr != nil {
			return updateErr
		}
		if rowsAffected == 0 {
			return ErrRedeemCodeUsed
		}
		return nil
	}
	return s.redeemRepo.Use(ctx, invitationID, userID)
}

func (s *AuthService) updateOAuthRegistrationInvitation(ctx context.Context, code *RedeemCode) error {
	if code == nil {
		return nil
	}
	if dbClient := s.oauthEmailFlowClient(ctx); dbClient != nil {
		mut := dbClient.RedeemCode.UpdateOneID(code.ID).
			SetCode(code.Code).
			SetType(code.Type).
			SetValue(code.Value).
			SetStatus(code.Status).
			SetNotes(code.Notes).
			SetValidityDays(code.ValidityDays)
		if code.ExpiresAt != nil {
			mut = mut.SetExpiresAt(*code.ExpiresAt)
		} else {
			mut = mut.ClearExpiresAt()
		}
		if code.UsedBy != nil {
			mut = mut.SetUsedBy(*code.UsedBy)
		} else {
			mut = mut.ClearUsedBy()
		}
		if code.UsedAt != nil {
			mut = mut.SetUsedAt(*code.UsedAt)
		} else {
			mut = mut.ClearUsedAt()
		}
		if code.GroupID != nil {
			mut = mut.SetGroupID(*code.GroupID)
		} else {
			mut = mut.ClearGroupID()
		}
		_, saveErr := mut.Save(ctx)
		return saveErr
	}
	return s.redeemRepo.Update(ctx, code)
}

func (s *AuthService) updateOAuthSignupSource(ctx context.Context, userID int64, signupSource string) {
	dbClient := s.oauthEmailFlowClient(ctx)
	if dbClient == nil || userID <= 0 || strings.TrimSpace(signupSource) == "" {
		return
	}
	_ = dbClient.User.UpdateOneID(userID).SetSignupSource(signupSource).Exec(ctx)
}

func oauthEmailFlowStringValue(ptr *string) string {
	if ptr == nil {
		return ""
	}
	return *ptr
}

// ValidatePasswordCredentials checks the local password without completing the
// login flow. This is used by pending third-party account adoption flows before
// the external identity has been bound.
func (s *AuthService) ValidatePasswordCredentials(ctx context.Context, email, password string) (*User, error) {
	if s == nil {
		return nil, ErrServiceUnavailable
	}

	addr := strings.ToLower(strings.TrimSpace(email))
	found, lookupErr := s.userRepo.GetByEmail(ctx, addr)
	if lookupErr != nil {
		if errors.Is(lookupErr, ErrUserNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, ErrServiceUnavailable
	}
	if !found.IsActive() {
		return nil, ErrUserNotActive
	}
	if !s.CheckPassword(password, found.PasswordHash) {
		return nil, ErrInvalidCredentials
	}
	return found, nil
}

// RecordSuccessfulLogin updates last-login activity after a non-standard login
// flow finishes with a real session.
func (s *AuthService) RecordSuccessfulLogin(ctx context.Context, userID int64) {
	if s != nil && s.userRepo != nil && userID > 0 {
		found, lookupErr := s.userRepo.GetByID(ctx, userID)
		if lookupErr == nil && found != nil && !isReservedEmail(found.Email) {
			s.backfillEmailIdentityOnSuccessfulLogin(ctx, found)
		}
	}
	s.touchUserLogin(ctx, userID)
}
