//go:build unit

package repository

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testCredCipher 构造一个启用/禁用写入加密的字段级凭证加解密器。
// 复用同包 aesHexKey/aesTestCfg（见 aes_encryptor_test.go）。
func testCredCipher(t *testing.T, enabled bool) *CredentialCipher {
	t.Helper()
	cfg := aesTestCfg(aesHexKey(32, 0x42))
	cfg.Totp.EncryptionKeyConfigured = enabled
	enc, err := NewAESEncryptor(cfg)
	require.NoError(t, err)
	return NewCredentialCipher(cfg, enc)
}

// credCipherWithKey 用指定填充字节的 key 构造启用的 cipher（用于跨 key 解密失败测试）。
func credCipherWithKey(t *testing.T, b byte) *CredentialCipher {
	t.Helper()
	cfg := aesTestCfg(aesHexKey(32, b))
	cfg.Totp.EncryptionKeyConfigured = true
	enc, err := NewAESEncryptor(cfg)
	require.NoError(t, err)
	return NewCredentialCipher(cfg, enc)
}

// ── 往返：所有敏感键加密后可解密还原 ─────────────────────────────────────────

func TestCredentialCipher_RoundTrip(t *testing.T) {
	c := testCredCipher(t, true)
	in := map[string]any{
		"access_token":          "sk-ant-oat-xxx",
		"refresh_token":         "rt-yyy",
		"id_token":              "id-zzz",
		"api_key":               "sk-test-12345",
		"session_key":           "sess-abc",
		"cookie":                "cookie-blob",
		"aws_secret_access_key": "AWS/SECRET+value",
		"aws_session_token":     "aws-sess-token",
		"service_account_json":  `{"type":"service_account","private_key":"-----BEGIN"}`,
		"service_account":       "svc-acc",
		"private_key":           "-----BEGIN PRIVATE KEY-----",
		// 边界值
		"empty":   "", // 非敏感键，保持
		"unicode": "密钥-令牌-🔑",
	}
	// 把 unicode 放进敏感键验证多字节
	in["api_key"] = "密钥-令牌-🔑"

	enc := c.EncryptMap(in)
	// 每个敏感键都应带前缀且不再是明文
	for _, k := range []string{
		"access_token", "refresh_token", "id_token", "api_key", "session_key",
		"cookie", "aws_secret_access_key", "aws_session_token",
		"service_account_json", "service_account", "private_key",
	} {
		s := enc[k].(string)
		require.True(t, strings.HasPrefix(s, credentialEncPrefixV1), "key %s 应被加密", k)
		require.NotEqual(t, in[k], s, "key %s 密文不应等于明文", k)
	}

	dec := c.DecryptMap(enc)
	for k, v := range in {
		assert.Equal(t, v, dec[k], "key %s 应往返还原", k)
	}
}

func TestCredentialCipher_EmptyStringSensitiveValue(t *testing.T) {
	c := testCredCipher(t, true)
	enc := c.EncryptMap(map[string]any{"api_key": ""})
	require.True(t, strings.HasPrefix(enc["api_key"].(string), credentialEncPrefixV1))
	dec := c.DecryptMap(enc)
	assert.Equal(t, "", dec["api_key"])
}

// ── 非敏感键 / 非 string 值：保持原样 ────────────────────────────────────────

func TestCredentialCipher_SkipsNonSensitive(t *testing.T) {
	c := testCredCipher(t, true)
	modelMapping := map[string]any{"gpt-5": "gpt-5-codex"}
	in := map[string]any{
		"base_url":      "https://api.example.com/v1",
		"oauth_type":    "chatgpt",
		"project_id":    "proj-123",
		"expires_at":    "2030-01-01",
		"model_mapping": modelMapping,
	}
	enc := c.EncryptMap(in)
	assert.Equal(t, "https://api.example.com/v1", enc["base_url"])
	assert.Equal(t, "chatgpt", enc["oauth_type"])
	assert.Equal(t, "proj-123", enc["project_id"])
	assert.Equal(t, "2030-01-01", enc["expires_at"])
	// 嵌套 map 必须保持原样（不破坏 GetModelMapping 指针缓存）
	assert.Equal(t, modelMapping, enc["model_mapping"])
}

func TestCredentialCipher_SkipsNonStringValues(t *testing.T) {
	c := testCredCipher(t, true)
	in := map[string]any{
		"api_key":        123,      // 敏感键但非 string
		"_token_version": int64(7), // 内部字段
		"flag":           true,     // 非敏感非 string
	}
	enc := c.EncryptMap(in)
	assert.Equal(t, 123, enc["api_key"])
	assert.Equal(t, int64(7), enc["_token_version"])
	assert.Equal(t, true, enc["flag"])
}

// ── 向后兼容：无前缀明文 DecryptMap 原样返回 ─────────────────────────────────

func TestCredentialCipher_PlaintextPassthrough(t *testing.T) {
	c := testCredCipher(t, true)
	in := map[string]any{"api_key": "sk-legacy-plaintext", "base_url": "u"}
	dec := c.DecryptMap(in)
	assert.Equal(t, "sk-legacy-plaintext", dec["api_key"])
	assert.Equal(t, "u", dec["base_url"])
}

func TestCredentialCipher_MixedPlaintextAndCiphertext(t *testing.T) {
	c := testCredCipher(t, true)
	// 模拟 lazy 迁移中途：api_key 已加密、refresh_token 仍明文
	enc := c.EncryptMap(map[string]any{"api_key": "new-encrypted"})
	mixed := map[string]any{
		"api_key":       enc["api_key"],     // 密文
		"refresh_token": "legacy-plaintext", // 明文
	}
	dec := c.DecryptMap(mixed)
	assert.Equal(t, "new-encrypted", dec["api_key"])
	assert.Equal(t, "legacy-plaintext", dec["refresh_token"])
}

// ── 幂等：系统密文再加密跳过 ─────────────────────────────────────────────────

func TestCredentialCipher_NoDoubleEncrypt(t *testing.T) {
	c := testCredCipher(t, true)
	once := c.EncryptMap(map[string]any{"api_key": "sk-abc"})
	twice := c.EncryptMap(once)
	assert.Equal(t, once["api_key"], twice["api_key"], "系统密文应幂等跳过")
	// 解密一次即得原文（未被双重加密）
	dec := c.DecryptMap(twice)
	assert.Equal(t, "sk-abc", dec["api_key"])
}

// ── BLINDSPOT-3：客户端伪造 enc:v1: 前缀被剥离后当明文加密 ───────────────────

func TestCredentialCipher_SpoofedPrefixReencrypted(t *testing.T) {
	c := testCredCipher(t, true)
	// 客户端发送伪造前缀（非本系统密文）
	in := map[string]any{"api_key": credentialEncPrefixV1 + "not-real-ciphertext"}
	enc := c.EncryptMap(in)
	// 应被真正加密（解密验证失败 → 剥离前缀 → 重新加密）
	require.True(t, strings.HasPrefix(enc["api_key"].(string), credentialEncPrefixV1))
	require.NotEqual(t, in["api_key"], enc["api_key"], "伪造前缀的值必须被重新加密")
	dec := c.DecryptMap(enc)
	// 剥离伪造前缀后的明文应可还原
	assert.Equal(t, "not-real-ciphertext", dec["api_key"])
}

// ── degrade-safe：未配持久 key 时只读不写密文 ───────────────────────────────

func TestCredentialCipher_DegradeWhenNotConfigured(t *testing.T) {
	disabled := testCredCipher(t, false)
	in := map[string]any{"api_key": "sk-plain"}
	enc := disabled.EncryptMap(in)
	assert.Equal(t, "sk-plain", enc["api_key"], "未配持久 key 不应写密文")

	// 但仍能解密由相同 key 写出的历史密文
	enabled := testCredCipher(t, true)
	historical := enabled.EncryptMap(map[string]any{"api_key": "sk-hist"})
	dec := disabled.DecryptMap(historical) // disabled 同 key，仅 enabled=false
	assert.Equal(t, "sk-hist", dec["api_key"], "禁用写入仍须能读历史密文")
}

// ── 解密失败容错：异 key/损坏密文保留原样不 panic ──────────────────────────

func TestCredentialCipher_DecryptFailureDegrade(t *testing.T) {
	cipherA := credCipherWithKey(t, 0x11)
	cipherB := credCipherWithKey(t, 0x22) // 不同 key
	enc := cipherA.EncryptMap(map[string]any{"api_key": "secret"})
	// 用错误 key 解密：保留密文、不 panic
	require.NotPanics(t, func() {
		dec := cipherB.DecryptMap(enc)
		assert.Equal(t, enc["api_key"], dec["api_key"], "解密失败应保留密文原样")
	})
}

// ── nil-safe：nil receiver / nil 入参 ───────────────────────────────────────

func TestCredentialCipher_NilSafe(t *testing.T) {
	var nilCipher *CredentialCipher
	require.NotPanics(t, func() {
		out := nilCipher.EncryptMap(map[string]any{"api_key": "x"})
		assert.Equal(t, "x", out["api_key"], "nil cipher EncryptMap 原样返回")
		out2 := nilCipher.DecryptMap(map[string]any{"api_key": "x"})
		assert.Equal(t, "x", out2["api_key"], "nil cipher DecryptMap 原样返回")
	})

	c := testCredCipher(t, true)
	assert.Nil(t, c.EncryptMap(nil))
	assert.Nil(t, c.DecryptMap(nil))
}

// ── 不修改入参 ──────────────────────────────────────────────────────────────

func TestCredentialCipher_DoesNotMutateInput(t *testing.T) {
	c := testCredCipher(t, true)
	in := map[string]any{"api_key": "sk-orig"}
	_ = c.EncryptMap(in)
	assert.Equal(t, "sk-orig", in["api_key"], "EncryptMap 不应修改入参")
}
