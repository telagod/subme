//go:build unit

package service

import (
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// AntigravityTokenRefresher 实现了 TokenRefresher 接口，本测试覆盖其纯逻辑：
//   - CanRefresh：平台 + 类型守卫
//   - NeedsRefresh：15 分钟提前刷新窗口边界
//   - CacheKey：project_id 优先，fallback 到账号 ID
// Refresh 涉及外部 HTTP / DB 调用，由集成测试覆盖。

func TestAntigravityTokenRefresher_CanRefresh(t *testing.T) {
	r := NewAntigravityTokenRefresher(nil)

	tests := []struct {
		name     string
		account  *Account
		wantCanR bool
	}{
		{
			name:     "antigravity + oauth allowed",
			account:  &Account{Platform: PlatformAntigravity, Type: AccountTypeOAuth},
			wantCanR: true,
		},
		{
			name:     "antigravity + non-oauth rejected (上游 api_key 账户不应被这个 refresher 刷新)",
			account:  &Account{Platform: PlatformAntigravity, Type: AccountTypeUpstream},
			wantCanR: false,
		},
		{
			name:     "other platform + oauth rejected",
			account:  &Account{Platform: PlatformAnthropic, Type: AccountTypeOAuth},
			wantCanR: false,
		},
		{
			name:     "other platform + non-oauth rejected",
			account:  &Account{Platform: PlatformOpenAI, Type: AccountTypeUpstream},
			wantCanR: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.wantCanR, r.CanRefresh(tt.account))
		})
	}
}

func TestAntigravityTokenRefresher_NeedsRefresh_WindowBoundaries(t *testing.T) {
	r := NewAntigravityTokenRefresher(nil)
	base := func(expiresAt *time.Time) *Account {
		creds := map[string]any{}
		if expiresAt != nil {
			creds["expires_at"] = strconv.FormatInt(expiresAt.Unix(), 10)
		}
		return &Account{
			ID:          1,
			Platform:    PlatformAntigravity,
			Type:        AccountTypeOAuth,
			Credentials: creds,
		}
	}

	now := time.Now()

	t.Run("expired token needs refresh", func(t *testing.T) {
		past := now.Add(-1 * time.Hour)
		require.True(t, r.NeedsRefresh(base(&past), 0))
	})

	t.Run("within 15-minute window needs refresh", func(t *testing.T) {
		soon := now.Add(10 * time.Minute)
		require.True(t, r.NeedsRefresh(base(&soon), 0),
			"距离过期 10 分钟（<15min 窗口）应触发刷新")
	})

	t.Run("just at edge of 15-minute window (14m59s) needs refresh", func(t *testing.T) {
		soon := now.Add(14*time.Minute + 59*time.Second)
		require.True(t, r.NeedsRefresh(base(&soon), 0))
	})

	t.Run("outside window (1h ahead) does not need refresh", func(t *testing.T) {
		future := now.Add(time.Hour)
		require.False(t, r.NeedsRefresh(base(&future), 0))
	})

	t.Run("nil expires_at credential does not need refresh", func(t *testing.T) {
		// 没有 expires_at 时无法判断窗口，应静默放过避免误触发
		// 后台风暴式刷新。
		require.False(t, r.NeedsRefresh(base(nil), 0))
	})

	t.Run("non-antigravity account never needs refresh", func(t *testing.T) {
		// CanRefresh 守卫优先：即便 expires_at 早已过期，
		// 也不应对非 antigravity 账号返回 true。
		past := now.Add(-1 * time.Hour)
		acc := base(&past)
		acc.Platform = PlatformOpenAI
		require.False(t, r.NeedsRefresh(acc, 0))
	})

	t.Run("ignores externally provided window duration", func(t *testing.T) {
		// 文档明确说 Antigravity 使用固定 15min，第二个参数应被忽略。
		// 提供一个 1 小时的窗口，但 token 30 分钟才过期 → 仍不应触发。
		future := now.Add(30 * time.Minute)
		require.False(t, r.NeedsRefresh(base(&future), 2*time.Hour),
			"Antigravity refresher 必须使用固定 15min 窗口而非全局配置")
	})
}

func TestAntigravityTokenRefresher_CacheKey_PrefersProjectID(t *testing.T) {
	r := NewAntigravityTokenRefresher(nil)

	t.Run("project_id 存在时优先（多账号共享同 project 时复用刷新锁）", func(t *testing.T) {
		acc := &Account{
			ID: 42,
			Credentials: map[string]any{
				"project_id": "my-gcp-project",
			},
		}
		require.Equal(t, "ag:my-gcp-project", r.CacheKey(acc))
	})

	t.Run("project_id 缺失时 fallback 到 account ID", func(t *testing.T) {
		acc := &Account{
			ID:          77,
			Credentials: map[string]any{},
		}
		require.Equal(t, "ag:account:77", r.CacheKey(acc))
	})

	t.Run("project_id 为空字符串时 fallback 到 account ID", func(t *testing.T) {
		acc := &Account{
			ID: 88,
			Credentials: map[string]any{
				"project_id": "",
			},
		}
		require.Equal(t, "ag:account:88", r.CacheKey(acc))
	})

	t.Run("project_id 只有空白时仍 fallback（防止 ag: + 空白前缀脏键）", func(t *testing.T) {
		acc := &Account{
			ID: 99,
			Credentials: map[string]any{
				"project_id": "   ",
			},
		}
		require.Equal(t, "ag:account:99", r.CacheKey(acc))
	})
}

// 验证 Refresh 中关于 project_id 保留与 MergeCredentials 的语义。
// Refresh 本体涉及外部 HTTP，因此这里直接测试它依赖的两个纯函数：
//   - MergeCredentials：旧值在新值缺失时保留
//   - 当 tokenInfo.ProjectID 为空字符串时，refresher 用 fallback 到旧 project_id
//
// 这两条语义如果回归，会导致 LoadCodeAssist 暂时失败时 project_id 被擦除，
// 进而 Antigravity 调用全部 401。
func TestMergeCredentials_PreservesOldFieldsWhenNewMissing(t *testing.T) {
	old := map[string]any{
		"project_id": "proj-123",
		"email":      "user@example.com",
		"plan_type":  "PRO",
		"old_only":   "kept",
	}
	new_ := map[string]any{
		"access_token":  "new-token",
		"refresh_token": "new-refresh",
		"expires_at":    "9999",
		"email":         "user@example.com",
	}

	merged := MergeCredentials(old, new_)

	// 新值覆盖：access_token / refresh_token / expires_at 来自 new
	require.Equal(t, "new-token", merged["access_token"])
	require.Equal(t, "new-refresh", merged["refresh_token"])
	require.Equal(t, "9999", merged["expires_at"])

	// 旧值在新 map 中缺失时保留：project_id、plan_type、old_only
	require.Equal(t, "proj-123", merged["project_id"],
		"MergeCredentials 必须保留旧 project_id，否则 LoadCodeAssist 临时失败将 wipe 关键身份信息")
	require.Equal(t, "PRO", merged["plan_type"])
	require.Equal(t, "kept", merged["old_only"])

	// 新值已存在则保留新值（即便旧值也有）
	require.Equal(t, "user@example.com", merged["email"])
}

func TestMergeCredentials_NilNewBecomesEmptyMap(t *testing.T) {
	old := map[string]any{"project_id": "p1"}
	merged := MergeCredentials(old, nil)
	require.NotNil(t, merged)
	require.Equal(t, "p1", merged["project_id"])
}

func TestMergeCredentials_NilOldReturnsNewUnchanged(t *testing.T) {
	new_ := map[string]any{"access_token": "tok"}
	merged := MergeCredentials(nil, new_)
	require.NotNil(t, merged)
	require.Equal(t, "tok", merged["access_token"])
}
