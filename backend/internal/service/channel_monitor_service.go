package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

// ChannelMonitorRepository defines the data access interface for channel monitors.
// Input/output pointer types use the service-layer ChannelMonitor model;
// repository implementations handle ent model conversion and keep api_key_encrypted as ciphertext.
type ChannelMonitorRepository interface {
	// CRUD
	Create(ctx context.Context, m *ChannelMonitor) error
	GetByID(ctx context.Context, id int64) (*ChannelMonitor, error)
	Update(ctx context.Context, m *ChannelMonitor) error
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, params ChannelMonitorListParams) ([]*ChannelMonitor, int64, error)

	// Scheduler helpers
	ListEnabled(ctx context.Context) ([]*ChannelMonitor, error)
	MarkChecked(ctx context.Context, id int64, checkedAt time.Time) error
	InsertHistoryBatch(ctx context.Context, rows []*ChannelMonitorHistoryRow) error
	DeleteHistoryBefore(ctx context.Context, before time.Time) (int64, error)

	// History records
	ListHistory(ctx context.Context, monitorID int64, model string, limit int) ([]*ChannelMonitorHistoryEntry, error)

	// User view aggregation
	ListLatestPerModel(ctx context.Context, monitorID int64) ([]*ChannelMonitorLatest, error)
	ComputeAvailability(ctx context.Context, monitorID int64, windowDays int) ([]*ChannelMonitorAvailability, error)

	// Batch aggregation (admin/user list, eliminates N+1)
	ListLatestForMonitorIDs(ctx context.Context, ids []int64) (map[int64][]*ChannelMonitorLatest, error)
	ComputeAvailabilityForMonitors(ctx context.Context, ids []int64, windowDays int) (map[int64][]*ChannelMonitorAvailability, error)
	// ListRecentHistoryForMonitors batch-fetches recent history for each monitor's primary model.
	// Returns entries sorted by checked_at DESC (newest first), excluding the message field.
	ListRecentHistoryForMonitors(ctx context.Context, ids []int64, primaryModels map[int64]string, perMonitorLimit int) (map[int64][]*ChannelMonitorHistoryEntry, error)

	// ---------- Aggregation maintenance (called by OpsCleanupService) ----------

	// UpsertDailyRollupsFor aggregates the given date's raw history into daily rollups.
	// Uses ON CONFLICT DO UPDATE for idempotent backfill. Returns upserted row count.
	UpsertDailyRollupsFor(ctx context.Context, targetDate time.Time) (int64, error)
	// DeleteRollupsBefore soft-deletes rollup rows with bucket_date < beforeDate.
	DeleteRollupsBefore(ctx context.Context, beforeDate time.Time) (int64, error)
	// LoadAggregationWatermark reads the watermark (id=1).
	// Returns nil if aggregation has never run; the watermark row is expected to exist (from migration).
	LoadAggregationWatermark(ctx context.Context) (*time.Time, error)
	// UpdateAggregationWatermark writes the watermark (UPSERT to id=1).
	UpdateAggregationWatermark(ctx context.Context, date time.Time) error
}

// ChannelMonitorService is the channel monitor management service.
type ChannelMonitorService struct {
	repo      ChannelMonitorRepository
	encryptor SecretEncryptor
	// scheduler is injected by wire via SetScheduler; CRUD operations call its hooks
	// to synchronize tasks immediately. Remains nil in tests or when not injected (all hooks become no-ops).
	scheduler MonitorScheduler
}

// NewChannelMonitorService creates a channel monitor service instance.
func NewChannelMonitorService(repo ChannelMonitorRepository, encryptor SecretEncryptor) *ChannelMonitorService {
	return &ChannelMonitorService{repo: repo, encryptor: encryptor}
}

// ---------- CRUD ----------

// List returns monitors matching the filter criteria with pagination.
// Returned ChannelMonitor.APIKey is decrypted to plaintext; handler layer is responsible for masking.
func (s *ChannelMonitorService) List(reqCtx context.Context, params ChannelMonitorListParams) ([]*ChannelMonitor, int64, error) {
	if params.Page < 1 {
		params.Page = 1
	}
	if params.PageSize < 1 || params.PageSize > 200 {
		params.PageSize = 20
	}
	monitors, totalCount, queryErr := s.repo.List(reqCtx, params)
	if queryErr != nil {
		return nil, 0, fmt.Errorf("list channel monitors: %w", queryErr)
	}
	for idx := 0; idx < len(monitors); idx++ {
		s.decryptInPlace(monitors[idx])
	}
	return monitors, totalCount, nil
}

// Get returns a single monitor with its API key decrypted.
func (s *ChannelMonitorService) Get(reqCtx context.Context, monitorID int64) (*ChannelMonitor, error) {
	mon, fetchErr := s.repo.GetByID(reqCtx, monitorID)
	if fetchErr != nil {
		return nil, fetchErr
	}
	s.decryptInPlace(mon)
	return mon, nil
}

// Create creates a new monitor (encrypts api_key internally).
func (s *ChannelMonitorService) Create(reqCtx context.Context, params ChannelMonitorCreateParams) (*ChannelMonitor, error) {
	if validationErr := validateCreateParams(params); validationErr != nil {
		return nil, validationErr
	}
	if bodyErr := validateBodyModeForProtocol(params.Provider, params.APIMode, params.BodyOverrideMode, params.BodyOverride); bodyErr != nil {
		return nil, bodyErr
	}
	if headerErr := validateExtraHeaders(params.ExtraHeaders); headerErr != nil {
		return nil, headerErr
	}
	cipherKey, encErr := s.encryptor.Encrypt(params.APIKey)
	if encErr != nil {
		return nil, fmt.Errorf("encrypt api key: %w", encErr)
	}
	mon := &ChannelMonitor{
		Name:             strings.TrimSpace(params.Name),
		Provider:         params.Provider,
		APIMode:          defaultAPIMode(params.APIMode),
		Endpoint:         normalizeEndpoint(params.Endpoint),
		APIKey:           cipherKey, // stored as ciphertext in repository
		PrimaryModel:     strings.TrimSpace(params.PrimaryModel),
		ExtraModels:      normalizeModels(params.ExtraModels),
		GroupName:        strings.TrimSpace(params.GroupName),
		Enabled:          params.Enabled,
		IntervalSeconds:  params.IntervalSeconds,
		JitterSeconds:    params.JitterSeconds,
		CreatedBy:        params.CreatedBy,
		TemplateID:       params.TemplateID,
		ExtraHeaders:     emptyHeadersIfNil(params.ExtraHeaders),
		BodyOverrideMode: defaultBodyMode(params.BodyOverrideMode),
		BodyOverride:     params.BodyOverride,
	}
	if createErr := s.repo.Create(reqCtx, mon); createErr != nil {
		return nil, fmt.Errorf("create channel monitor: %w", createErr)
	}
	// Use the known plaintext directly instead of re-decrypting, avoiding the risk
	// of APIKey being silently cleared if decryption fails.
	mon.APIKey = strings.TrimSpace(params.APIKey)
	if s.scheduler != nil {
		s.scheduler.Schedule(mon)
	}
	return mon, nil
}

// validateCreateParams consolidates all Create input validations.
func validateCreateParams(params ChannelMonitorCreateParams) error {
	if provErr := validateProvider(params.Provider); provErr != nil {
		return provErr
	}
	if modeErr := validateAPIMode(params.Provider, params.APIMode); modeErr != nil {
		return modeErr
	}
	if intervalErr := validateInterval(params.IntervalSeconds); intervalErr != nil {
		return intervalErr
	}
	if jitterErr := validateJitter(params.JitterSeconds, params.IntervalSeconds); jitterErr != nil {
		return jitterErr
	}
	if epErr := validateEndpoint(params.Endpoint); epErr != nil {
		return epErr
	}
	if strings.TrimSpace(params.APIKey) == "" {
		return ErrChannelMonitorMissingAPIKey
	}
	if strings.TrimSpace(params.PrimaryModel) == "" {
		return ErrChannelMonitorMissingPrimaryModel
	}
	return nil
}

// Update updates a monitor. APIKey field: nil or empty string = no change; non-empty = encrypt and overwrite.
func (s *ChannelMonitorService) Update(reqCtx context.Context, monitorID int64, params ChannelMonitorUpdateParams) (*ChannelMonitor, error) {
	current, fetchErr := s.repo.GetByID(reqCtx, monitorID)
	if fetchErr != nil {
		return nil, fetchErr
	}
	if mergeErr := applyMonitorUpdate(current, params); mergeErr != nil {
		return nil, mergeErr
	}

	plainKey, keyChanged, keyErr := s.applyAPIKeyUpdate(current, params.APIKey)
	if keyErr != nil {
		return nil, keyErr
	}

	if saveErr := s.repo.Update(reqCtx, current); saveErr != nil {
		return nil, fmt.Errorf("update channel monitor: %w", saveErr)
	}

	// Use known plaintext when key was updated; otherwise decrypt in place.
	// Avoids double-decryption risk consistent with Create.
	if keyChanged {
		current.APIKey = plainKey
	} else {
		s.decryptInPlace(current)
	}
	if s.scheduler != nil {
		// Schedule internally handles Enabled toggle and interval changes
		// (cancels old task + creates new one with updated interval).
		s.scheduler.Schedule(current)
	}
	return current, nil
}

// applyAPIKeyUpdate handles the APIKey field during Update:
//   - raw is nil or blank: no change to existing.APIKey (remains ciphertext), returns updated=false
//   - non-empty: encrypts and writes to existing.APIKey; returns the plaintext for the caller
//     to set back on existing after successful DB write
func (s *ChannelMonitorService) applyAPIKeyUpdate(current *ChannelMonitor, raw *string) (plainKey string, updated bool, opErr error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return "", false, nil
	}
	plainKey = strings.TrimSpace(*raw)
	cipherKey, encErr := s.encryptor.Encrypt(plainKey)
	if encErr != nil {
		return "", false, fmt.Errorf("encrypt api key: %w", encErr)
	}
	current.APIKey = cipherKey
	return plainKey, true, nil
}

// Delete removes a monitor (history is CASCADE-deleted via foreign key).
func (s *ChannelMonitorService) Delete(reqCtx context.Context, monitorID int64) error {
	if delErr := s.repo.Delete(reqCtx, monitorID); delErr != nil {
		return fmt.Errorf("delete channel monitor: %w", delErr)
	}
	if s.scheduler != nil {
		s.scheduler.Unschedule(monitorID)
	}
	return nil
}

// ListHistory returns recent check history for a monitor.
// Empty model returns all models; limit defaults and caps are applied.
func (s *ChannelMonitorService) ListHistory(reqCtx context.Context, monitorID int64, modelFilter string, maxRows int) ([]*ChannelMonitorHistoryEntry, error) {
	if _, fetchErr := s.repo.GetByID(reqCtx, monitorID); fetchErr != nil {
		return nil, fetchErr
	}
	if maxRows <= 0 {
		maxRows = MonitorHistoryDefaultLimit
	}
	if maxRows > MonitorHistoryMaxLimit {
		maxRows = MonitorHistoryMaxLimit
	}
	rows, queryErr := s.repo.ListHistory(reqCtx, monitorID, strings.TrimSpace(modelFilter), maxRows)
	if queryErr != nil {
		return nil, fmt.Errorf("list history: %w", queryErr)
	}
	return rows, nil
}

// ---------- Business logic ----------

// RunCheck synchronously runs checks for a monitor: concurrently checks primary + extra models,
// writes history records, and updates last_checked_at. Returns per-model results.
func (s *ChannelMonitorService) RunCheck(reqCtx context.Context, monitorID int64) ([]*CheckResult, error) {
	mon, fetchErr := s.Get(reqCtx, monitorID) // APIKey already decrypted
	if fetchErr != nil {
		return nil, fetchErr
	}
	if mon.APIKeyDecryptFailed {
		return nil, ErrChannelMonitorAPIKeyDecryptFailed
	}
	checkResults := s.runChecksConcurrent(reqCtx, mon)
	s.persistCheckResults(reqCtx, mon, checkResults)
	return checkResults, nil
}

// persistCheckResults writes check results to history and updates last_checked_at.
// Write failures are logged only, not propagated (MVP: better to return results than block on history).
func (s *ChannelMonitorService) persistCheckResults(reqCtx context.Context, mon *ChannelMonitor, results []*CheckResult) {
	historyRows := make([]*ChannelMonitorHistoryRow, 0, len(results))
	for idx := 0; idx < len(results); idx++ {
		cr := results[idx]
		historyRows = append(historyRows, &ChannelMonitorHistoryRow{
			MonitorID:     mon.ID,
			Model:         cr.Model,
			Status:        cr.Status,
			LatencyMs:     cr.LatencyMs,
			PingLatencyMs: cr.PingLatencyMs,
			Message:       cr.Message,
			CheckedAt:     cr.CheckedAt,
		})
	}
	if insertErr := s.repo.InsertHistoryBatch(reqCtx, historyRows); insertErr != nil {
		slog.Error("channel_monitor: failed to insert history batch",
			"monitor_id", mon.ID, "name", mon.Name, "error", insertErr)
	}
	if markErr := s.repo.MarkChecked(reqCtx, mon.ID, time.Now()); markErr != nil {
		slog.Error("channel_monitor: failed to mark checked",
			"monitor_id", mon.ID, "error", markErr)
	}
}

// runChecksConcurrent runs checks for primary + extra models concurrently.
// errgroup is used only for synchronization; errors are encoded into CheckResult.
func (s *ChannelMonitorService) runChecksConcurrent(reqCtx context.Context, mon *ChannelMonitor) []*CheckResult {
	allModels := make([]string, 0, 1+len(mon.ExtraModels))
	allModels = append(allModels, mon.PrimaryModel)
	allModels = append(allModels, mon.ExtraModels...)
	checkResults := make([]*CheckResult, len(allModels))

	// Single ping shared across all models.
	pingMs := pingEndpointOrigin(reqCtx, mon.Endpoint)

	// All models share the same CheckOptions snapshot.
	checkOpts := &CheckOptions{
		APIMode:          mon.APIMode,
		ExtraHeaders:     mon.ExtraHeaders,
		BodyOverrideMode: mon.BodyOverrideMode,
		BodyOverride:     mon.BodyOverride,
	}

	var grp errgroup.Group
	var resultMu sync.Mutex
	for idx := 0; idx < len(allModels); idx++ {
		pos, modelName := idx, allModels[idx]
		grp.Go(func() error {
			cr := runCheckForModel(reqCtx, mon.Provider, mon.Endpoint, mon.APIKey, modelName, checkOpts)
			cr.PingLatencyMs = pingMs
			resultMu.Lock()
			checkResults[pos] = cr
			resultMu.Unlock()
			return nil
		})
	}
	_ = grp.Wait()
	return checkResults
}

// ---------- Scheduler collaboration ----------

// SetScheduler is called by wire after runner construction to inject the scheduler,
// enabling CRUD operations to synchronize tasks immediately.
// Uses setter injection to avoid service <-> runner dependency cycle.
func (s *ChannelMonitorService) SetScheduler(sched MonitorScheduler) {
	s.scheduler = sched
}

// ListEnabledMonitors returns all enabled monitors with decrypted API keys,
// for the runner to build its initial task table at startup.
func (s *ChannelMonitorService) ListEnabledMonitors(reqCtx context.Context) ([]*ChannelMonitor, error) {
	enabledMonitors, fetchErr := s.repo.ListEnabled(reqCtx)
	if fetchErr != nil {
		return nil, fetchErr
	}
	for idx := 0; idx < len(enabledMonitors); idx++ {
		s.decryptInPlace(enabledMonitors[idx])
	}
	return enabledMonitors, nil
}

// cleanupOldHistory deletes raw history older than monitorHistoryRetentionDays.
// Called by RunDailyMaintenance; SoftDeleteMixin converts DELETE to UPDATE deleted_at.
func (s *ChannelMonitorService) cleanupOldHistory(reqCtx context.Context) error {
	cutoff := time.Now().UTC().AddDate(0, 0, -monitorHistoryRetentionDays)
	removedCount, delErr := s.repo.DeleteHistoryBefore(reqCtx, cutoff)
	if delErr != nil {
		return fmt.Errorf("delete history before %s: %w", cutoff.Format(time.RFC3339), delErr)
	}
	if removedCount > 0 {
		slog.Info("channel_monitor: history cleanup complete",
			"deleted_rows", removedCount, "before", cutoff.Format(time.RFC3339))
	}
	return nil
}

// RunDailyMaintenance performs daily maintenance: aggregates un-aggregated history,
// soft-deletes expired history and rollups.
// Called by OpsCleanupService cron (shared schedule and leader lock).
//
// Idempotency:
//   - watermark prevents re-processing already-aggregated dates
//   - UpsertDailyRollupsFor uses ON CONFLICT DO UPDATE for consistent re-runs
//
// Each step logs on failure but returns nil to allow subsequent steps to proceed.
func (s *ChannelMonitorService) RunDailyMaintenance(reqCtx context.Context) error {
	utcNow := time.Now().UTC()
	todayStart := utcNow.Truncate(24 * time.Hour)

	if aggErr := s.runDailyAggregation(reqCtx, todayStart); aggErr != nil {
		slog.Warn("channel_monitor: maintenance step failed",
			"step", "aggregate", "error", aggErr)
	}
	if histErr := s.cleanupOldHistory(reqCtx); histErr != nil {
		slog.Warn("channel_monitor: maintenance step failed",
			"step", "prune_history", "error", histErr)
	}
	if rollupErr := s.cleanupOldRollups(reqCtx, todayStart); rollupErr != nil {
		slog.Warn("channel_monitor: maintenance step failed",
			"step", "prune_rollups", "error", rollupErr)
	}
	return nil
}

// runDailyAggregation aggregates from watermark+1 through yesterday (UTC).
// First run (nil watermark): backfills from today - monitorRollupRetentionDays.
// Capped at monitorMaintenanceMaxDaysPerRun per invocation to avoid long transactions.
func (s *ChannelMonitorService) runDailyAggregation(reqCtx context.Context, todayStart time.Time) error {
	wmk, wmkErr := s.repo.LoadAggregationWatermark(reqCtx)
	if wmkErr != nil {
		return fmt.Errorf("load watermark: %w", wmkErr)
	}

	aggStart := s.resolveAggregationStart(wmk, todayStart)
	if !aggStart.Before(todayStart) {
		return nil // nothing to aggregate
	}

	dayCount := 0
	cursor := aggStart
	for cursor.Before(todayStart) {
		if dayCount >= monitorMaintenanceMaxDaysPerRun {
			slog.Info("channel_monitor: aggregation capped at max days",
				"max_days", monitorMaintenanceMaxDaysPerRun,
				"next_resume", cursor.Format("2006-01-02"))
			break
		}
		rowsAffected, upsertErr := s.repo.UpsertDailyRollupsFor(reqCtx, cursor)
		if upsertErr != nil {
			return fmt.Errorf("upsert rollups for %s: %w", cursor.Format("2006-01-02"), upsertErr)
		}
		if wmkUpdateErr := s.repo.UpdateAggregationWatermark(reqCtx, cursor); wmkUpdateErr != nil {
			return fmt.Errorf("update watermark to %s: %w", cursor.Format("2006-01-02"), wmkUpdateErr)
		}
		slog.Info("channel_monitor: rollups upserted",
			"date", cursor.Format("2006-01-02"), "affected_rows", rowsAffected)
		dayCount++
		cursor = cursor.Add(24 * time.Hour)
	}
	return nil
}

// resolveAggregationStart computes the aggregation start date:
//   - watermark == nil: today - monitorRollupRetentionDays (initial backfill, max 30 days)
//   - watermark != nil: *watermark + 1 day
func (s *ChannelMonitorService) resolveAggregationStart(wmk *time.Time, todayStart time.Time) time.Time {
	if wmk == nil {
		return todayStart.AddDate(0, 0, -monitorRollupRetentionDays)
	}
	return wmk.UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
}

// cleanupOldRollups soft-deletes daily rollup rows older than monitorRollupRetentionDays.
func (s *ChannelMonitorService) cleanupOldRollups(reqCtx context.Context, todayStart time.Time) error {
	cutoffDate := todayStart.AddDate(0, 0, -monitorRollupRetentionDays)
	removedCount, delErr := s.repo.DeleteRollupsBefore(reqCtx, cutoffDate)
	if delErr != nil {
		return fmt.Errorf("delete rollups before %s: %w", cutoffDate.Format("2006-01-02"), delErr)
	}
	if removedCount > 0 {
		slog.Info("channel_monitor: rollups cleanup complete",
			"deleted_rows", removedCount, "before", cutoffDate.Format("2006-01-02"))
	}
	return nil
}

// ---------- Helpers ----------

// decryptInPlace decrypts ChannelMonitor.APIKey from ciphertext to plaintext.
// On decryption failure, clears the field and sets APIKeyDecryptFailed=true
// (does not return error to avoid blocking list rendering).
// The runner/RunCheck must check this flag and refuse to execute checks.
func (s *ChannelMonitorService) decryptInPlace(mon *ChannelMonitor) {
	if mon == nil || mon.APIKey == "" {
		return
	}
	plainKey, decErr := s.encryptor.Decrypt(mon.APIKey)
	if decErr != nil {
		slog.Warn("channel_monitor: api key decryption failed",
			"monitor_id", mon.ID, "error", decErr)
		mon.APIKey = ""
		mon.APIKeyDecryptFailed = true
		return
	}
	mon.APIKey = plainKey
}

// applyMonitorUpdate applies non-nil update fields to the existing monitor.
// APIKey is handled separately by the caller (requires encryption).
func applyMonitorUpdate(current *ChannelMonitor, params ChannelMonitorUpdateParams) error {
	provChanged := false
	if params.Name != nil {
		current.Name = strings.TrimSpace(*params.Name)
	}
	if params.Provider != nil {
		if provErr := validateProvider(*params.Provider); provErr != nil {
			return provErr
		}
		current.Provider = *params.Provider
		provChanged = true
	}
	if params.Endpoint != nil {
		if epErr := validateEndpoint(*params.Endpoint); epErr != nil {
			return epErr
		}
		current.Endpoint = normalizeEndpoint(*params.Endpoint)
	}
	if params.PrimaryModel != nil {
		current.PrimaryModel = strings.TrimSpace(*params.PrimaryModel)
	}
	if params.ExtraModels != nil {
		current.ExtraModels = normalizeModels(*params.ExtraModels)
	}
	if params.GroupName != nil {
		current.GroupName = strings.TrimSpace(*params.GroupName)
	}
	if params.Enabled != nil {
		current.Enabled = *params.Enabled
	}
	if params.IntervalSeconds != nil {
		if intervalErr := validateInterval(*params.IntervalSeconds); intervalErr != nil {
			return intervalErr
		}
		current.IntervalSeconds = *params.IntervalSeconds
	}
	if params.JitterSeconds != nil {
		current.JitterSeconds = *params.JitterSeconds
	}
	if params.IntervalSeconds != nil || params.JitterSeconds != nil {
		// interval 与 jitter 任一变化都要重算组合约束（interval - jitter >= 下限）。
		if jitterErr := validateJitter(current.JitterSeconds, current.IntervalSeconds); jitterErr != nil {
			return jitterErr
		}
	}
	return applyMonitorAdvancedUpdate(current, params, provChanged)
}

// applyMonitorAdvancedUpdate handles custom request snapshot fields, split from applyMonitorUpdate for length.
func applyMonitorAdvancedUpdate(current *ChannelMonitor, params ChannelMonitorUpdateParams, provChanged bool) error {
	if params.ClearTemplate {
		current.TemplateID = nil
	} else if params.TemplateID != nil {
		tplID := *params.TemplateID
		current.TemplateID = &tplID
	}
	if params.ExtraHeaders != nil {
		if headerErr := validateExtraHeaders(*params.ExtraHeaders); headerErr != nil {
			return headerErr
		}
		current.ExtraHeaders = emptyHeadersIfNil(*params.ExtraHeaders)
	}
	effectiveAPIMode := defaultAPIMode(current.APIMode)
	if params.APIMode != nil {
		effectiveAPIMode = defaultAPIMode(*params.APIMode)
	} else if current.Provider != MonitorProviderOpenAI {
		effectiveAPIMode = MonitorAPIModeChatCompletions
	}
	if modeErr := validateAPIMode(current.Provider, effectiveAPIMode); modeErr != nil {
		return modeErr
	}
	// Body override mode/body validated together, consistent with template logic.
	effectiveBodyMode := current.BodyOverrideMode
	effectiveBody := current.BodyOverride
	if params.BodyOverrideMode != nil {
		effectiveBodyMode = *params.BodyOverrideMode
	}
	if params.BodyOverride != nil {
		effectiveBody = *params.BodyOverride
	}
	if provChanged || params.APIMode != nil || params.BodyOverrideMode != nil || params.BodyOverride != nil {
		if bodyErr := validateBodyModeForProtocol(current.Provider, effectiveAPIMode, effectiveBodyMode, effectiveBody); bodyErr != nil {
			return bodyErr
		}
		current.BodyOverrideMode = defaultBodyMode(effectiveBodyMode)
		current.BodyOverride = effectiveBody
	}
	current.APIMode = effectiveAPIMode
	return nil
}
