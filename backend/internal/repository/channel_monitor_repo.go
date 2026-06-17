package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/channelmonitor"
	"github.com/telagod/subme/ent/channelmonitorhistory"
	"github.com/telagod/subme/internal/service"
)

// channelMonitorRepository implements service.ChannelMonitorRepository.
//
// Design notes:
//   - Standard CRUD operations use ent for transactional context reuse.
//   - Aggregate queries (latest per model, availability) use raw SQL to
//     avoid ent's GROUP BY boilerplate and ensure proper index usage.
type channelMonitorRepository struct {
	client *dbent.Client
	db     *sql.DB
}

// NewChannelMonitorRepository constructs a new repository instance.
func NewChannelMonitorRepository(client *dbent.Client, db *sql.DB) service.ChannelMonitorRepository {
	return &channelMonitorRepository{client: client, db: db}
}

// ---------- CRUD ----------

func (repo *channelMonitorRepository) Create(ctx context.Context, m *service.ChannelMonitor) error {
	dbClient := clientFromContext(ctx, repo.client)
	builder := dbClient.ChannelMonitor.Create().
		SetName(m.Name).
		SetProvider(channelmonitor.Provider(m.Provider)).
		SetAPIMode(fallbackAPIMode(m.APIMode)).
		SetEndpoint(m.Endpoint).
		SetAPIKeyEncrypted(m.APIKey). // Caller passes pre-encrypted ciphertext.
		SetPrimaryModel(m.PrimaryModel).
		SetExtraModels(coalesceStringSlice(m.ExtraModels)).
		SetGroupName(m.GroupName).
		SetEnabled(m.Enabled).
		SetIntervalSeconds(m.IntervalSeconds).
		SetJitterSeconds(m.JitterSeconds).
		SetCreatedBy(m.CreatedBy).
		SetExtraHeaders(coalesceHeadersMap(m.ExtraHeaders)).
		SetBodyOverrideMode(fallbackBodyMode(m.BodyOverrideMode))
	if m.TemplateID != nil {
		builder = builder.SetTemplateID(*m.TemplateID)
	}
	if m.BodyOverride != nil {
		builder = builder.SetBodyOverride(m.BodyOverride)
	}

	saved, saveErr := builder.Save(ctx)
	if saveErr != nil {
		return translatePersistenceError(saveErr, service.ErrChannelMonitorNotFound, nil)
	}
	m.ID = saved.ID
	m.CreatedAt = saved.CreatedAt
	m.UpdatedAt = saved.UpdatedAt
	return nil
}

func (repo *channelMonitorRepository) GetByID(ctx context.Context, id int64) (*service.ChannelMonitor, error) {
	entity, queryErr := repo.client.ChannelMonitor.Query().
		Where(channelmonitor.IDEQ(id)).
		Only(ctx)
	if queryErr != nil {
		return nil, translatePersistenceError(queryErr, service.ErrChannelMonitorNotFound, nil)
	}
	return convertEntMonitorToService(entity), nil
}

func (repo *channelMonitorRepository) Update(ctx context.Context, m *service.ChannelMonitor) error {
	dbClient := clientFromContext(ctx, repo.client)
	updater := dbClient.ChannelMonitor.UpdateOneID(m.ID).
		SetName(m.Name).
		SetProvider(channelmonitor.Provider(m.Provider)).
		SetAPIMode(fallbackAPIMode(m.APIMode)).
		SetEndpoint(m.Endpoint).
		SetAPIKeyEncrypted(m.APIKey).
		SetPrimaryModel(m.PrimaryModel).
		SetExtraModels(coalesceStringSlice(m.ExtraModels)).
		SetGroupName(m.GroupName).
		SetEnabled(m.Enabled).
		SetIntervalSeconds(m.IntervalSeconds).
		SetJitterSeconds(m.JitterSeconds).
		SetExtraHeaders(coalesceHeadersMap(m.ExtraHeaders)).
		SetBodyOverrideMode(fallbackBodyMode(m.BodyOverrideMode))
	if m.TemplateID != nil {
		updater = updater.SetTemplateID(*m.TemplateID)
	} else {
		updater = updater.ClearTemplateID()
	}
	if m.BodyOverride != nil {
		updater = updater.SetBodyOverride(m.BodyOverride)
	} else {
		updater = updater.ClearBodyOverride()
	}

	saved, saveErr := updater.Save(ctx)
	if saveErr != nil {
		return translatePersistenceError(saveErr, service.ErrChannelMonitorNotFound, nil)
	}
	m.UpdatedAt = saved.UpdatedAt
	return nil
}

func (repo *channelMonitorRepository) Delete(ctx context.Context, id int64) error {
	dbClient := clientFromContext(ctx, repo.client)
	if delErr := dbClient.ChannelMonitor.DeleteOneID(id).Exec(ctx); delErr != nil {
		return translatePersistenceError(delErr, service.ErrChannelMonitorNotFound, nil)
	}
	return nil
}

func (repo *channelMonitorRepository) List(ctx context.Context, params service.ChannelMonitorListParams) ([]*service.ChannelMonitor, int64, error) {
	query := repo.client.ChannelMonitor.Query()
	if params.Provider != "" {
		query = query.Where(channelmonitor.ProviderEQ(channelmonitor.Provider(params.Provider)))
	}
	if params.Enabled != nil {
		query = query.Where(channelmonitor.EnabledEQ(*params.Enabled))
	}
	if trimmed := strings.TrimSpace(params.Search); trimmed != "" {
		query = query.Where(channelmonitor.Or(
			channelmonitor.NameContainsFold(trimmed),
			channelmonitor.GroupNameContainsFold(trimmed),
			channelmonitor.PrimaryModelContainsFold(trimmed),
		))
	}

	totalCount, countErr := query.Count(ctx)
	if countErr != nil {
		return nil, 0, fmt.Errorf("failed to count monitor records: %w", countErr)
	}

	perPage := params.PageSize
	if perPage <= 0 {
		perPage = 20
	}
	currentPage := params.Page
	if currentPage <= 0 {
		currentPage = 1
	}

	entities, listErr := query.
		Order(dbent.Desc(channelmonitor.FieldID)).
		Offset((currentPage - 1) * perPage).
		Limit(perPage).
		All(ctx)
	if listErr != nil {
		return nil, 0, fmt.Errorf("failed to list monitor records: %w", listErr)
	}

	monitors := make([]*service.ChannelMonitor, 0, len(entities))
	for _, ent := range entities {
		monitors = append(monitors, convertEntMonitorToService(ent))
	}
	return monitors, int64(totalCount), nil
}

// ---------- Scheduler helpers ----------

func (repo *channelMonitorRepository) ListEnabled(ctx context.Context) ([]*service.ChannelMonitor, error) {
	entities, queryErr := repo.client.ChannelMonitor.Query().
		Where(channelmonitor.EnabledEQ(true)).
		All(ctx)
	if queryErr != nil {
		return nil, fmt.Errorf("failed to query enabled monitors: %w", queryErr)
	}
	monitors := make([]*service.ChannelMonitor, 0, len(entities))
	for _, ent := range entities {
		monitors = append(monitors, convertEntMonitorToService(ent))
	}
	return monitors, nil
}

func (repo *channelMonitorRepository) MarkChecked(ctx context.Context, id int64, checkedAt time.Time) error {
	dbClient := clientFromContext(ctx, repo.client)
	if updErr := dbClient.ChannelMonitor.UpdateOneID(id).
		SetLastCheckedAt(checkedAt).
		Exec(ctx); updErr != nil {
		return translatePersistenceError(updErr, service.ErrChannelMonitorNotFound, nil)
	}
	return nil
}

func (repo *channelMonitorRepository) InsertHistoryBatch(ctx context.Context, rows []*service.ChannelMonitorHistoryRow) error {
	if len(rows) == 0 {
		return nil
	}
	dbClient := clientFromContext(ctx, repo.client)
	creators := make([]*dbent.ChannelMonitorHistoryCreate, 0, len(rows))
	for _, hr := range rows {
		builder := dbClient.ChannelMonitorHistory.Create().
			SetMonitorID(hr.MonitorID).
			SetModel(hr.Model).
			SetStatus(channelmonitorhistory.Status(hr.Status)).
			SetMessage(hr.Message).
			SetCheckedAt(hr.CheckedAt)
		if hr.LatencyMs != nil {
			builder = builder.SetLatencyMs(*hr.LatencyMs)
		}
		if hr.PingLatencyMs != nil {
			builder = builder.SetPingLatencyMs(*hr.PingLatencyMs)
		}
		creators = append(creators, builder)
	}
	if _, bulkErr := dbClient.ChannelMonitorHistory.CreateBulk(creators...).Save(ctx); bulkErr != nil {
		return fmt.Errorf("bulk insert of history records failed: %w", bulkErr)
	}
	return nil
}

// DeleteHistoryBefore removes history rows where checked_at < before in batches
// to avoid prolonged lock contention and WAL pressure.
func (repo *channelMonitorRepository) DeleteHistoryBefore(ctx context.Context, before time.Time) (int64, error) {
	return pruneMonitorRowsBatched(ctx, repo.db, historyPruneSQL, before)
}

// ListHistory returns the most recent N history entries for a monitor, ordered
// by checked_at descending. When model is non-empty, results are filtered to
// that specific model only.
func (repo *channelMonitorRepository) ListHistory(ctx context.Context, monitorID int64, model string, limit int) ([]*service.ChannelMonitorHistoryEntry, error) {
	query := repo.client.ChannelMonitorHistory.Query().
		Where(channelmonitorhistory.MonitorIDEQ(monitorID))
	if strings.TrimSpace(model) != "" {
		query = query.Where(channelmonitorhistory.ModelEQ(model))
	}
	entities, queryErr := query.
		Order(dbent.Desc(channelmonitorhistory.FieldCheckedAt)).
		Limit(limit).
		All(ctx)
	if queryErr != nil {
		return nil, fmt.Errorf("failed to retrieve history entries: %w", queryErr)
	}
	entries := make([]*service.ChannelMonitorHistoryEntry, 0, len(entities))
	for _, ent := range entities {
		entries = append(entries, &service.ChannelMonitorHistoryEntry{
			ID:            ent.ID,
			Model:         ent.Model,
			Status:        string(ent.Status),
			LatencyMs:     ent.LatencyMs,
			PingLatencyMs: ent.PingLatencyMs,
			Message:       ent.Message,
			CheckedAt:     ent.CheckedAt,
		})
	}
	return entries, nil
}

// ---------- User-facing aggregation views (raw SQL) ----------

// ListLatestPerModel returns the most recent record for each model within a
// single monitor, using Postgres DISTINCT ON for efficient index-only scans.
func (repo *channelMonitorRepository) ListLatestPerModel(ctx context.Context, monitorID int64) ([]*service.ChannelMonitorLatest, error) {
	const stmt = `
		SELECT DISTINCT ON (model)
		    model, status, latency_ms, ping_latency_ms, checked_at
		FROM channel_monitor_histories
		WHERE monitor_id = $1
		ORDER BY model, checked_at DESC
	`
	sqlRows, queryErr := repo.db.QueryContext(ctx, stmt, monitorID)
	if queryErr != nil {
		return nil, fmt.Errorf("latest-per-model query failed: %w", queryErr)
	}
	defer func() { _ = sqlRows.Close() }()

	items := make([]*service.ChannelMonitorLatest, 0)
	for sqlRows.Next() {
		item := &service.ChannelMonitorLatest{}
		var rawLatency, rawPing sql.NullInt64
		if scanErr := sqlRows.Scan(&item.Model, &item.Status, &rawLatency, &rawPing, &item.CheckedAt); scanErr != nil {
			return nil, fmt.Errorf("failed to scan latest-per-model row: %w", scanErr)
		}
		unwrapNullableInt(&item.LatencyMs, rawLatency)
		unwrapNullableInt(&item.PingLatencyMs, rawPing)
		items = append(items, item)
	}
	return items, sqlRows.Err()
}

// unwrapNullableInt assigns the value from a sql.NullInt64 to a *int pointer
// target, allocating only when the source is valid.
func unwrapNullableInt(target **int, src sql.NullInt64) {
	if !src.Valid {
		return
	}
	val := int(src.Int64)
	*target = &val
}

// ComputeAvailability calculates per-model availability percentage and average
// latency within the specified time window.
// "Available" is defined as status IN (operational, degraded).
func (repo *channelMonitorRepository) ComputeAvailability(ctx context.Context, monitorID int64, windowDays int) ([]*service.ChannelMonitorAvailability, error) {
	if windowDays <= 0 {
		windowDays = 7
	}
	const stmt = `
		SELECT model,
		       COUNT(*)                                                             AS total,
		       COUNT(*) FILTER (WHERE status IN ('operational','degraded'))         AS ok,
		       CASE WHEN COUNT(latency_ms) > 0
		            THEN SUM(latency_ms) FILTER (WHERE latency_ms IS NOT NULL)::float8 / COUNT(latency_ms)
		            ELSE NULL END                                                   AS avg_latency_ms
		FROM channel_monitor_histories
		WHERE monitor_id = $1
		  AND checked_at >= NOW() - ($2::int || ' days')::interval
		GROUP BY model
	`
	sqlRows, queryErr := repo.db.QueryContext(ctx, stmt, monitorID, windowDays)
	if queryErr != nil {
		return nil, fmt.Errorf("availability computation query failed: %w", queryErr)
	}
	defer func() { _ = sqlRows.Close() }()

	results := make([]*service.ChannelMonitorAvailability, 0)
	for sqlRows.Next() {
		avail, scanErr := parseAvailabilityRow(sqlRows, windowDays)
		if scanErr != nil {
			return nil, scanErr
		}
		results = append(results, avail)
	}
	return results, sqlRows.Err()
}

// parseAvailabilityRow scans a single (model, total, ok, avg_latency) row into
// a ChannelMonitorAvailability struct. Used by the single-monitor variant.
func parseAvailabilityRow(scanner interface{ Scan(...any) error }, windowDays int) (*service.ChannelMonitorAvailability, error) {
	avail := &service.ChannelMonitorAvailability{WindowDays: windowDays}
	var rawAvgLatency sql.NullFloat64
	if scanErr := scanner.Scan(&avail.Model, &avail.TotalChecks, &avail.OperationalChecks, &rawAvgLatency); scanErr != nil {
		return nil, fmt.Errorf("failed to scan availability row: %w", scanErr)
	}
	computeAvailabilityMetrics(avail, rawAvgLatency)
	return avail, nil
}

// computeAvailabilityMetrics derives the availability percentage and unpacks
// the nullable average latency into the result struct.
func computeAvailabilityMetrics(avail *service.ChannelMonitorAvailability, rawAvgLatency sql.NullFloat64) {
	if avail.TotalChecks > 0 {
		avail.AvailabilityPct = float64(avail.OperationalChecks) * 100.0 / float64(avail.TotalChecks)
	}
	if rawAvgLatency.Valid {
		rounded := int(rawAvgLatency.Float64)
		avail.AvgLatencyMs = &rounded
	}
}

// ListLatestForMonitorIDs fetches the most recent record per (monitor_id, model)
// for multiple monitors in a single query using DISTINCT ON.
func (repo *channelMonitorRepository) ListLatestForMonitorIDs(ctx context.Context, ids []int64) (map[int64][]*service.ChannelMonitorLatest, error) {
	resultMap := make(map[int64][]*service.ChannelMonitorLatest, len(ids))
	if len(ids) == 0 {
		return resultMap, nil
	}
	const stmt = `
		SELECT DISTINCT ON (monitor_id, model)
		    monitor_id, model, status, latency_ms, ping_latency_ms, checked_at
		FROM channel_monitor_histories
		WHERE monitor_id = ANY($1)
		ORDER BY monitor_id, model, checked_at DESC
	`
	sqlRows, queryErr := repo.db.QueryContext(ctx, stmt, pq.Array(ids))
	if queryErr != nil {
		return nil, fmt.Errorf("batch latest query failed: %w", queryErr)
	}
	defer func() { _ = sqlRows.Close() }()

	for sqlRows.Next() {
		var mid int64
		item := &service.ChannelMonitorLatest{}
		var rawLatency, rawPing sql.NullInt64
		if scanErr := sqlRows.Scan(&mid, &item.Model, &item.Status, &rawLatency, &rawPing, &item.CheckedAt); scanErr != nil {
			return nil, fmt.Errorf("failed to scan batch latest row: %w", scanErr)
		}
		unwrapNullableInt(&item.LatencyMs, rawLatency)
		unwrapNullableInt(&item.PingLatencyMs, rawPing)
		resultMap[mid] = append(resultMap[mid], item)
	}
	if iterErr := sqlRows.Err(); iterErr != nil {
		return nil, iterErr
	}
	return resultMap, nil
}

// ListRecentHistoryForMonitors retrieves the most recent N history entries per
// monitor, filtered by each monitor's primary model. Uses a CTE with unnest
// for the (monitor_id, model) whitelist and ROW_NUMBER() windowing.
//
// Returns map[monitorID] -> entries (without message field to reduce payload).
// Empty inputs return an empty map without error.
func (repo *channelMonitorRepository) ListRecentHistoryForMonitors(
	ctx context.Context,
	ids []int64,
	primaryModels map[int64]string,
	perMonitorLimit int,
) (map[int64][]*service.ChannelMonitorHistoryEntry, error) {
	resultMap := make(map[int64][]*service.ChannelMonitorHistoryEntry, len(ids))
	monitorIDs, modelNames := assembleMonitorModelPairs(ids, primaryModels)
	if len(monitorIDs) == 0 {
		return resultMap, nil
	}
	perMonitorLimit = constrainTimelineDepth(perMonitorLimit)

	const stmt = `
		WITH targets AS (
		    SELECT unnest($1::bigint[]) AS monitor_id,
		           unnest($2::text[])   AS model
		),
		ranked AS (
		    SELECT h.monitor_id,
		           h.status,
		           h.latency_ms,
		           h.ping_latency_ms,
		           h.checked_at,
		           ROW_NUMBER() OVER (PARTITION BY h.monitor_id ORDER BY h.checked_at DESC) AS rn
		    FROM channel_monitor_histories h
		    JOIN targets t
		      ON t.monitor_id = h.monitor_id AND t.model = h.model
		)
		SELECT monitor_id, status, latency_ms, ping_latency_ms, checked_at
		FROM ranked
		WHERE rn <= $3
		ORDER BY monitor_id, checked_at DESC
	`
	sqlRows, queryErr := repo.db.QueryContext(ctx, stmt, pq.Array(monitorIDs), pq.Array(modelNames), perMonitorLimit)
	if queryErr != nil {
		return nil, fmt.Errorf("batch recent history query failed: %w", queryErr)
	}
	defer func() { _ = sqlRows.Close() }()

	for sqlRows.Next() {
		var mid int64
		histEntry := &service.ChannelMonitorHistoryEntry{}
		var rawLatency, rawPing sql.NullInt64
		if scanErr := sqlRows.Scan(&mid, &histEntry.Status, &rawLatency, &rawPing, &histEntry.CheckedAt); scanErr != nil {
			return nil, fmt.Errorf("failed to scan recent history row: %w", scanErr)
		}
		unwrapNullableInt(&histEntry.LatencyMs, rawLatency)
		unwrapNullableInt(&histEntry.PingLatencyMs, rawPing)
		resultMap[mid] = append(resultMap[mid], histEntry)
	}
	if iterErr := sqlRows.Err(); iterErr != nil {
		return nil, iterErr
	}
	return resultMap, nil
}

// assembleMonitorModelPairs filters the ID list against the primary models map
// to produce paired slices suitable for SQL unnest.
func assembleMonitorModelPairs(ids []int64, primaryModels map[int64]string) ([]int64, []string) {
	if len(ids) == 0 || len(primaryModels) == 0 {
		return nil, nil
	}
	filteredIDs := make([]int64, 0, len(ids))
	filteredModels := make([]string, 0, len(ids))
	for _, mid := range ids {
		modelName, found := primaryModels[mid]
		if !found || strings.TrimSpace(modelName) == "" {
			continue
		}
		filteredIDs = append(filteredIDs, mid)
		filteredModels = append(filteredModels, modelName)
	}
	return filteredIDs, filteredModels
}

// Bounds for per-monitor timeline limit clamping.
const (
	timelineLimitMin = 1
	timelineLimitMax = 200
)

// constrainTimelineDepth clamps the per-monitor limit to [timelineLimitMin, timelineLimitMax].
func constrainTimelineDepth(n int) int {
	if n < timelineLimitMin {
		return timelineLimitMin
	}
	if n > timelineLimitMax {
		return timelineLimitMax
	}
	return n
}

// ComputeAvailabilityForMonitors calculates per-model availability for multiple
// monitors in a single query. Uses the detail table directly for windows <= 30 days.
func (repo *channelMonitorRepository) ComputeAvailabilityForMonitors(ctx context.Context, ids []int64, windowDays int) (map[int64][]*service.ChannelMonitorAvailability, error) {
	resultMap := make(map[int64][]*service.ChannelMonitorAvailability, len(ids))
	if len(ids) == 0 {
		return resultMap, nil
	}
	if windowDays <= 0 {
		windowDays = 7
	}
	const stmt = `
		SELECT monitor_id,
		       model,
		       COUNT(*)                                                             AS total,
		       COUNT(*) FILTER (WHERE status IN ('operational','degraded'))         AS ok,
		       CASE WHEN COUNT(latency_ms) > 0
		            THEN SUM(latency_ms) FILTER (WHERE latency_ms IS NOT NULL)::float8 / COUNT(latency_ms)
		            ELSE NULL END                                                   AS avg_latency_ms
		FROM channel_monitor_histories
		WHERE monitor_id = ANY($1)
		  AND checked_at >= NOW() - ($2::int || ' days')::interval
		GROUP BY monitor_id, model
	`
	sqlRows, queryErr := repo.db.QueryContext(ctx, stmt, pq.Array(ids), windowDays)
	if queryErr != nil {
		return nil, fmt.Errorf("batch availability computation failed: %w", queryErr)
	}
	defer func() { _ = sqlRows.Close() }()

	for sqlRows.Next() {
		var mid int64
		avail := &service.ChannelMonitorAvailability{WindowDays: windowDays}
		var rawAvgLatency sql.NullFloat64
		if scanErr := sqlRows.Scan(&mid, &avail.Model, &avail.TotalChecks, &avail.OperationalChecks, &rawAvgLatency); scanErr != nil {
			return nil, fmt.Errorf("failed to scan batch availability row: %w", scanErr)
		}
		computeAvailabilityMetrics(avail, rawAvgLatency)
		resultMap[mid] = append(resultMap[mid], avail)
	}
	if iterErr := sqlRows.Err(); iterErr != nil {
		return nil, iterErr
	}
	return resultMap, nil
}

// ---------- Aggregation maintenance ----------

// UpsertDailyRollupsFor aggregates the detail rows for targetDate into the
// daily rollup table using ON CONFLICT for idempotent back-fill.
func (repo *channelMonitorRepository) UpsertDailyRollupsFor(ctx context.Context, targetDate time.Time) (int64, error) {
	const stmt = `
		INSERT INTO channel_monitor_daily_rollups (
		    monitor_id, model, bucket_date,
		    total_checks, ok_count,
		    operational_count, degraded_count, failed_count, error_count,
		    sum_latency_ms, count_latency,
		    sum_ping_latency_ms, count_ping_latency,
		    computed_at
		)
		SELECT
		    monitor_id,
		    model,
		    $1::date AS bucket_date,
		    COUNT(*)                                                         AS total_checks,
		    COUNT(*) FILTER (WHERE status IN ('operational','degraded'))     AS ok_count,
		    COUNT(*) FILTER (WHERE status = 'operational')                   AS operational_count,
		    COUNT(*) FILTER (WHERE status = 'degraded')                      AS degraded_count,
		    COUNT(*) FILTER (WHERE status = 'failed')                        AS failed_count,
		    COUNT(*) FILTER (WHERE status = 'error')                         AS error_count,
		    COALESCE(SUM(latency_ms) FILTER (WHERE latency_ms IS NOT NULL), 0)             AS sum_latency_ms,
		    COUNT(latency_ms)                                                AS count_latency,
		    COALESCE(SUM(ping_latency_ms) FILTER (WHERE ping_latency_ms IS NOT NULL), 0)   AS sum_ping_latency_ms,
		    COUNT(ping_latency_ms)                                           AS count_ping_latency,
		    NOW()
		FROM channel_monitor_histories
		WHERE checked_at >= $1::date
		  AND checked_at <  ($1::date + INTERVAL '1 day')
		GROUP BY monitor_id, model
		ON CONFLICT (monitor_id, model, bucket_date) DO UPDATE SET
		    total_checks        = EXCLUDED.total_checks,
		    ok_count            = EXCLUDED.ok_count,
		    operational_count   = EXCLUDED.operational_count,
		    degraded_count      = EXCLUDED.degraded_count,
		    failed_count        = EXCLUDED.failed_count,
		    error_count         = EXCLUDED.error_count,
		    sum_latency_ms      = EXCLUDED.sum_latency_ms,
		    count_latency       = EXCLUDED.count_latency,
		    sum_ping_latency_ms = EXCLUDED.sum_ping_latency_ms,
		    count_ping_latency  = EXCLUDED.count_ping_latency,
		    computed_at         = NOW()
	`
	execResult, execErr := repo.db.ExecContext(ctx, stmt, targetDate)
	if execErr != nil {
		return 0, fmt.Errorf("daily rollup upsert for %s failed: %w", targetDate.Format("2006-01-02"), execErr)
	}
	affected, affErr := execResult.RowsAffected()
	if affErr != nil {
		return 0, fmt.Errorf("unable to determine rows affected by rollup upsert: %w", affErr)
	}
	return affected, nil
}

// DeleteRollupsBefore removes rollup rows where bucket_date < beforeDate in batches.
func (repo *channelMonitorRepository) DeleteRollupsBefore(ctx context.Context, beforeDate time.Time) (int64, error) {
	return pruneMonitorRowsBatched(ctx, repo.db, rollupPruneSQL, beforeDate)
}

// pruneBatchCeiling is the maximum number of rows deleted per batch to avoid
// long transactions and WAL accumulation.
const pruneBatchCeiling = 5000

// historyPruneSQL deletes expired detail rows in small batches by ID.
const historyPruneSQL = `
WITH batch AS (
    SELECT id FROM channel_monitor_histories
    WHERE checked_at < $1
    ORDER BY id
    LIMIT $2
)
DELETE FROM channel_monitor_histories
WHERE id IN (SELECT id FROM batch)
`

// rollupPruneSQL deletes expired rollup rows in small batches. The ::date cast
// ensures consistent comparison with the DATE column type.
const rollupPruneSQL = `
WITH batch AS (
    SELECT id FROM channel_monitor_daily_rollups
    WHERE bucket_date < $1::date
    ORDER BY id
    LIMIT $2
)
DELETE FROM channel_monitor_daily_rollups
WHERE id IN (SELECT id FROM batch)
`

// pruneMonitorRowsBatched loops a batched DELETE until zero rows are affected,
// returning the cumulative count of removed rows.
func pruneMonitorRowsBatched(ctx context.Context, db *sql.DB, stmt string, cutoff time.Time) (int64, error) {
	var cumulative int64
	for {
		execResult, execErr := db.ExecContext(ctx, stmt, cutoff, pruneBatchCeiling)
		if execErr != nil {
			return cumulative, fmt.Errorf("monitor prune batch execution failed: %w", execErr)
		}
		affected, affErr := execResult.RowsAffected()
		if affErr != nil {
			return cumulative, fmt.Errorf("unable to determine rows affected in prune batch: %w", affErr)
		}
		cumulative += affected
		if affected == 0 {
			break
		}
	}
	return cumulative, nil
}

// LoadAggregationWatermark reads the single-row watermark table (id=1).
// Returns (nil, nil) when no row exists or last_aggregated_date is NULL.
func (repo *channelMonitorRepository) LoadAggregationWatermark(ctx context.Context) (*time.Time, error) {
	const stmt = `SELECT last_aggregated_date FROM channel_monitor_aggregation_watermark WHERE id = 1`
	var scanned sql.NullTime
	if scanErr := repo.db.QueryRowContext(ctx, stmt).Scan(&scanned); scanErr != nil {
		if scanErr == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("watermark load failed: %w", scanErr)
	}
	if !scanned.Valid {
		return nil, nil
	}
	return &scanned.Time, nil
}

// UpdateAggregationWatermark upserts the watermark row (id=1) with the given date.
func (repo *channelMonitorRepository) UpdateAggregationWatermark(ctx context.Context, date time.Time) error {
	const stmt = `
		INSERT INTO channel_monitor_aggregation_watermark (id, last_aggregated_date, updated_at)
		VALUES (1, $1::date, NOW())
		ON CONFLICT (id) DO UPDATE SET
		    last_aggregated_date = EXCLUDED.last_aggregated_date,
		    updated_at           = NOW()
	`
	if _, execErr := repo.db.ExecContext(ctx, stmt, date); execErr != nil {
		return fmt.Errorf("watermark update failed: %w", execErr)
	}
	return nil
}

// ---------- Conversion helpers ----------

// convertEntMonitorToService maps an ent entity to the service-layer struct.
func convertEntMonitorToService(entity *dbent.ChannelMonitor) *service.ChannelMonitor {
	if entity == nil {
		return nil
	}
	modelList := entity.ExtraModels
	if modelList == nil {
		modelList = []string{}
	}
	headerMap := entity.ExtraHeaders
	if headerMap == nil {
		headerMap = map[string]string{}
	}
	svc := &service.ChannelMonitor{
		ID:               entity.ID,
		Name:             entity.Name,
		Provider:         string(entity.Provider),
		APIMode:          fallbackAPIMode(entity.APIMode),
		Endpoint:         entity.Endpoint,
		APIKey:           entity.APIKeyEncrypted, // Still ciphertext; service layer handles decryption.
		PrimaryModel:     entity.PrimaryModel,
		ExtraModels:      modelList,
		GroupName:        entity.GroupName,
		Enabled:          entity.Enabled,
		IntervalSeconds:  entity.IntervalSeconds,
		JitterSeconds:    entity.JitterSeconds,
		LastCheckedAt:    entity.LastCheckedAt,
		CreatedBy:        entity.CreatedBy,
		CreatedAt:        entity.CreatedAt,
		UpdatedAt:        entity.UpdatedAt,
		ExtraHeaders:     headerMap,
		BodyOverrideMode: entity.BodyOverrideMode,
		BodyOverride:     entity.BodyOverride,
	}
	if entity.TemplateID != nil {
		tid := *entity.TemplateID
		svc.TemplateID = &tid
	}
	return svc
}

// coalesceHeadersMap returns an empty map when the input is nil,
// avoiding null JSON serialization.
func coalesceHeadersMap(h map[string]string) map[string]string {
	if h == nil {
		return map[string]string{}
	}
	return h
}

// emptyHeadersIfNilRepo is kept as a package-level alias.
func emptyHeadersIfNilRepo(h map[string]string) map[string]string {
	return coalesceHeadersMap(h)
}

// fallbackBodyMode normalizes an empty body override mode to "off".
func fallbackBodyMode(mode string) string {
	if mode == "" {
		return "off"
	}
	return mode
}

// defaultBodyModeRepo is kept as a package-level alias.
func defaultBodyModeRepo(mode string) string {
	return fallbackBodyMode(mode)
}

// fallbackAPIMode normalizes an empty API mode to the default "chat_completions".
func fallbackAPIMode(apiMode string) string {
	if apiMode == "" {
		return "chat_completions"
	}
	return apiMode
}

// defaultAPIModeRepo is kept as a package-level alias.
func defaultAPIModeRepo(apiMode string) string {
	return fallbackAPIMode(apiMode)
}

// coalesceStringSlice returns an empty slice when the input is nil.
func coalesceStringSlice(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}
