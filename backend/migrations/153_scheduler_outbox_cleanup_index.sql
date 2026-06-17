-- 153_scheduler_outbox_cleanup_index.sql
-- 配合 SchedulerOutboxRepository.DeleteConsumedUpTo 的裁剪路径：
--   WHERE id <= $1 AND created_at < NOW() - INTERVAL '10 seconds'
--   ORDER BY id ASC LIMIT $2
--
-- PK(id) 已能让 id <= $1 走索引扫描；补一个 (id, created_at) 复合索引
-- 让裁剪 CTE 可直接覆盖谓词，避免回表读 created_at。advisory lock 由
-- 应用层通过 pg_try_advisory_lock(hashtext('scheduler_outbox_cleanup'))
-- 自行获取，无需新建 SQL 函数。
--
-- IF NOT EXISTS 保证灾备/重放幂等。

CREATE INDEX IF NOT EXISTS idx_scheduler_outbox_id_created_at
    ON scheduler_outbox (id, created_at);
