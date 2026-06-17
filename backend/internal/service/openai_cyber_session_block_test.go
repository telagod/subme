//go:build unit

package service

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSessionBlockStore_MarkAndIs(t *testing.T) {
	s := NewCyberSessionBlockStore()
	require.False(t, s.IsSessionBlocked("sess-a", 1), "fresh store: nothing blocked")

	s.MarkSessionBlocked("sess-a", 1)
	require.True(t, s.IsSessionBlocked("sess-a", 1))

	// 跨账号隔离：相同 session 不同账号不互相影响。
	require.False(t, s.IsSessionBlocked("sess-a", 2))
	// 跨 session 隔离：同账号不同 session 不互相影响。
	require.False(t, s.IsSessionBlocked("sess-b", 1))
}

func TestSessionBlockStore_Clear(t *testing.T) {
	s := NewCyberSessionBlockStore()
	s.MarkSessionBlocked("sess-x", 7)
	require.True(t, s.IsSessionBlocked("sess-x", 7))
	s.ClearSessionBlock("sess-x", 7)
	require.False(t, s.IsSessionBlocked("sess-x", 7))
}

func TestSessionBlockStore_TTLExpiry(t *testing.T) {
	s := NewCyberSessionBlockStore()
	s.SetTTL(50 * time.Millisecond)

	// 用伪时间源精确测试 TTL 行为，避免依赖真实 sleep 的稳定性。
	base := time.Now()
	current := base
	var mu sync.Mutex
	s.SetNowFn(func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		return current
	})

	s.MarkSessionBlocked("sess-ttl", 3)
	require.True(t, s.IsSessionBlocked("sess-ttl", 3))

	// 推进到 TTL 之前：仍 blocked。
	mu.Lock()
	current = base.Add(40 * time.Millisecond)
	mu.Unlock()
	require.True(t, s.IsSessionBlocked("sess-ttl", 3))

	// 推进到 TTL 之后：lazy-expire 应清掉。
	mu.Lock()
	current = base.Add(60 * time.Millisecond)
	mu.Unlock()
	require.False(t, s.IsSessionBlocked("sess-ttl", 3), "expired entry must be invisible")
}

func TestSessionBlockStore_Reap(t *testing.T) {
	s := NewCyberSessionBlockStore()
	s.SetTTL(20 * time.Millisecond)

	base := time.Now()
	current := base
	var mu sync.Mutex
	s.SetNowFn(func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		return current
	})

	s.MarkSessionBlocked("s1", 1)
	s.MarkSessionBlocked("s2", 2)
	s.MarkSessionBlocked("s3", 3)

	// 推进到 TTL 之后，主动 Reap 应清掉所有 entry。
	mu.Lock()
	current = base.Add(50 * time.Millisecond)
	mu.Unlock()
	s.Reap()
	require.False(t, s.IsSessionBlocked("s1", 1))
	require.False(t, s.IsSessionBlocked("s2", 2))
	require.False(t, s.IsSessionBlocked("s3", 3))
}

func TestSessionBlockStore_DefensiveInputs(t *testing.T) {
	s := NewCyberSessionBlockStore()
	// 空 sessionID / 非正 accountID 视为 no-op。
	s.MarkSessionBlocked("", 1)
	require.False(t, s.IsSessionBlocked("", 1))

	s.MarkSessionBlocked("nonzero", 0)
	require.False(t, s.IsSessionBlocked("nonzero", 0))

	s.MarkSessionBlocked("nonzero", -1)
	require.False(t, s.IsSessionBlocked("nonzero", -1))

	// nil receiver 安全。
	var nilStore *CyberSessionBlockStore
	require.NotPanics(t, func() {
		nilStore.MarkSessionBlocked("x", 1)
		_ = nilStore.IsSessionBlocked("x", 1)
		nilStore.ClearSessionBlock("x", 1)
		nilStore.Reap()
	})
	require.False(t, nilStore.IsSessionBlocked("x", 1))
}

func TestSessionBlockStore_DefaultSingleton(t *testing.T) {
	// 包级 store 永不返回 nil；其他模块据此安全调用。
	s := DefaultCyberSessionBlockStore()
	require.NotNil(t, s)

	// 测试不污染默认 store：用唯一 key 后立即清理。
	const key = "test-default-only"
	s.MarkSessionBlocked(key, 99999999)
	require.True(t, s.IsSessionBlocked(key, 99999999))
	s.ClearSessionBlock(key, 99999999)
	require.False(t, s.IsSessionBlocked(key, 99999999))
}

func TestParseCyberPolicyBanExcludedAccounts(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []int64
	}{
		{"empty", "", []int64{}},
		{"valid array", "[1,2,3]", []int64{1, 2, 3}},
		{"filters non-positive", "[1,0,-5,7]", []int64{1, 7}},
		{"invalid json", "{not json}", []int64{}},
		{"wrong type", `{"foo":"bar"}`, []int64{}},
		{"whitespace only", "   ", []int64{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			set := parseCyberPolicyBanExcludedAccounts(tc.raw)
			// set 内容与 want 一致（顺序无关）。
			require.Equal(t, len(tc.want), len(set), "size mismatch")
			for _, id := range tc.want {
				_, ok := set[id]
				require.True(t, ok, "expected id %d in set", id)
			}
		})
	}
}
