package service

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/authidentity"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
	"github.com/telagod/subme/internal/pkg/logger"
)

// BindEmailIdentity verifies and binds a local email/password identity to the
// current user, or replaces the existing bound primary email.
func (s *AuthService) BindEmailIdentity(
	ctx context.Context,
	userID int64,
	email string,
	verifyCode string,
	password string,
) (*User, error) {
	if s == nil {
		return nil, ErrServiceUnavailable
	}

	addr, normalizeErr := normalizeEmailForIdentityBinding(email)
	if normalizeErr != nil {
		return nil, normalizeErr
	}
	if isReservedEmail(addr) {
		return nil, ErrEmailReserved
	}
	if strings.TrimSpace(password) == "" {
		return nil, ErrPasswordRequired
	}
	if codeErr := s.VerifyOAuthEmailCode(ctx, addr, verifyCode); codeErr != nil {
		return nil, codeErr
	}

	existing, fetchErr := s.userRepo.GetByID(ctx, userID)
	if fetchErr != nil {
		return nil, fetchErr
	}
	isFirstBind := !hasBindableEmailIdentitySubject(existing.Email)
	if isFirstBind && len(password) < 6 {
		return nil, infraerrors.BadRequest("PASSWORD_TOO_SHORT", "password must be at least 6 characters")
	}
	if !isFirstBind && !s.CheckPassword(password, existing.PasswordHash) {
		return nil, ErrPasswordIncorrect
	}

	otherUser, lookupErr := s.userRepo.GetByEmail(ctx, addr)
	switch {
	case lookupErr == nil && otherUser != nil && otherUser.ID != userID:
		return nil, ErrEmailExists
	case lookupErr != nil && !errors.Is(lookupErr, ErrUserNotFound):
		return nil, ErrServiceUnavailable
	}

	pwHash, hashErr := s.HashPassword(password)
	if hashErr != nil {
		return nil, fmt.Errorf("unable to hash password: %w", hashErr)
	}

	if s.entClient != nil {
		if txErr := s.updateBoundEmailIdentityTx(ctx, existing, addr, pwHash, isFirstBind); txErr != nil {
			return nil, txErr
		}
		s.revokeEmailIdentitySessions(ctx, userID)
		return existing, nil
	}

	existing.Email = addr
	existing.PasswordHash = pwHash
	if updErr := s.userRepo.Update(ctx, existing); updErr != nil {
		if errors.Is(updErr, ErrEmailExists) {
			return nil, ErrEmailExists
		}
		return nil, ErrServiceUnavailable
	}

	if isFirstBind {
		if bindErr := s.ApplyProviderDefaultSettingsOnFirstBind(ctx, userID, "email"); bindErr != nil {
			return nil, fmt.Errorf("unable to apply email first-bind defaults: %w", bindErr)
		}
	}

	s.revokeEmailIdentitySessions(ctx, userID)
	return existing, nil
}

// SendEmailIdentityBindCode sends a verification code for authenticated email binding flows.
func (s *AuthService) SendEmailIdentityBindCode(ctx context.Context, userID int64, email string, locale ...string) error {
	if s == nil {
		return ErrServiceUnavailable
	}

	addr, normalizeErr := normalizeEmailForIdentityBinding(email)
	if normalizeErr != nil {
		return normalizeErr
	}
	if isReservedEmail(addr) {
		return ErrEmailReserved
	}
	if s.emailService == nil {
		return ErrServiceUnavailable
	}
	if _, fetchErr := s.userRepo.GetByID(ctx, userID); fetchErr != nil {
		if errors.Is(fetchErr, ErrUserNotFound) {
			return ErrUserNotFound
		}
		return ErrServiceUnavailable
	}

	otherUser, lookupErr := s.userRepo.GetByEmail(ctx, addr)
	switch {
	case lookupErr == nil && otherUser != nil && otherUser.ID != userID:
		return ErrEmailExists
	case lookupErr != nil && !errors.Is(lookupErr, ErrUserNotFound):
		return ErrServiceUnavailable
	}

	brandName := "Sub2API"
	if s.settingService != nil {
		brandName = s.settingService.GetSiteName(ctx)
	}
	return s.emailService.SendVerifyCode(ctx, addr, brandName, firstEmailLocaleV2(locale))
}

func normalizeEmailForIdentityBinding(email string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(email))
	if trimmed == "" || len(trimmed) > 255 {
		return "", infraerrors.BadRequest("INVALID_EMAIL", "invalid email")
	}
	if _, parseErr := mail.ParseAddress(trimmed); parseErr != nil {
		return "", infraerrors.BadRequest("INVALID_EMAIL", "invalid email")
	}
	return trimmed, nil
}

func hasBindableEmailIdentitySubject(email string) bool {
	trimmed := strings.ToLower(strings.TrimSpace(email))
	return trimmed != "" && !isReservedEmail(trimmed)
}

func (s *AuthService) updateBoundEmailIdentityTx(
	ctx context.Context,
	currentUser *User,
	email string,
	hashedPassword string,
	applyFirstBindDefaults bool,
) error {
	if activeTx := dbent.TxFromContext(ctx); activeTx != nil {
		return s.updateBoundEmailIdentityWithClient(ctx, activeTx.Client(), currentUser, email, hashedPassword, applyFirstBindDefaults)
	}

	newTx, txErr := s.entClient.Tx(ctx)
	if txErr != nil {
		return ErrServiceUnavailable
	}
	defer func() { _ = newTx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, newTx)
	if opErr := s.updateBoundEmailIdentityWithClient(txCtx, newTx.Client(), currentUser, email, hashedPassword, applyFirstBindDefaults); opErr != nil {
		return opErr
	}
	if commitErr := newTx.Commit(); commitErr != nil {
		return ErrServiceUnavailable
	}
	return nil
}

func (s *AuthService) updateBoundEmailIdentityWithClient(
	ctx context.Context,
	client *dbent.Client,
	currentUser *User,
	email string,
	hashedPassword string,
	applyFirstBindDefaults bool,
) error {
	if client == nil || currentUser == nil || currentUser.ID <= 0 {
		return ErrServiceUnavailable
	}

	previousEmail := currentUser.Email
	if _, saveErr := client.User.UpdateOneID(currentUser.ID).
		SetEmail(email).
		SetPasswordHash(hashedPassword).
		Save(ctx); saveErr != nil {
		if dbent.IsConstraintError(saveErr) {
			return ErrEmailExists
		}
		return ErrServiceUnavailable
	}

	if replaceErr := replaceBoundEmailAuthIdentityWithClient(ctx, client, currentUser.ID, previousEmail, email, "auth_service_email_bind"); replaceErr != nil {
		if errors.Is(replaceErr, ErrEmailExists) {
			return ErrEmailExists
		}
		return ErrServiceUnavailable
	}

	if applyFirstBindDefaults {
		if bindErr := s.ApplyProviderDefaultSettingsOnFirstBind(ctx, currentUser.ID, "email"); bindErr != nil {
			return fmt.Errorf("unable to apply email first-bind defaults: %w", bindErr)
		}
	}

	refreshed, getErr := client.User.Get(ctx, currentUser.ID)
	if getErr != nil {
		return ErrServiceUnavailable
	}
	currentUser.Email = refreshed.Email
	currentUser.PasswordHash = refreshed.PasswordHash
	currentUser.Balance = refreshed.Balance
	currentUser.Concurrency = refreshed.Concurrency
	currentUser.UpdatedAt = refreshed.UpdatedAt
	return nil
}

func (s *AuthService) revokeEmailIdentitySessions(ctx context.Context, userID int64) {
	if revokeErr := s.RevokeAllUserSessions(ctx, userID); revokeErr != nil {
		logger.LegacyPrintf("service.auth", "[Auth] Failed to revoke refresh sessions after email identity bind for user %d: %v", userID, revokeErr)
	}
}

func replaceBoundEmailAuthIdentityWithClient(
	ctx context.Context,
	client *dbent.Client,
	userID int64,
	oldEmail string,
	newEmail string,
	source string,
) error {
	newSubj := normalizeBoundEmailAuthIdentitySubject(newEmail)
	if ensureErr := ensureBoundEmailAuthIdentityWithClient(ctx, client, userID, newSubj, source); ensureErr != nil {
		return ensureErr
	}

	oldSubj := normalizeBoundEmailAuthIdentitySubject(oldEmail)
	if oldSubj == "" || oldSubj == newSubj {
		return nil
	}

	_, delErr := client.AuthIdentity.Delete().
		Where(
			authidentity.UserIDEQ(userID),
			authidentity.ProviderTypeEQ("email"),
			authidentity.ProviderKeyEQ("email"),
			authidentity.ProviderSubjectEQ(oldSubj),
		).
		Exec(ctx)
	return delErr
}

func ensureBoundEmailAuthIdentityWithClient(
	ctx context.Context,
	client *dbent.Client,
	userID int64,
	subject string,
	source string,
) error {
	if client == nil || userID <= 0 || subject == "" {
		return nil
	}

	if strings.TrimSpace(source) == "" {
		source = "auth_service_email_bind"
	}

	if upsertErr := client.AuthIdentity.Create().
		SetUserID(userID).
		SetProviderType("email").
		SetProviderKey("email").
		SetProviderSubject(subject).
		SetVerifiedAt(time.Now().UTC()).
		SetMetadata(map[string]any{"source": strings.TrimSpace(source)}).
		OnConflictColumns(
			authidentity.FieldProviderType,
			authidentity.FieldProviderKey,
			authidentity.FieldProviderSubject,
		).
		DoNothing().
		Exec(ctx); upsertErr != nil {
		if !isSQLNoRowsError(upsertErr) {
			return upsertErr
		}
	}

	row, queryErr := client.AuthIdentity.Query().
		Where(
			authidentity.ProviderTypeEQ("email"),
			authidentity.ProviderKeyEQ("email"),
			authidentity.ProviderSubjectEQ(subject),
		).
		Only(ctx)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return nil
		}
		return queryErr
	}
	if row.UserID != userID {
		return ErrEmailExists
	}
	return nil
}

func normalizeBoundEmailAuthIdentitySubject(email string) string {
	trimmed := strings.ToLower(strings.TrimSpace(email))
	if trimmed == "" || isReservedEmail(trimmed) {
		return ""
	}
	return trimmed
}
