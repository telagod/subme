package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/telagod/subme/internal/pkg/pagination"
	"github.com/telagod/subme/internal/service"
)

type contentModerationRepository struct {
	db *sql.DB
}

func NewContentModerationRepository(db *sql.DB) service.ContentModerationRepository {
	return &contentModerationRepository{db: db}
}

func (r *contentModerationRepository) CreateLog(ctx context.Context, log *service.ContentModerationLog) error {
	if log == nil {
		return nil
	}

	scoresJSON, marshalErr := json.Marshal(log.CategoryScores)
	if marshalErr != nil {
		return fmt.Errorf("encoding category scores to JSON: %w", marshalErr)
	}
	thresholdsJSON, marshalErr := json.Marshal(log.ThresholdSnapshot)
	if marshalErr != nil {
		return fmt.Errorf("encoding threshold snapshot to JSON: %w", marshalErr)
	}

	var uid any
	if log.UserID != nil {
		uid = *log.UserID
	}
	var kid any
	if log.APIKeyID != nil {
		kid = *log.APIKeyID
	}
	var gid any
	if log.GroupID != nil {
		gid = *log.GroupID
	}
	var latencyVal any
	if log.UpstreamLatencyMS != nil {
		latencyVal = *log.UpstreamLatencyMS
	}

	insertErr := r.db.QueryRowContext(ctx, `
INSERT INTO content_moderation_logs (
    request_id, user_id, user_email, api_key_id, api_key_name, group_id, group_name,
    endpoint, provider, model, mode, action, flagged, highest_category, highest_score,
    category_scores, threshold_snapshot, input_excerpt, upstream_latency_ms, error,
    violation_count, auto_banned, email_sent, queue_delay_ms
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14, $15,
    $16::jsonb, $17::jsonb, $18, $19, $20,
    $21, $22, $23, $24
) RETURNING id, created_at`,
		log.RequestID, uid, log.UserEmail, kid, log.APIKeyName, gid, log.GroupName,
		log.Endpoint, log.Provider, log.Model, log.Mode, log.Action, log.Flagged, log.HighestCategory, log.HighestScore,
		string(scoresJSON), string(thresholdsJSON), log.InputExcerpt, latencyVal, log.Error,
		log.ViolationCount, log.AutoBanned, log.EmailSent, coalesceIntPtr(log.QueueDelayMS),
	).Scan(&log.ID, &log.CreatedAt)
	if insertErr != nil {
		return fmt.Errorf("persisting content moderation log: %w", insertErr)
	}
	return nil
}

func (r *contentModerationRepository) ListLogs(ctx context.Context, filter service.ContentModerationLogFilter) ([]service.ContentModerationLog, *pagination.PaginationResult, error) {
	clauses, filterArgs := composeLogFilterClauses(filter)
	whereFragment := "WHERE " + strings.Join(clauses, " AND ")

	var rowCount int64
	if countErr := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM content_moderation_logs l "+whereFragment, filterArgs...).Scan(&rowCount); countErr != nil {
		return nil, nil, fmt.Errorf("counting content moderation logs: %w", countErr)
	}

	pg := filter.Pagination
	if pg.Page <= 0 {
		pg.Page = 1
	}
	if pg.PageSize <= 0 {
		pg.PageSize = 20
	}
	if pg.PageSize > 100 {
		pg.PageSize = 100
	}

	selectArgs := append([]any{}, filterArgs...)
	selectArgs = append(selectArgs, pg.Limit(), pg.Offset())

	rows, queryErr := r.db.QueryContext(ctx, `
SELECT
    l.id, l.request_id, l.user_id, l.user_email, l.api_key_id, l.api_key_name, l.group_id, l.group_name,
    l.endpoint, l.provider, l.model, l.mode, l.action, l.flagged, l.highest_category, l.highest_score,
    l.category_scores, l.threshold_snapshot, l.input_excerpt, l.upstream_latency_ms, l.error,
    l.violation_count, l.auto_banned, l.email_sent, COALESCE(u.status, ''), l.queue_delay_ms, l.created_at
FROM content_moderation_logs l
LEFT JOIN users u ON u.id = l.user_id `+whereFragment+`
ORDER BY l.created_at DESC, l.id DESC
LIMIT $`+fmt.Sprint(len(selectArgs)-1)+` OFFSET $`+fmt.Sprint(len(selectArgs)),
		selectArgs...,
	)
	if queryErr != nil {
		return nil, nil, fmt.Errorf("querying content moderation logs: %w", queryErr)
	}
	defer func() { _ = rows.Close() }()

	entries := make([]service.ContentModerationLog, 0)
	for rows.Next() {
		var entry service.ContentModerationLog
		var nullUID, nullKeyID, nullGID, nullLatency, nullQueueDelay sql.NullInt64
		var rawScores, rawThresholds []byte

		if scanErr := rows.Scan(
			&entry.ID,
			&entry.RequestID,
			&nullUID,
			&entry.UserEmail,
			&nullKeyID,
			&entry.APIKeyName,
			&nullGID,
			&entry.GroupName,
			&entry.Endpoint,
			&entry.Provider,
			&entry.Model,
			&entry.Mode,
			&entry.Action,
			&entry.Flagged,
			&entry.HighestCategory,
			&entry.HighestScore,
			&rawScores,
			&rawThresholds,
			&entry.InputExcerpt,
			&nullLatency,
			&entry.Error,
			&entry.ViolationCount,
			&entry.AutoBanned,
			&entry.EmailSent,
			&entry.UserStatus,
			&nullQueueDelay,
			&entry.CreatedAt,
		); scanErr != nil {
			return nil, nil, fmt.Errorf("scanning content moderation log row: %w", scanErr)
		}

		if nullUID.Valid {
			val := nullUID.Int64
			entry.UserID = &val
		}
		if nullKeyID.Valid {
			val := nullKeyID.Int64
			entry.APIKeyID = &val
		}
		if nullGID.Valid {
			val := nullGID.Int64
			entry.GroupID = &val
		}
		if nullLatency.Valid {
			val := int(nullLatency.Int64)
			entry.UpstreamLatencyMS = &val
		}
		if nullQueueDelay.Valid {
			val := int(nullQueueDelay.Int64)
			entry.QueueDelayMS = &val
		}

		entry.CategoryScores = map[string]float64{}
		_ = json.Unmarshal(rawScores, &entry.CategoryScores)
		entry.ThresholdSnapshot = map[string]float64{}
		_ = json.Unmarshal(rawThresholds, &entry.ThresholdSnapshot)

		entries = append(entries, entry)
	}
	if iterErr := rows.Err(); iterErr != nil {
		return nil, nil, fmt.Errorf("iterating content moderation log rows: %w", iterErr)
	}

	return entries, paginationResultFromTotal(rowCount, pg), nil
}

func (r *contentModerationRepository) CountFlaggedByUserSince(ctx context.Context, userID int64, since time.Time) (int, error) {
	if userID <= 0 {
		return 0, nil
	}
	var total int
	queryErr := r.db.QueryRowContext(ctx, `
WITH most_recent_ban AS (
    SELECT MAX(created_at) AS at
    FROM content_moderation_logs
    WHERE user_id = $1 AND auto_banned = TRUE
)
SELECT COUNT(*)
FROM content_moderation_logs
WHERE user_id = $1
  AND flagged = TRUE
  AND action <> 'hash_block'
  AND created_at >= $2
  AND created_at > COALESCE((SELECT at FROM most_recent_ban), '-infinity'::timestamptz)
`, userID, since).Scan(&total)
	if queryErr != nil {
		return 0, fmt.Errorf("counting flagged moderation entries for user: %w", queryErr)
	}
	return total, nil
}

func (r *contentModerationRepository) CleanupExpiredLogs(ctx context.Context, hitBefore time.Time, nonHitBefore time.Time) (*service.ContentModerationCleanupResult, error) {
	outcome := &service.ContentModerationCleanupResult{FinishedAt: time.Now()}
	if r == nil || r.db == nil {
		return outcome, nil
	}

	flaggedResult, delErr := r.db.ExecContext(ctx, `
DELETE FROM content_moderation_logs
WHERE flagged = TRUE AND created_at < $1
`, hitBefore)
	if delErr != nil {
		return nil, fmt.Errorf("removing expired flagged moderation logs: %w", delErr)
	}
	outcome.DeletedHit, _ = flaggedResult.RowsAffected()

	cleanResult, delErr := r.db.ExecContext(ctx, `
DELETE FROM content_moderation_logs
WHERE flagged = FALSE AND created_at < $1
`, nonHitBefore)
	if delErr != nil {
		return nil, fmt.Errorf("removing expired clean moderation logs: %w", delErr)
	}
	outcome.DeletedNonHit, _ = cleanResult.RowsAffected()

	outcome.FinishedAt = time.Now()
	return outcome, nil
}

func coalesceIntPtr(ptr *int) any {
	if ptr == nil {
		return nil
	}
	return *ptr
}

func composeLogFilterClauses(filter service.ContentModerationLogFilter) ([]string, []any) {
	predicates := []string{"l.id IS NOT NULL"}
	params := make([]any, 0)

	appendParam := func(template string, val any) {
		params = append(params, val)
		predicates = append(predicates, fmt.Sprintf(template, len(params)))
	}

	switch strings.ToLower(strings.TrimSpace(filter.Result)) {
	case "hit", "flagged":
		predicates = append(predicates, "l.flagged = TRUE")
	case "blocked", "block":
		predicates = append(predicates, "l.action IN ('block', 'keyword_block', 'hash_block')")
	case "pass", "allow":
		predicates = append(predicates, "l.flagged = FALSE AND l.error = ''")
	case "error":
		predicates = append(predicates, "l.error <> ''")
	}

	if filter.GroupID != nil {
		appendParam("l.group_id = $%d", *filter.GroupID)
	}
	if ep := strings.TrimSpace(filter.Endpoint); ep != "" {
		appendParam("l.endpoint = $%d", ep)
	}
	if keyword := strings.TrimSpace(filter.Search); keyword != "" {
		pattern := "%" + keyword + "%"
		params = append(params, pattern, pattern, pattern, pattern, pattern)
		base := len(params) - 4
		predicates = append(predicates, fmt.Sprintf("(l.request_id ILIKE $%d OR l.user_email ILIKE $%d OR l.api_key_name ILIKE $%d OR l.model ILIKE $%d OR l.input_excerpt ILIKE $%d)", base, base+1, base+2, base+3, base+4))
	}
	if filter.From != nil && !filter.From.IsZero() {
		appendParam("l.created_at >= $%d", *filter.From)
	}
	if filter.To != nil && !filter.To.IsZero() {
		appendParam("l.created_at <= $%d", *filter.To)
	}

	return predicates, params
}
