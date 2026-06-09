package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/telagod/subme/internal/service"
	"github.com/redis/go-redis/v9"
)

// User and group-level RPM counter backed by Redis.
//
// Design notes:
//   - Key format: rpm:ug:{uid}:{gid}:{minute} and rpm:u:{uid}:{minute}
//   - Time source: rdb.Time() (Redis server clock) to avoid multi-instance clock drift.
//   - Atomicity: TxPipeline (MULTI/EXEC) for INCR+EXPIRE, compatible with Redis Cluster.
//   - TTL: 120s, covering the current minute window plus a safety margin.
//   - Return semantics: the caller (billing_cache_service.checkRPM) compares against RPMLimit.
const (
	userGroupRPMKeyPrefix = "rpm:ug:"
	userRPMKeyPrefix      = "rpm:u:"

	userRPMKeyTTL = 120 * time.Second
)

type userRPMCacheImpl struct {
	rdb *redis.Client
}

// NewUserRPMCache creates a user/group-level RPM counter instance.
func NewUserRPMCache(rdb *redis.Client) service.UserRPMCache {
	return &userRPMCacheImpl{rdb: rdb}
}

// currentMinute returns the Redis server-side minute timestamp.
func (c *userRPMCacheImpl) currentMinute(ctx context.Context) (int64, error) {
	serverTime, timeErr := c.rdb.Time(ctx).Result()
	if timeErr != nil {
		return 0, fmt.Errorf("fetching redis server time: %w", timeErr)
	}
	return serverTime.Unix() / 60, nil
}

// incrWithExpiry atomically increments a key and sets its TTL.
func (c *userRPMCacheImpl) incrWithExpiry(ctx context.Context, key string) (int, error) {
	txn := c.rdb.TxPipeline()
	counter := txn.Incr(ctx, key)
	txn.Expire(ctx, key, userRPMKeyTTL)
	if _, execErr := txn.Exec(ctx); execErr != nil {
		return 0, fmt.Errorf("incrementing rpm counter: %w", execErr)
	}
	return int(counter.Val()), nil
}

// IncrementUserGroupRPM increments the per-minute counter for a (user, group) pair.
func (c *userRPMCacheImpl) IncrementUserGroupRPM(ctx context.Context, userID, groupID int64) (int, error) {
	min, minErr := c.currentMinute(ctx)
	if minErr != nil {
		return 0, minErr
	}
	rkey := fmt.Sprintf("%s%d:%d:%d", userGroupRPMKeyPrefix, userID, groupID, min)
	return c.incrWithExpiry(ctx, rkey)
}

// IncrementUserRPM increments the per-minute counter for a user.
func (c *userRPMCacheImpl) IncrementUserRPM(ctx context.Context, userID int64) (int, error) {
	min, minErr := c.currentMinute(ctx)
	if minErr != nil {
		return 0, minErr
	}
	rkey := fmt.Sprintf("%s%d:%d", userRPMKeyPrefix, userID, min)
	return c.incrWithExpiry(ctx, rkey)
}

// GetUserGroupRPM reads the current minute's RPM for a (user, group) pair (read-only).
func (c *userRPMCacheImpl) GetUserGroupRPM(ctx context.Context, userID, groupID int64) (int, error) {
	min, minErr := c.currentMinute(ctx)
	if minErr != nil {
		return 0, minErr
	}
	rkey := fmt.Sprintf("%s%d:%d:%d", userGroupRPMKeyPrefix, userID, groupID, min)
	count, getErr := c.rdb.Get(ctx, rkey).Int()
	if getErr == redis.Nil {
		return 0, nil
	}
	if getErr != nil {
		return 0, fmt.Errorf("reading user-group rpm counter: %w", getErr)
	}
	return count, nil
}

// GetUserRPM reads the current minute's RPM for a user (read-only).
func (c *userRPMCacheImpl) GetUserRPM(ctx context.Context, userID int64) (int, error) {
	min, minErr := c.currentMinute(ctx)
	if minErr != nil {
		return 0, minErr
	}
	rkey := fmt.Sprintf("%s%d:%d", userRPMKeyPrefix, userID, min)
	count, getErr := c.rdb.Get(ctx, rkey).Int()
	if getErr == redis.Nil {
		return 0, nil
	}
	if getErr != nil {
		return 0, fmt.Errorf("reading user rpm counter: %w", getErr)
	}
	return count, nil
}
