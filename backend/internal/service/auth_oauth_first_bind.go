package service

import (
	"context"
	"fmt"
	"strings"

	dbent "github.com/telagod/subme/ent"

	entsql "entgo.io/ent/dialect/sql"
)

// ApplyProviderDefaultSettingsOnFirstBind applies provider-specific bootstrap
// settings the first time a user binds a third-party identity. The grant is
// idempotent per user/provider pair.
func (s *AuthService) ApplyProviderDefaultSettingsOnFirstBind(
	ctx context.Context,
	userID int64,
	providerType string,
) error {
	if s == nil || s.entClient == nil || s.settingService == nil || userID <= 0 {
		return nil
	}

	if dbent.TxFromContext(ctx) != nil {
		return s.applyProviderDefaultSettingsOnFirstBind(ctx, userID, providerType)
	}

	newTx, txErr := s.entClient.Tx(ctx)
	if txErr != nil {
		return fmt.Errorf("unable to begin first-bind defaults transaction: %w", txErr)
	}
	defer func() { _ = newTx.Rollback() }()

	txCtx := dbent.NewTxContext(ctx, newTx)
	if applyErr := s.applyProviderDefaultSettingsOnFirstBind(txCtx, userID, providerType); applyErr != nil {
		return applyErr
	}
	return newTx.Commit()
}

func (s *AuthService) applyProviderDefaultSettingsOnFirstBind(
	ctx context.Context,
	userID int64,
	providerType string,
) error {
	defaults, active, resolveErr := s.settingService.ResolveAuthSourceGrantSettings(ctx, providerType, true)
	if resolveErr != nil {
		return fmt.Errorf("unable to load auth source defaults: %w", resolveErr)
	}
	if !active {
		return nil
	}

	dbClient := s.entClient
	if activeTx := dbent.TxFromContext(ctx); activeTx != nil {
		dbClient = activeTx.Client()
	}

	var sqlResult entsql.Result
	if execErr := dbClient.Driver().Exec(
		ctx,
		`INSERT INTO user_provider_default_grants (user_id, provider_type, grant_reason)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, provider_type, grant_reason) DO NOTHING`,
		[]any{userID, strings.TrimSpace(providerType), "first_bind"},
		&sqlResult,
	); execErr != nil {
		return fmt.Errorf("unable to record first-bind provider grant: %w", execErr)
	}

	rowsChanged, countErr := sqlResult.RowsAffected()
	if countErr != nil {
		return fmt.Errorf("unable to read first-bind provider grant result: %w", countErr)
	}
	if rowsChanged == 0 {
		return nil
	}

	if defaults.Balance != 0 {
		if updErr := dbClient.User.UpdateOneID(userID).AddBalance(defaults.Balance).Exec(ctx); updErr != nil {
			return fmt.Errorf("unable to apply first-bind balance default: %w", updErr)
		}
	}
	if defaults.Concurrency != 0 {
		if updErr := dbClient.User.UpdateOneID(userID).AddConcurrency(defaults.Concurrency).Exec(ctx); updErr != nil {
			return fmt.Errorf("unable to apply first-bind concurrency default: %w", updErr)
		}
	}
	if s.defaultSubAssigner != nil {
		for _, item := range defaults.Subscriptions {
			if _, _, assignErr := s.defaultSubAssigner.AssignOrExtendSubscription(ctx, &AssignSubscriptionInput{
				UserID:       userID,
				GroupID:      item.GroupID,
				ValidityDays: item.ValidityDays,
				Notes:        "auto assigned by first bind defaults",
			}); assignErr != nil {
				return fmt.Errorf("unable to apply first-bind subscription default: %w", assignErr)
			}
		}
	}

	return nil
}
