-- Migration: 154_channel_monitor_jitter
-- 渠道监控新增正负随机抖动配置：每次调度在 interval_seconds 基础上
-- ± [0, jitter_seconds] 的均匀随机偏移，避免多个监控固定同步触发上游。
-- 0（默认）表示固定间隔，与历史行为一致；service 层另保证 interval - jitter >= 15s。

ALTER TABLE channel_monitors
    ADD COLUMN IF NOT EXISTS jitter_seconds INTEGER NOT NULL DEFAULT 0;
