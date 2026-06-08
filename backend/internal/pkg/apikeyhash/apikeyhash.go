// Package apikeyhash 提供 API Key 的确定性哈希,用作认证 lookup 索引与缓存键。
//
// 采用 SHA-256 而非 bcrypt/argon2:API key 是高熵随机值(sk- + 256bit 随机),
// 不存在彩虹表/暴力破解风险,无需慢哈希;且认证是每请求热路径,确定性哈希才能
// 建唯一索引、做等值查询。这是 GitHub/Stripe 风格 token 的行业标准做法。
//
// 关键不变量:DB 列 api_keys.key_hash 与认证缓存键必须**同源**——都用本包 Hash,
// 杜绝两处各写一份 sha256 导致迁移/认证不一致。
package apikeyhash

import (
	"crypto/sha256"
	"encoding/hex"
)

// Hash 返回 key 的 hex(sha256),固定 64 个十六进制字符。
func Hash(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}
