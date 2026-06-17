package service

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// opsCyberPolicyKey 在 gin context 中携带 cyber_policy 命中标记。
// phase-1 仅 detect + ops 日志记录；不改变响应行为，不冷却账号，不阻断会话。
// session-block / ban-exclusion 等行为留 phase-2 follow-up。
const opsCyberPolicyKey = "ops_cyber_policy"

// CyberPolicyVerdict 是 cyber_policy 检测结果的分类。
//   - VerdictNone:       未命中 cyber_policy（其它错误码、空体或非法 JSON）
//   - VerdictBlocked:    上游明确返回 error.code == "cyber_policy"（硬阻断）
//   - VerdictSuspicious: error.message 含高风险关键词但 code 非 cyber_policy（启发式）
type CyberPolicyVerdict int

const (
	VerdictNone CyberPolicyVerdict = iota
	VerdictBlocked
	VerdictSuspicious
)

// String 返回 verdict 的人类可读形式（用于 ops 日志 / 测试）。
func (v CyberPolicyVerdict) String() string {
	switch v {
	case VerdictBlocked:
		return "blocked"
	case VerdictSuspicious:
		return "suspicious"
	default:
		return "none"
	}
}

// CyberPolicyDetection 描述一次 cyber_policy 检测结论。
type CyberPolicyDetection struct {
	Verdict CyberPolicyVerdict
	Code    string // 命中时为 "cyber_policy"；否则为上游报告的 code（可空）
	Message string // 上游 error.message（已 trim）
	Summary string // ops 日志摘要：verdict + code + message
}

// Hit 返回是否触发任何 cyber_policy 标记（Blocked 或 Suspicious）。
func (d CyberPolicyDetection) Hit() bool {
	return d.Verdict != VerdictNone
}

// CyberPolicyMark 记录一次 cyber_policy 硬阻断的上游证据，由 gateway 写入 context，
// handler 在 Forward 返回后读取以触发 ops 日志 / phase-2 后续行为。
//
// phase-2 字段扩展：
//   - Body:           上游返回的原始 body / SSE data（用于审计与离线分析；调用方需保证已脱敏/限长）。
//   - UpstreamInTok:  上游 usage.input_tokens 快照（若 body 中携带；否则 0）。
//   - UpstreamOutTok: 上游 usage.output_tokens 快照（若 body 中携带；否则 0）。
//
// 这些字段仅用于 ops/admin 复盘；token-aware RecordUsage 在 Blocked verdict 下仍写 tokens=0
// 防止安全阻断流量被错误计费。
type CyberPolicyMark struct {
	Verdict        CyberPolicyVerdict
	Code           string // 固定 "cyber_policy"（命中时）
	Message        string // 上游 error.message
	UpstreamStatus int    // 上游 HTTP 状态（流式=200，非流式=400）
	Body           []byte // 上游 body 快照（可空；调用方自行决定是否填充以控制内存）
	UpstreamInTok  int64  // 上游 usage.input_tokens（若可解析）
	UpstreamOutTok int64  // 上游 usage.output_tokens（若可解析）
}

// DetectCyberPolicy 解析上游 body / SSE data，返回 cyber_policy 命中结论。
//
//   - 安全处理空 body / 非法 JSON：返回 VerdictNone。
//   - error.code == "cyber_policy"（大小写不敏感）→ VerdictBlocked。
//   - 同时检查 response.error.code（Responses API 包装）和 top-level error.code。
//   - error.message 含 "high-risk cyber" 等关键词、但 code 非 cyber_policy → VerdictSuspicious。
//
// 对齐上游精确识别逻辑（codex api_bridge.rs / sse/responses.rs）。
func DetectCyberPolicy(body []byte) CyberPolicyDetection {
	if len(body) == 0 {
		return CyberPolicyDetection{Verdict: VerdictNone}
	}
	if !gjson.ValidBytes(body) {
		return CyberPolicyDetection{Verdict: VerdictNone}
	}

	code := strings.TrimSpace(gjson.GetBytes(body, "error.code").String())
	if code == "" {
		code = strings.TrimSpace(gjson.GetBytes(body, "response.error.code").String())
	}
	msg := strings.TrimSpace(gjson.GetBytes(body, "error.message").String())
	if msg == "" {
		msg = strings.TrimSpace(gjson.GetBytes(body, "response.error.message").String())
	}

	if strings.EqualFold(code, "cyber_policy") {
		d := CyberPolicyDetection{
			Verdict: VerdictBlocked,
			Code:    "cyber_policy",
			Message: msg,
		}
		d.Summary = buildCyberPolicySummary(d)
		return d
	}

	// 启发式：error.message 含 "high-risk cyber" 之类标记，但 code 非 cyber_policy。
	// 仅作日志提示，不触发后续阻断（phase-2 才决定是否升级）。
	lowerMsg := strings.ToLower(msg)
	if msg != "" && strings.Contains(lowerMsg, "high-risk cyber") {
		d := CyberPolicyDetection{
			Verdict: VerdictSuspicious,
			Code:    code,
			Message: msg,
		}
		d.Summary = buildCyberPolicySummary(d)
		return d
	}

	return CyberPolicyDetection{Verdict: VerdictNone}
}

func buildCyberPolicySummary(d CyberPolicyDetection) string {
	parts := []string{"verdict=" + d.Verdict.String()}
	if d.Code != "" {
		parts = append(parts, "code="+d.Code)
	}
	if d.Message != "" {
		// ops 日志会再走 sanitize；此处只 trim 长度避免单条事件超大。
		msg := d.Message
		if len(msg) > 256 {
			msg = msg[:256] + "…"
		}
		parts = append(parts, "message="+msg)
	}
	return strings.Join(parts, " ")
}

// MarkOpsCyberPolicy 在 gin context 写入 cyber_policy 命中标记。
// 首个写入生效，后续 Mark 调用静默忽略（同一 turn 只记一次）。
// 与上游对齐：context 无并发安全的删除原语，Set 走内部锁，
// 与异步 GetOpsCyberPolicy 不构成 data race。
func MarkOpsCyberPolicy(c *gin.Context, mark CyberPolicyMark) {
	if c == nil {
		return
	}
	if GetOpsCyberPolicy(c) != nil {
		return
	}
	if mark.Code == "" && mark.Verdict == VerdictBlocked {
		mark.Code = "cyber_policy"
	}
	mark.Message = strings.TrimSpace(mark.Message)
	c.Set(opsCyberPolicyKey, &mark)
}

// GetOpsCyberPolicy 返回 cyber_policy 标记；未命中或已 Clear 返回 nil。
func GetOpsCyberPolicy(c *gin.Context) *CyberPolicyMark {
	if c == nil {
		return nil
	}
	v, ok := c.Get(opsCyberPolicyKey)
	if !ok {
		return nil
	}
	m, ok := v.(*CyberPolicyMark)
	if !ok || m == nil {
		return nil
	}
	return m
}

// ClearOpsCyberPolicy 清除 cyber_policy 标记。
// 仅 WS 多轮路径在 turn 收尾调用；HTTP 单请求路径不必调用。
// 通过 typed-nil 覆盖实现（gin context 无安全的 Delete 原语）。
func ClearOpsCyberPolicy(c *gin.Context) {
	if c == nil {
		return
	}
	c.Set(opsCyberPolicyKey, (*CyberPolicyMark)(nil))
}

// DetectAndMarkOpsCyberPolicy 检测 body，若命中则写 context mark + 返回 detection。
// gateway forward 路径在四类出口（流/非流 × 透传/非透传）调用此函数完成 phase-1 接入。
// 返回 detection 用于由调用方追加 ops 日志事件。
//
// phase-2：命中 Blocked 时同时持久化 body 快照（限长 cyberPolicyBodySnapshotMaxBytes）
// 以及上游 usage token 快照（若 body 中携带）。token snapshot 仅用于 ops/admin 审计；
// RecordUsage 在 Blocked verdict 下仍写 tokens=0 防止安全阻断流量进入计费链路。
func DetectAndMarkOpsCyberPolicy(c *gin.Context, body []byte, upstreamStatus int) CyberPolicyDetection {
	d := DetectCyberPolicy(body)
	if d.Verdict != VerdictBlocked {
		return d
	}
	mark := CyberPolicyMark{
		Verdict:        VerdictBlocked,
		Code:           d.Code,
		Message:        d.Message,
		UpstreamStatus: upstreamStatus,
	}
	mark.Body = truncateCyberPolicyBody(body)
	mark.UpstreamInTok, mark.UpstreamOutTok = extractCyberPolicyUpstreamTokens(body)
	MarkOpsCyberPolicy(c, mark)
	return d
}

// cyberPolicyBodySnapshotMaxBytes 控制 mark.Body 的最大快照长度，避免内存放大。
// 与 ops 日志 LogUpstreamErrorBodyMaxBytes 同量级；调用方已传入 readUpstreamErrorBody
// 的结果，二次 trim 仅是保险。
const cyberPolicyBodySnapshotMaxBytes = 4096

func truncateCyberPolicyBody(body []byte) []byte {
	if len(body) == 0 {
		return nil
	}
	if len(body) <= cyberPolicyBodySnapshotMaxBytes {
		dup := make([]byte, len(body))
		copy(dup, body)
		return dup
	}
	dup := make([]byte, cyberPolicyBodySnapshotMaxBytes)
	copy(dup, body[:cyberPolicyBodySnapshotMaxBytes])
	return dup
}

// extractCyberPolicyUpstreamTokens 尝试从上游 body / SSE data 中读取 usage token 快照。
// 兼容 OpenAI Responses (`usage.input_tokens` / `usage.output_tokens`)、
// Chat Completions (`usage.prompt_tokens` / `usage.completion_tokens`) 以及
// response-wrapped 形态 (`response.usage.*`)。
// 解析失败或字段缺失返回 (0, 0)，调用方按 0 处理。
func extractCyberPolicyUpstreamTokens(body []byte) (int64, int64) {
	if len(body) == 0 || !gjson.ValidBytes(body) {
		return 0, 0
	}
	in := gjson.GetBytes(body, "usage.input_tokens")
	if !in.Exists() {
		in = gjson.GetBytes(body, "response.usage.input_tokens")
	}
	if !in.Exists() {
		in = gjson.GetBytes(body, "usage.prompt_tokens")
	}
	out := gjson.GetBytes(body, "usage.output_tokens")
	if !out.Exists() {
		out = gjson.GetBytes(body, "response.usage.output_tokens")
	}
	if !out.Exists() {
		out = gjson.GetBytes(body, "usage.completion_tokens")
	}
	return in.Int(), out.Int()
}
