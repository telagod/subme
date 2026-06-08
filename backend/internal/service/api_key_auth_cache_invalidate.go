package service

import "context"

// InvalidateAuthCacheByKey 清除指定 API Key 的认证缓存。入参是明文 key(内部 hash 算出缓存键)。
func (s *APIKeyService) InvalidateAuthCacheByKey(ctx context.Context, key string) {
	if key == "" {
		return
	}
	s.deleteAuthCache(ctx, s.authCacheKey(key))
}

// InvalidateAuthCacheByHash 清除指定 key_hash 对应的认证缓存。入参已是 sha256 hash
// (= authCacheKey 的输出值 = DB key_hash 列),直接用作缓存键,跳过二次 hash。
// 用于 Delete/ListKeys 等已从 DB 拿到 key_hash 的路径,避免 hash(hash) 不匹配。
func (s *APIKeyService) InvalidateAuthCacheByHash(ctx context.Context, keyHash string) {
	if keyHash == "" {
		return
	}
	s.deleteAuthCache(ctx, keyHash)
}

// InvalidateAuthCacheByUserID 清除用户相关的 API Key 认证缓存
func (s *APIKeyService) InvalidateAuthCacheByUserID(ctx context.Context, userID int64) {
	if userID <= 0 {
		return
	}
	// ListKeysByUserID 现返回 key_hash 列表(非明文),直接作 cacheKey。
	hashes, err := s.apiKeyRepo.ListKeysByUserID(ctx, userID)
	if err != nil {
		return
	}
	s.deleteAuthCacheByHashes(ctx, hashes)
}

// InvalidateAuthCacheByGroupID 清除分组相关的 API Key 认证缓存
func (s *APIKeyService) InvalidateAuthCacheByGroupID(ctx context.Context, groupID int64) {
	if groupID <= 0 {
		return
	}
	hashes, err := s.apiKeyRepo.ListKeysByGroupID(ctx, groupID)
	if err != nil {
		return
	}
	s.deleteAuthCacheByHashes(ctx, hashes)
}

// deleteAuthCacheByHashes 批量清除缓存,入参已是 key_hash(= cacheKey),直接用、不再二次 hash。
func (s *APIKeyService) deleteAuthCacheByHashes(ctx context.Context, hashes []string) {
	for _, h := range hashes {
		if h == "" {
			continue
		}
		s.deleteAuthCache(ctx, h)
	}
}
