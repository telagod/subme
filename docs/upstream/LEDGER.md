# 上游甄别台账（append-only）

> 本 fork 已 clean-room 重写并切换 MIT；上游（Wei-Shaw/sub2api）为 LGPL。
> **永远不 cherry-pick 上游提交**——只读 commit message 与行为差异，独立重实现。
> 本台账同时是 MIT 合规的出处证明：所有 `ported` 项均为行为对齐的独立实现。
>
> 工具：`tools/upstream-triage.sh`（scan / show / mark / seal / status）
> 重实现的本地提交请带 trailer：`Upstream-Ref: <upstream-sha>`

| upstream SHA | 甄别日期 | 判定 | 本地落点 | 备注 |
|---|---|---|---|---|
| `914c059f` | 2026-06-12 | ported | 2741e451 | 非流式错误帧双写修复，行为对齐独立实现（2741e451 #1） |
| `2c45f91d` | 2026-06-12 | ported | 2741e451 | OpenAI failover body 替换缓存（2741e451 #2） |
| `c10598df` | 2026-06-12 | ported | 2741e451 | 幂等响应 UTF-8 截断（2741e451 #3） |
| `20f3f204` | 2026-06-12 | ported | 2741e451 | MarkResponseCommitted 全平台覆盖（2741e451 #1+#5） |
| `6c886316` | 2026-06-12 | deferred | - | 与 2741e451#1 同族；error passthrough 路径的覆盖待行为比对确认 |
| `bf28a009` | 2026-06-12 | deferred | - | beta token 清理已对齐（2741e451#4）；top-level 字段过滤部分待评估 |
| `448936d9` | 2026-06-12 | skipped | - | 上游自身 CI/gofmt/errcheck 修复，与本仓库无关 |
| `d251487d` | 2026-06-12 | ported | c47e8743 | CC→Responses 转换链路 prompt_cache_key 透传，独立实现 |
