//go:build unit

package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

// credsPersistRepoUpdater 实现 AccountRepository + accountCredentialsUpdater，
// 用于验证当 repo 同时实现 UpdateCredentials 时走快速路径，而不是 fallback 到 Update。
type credsPersistRepoUpdater struct {
	mockAccountRepoForGemini
	updateCalls            int
	updateCredentialsCalls int
	lastUpdatedAccount     *Account
	lastCredsID            int64
	lastCreds              map[string]any
	updateErr              error
	updateCredsErr         error
}

func (r *credsPersistRepoUpdater) Update(ctx context.Context, account *Account) error {
	r.updateCalls++
	r.lastUpdatedAccount = account
	return r.updateErr
}

func (r *credsPersistRepoUpdater) UpdateCredentials(ctx context.Context, id int64, credentials map[string]any) error {
	r.updateCredentialsCalls++
	r.lastCredsID = id
	r.lastCreds = credentials
	return r.updateCredsErr
}

// credsPersistRepoFallback 仅实现 AccountRepository（不实现 UpdateCredentials），
// 用于验证 fallback 路径调用 repo.Update。
type credsPersistRepoFallback struct {
	mockAccountRepoForGemini
	updateCalls        int
	lastUpdatedAccount *Account
	updateErr          error
}

func (r *credsPersistRepoFallback) Update(ctx context.Context, account *Account) error {
	r.updateCalls++
	r.lastUpdatedAccount = account
	return r.updateErr
}

func TestPersistAccountCredentials_NilGuards(t *testing.T) {
	ctx := context.Background()

	t.Run("nil repo returns nil", func(t *testing.T) {
		// 不应 panic，应静默返回。
		err := persistAccountCredentials(ctx, nil, &Account{ID: 1}, map[string]any{"k": "v"})
		require.NoError(t, err)
	})

	t.Run("nil account returns nil", func(t *testing.T) {
		repo := &credsPersistRepoUpdater{}
		err := persistAccountCredentials(ctx, repo, nil, map[string]any{"k": "v"})
		require.NoError(t, err)
		require.Equal(t, 0, repo.updateCalls)
		require.Equal(t, 0, repo.updateCredentialsCalls)
	})
}

func TestPersistAccountCredentials_PrefersUpdateCredentialsInterface(t *testing.T) {
	ctx := context.Background()
	repo := &credsPersistRepoUpdater{}
	account := &Account{ID: 42, Credentials: map[string]any{"old": "value"}}
	newCreds := map[string]any{"access_token": "tok", "refresh_token": "ref"}

	err := persistAccountCredentials(ctx, repo, account, newCreds)
	require.NoError(t, err)
	require.Equal(t, 1, repo.updateCredentialsCalls,
		"应通过 UpdateCredentials 快速路径写入，避免整账户重写")
	require.Equal(t, 0, repo.updateCalls,
		"不应 fallback 到 Update")
	require.Equal(t, int64(42), repo.lastCredsID)
	require.Equal(t, "tok", repo.lastCreds["access_token"])
	require.Equal(t, "ref", repo.lastCreds["refresh_token"])
}

func TestPersistAccountCredentials_ClonesIncomingMapBeforePersisting(t *testing.T) {
	ctx := context.Background()
	repo := &credsPersistRepoUpdater{}
	account := &Account{ID: 7}
	newCreds := map[string]any{"a": "1", "b": 2}

	err := persistAccountCredentials(ctx, repo, account, newCreds)
	require.NoError(t, err)
	require.Equal(t, int64(7), repo.lastCredsID)
	require.Equal(t, "1", repo.lastCreds["a"])
	require.EqualValues(t, 2, repo.lastCreds["b"])

	// 修改原 map 不应影响 account.Credentials 和 repo 收到的副本。
	newCreds["a"] = "mutated"
	require.Equal(t, "1", account.Credentials["a"],
		"修改入参 map 不应影响 account.Credentials（必须克隆）")
	require.Equal(t, "1", repo.lastCreds["a"],
		"修改入参 map 不应影响传给 repo 的 credentials")
}

func TestPersistAccountCredentials_FallbackToUpdateWhenInterfaceUnsupported(t *testing.T) {
	ctx := context.Background()
	repo := &credsPersistRepoFallback{}
	account := &Account{ID: 99, Credentials: map[string]any{"old": "v"}}
	newCreds := map[string]any{"new": "v2"}

	err := persistAccountCredentials(ctx, repo, account, newCreds)
	require.NoError(t, err)
	require.Equal(t, 1, repo.updateCalls,
		"repo 不实现 UpdateCredentials 时必须 fallback 到 Update(account)")
	require.Same(t, account, repo.lastUpdatedAccount)
	require.Equal(t, "v2", account.Credentials["new"])
	require.NotContains(t, account.Credentials, "old",
		"persistAccountCredentials 应整体替换 credentials")
}

func TestPersistAccountCredentials_PropagatesUpdateCredentialsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("db down")
	repo := &credsPersistRepoUpdater{updateCredsErr: wantErr}
	account := &Account{ID: 1}

	err := persistAccountCredentials(ctx, repo, account, map[string]any{"k": "v"})
	require.ErrorIs(t, err, wantErr)
}

func TestPersistAccountCredentials_PropagatesFallbackUpdateError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("update failed")
	repo := &credsPersistRepoFallback{updateErr: wantErr}
	account := &Account{ID: 1}

	err := persistAccountCredentials(ctx, repo, account, map[string]any{"k": "v"})
	require.ErrorIs(t, err, wantErr)
}

func TestPersistAccountCredentials_NilCredentialsBecomesEmptyMap(t *testing.T) {
	ctx := context.Background()
	repo := &credsPersistRepoUpdater{}
	account := &Account{ID: 1, Credentials: map[string]any{"old": "v"}}

	err := persistAccountCredentials(ctx, repo, account, nil)
	require.NoError(t, err)
	require.NotNil(t, account.Credentials,
		"持久化 nil credentials 后，account.Credentials 应为空 map 而非 nil，防止下游读取 nil map 时 panic")
	require.Len(t, account.Credentials, 0)
	require.NotNil(t, repo.lastCreds)
}

func TestCloneCredentials_NilReturnsEmpty(t *testing.T) {
	out := cloneCredentials(nil)
	require.NotNil(t, out,
		"cloneCredentials(nil) 必须返回非 nil 的空 map，确保下游赋值/写入不 panic")
	require.Len(t, out, 0)
}

func TestCloneCredentials_EmptyReturnsEmpty(t *testing.T) {
	in := map[string]any{}
	out := cloneCredentials(in)
	require.NotNil(t, out)
	require.Len(t, out, 0)
}

func TestCloneCredentials_TopLevelAliasBroken(t *testing.T) {
	in := map[string]any{
		"access_token": "tok",
		"expires_at":   int64(123),
		"nested":       map[string]any{"a": "1"},
	}
	out := cloneCredentials(in)

	out["access_token"] = "changed"
	require.Equal(t, "tok", in["access_token"],
		"顶层键替换不应影响原 map（顶层别名已断开）")

	delete(out, "expires_at")
	require.Contains(t, in, "expires_at",
		"删除 out 中的键不应影响原 map")

	require.Equal(t, len(in), 3, "原 map 长度不应改变")
}
