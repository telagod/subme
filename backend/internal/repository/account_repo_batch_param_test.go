//go:build unit

// account_repo_batch_param_test.go 校验 accountsToService 在大账号集合下
// 不会触发 PG 扩展协议 65535 参数上限：通过自定义 sql/driver 在 query 参数
// 超过 65535 时返回 `extended_protocol_limit_exceeded` 类错误，
// 真分批实现下应 ≥2 批且每批 ≤ 65535 参数，整体通过。
package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"io"
	"sync"
	"testing"

	dbent "github.com/telagod/subme/ent"
	_ "github.com/telagod/subme/ent/runtime"
	"github.com/telagod/subme/internal/service"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/stretchr/testify/require"
)

const parameterLimitTestDriverName = "subme_param_limit_test"

var registerParameterLimitTestDriverOnce sync.Once

// TestAccountsToService_LargeActiveAccountSetDoesNotExceedPostgresParameterLimit
// 用 65536 个账号（刚好超过单批 65535 上限）走 accountsToService，
// 内部 loadProxies / loadAccountGroups 必须分批：任一批 IDIn 参数 > 65535
// 自定义 driver 会返回 pq 风格错误并使测试失败。
func TestAccountsToService_LargeActiveAccountSetDoesNotExceedPostgresParameterLimit(t *testing.T) {
	repo := newParameterLimitAccountRepo(t)

	const total = 65536
	accounts := make([]*dbent.Account, 0, total)
	proxyID := int64(1)
	for i := range total {
		// 每个账号挂一个 proxy_id，确保 loadProxies 路径也吃满参数上限。
		pid := proxyID
		accounts = append(accounts, &dbent.Account{
			ID:          int64(i + 1),
			Name:        "large-active",
			Platform:    service.PlatformOpenAI,
			Type:        service.AccountTypeOAuth,
			Credentials: map[string]any{},
			Extra:       map[string]any{},
			Status:      service.StatusActive,
			Schedulable: true,
			ProxyID:     &pid,
		})
		proxyID++
	}

	got, err := repo.accountsToService(context.Background(), accounts)
	require.NoError(t, err)
	require.Len(t, got, len(accounts))
}

// TestUniquePositiveInt64s_DedupAndFilter 覆盖 helper：保持顺序、去重、剔除非正。
func TestUniquePositiveInt64s_DedupAndFilter(t *testing.T) {
	cases := []struct {
		name string
		in   []int64
		want []int64
	}{
		{name: "nil", in: nil, want: nil},
		{name: "empty", in: []int64{}, want: nil},
		{name: "drop zero and negative", in: []int64{0, -1, 2, -3, 4}, want: []int64{2, 4}},
		{name: "dedup preserving order", in: []int64{3, 1, 3, 2, 1}, want: []int64{3, 1, 2}},
		{name: "all positive unique", in: []int64{1, 2, 3}, want: []int64{1, 2, 3}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, uniquePositiveInt64s(tc.in))
		})
	}
}

// newParameterLimitAccountRepo 构造一个绑定参数上限校验 driver 的 *accountRepository。
// schedulerCache / cipher 可为 nil（DecryptMap / SchedulerCache 调用路径均 nil-safe）。
func newParameterLimitAccountRepo(t *testing.T) *accountRepository {
	t.Helper()

	registerParameterLimitTestDriverOnce.Do(func() {
		sql.Register(parameterLimitTestDriverName, parameterLimitDriver{})
	})

	db, err := sql.Open(parameterLimitTestDriverName, "")
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	drv := entsql.OpenDB(dialect.Postgres, db)
	client := dbent.NewClient(dbent.Driver(drv))
	t.Cleanup(func() { _ = client.Close() })

	return newAccountRepositoryWithSQL(client, nil, nil, nil)
}

// parameterLimitDriver 是仅用于本测试的 sql/driver 实现：
// 在 query 绑定参数数 > 65535 时返回错误，模拟 PG 扩展协议参数上限。
type parameterLimitDriver struct{}

func (parameterLimitDriver) Open(string) (driver.Conn, error) {
	return parameterLimitConn{}, nil
}

type parameterLimitConn struct{}

func (parameterLimitConn) Prepare(query string) (driver.Stmt, error) {
	return parameterLimitStmt{query: query}, nil
}

func (parameterLimitConn) Close() error {
	return nil
}

func (parameterLimitConn) Begin() (driver.Tx, error) {
	return parameterLimitTx{}, nil
}

func (parameterLimitConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	return queryWithParameterLimit(query, args)
}

type parameterLimitStmt struct {
	query string
}

func (s parameterLimitStmt) Close() error {
	return nil
}

func (s parameterLimitStmt) NumInput() int {
	return -1
}

func (s parameterLimitStmt) Exec(args []driver.Value) (driver.Result, error) {
	return driver.RowsAffected(0), parameterLimitError(len(args))
}

func (s parameterLimitStmt) Query(args []driver.Value) (driver.Rows, error) {
	namedArgs := make([]driver.NamedValue, len(args))
	for i, arg := range args {
		namedArgs[i] = driver.NamedValue{Ordinal: i + 1, Value: arg}
	}
	return queryWithParameterLimit(s.query, namedArgs)
}

type parameterLimitTx struct{}

func (parameterLimitTx) Commit() error {
	return nil
}

func (parameterLimitTx) Rollback() error {
	return nil
}

func queryWithParameterLimit(query string, args []driver.NamedValue) (driver.Rows, error) {
	if err := parameterLimitError(len(args)); err != nil {
		return nil, err
	}
	return parameterLimitRows{columns: columnsForParameterLimitQuery(query)}, nil
}

func parameterLimitError(paramCount int) error {
	if paramCount <= 65535 {
		return nil
	}
	return fmt.Errorf("pq: got %d parameters but PostgreSQL only supports 65535 parameters", paramCount)
}

func columnsForParameterLimitQuery(query string) []string {
	if query == "" {
		return nil
	}
	// 返回一个无关紧要的列集合 + EOF 行——读路径仅关心 err，不解析数据。
	return []string{"account_id", "group_id", "priority", "created_at"}
}

type parameterLimitRows struct {
	columns []string
}

func (r parameterLimitRows) Columns() []string {
	return r.columns
}

func (parameterLimitRows) Close() error {
	return nil
}

func (parameterLimitRows) Next([]driver.Value) error {
	return io.EOF
}
