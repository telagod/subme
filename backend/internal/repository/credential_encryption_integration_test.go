//go:build integration

package repository

import (
	"context"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

// credEncCfg 构造一个启用持久加密密钥的最小 Config。
func credEncCfg() *config.Config {
	cfg := &config.Config{}
	cfg.Totp.EncryptionKey = strings.Repeat("ab", 32) // 64 hex = 32 bytes
	cfg.Totp.EncryptionKeyConfigured = true
	return cfg
}

func newCredEncCipher(t *testing.T) *CredentialCipher {
	t.Helper()
	enc, err := NewAESEncryptor(credEncCfg())
	require.NoError(t, err)
	return NewCredentialCipher(credEncCfg(), enc)
}

// TestCredentials_EncryptedAtRest_DecryptedOnRead 验证 DB 层字段级加密端到端往返：
//   - Create 后直查 ent.Account.Credentials：敏感键密文(enc:v1:)、非敏感键明文。
//   - GetByID 读出：敏感键解密还原。
func TestCredentials_EncryptedAtRest_DecryptedOnRead(t *testing.T) {
	ctx := context.Background()
	tx := testEntTx(t)
	client := tx.Client()
	repo := newAccountRepositoryWithSQL(client, tx, nil, newCredEncCipher(t))

	acc := &service.Account{
		Name:     "enc-roundtrip",
		Platform: service.PlatformOpenAI,
		Type:     service.AccountTypeAPIKey,
		Status:   service.StatusActive,
		Credentials: map[string]any{
			"api_key":       "sk-secret-xyz",
			"refresh_token": "rt-secret",
			"base_url":      "https://api.example.com/v1",           // 非敏感
			"model_mapping": map[string]any{"gpt-5": "gpt-5-codex"}, // 嵌套，不加密
		},
		Extra:       map[string]any{},
		Concurrency: 3,
		Priority:    50,
		Schedulable: true,
	}
	require.NoError(t, repo.Create(ctx, acc))
	require.NotZero(t, acc.ID)

	// 直查 ent：敏感键应为密文，非敏感键保持明文。
	raw, err := client.Account.Get(ctx, acc.ID)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(raw.Credentials["api_key"].(string), credentialEncPrefixV1),
		"api_key 应密文存储, got %v", raw.Credentials["api_key"])
	require.True(t, strings.HasPrefix(raw.Credentials["refresh_token"].(string), credentialEncPrefixV1),
		"refresh_token 应密文存储")
	require.Equal(t, "https://api.example.com/v1", raw.Credentials["base_url"], "非敏感键应明文")
	require.Equal(t, map[string]any{"gpt-5": "gpt-5-codex"}, raw.Credentials["model_mapping"], "嵌套 map 应明文")

	// GetByID 读出：敏感键解密还原。
	got, err := repo.GetByID(ctx, acc.ID)
	require.NoError(t, err)
	require.Equal(t, "sk-secret-xyz", got.Credentials["api_key"])
	require.Equal(t, "rt-secret", got.Credentials["refresh_token"])
	require.Equal(t, "https://api.example.com/v1", got.Credentials["base_url"])
}

// TestCredentials_DegradeWhenKeyNotConfigured 验证未配持久 key 时写明文（degrade-safe）。
func TestCredentials_DegradeWhenKeyNotConfigured(t *testing.T) {
	ctx := context.Background()
	tx := testEntTx(t)
	client := tx.Client()

	cfg := credEncCfg()
	cfg.Totp.EncryptionKeyConfigured = false // 自动生成的易失 key
	enc, err := NewAESEncryptor(cfg)
	require.NoError(t, err)
	repo := newAccountRepositoryWithSQL(client, tx, nil, NewCredentialCipher(cfg, enc))

	acc := &service.Account{
		Name:        "degrade-plain",
		Platform:    service.PlatformOpenAI,
		Type:        service.AccountTypeAPIKey,
		Status:      service.StatusActive,
		Credentials: map[string]any{"api_key": "sk-plain-degrade"},
		Extra:       map[string]any{},
		Concurrency: 3,
		Priority:    50,
		Schedulable: true,
	}
	require.NoError(t, repo.Create(ctx, acc))

	raw, err := client.Account.Get(ctx, acc.ID)
	require.NoError(t, err)
	require.Equal(t, "sk-plain-degrade", raw.Credentials["api_key"], "未配持久 key 应写明文")
}

// TestCredentials_BackwardCompatPlaintextRead 验证读取历史明文凭证（向后兼容）。
func TestCredentials_BackwardCompatPlaintextRead(t *testing.T) {
	ctx := context.Background()
	tx := testEntTx(t)
	client := tx.Client()

	// 用裸 ent 写入明文凭证，模拟加密上线前的存量数据。
	created, err := client.Account.Create().
		SetName("legacy-plain").
		SetPlatform(service.PlatformOpenAI).
		SetType(service.AccountTypeAPIKey).
		SetStatus(service.StatusActive).
		SetCredentials(map[string]any{"api_key": "sk-legacy-plain"}).
		SetExtra(map[string]any{}).
		Save(ctx)
	require.NoError(t, err)

	repo := newAccountRepositoryWithSQL(client, tx, nil, newCredEncCipher(t))
	got, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "sk-legacy-plain", got.Credentials["api_key"], "历史明文应原样读出")
}

// TestSchedulerSnapshot_CredentialsEncryptedInRedis 验证 Redis 快照层 R1 加密往返：
//   - SetAccount 后直读 Redis：敏感键密文、原文不出现。
//   - GetAccount 读出：解密还原。
func TestSchedulerSnapshot_CredentialsEncryptedInRedis(t *testing.T) {
	ctx := context.Background()
	rdb := testRedis(t)
	cache := NewSchedulerCache(rdb)

	// Redis 路径用包级 cipher（生产由 NewAccountRepository 设置）。
	setPkgCredentialCipher(newCredEncCipher(t))
	defer setPkgCredentialCipher(nil)

	acc := service.Account{
		ID:       555,
		Name:     "redis-enc",
		Platform: service.PlatformOpenAI,
		Type:     service.AccountTypeAPIKey,
		Status:   service.StatusActive,
		Credentials: map[string]any{
			"api_key":  "sk-redis-secret",
			"base_url": "https://u.example.com",
		},
		Extra: map[string]any{},
	}
	require.NoError(t, cache.SetAccount(ctx, &acc))

	// 直读 Redis acc 层：敏感原文不应出现，应为密文。
	rawAcc, err := rdb.Get(ctx, schedulerAccountKey("555")).Result()
	require.NoError(t, err)
	require.Contains(t, rawAcc, credentialEncPrefixV1, "acc 层 api_key 应密文")
	require.NotContains(t, rawAcc, "sk-redis-secret", "acc 层不应出现明文 api_key")

	// 直读 Redis meta 层：filterSchedulerCredentials 保留的 api_key 也应密文。
	rawMeta, err := rdb.Get(ctx, schedulerAccountMetaKey("555")).Result()
	require.NoError(t, err)
	require.NotContains(t, rawMeta, "sk-redis-secret", "meta 层不应出现明文 api_key")

	// GetAccount 读出：解密还原。
	got, err := cache.GetAccount(ctx, 555)
	require.NoError(t, err)
	require.Equal(t, "sk-redis-secret", got.Credentials["api_key"])
	require.Equal(t, "https://u.example.com", got.Credentials["base_url"])
}
