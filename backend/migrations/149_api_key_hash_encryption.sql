-- API Key 加密+hash 双列改造(Phase 3):
--   key_hash      = hex(sha256(key)),用于 auth 等值查询索引(替代明文 key lookup,消除 DB 明文依赖)
--   key_encrypted = "enc:v1:" + AES-256-GCM(key),可逆,读出口解密供用户始终查看明文
--                   (NULL 表示未加密:degrade-safe 未配持久密钥时回退读 key 明文列)
-- 本迁移仅加列 + 普通索引(对齐 ent schema 的 index.Fields("key_hash"),索引名 apikey_key_hash)。
-- 列均 nullable 以兼容存量数据回填;部分唯一约束(auth 唯一)在 auth 切换阶段单独迁移。
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS key_hash      VARCHAR(64),
    ADD COLUMN IF NOT EXISTS key_encrypted VARCHAR(300);

CREATE INDEX IF NOT EXISTS apikey_key_hash ON api_keys (key_hash);
