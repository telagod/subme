package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/telagod/subme/internal/service"
)

// userPlatformQuotaServiceAdapter bridges the repository-layer userPlatformQuotaRepository
// to the service.UserPlatformQuotaRepository interface (returns *service.UserPlatformQuotaRecord).
type userPlatformQuotaServiceAdapter struct {
	inner *userPlatformQuotaRepository
}

// NewUserPlatformQuotaServiceAdapter wraps a UserPlatformQuotaRepository implementation
// to satisfy the service.UserPlatformQuotaRepository interface.
func NewUserPlatformQuotaServiceAdapter(repo UserPlatformQuotaRepository) service.UserPlatformQuotaRepository {
	concrete, ok := repo.(*userPlatformQuotaRepository)
	if !ok {
		// Non-standard implementation (e.g. test fake) — use the generic adapter path.
		return &genericUserPlatformQuotaAdapter{inner: repo}
	}
	return &userPlatformQuotaServiceAdapter{inner: concrete}
}

func (a *userPlatformQuotaServiceAdapter) GetByUserPlatform(ctx context.Context, userID int64, platform string) (*service.UserPlatformQuotaRecord, error) {
	row, fetchErr := a.inner.GetByUserPlatform(ctx, userID, platform)
	if fetchErr != nil || row == nil {
		return nil, fetchErr
	}
	return repoRecordToService(row), nil
}

// IncrementUsageWithReset atomically adds cost to all three usage windows for (user, platform).
func (a *userPlatformQuotaServiceAdapter) IncrementUsageWithReset(ctx context.Context, userID int64, platform string, cost float64, now time.Time) error {
	return a.inner.IncrementUsageWithReset(ctx, userID, platform, cost, now)
}

// ListByUser retrieves all platform quota records for a given user.
func (a *userPlatformQuotaServiceAdapter) ListByUser(ctx context.Context, userID int64) ([]service.UserPlatformQuotaRecord, error) {
	rows, fetchErr := a.inner.ListByUser(ctx, userID)
	if fetchErr != nil {
		return nil, fetchErr
	}
	svcRecords := make([]service.UserPlatformQuotaRecord, len(rows))
	for idx, rec := range rows {
		svcRecords[idx] = service.UserPlatformQuotaRecord{
			UserID:             rec.UserID,
			Platform:           rec.Platform,
			DailyLimitUSD:      rec.DailyLimitUSD,
			WeeklyLimitUSD:     rec.WeeklyLimitUSD,
			MonthlyLimitUSD:    rec.MonthlyLimitUSD,
			DailyUsageUSD:      rec.DailyUsageUSD,
			WeeklyUsageUSD:     rec.WeeklyUsageUSD,
			MonthlyUsageUSD:    rec.MonthlyUsageUSD,
			DailyWindowStart:   rec.DailyWindowStart,
			WeeklyWindowStart:  rec.WeeklyWindowStart,
			MonthlyWindowStart: rec.MonthlyWindowStart,
		}
	}
	return svcRecords, nil
}

// BulkInsertInitial converts service records and delegates to the underlying repo.
func (a *userPlatformQuotaServiceAdapter) BulkInsertInitial(ctx context.Context, records []service.UserPlatformQuotaRecord) error {
	mapped := make([]UserPlatformQuotaRecord, len(records))
	for idx, rec := range records {
		mapped[idx] = UserPlatformQuotaRecord{
			UserID:          rec.UserID,
			Platform:        rec.Platform,
			DailyLimitUSD:   rec.DailyLimitUSD,
			WeeklyLimitUSD:  rec.WeeklyLimitUSD,
			MonthlyLimitUSD: rec.MonthlyLimitUSD,
		}
	}
	return a.inner.BulkInsertInitial(ctx, mapped)
}

// UpsertForUser replaces all platform quotas for the given user.
func (a *userPlatformQuotaServiceAdapter) UpsertForUser(ctx context.Context, userID int64, records []service.UserPlatformQuotaRecord) error {
	mapped := serviceToRepoRecords(records)
	return a.inner.UpsertForUser(ctx, userID, mapped)
}

// ResetExpiredWindow forwards to the repository and wraps the sentinel error for the service layer.
func (a *userPlatformQuotaServiceAdapter) ResetExpiredWindow(ctx context.Context, userID int64, platform string, window string, newStart time.Time) error {
	resetErr := a.inner.ResetExpiredWindow(ctx, userID, platform, window, newStart)
	if errors.Is(resetErr, ErrUserPlatformQuotaNotFound) {
		return fmt.Errorf("%w: %w", service.ErrUserPlatformQuotaNotFound, resetErr)
	}
	return resetErr
}

// BatchSnapshotUsage converts service snapshots to repo snapshots, delegates the call,
// and wraps FK violation sentinel errors for the service layer.
func (a *userPlatformQuotaServiceAdapter) BatchSnapshotUsage(ctx context.Context, snapshots []service.UserPlatformQuotaSnapshot, now time.Time) error {
	mapped := make([]UserPlatformQuotaSnapshot, len(snapshots))
	for idx, snap := range snapshots {
		mapped[idx] = UserPlatformQuotaSnapshot{
			UserID:             snap.UserID,
			Platform:           snap.Platform,
			DailyUsageUSD:      snap.DailyUsageUSD,
			WeeklyUsageUSD:     snap.WeeklyUsageUSD,
			MonthlyUsageUSD:    snap.MonthlyUsageUSD,
			DailyWindowStart:   snap.DailyWindowStart,
			WeeklyWindowStart:  snap.WeeklyWindowStart,
			MonthlyWindowStart: snap.MonthlyWindowStart,
		}
	}
	batchErr := a.inner.BatchSnapshotUsage(ctx, mapped, now)
	if errors.Is(batchErr, ErrUserPlatformQuotaFKViolation) {
		return fmt.Errorf("%w: %v", service.ErrUserPlatformQuotaFKViolation, batchErr)
	}
	return batchErr
}

// genericUserPlatformQuotaAdapter wraps any UserPlatformQuotaRepository through
// the generic interface (used for test fakes or non-standard implementations).
type genericUserPlatformQuotaAdapter struct {
	inner UserPlatformQuotaRepository
}

func (a *genericUserPlatformQuotaAdapter) GetByUserPlatform(ctx context.Context, userID int64, platform string) (*service.UserPlatformQuotaRecord, error) {
	row, fetchErr := a.inner.GetByUserPlatform(ctx, userID, platform)
	if fetchErr != nil || row == nil {
		return nil, fetchErr
	}
	return repoRecordToService(row), nil
}

// IncrementUsageWithReset atomically adds cost (generic adapter path).
func (a *genericUserPlatformQuotaAdapter) IncrementUsageWithReset(ctx context.Context, userID int64, platform string, cost float64, now time.Time) error {
	return a.inner.IncrementUsageWithReset(ctx, userID, platform, cost, now)
}

// ListByUser retrieves all platform quota records for a user (generic adapter path).
func (a *genericUserPlatformQuotaAdapter) ListByUser(ctx context.Context, userID int64) ([]service.UserPlatformQuotaRecord, error) {
	rows, fetchErr := a.inner.ListByUser(ctx, userID)
	if fetchErr != nil {
		return nil, fetchErr
	}
	svcRecords := make([]service.UserPlatformQuotaRecord, len(rows))
	for idx, rec := range rows {
		svcRecords[idx] = service.UserPlatformQuotaRecord{
			UserID:             rec.UserID,
			Platform:           rec.Platform,
			DailyLimitUSD:      rec.DailyLimitUSD,
			WeeklyLimitUSD:     rec.WeeklyLimitUSD,
			MonthlyLimitUSD:    rec.MonthlyLimitUSD,
			DailyUsageUSD:      rec.DailyUsageUSD,
			WeeklyUsageUSD:     rec.WeeklyUsageUSD,
			MonthlyUsageUSD:    rec.MonthlyUsageUSD,
			DailyWindowStart:   rec.DailyWindowStart,
			WeeklyWindowStart:  rec.WeeklyWindowStart,
			MonthlyWindowStart: rec.MonthlyWindowStart,
		}
	}
	return svcRecords, nil
}

// BulkInsertInitial converts and delegates to the generic repo (for test fakes).
func (a *genericUserPlatformQuotaAdapter) BulkInsertInitial(ctx context.Context, records []service.UserPlatformQuotaRecord) error {
	mapped := make([]UserPlatformQuotaRecord, len(records))
	for idx, rec := range records {
		mapped[idx] = UserPlatformQuotaRecord{
			UserID:          rec.UserID,
			Platform:        rec.Platform,
			DailyLimitUSD:   rec.DailyLimitUSD,
			WeeklyLimitUSD:  rec.WeeklyLimitUSD,
			MonthlyLimitUSD: rec.MonthlyLimitUSD,
		}
	}
	return a.inner.BulkInsertInitial(ctx, mapped)
}

// UpsertForUser replaces all platform quotas (generic adapter path).
func (a *genericUserPlatformQuotaAdapter) UpsertForUser(ctx context.Context, userID int64, records []service.UserPlatformQuotaRecord) error {
	mapped := serviceToRepoRecords(records)
	return a.inner.UpsertForUser(ctx, userID, mapped)
}

// ResetExpiredWindow forwards to the generic repo and wraps the sentinel error.
func (a *genericUserPlatformQuotaAdapter) ResetExpiredWindow(ctx context.Context, userID int64, platform string, window string, newStart time.Time) error {
	resetErr := a.inner.ResetExpiredWindow(ctx, userID, platform, window, newStart)
	if errors.Is(resetErr, ErrUserPlatformQuotaNotFound) {
		return fmt.Errorf("%w: %w", service.ErrUserPlatformQuotaNotFound, resetErr)
	}
	return resetErr
}

// BatchSnapshotUsage converts and delegates snapshots (generic adapter path),
// wrapping FK violation sentinel errors for the service layer.
func (a *genericUserPlatformQuotaAdapter) BatchSnapshotUsage(ctx context.Context, snapshots []service.UserPlatformQuotaSnapshot, now time.Time) error {
	mapped := make([]UserPlatformQuotaSnapshot, len(snapshots))
	for idx, snap := range snapshots {
		mapped[idx] = UserPlatformQuotaSnapshot{
			UserID:             snap.UserID,
			Platform:           snap.Platform,
			DailyUsageUSD:      snap.DailyUsageUSD,
			WeeklyUsageUSD:     snap.WeeklyUsageUSD,
			MonthlyUsageUSD:    snap.MonthlyUsageUSD,
			DailyWindowStart:   snap.DailyWindowStart,
			WeeklyWindowStart:  snap.WeeklyWindowStart,
			MonthlyWindowStart: snap.MonthlyWindowStart,
		}
	}
	batchErr := a.inner.BatchSnapshotUsage(ctx, mapped, now)
	if errors.Is(batchErr, ErrUserPlatformQuotaFKViolation) {
		return fmt.Errorf("%w: %v", service.ErrUserPlatformQuotaFKViolation, batchErr)
	}
	return batchErr
}

// repoRecordToService converts a repository-layer quota record to its service-layer counterpart.
func repoRecordToService(rec *UserPlatformQuotaRecord) *service.UserPlatformQuotaRecord {
	return &service.UserPlatformQuotaRecord{
		UserID:             rec.UserID,
		Platform:           rec.Platform,
		DailyLimitUSD:      rec.DailyLimitUSD,
		WeeklyLimitUSD:     rec.WeeklyLimitUSD,
		MonthlyLimitUSD:    rec.MonthlyLimitUSD,
		DailyUsageUSD:      rec.DailyUsageUSD,
		WeeklyUsageUSD:     rec.WeeklyUsageUSD,
		MonthlyUsageUSD:    rec.MonthlyUsageUSD,
		DailyWindowStart:   rec.DailyWindowStart,
		WeeklyWindowStart:  rec.WeeklyWindowStart,
		MonthlyWindowStart: rec.MonthlyWindowStart,
	}
}

// serviceToRepoRecords converts a slice of service quota records to repository records,
// including usage and window_start fields.
func serviceToRepoRecords(records []service.UserPlatformQuotaRecord) []UserPlatformQuotaRecord {
	mapped := make([]UserPlatformQuotaRecord, len(records))
	for idx, rec := range records {
		mapped[idx] = UserPlatformQuotaRecord{
			UserID:             rec.UserID,
			Platform:           rec.Platform,
			DailyLimitUSD:      rec.DailyLimitUSD,
			WeeklyLimitUSD:     rec.WeeklyLimitUSD,
			MonthlyLimitUSD:    rec.MonthlyLimitUSD,
			DailyUsageUSD:      rec.DailyUsageUSD,
			WeeklyUsageUSD:     rec.WeeklyUsageUSD,
			MonthlyUsageUSD:    rec.MonthlyUsageUSD,
			DailyWindowStart:   rec.DailyWindowStart,
			WeeklyWindowStart:  rec.WeeklyWindowStart,
			MonthlyWindowStart: rec.MonthlyWindowStart,
		}
	}
	return mapped
}
