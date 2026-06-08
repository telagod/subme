//go:build unit

package apikeyhash

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestHash_Deterministic(t *testing.T) {
	a := Hash("sk-test-123")
	b := Hash("sk-test-123")
	if a != b {
		t.Fatalf("Hash 非确定性: %s != %s", a, b)
	}
	if len(a) != 64 {
		t.Fatalf("应为 64 个 hex 字符, 实际 %d", len(a))
	}
}

// TestHash_MatchesLegacyAuthCacheKey 锚定:本包 Hash 与旧 authCacheKey(sha256 hex)同值,
// 保证抽包重构零行为变更、且作为 key_hash 与缓存键同源。
func TestHash_MatchesLegacyAuthCacheKey(t *testing.T) {
	for _, key := range []string{"sk-abc", "sk-" + string(make([]byte, 64)), "自定义-key-中文", ""} {
		sum := sha256.Sum256([]byte(key))
		want := hex.EncodeToString(sum[:])
		if got := Hash(key); got != want {
			t.Fatalf("Hash(%q)=%s, 期望 %s", key, got, want)
		}
	}
}

func TestHash_DifferentKeysDifferentHash(t *testing.T) {
	if Hash("key-a") == Hash("key-b") {
		t.Fatal("不同 key 哈希碰撞")
	}
}
