package service

import (
	"strconv"
	"sync"
	"time"
)

// cyber_policy phase-2: WS 多轮 session-block 基础设施。
//
// 当 OpenAI WS 多轮某个 (sessionID, accountID) 组合被上游标记为 cyber_policy blocked，
// 后续 multi-turn 帧应直接早返 Blocked 而非继续打上游，避免触发更严厉的账号级冷却。
//
// 当前 batch 仅落基础设施（Mark / Is / Clear + TTL + 测试）；与 openai_ws_v2 包的
// 实际接入留 phase-3 follow-up——因为 openai_ws_v2 是 frame-level passthrough relay，
// 不持有 gin.Context / Account 上下文，需要在 caddy_adapter / RunEntry 入口注入额外
// 元数据，本 batch scope 内未触达。
//
// 设计约束：
//   - O(1) 读路径（sync.Map）；写路径同样 O(1) 不持锁过 hot path。
//   - 过期清理走惰性策略：Is/Mark 时 inline check TTL；后台 reaper 简化为可选。
//   - key 命名固定 "{accountID}|{sessionID}"，避免 sessionID 含管道符的极端边界
//     与拼接歧义——sessionID 由上游分配，目前未见 "|" 字符。
//
// TTL 默认 10 min（上游 phase-2 常用值；可通过 SetCyberSessionBlockTTL 调整测试 hook）。

const defaultCyberSessionBlockTTL = 10 * time.Minute

// CyberSessionBlockStore 是一个线程安全、TTL 驱动的会话级阻断缓存。
type CyberSessionBlockStore struct {
	entries sync.Map // map[string]int64 (key → expiresAtUnixNano)
	ttl     int64    // atomic-ish (单次写 SetTTL，无并发竞争场景；rarely changed)
	nowFn   func() time.Time
}

// NewCyberSessionBlockStore 构造默认 TTL store。
func NewCyberSessionBlockStore() *CyberSessionBlockStore {
	return &CyberSessionBlockStore{
		ttl:   int64(defaultCyberSessionBlockTTL),
		nowFn: time.Now,
	}
}

// SetTTL 修改 TTL；仅测试 / 启动期调用。
func (s *CyberSessionBlockStore) SetTTL(ttl time.Duration) {
	if ttl <= 0 {
		return
	}
	s.ttl = int64(ttl)
}

// SetNowFn 注入伪时间源；仅测试用。
func (s *CyberSessionBlockStore) SetNowFn(fn func() time.Time) {
	if fn != nil {
		s.nowFn = fn
	}
}

func (s *CyberSessionBlockStore) ttlDuration() time.Duration {
	if s.ttl <= 0 {
		return defaultCyberSessionBlockTTL
	}
	return time.Duration(s.ttl)
}

func (s *CyberSessionBlockStore) now() time.Time {
	if s.nowFn != nil {
		return s.nowFn()
	}
	return time.Now()
}

// cyberSessionBlockKey 构造内部 key。account_id 在前避免同 session 跨账号串扰。
func cyberSessionBlockKey(sessionID string, accountID int64) string {
	if sessionID == "" {
		return ""
	}
	return strconv.FormatInt(accountID, 10) + "|" + sessionID
}

// MarkSessionBlocked 标记 (sessionID, accountID) 为 Blocked，TTL 内有效。
// sessionID 为空或 accountID <= 0 时静默 no-op（防御性）。
func (s *CyberSessionBlockStore) MarkSessionBlocked(sessionID string, accountID int64) {
	if s == nil {
		return
	}
	key := cyberSessionBlockKey(sessionID, accountID)
	if key == "" || accountID <= 0 {
		return
	}
	expiresAt := s.now().Add(s.ttlDuration()).UnixNano()
	s.entries.Store(key, expiresAt)
}

// IsSessionBlocked 查询是否阻断；TTL 过期惰性清理。
func (s *CyberSessionBlockStore) IsSessionBlocked(sessionID string, accountID int64) bool {
	if s == nil {
		return false
	}
	key := cyberSessionBlockKey(sessionID, accountID)
	if key == "" || accountID <= 0 {
		return false
	}
	raw, ok := s.entries.Load(key)
	if !ok {
		return false
	}
	expiresAt, ok := raw.(int64)
	if !ok {
		s.entries.Delete(key)
		return false
	}
	if s.now().UnixNano() >= expiresAt {
		s.entries.Delete(key)
		return false
	}
	return true
}

// ClearSessionBlock 移除阻断标记（用于 admin 手动解除 / session 结束清理）。
func (s *CyberSessionBlockStore) ClearSessionBlock(sessionID string, accountID int64) {
	if s == nil {
		return
	}
	key := cyberSessionBlockKey(sessionID, accountID)
	if key == "" {
		return
	}
	s.entries.Delete(key)
}

// Reap 主动清理已过期 entry；后台 reaper 或测试可调用。
// 不返回 entries 数量，避免误用为 metric——专门的 metric 留 phase-3。
func (s *CyberSessionBlockStore) Reap() {
	if s == nil {
		return
	}
	nowNanos := s.now().UnixNano()
	s.entries.Range(func(k, v any) bool {
		expiresAt, ok := v.(int64)
		if !ok {
			s.entries.Delete(k)
			return true
		}
		if nowNanos >= expiresAt {
			s.entries.Delete(k)
		}
		return true
	})
}

// 包级默认 store；服务初始化期可替换或注入 DI。
// phase-2 暂时使用包级单例，避免改 OpenAIGatewayService 构造签名。
// phase-3 接入 WS 时按需迁移到 service 字段。
var defaultCyberSessionBlockStore = NewCyberSessionBlockStore()

// DefaultCyberSessionBlockStore 返回包级 store；测试 / WS 接入处通过此函数读单例。
func DefaultCyberSessionBlockStore() *CyberSessionBlockStore {
	return defaultCyberSessionBlockStore
}
