package repository

import (
	"context"
	"database/sql"
	"regexp"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

// TestAccountRepository_SetTempUnschedulable_NoRowsAffectedDoesNotWriteOutbox
// 验证 condition-UPDATE 命中 0 行（已被更晚 until 覆盖或软删）时，
// SetTempUnschedulable 提前 return，不再 enqueue scheduler_outbox，
// 避免后台 token 刷新失败 → outbox churn 放大。
func TestAccountRepository_SetTempUnschedulable_NoRowsAffectedDoesNotWriteOutbox(t *testing.T) {
	exec := &recordingSQLExecutor{result: rowsAffectedResult(0)}
	repo := newAccountRepositoryWithSQL(nil, exec, nil, nil)
	until := time.Now().Add(10 * time.Minute)

	err := repo.SetTempUnschedulable(context.Background(), 42, until, "retry")
	require.NoError(t, err)
	require.Len(t, exec.execQueries, 1)
	require.Contains(t, exec.execQueries[0], "UPDATE accounts")
	require.NotContains(t, strings.Join(exec.execQueries, "\n"), "scheduler_outbox",
		"0-row UPDATE 不得再写 scheduler_outbox / 不得触发任何后续 ExecContext")
}

// TestAccountRepository_ListOAuthRefreshCandidates_SQLFilter 锁定 SQL 形状，
// 关键防回归点是 PG 三值逻辑：必须用 (a AND b) IS NOT TRUE 而非 NOT (a AND b)，
// 否则 temp_unschedulable_until=NULL 的健康账号会被静默排除 → access_token
// 到期后批量 401。
func TestAccountRepository_ListOAuthRefreshCandidates_SQLFilter(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	var capturedSQL string
	mock.ExpectQuery("SELECT id").
		WillReturnRows(sqlmock.NewRows([]string{"id"})).
		WillDelayFor(0)

	repo := newAccountRepositoryWithSQL(nil, captureQuerySQL{db: db, captured: &capturedSQL}, nil, nil)

	accounts, err := repo.ListOAuthRefreshCandidates(context.Background())
	require.NoError(t, err)
	require.Empty(t, accounts)

	normalized := normalizeSQLWhitespace(capturedSQL)
	require.Contains(t, normalized, "deleted_at IS NULL")
	require.Contains(t, normalized, "status = 'active'")
	require.Contains(t, normalized, "type = 'oauth'")
	require.Contains(t, normalized, "platform IN ('anthropic', 'openai', 'gemini', 'antigravity')")
	require.Contains(t, normalized, "credentials ? 'refresh_token'")
	require.Contains(t, normalized, "btrim(credentials->>'refresh_token') <> ''")
	require.Contains(t, normalized, "temp_unschedulable_until > NOW()")
	require.Contains(t, normalized, "temp_unschedulable_reason LIKE 'token refresh retry exhausted:%'")
	require.Contains(t, normalized, "IS NOT TRUE",
		"必须用 IS NOT TRUE：PG 三值逻辑下 NOT (a AND b) 会把 NULL 视作非真→排除健康账号")
	require.NotContains(t, normalized, "AND NOT (",
		"严禁回归到 AND NOT (...)：会把 temp_unschedulable_until=NULL 的健康账号默默排除")
	require.Contains(t, normalized, "ORDER BY priority ASC, id ASC")
	require.NotContains(t, normalized, "credentials->>'expires_at'",
		"不应在 SQL 层早筛 expires_at——后台刷新策略由 BackgroundRefreshPolicy 决定")
	require.NoError(t, mock.ExpectationsWereMet())
}

type captureQuerySQL struct {
	db       *sql.DB
	captured *string
}

func (c captureQuerySQL) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return c.db.ExecContext(ctx, query, args...)
}

func (c captureQuerySQL) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if c.captured != nil {
		*c.captured = query
	}
	return c.db.QueryContext(ctx, query, args...)
}

func normalizeSQLWhitespace(s string) string {
	return strings.Join(regexp.MustCompile(`\s+`).Split(strings.TrimSpace(s), -1), " ")
}

type rowsAffectedResult int64

func (r rowsAffectedResult) LastInsertId() (int64, error) { return 0, nil }
func (r rowsAffectedResult) RowsAffected() (int64, error) { return int64(r), nil }

type recordingSQLExecutor struct {
	result      sql.Result
	err         error
	execQueries []string
}

func (e *recordingSQLExecutor) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	e.execQueries = append(e.execQueries, query)
	if e.err != nil {
		return nil, e.err
	}
	return e.result, nil
}

func (e *recordingSQLExecutor) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return nil, sql.ErrNoRows
}
