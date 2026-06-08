-- 回填 api_keys.key_hash(sha256):对所有活跃、有明文 key、尚未填充 key_hash 的行。
-- key_encrypted(AES 加密)须由 Go 应用层回填(依赖 AESEncryptor),本 SQL 不涉。
-- 分批回填避免长事务锁表;若数据量大,可分多次执行。
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30min';

UPDATE api_keys
SET key_hash = encode(sha256(key::bytea), 'hex')
WHERE key_hash IS NULL
  AND deleted_at IS NULL
  AND key NOT LIKE '__deleted__%';
