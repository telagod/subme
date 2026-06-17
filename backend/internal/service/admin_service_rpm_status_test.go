//go:build unit

package service

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/telagod/subme/internal/pkg/pagination"
)

type rpmStatusUserRepoStub struct {
	UserRepository
	user *User
}

func (s *rpmStatusUserRepoStub) GetByID(_ context.Context, _ int64) (*User, error) {
	return s.user, nil
}

type rpmStatusAPIKeyRepoStub struct {
	APIKeyRepository
	keys []APIKey
}

func (s *rpmStatusAPIKeyRepoStub) ListByUserID(_ context.Context, _ int64, _ pagination.PaginationParams, _ APIKeyListFilters) ([]APIKey, *pagination.PaginationResult, error) {
	return s.keys, &pagination.PaginationResult{Total: int64(len(s.keys))}, nil
}

type rpmStatusGroupRepoStub struct {
	GroupRepository
	groups map[int64]*Group
}

func (s *rpmStatusGroupRepoStub) GetByIDLite(_ context.Context, id int64) (*Group, error) {
	return s.groups[id], nil
}

func (s *rpmStatusGroupRepoStub) GetByIDsLite(_ context.Context, ids []int64) (map[int64]*Group, error) {
	out := make(map[int64]*Group, len(ids))
	for _, id := range ids {
		if g, ok := s.groups[id]; ok {
			out[id] = g
		}
	}
	return out, nil
}

type rpmStatusRateRepoStub struct {
	UserGroupRateRepository
	overrides map[int64]*int
}

func (s *rpmStatusRateRepoStub) GetRPMOverrideByUserAndGroup(_ context.Context, _, groupID int64) (*int, error) {
	return s.overrides[groupID], nil
}

func (s *rpmStatusRateRepoStub) GetRPMOverridesByUserAndGroups(_ context.Context, _ int64, groupIDs []int64) (map[int64]int, error) {
	out := make(map[int64]int, len(groupIDs))
	for _, gid := range groupIDs {
		if v, ok := s.overrides[gid]; ok && v != nil {
			out[gid] = *v
		}
	}
	return out, nil
}

type rpmStatusCacheStub struct {
	UserRPMCache
	userUsed  int
	groupUsed map[int64]int
}

func (s *rpmStatusCacheStub) IncrementUserGroupRPM(context.Context, int64, int64) (int, error) {
	return 0, nil
}

func (s *rpmStatusCacheStub) IncrementUserRPM(context.Context, int64) (int, error) {
	return 0, nil
}

func (s *rpmStatusCacheStub) GetUserGroupRPM(_ context.Context, _, groupID int64) (int, error) {
	return s.groupUsed[groupID], nil
}

func (s *rpmStatusCacheStub) GetUserRPM(context.Context, int64) (int, error) {
	return s.userUsed, nil
}

func TestAdminService_GetUserRPMStatus_AggregatesUserAndGroupLimits(t *testing.T) {
	groupOneID := int64(1)
	groupTwoID := int64(2)
	override := 7
	svc := &adminServiceImpl{
		userRepo: &rpmStatusUserRepoStub{user: &User{
			ID:       42,
			RPMLimit: 20,
		}},
		apiKeyRepo: &rpmStatusAPIKeyRepoStub{keys: []APIKey{
			{ID: 100, UserID: 42, GroupID: &groupTwoID},
			{ID: 101, UserID: 42, GroupID: &groupOneID},
			{ID: 102, UserID: 42, GroupID: &groupTwoID},
			{ID: 103, UserID: 42},
		}},
		groupRepo: &rpmStatusGroupRepoStub{groups: map[int64]*Group{
			groupOneID: {ID: groupOneID, Name: "group-one", RPMLimit: 10},
			groupTwoID: {ID: groupTwoID, Name: "group-two", RPMLimit: 60},
		}},
		userGroupRateRepo: &rpmStatusRateRepoStub{overrides: map[int64]*int{
			groupTwoID: &override,
		}},
		userRPMCache: &rpmStatusCacheStub{
			userUsed: 5,
			groupUsed: map[int64]int{
				groupOneID: 3,
				groupTwoID: 4,
			},
		},
	}

	status, err := svc.GetUserRPMStatus(context.Background(), 42)
	require.NoError(t, err)
	require.Equal(t, &UserRPMStatus{
		UserRPMUsed:  5,
		UserRPMLimit: 20,
		PerGroup: []UserGroupRPMStatus{
			{GroupID: groupOneID, GroupName: "group-one", Used: 3, Limit: 10, Source: "group"},
			{GroupID: groupTwoID, GroupName: "group-two", Used: 4, Limit: 7, Source: "override"},
		},
	}, status)
}

// rpmStatusCountingRateRepoStub instruments rpmStatusRateRepoStub to count
// per-group override fetches so we can assert v.14 batched primitives stayed
// O(1) instead of regressing to per-group queries (the original N+1 hotspot).
type rpmStatusCountingRateRepoStub struct {
	rpmStatusRateRepoStub
	singleCalls atomic.Int64
	batchCalls  atomic.Int64
}

func (s *rpmStatusCountingRateRepoStub) GetRPMOverrideByUserAndGroup(ctx context.Context, userID, groupID int64) (*int, error) {
	s.singleCalls.Add(1)
	return s.rpmStatusRateRepoStub.GetRPMOverrideByUserAndGroup(ctx, userID, groupID)
}

func (s *rpmStatusCountingRateRepoStub) GetRPMOverridesByUserAndGroups(ctx context.Context, userID int64, groupIDs []int64) (map[int64]int, error) {
	s.batchCalls.Add(1)
	return s.rpmStatusRateRepoStub.GetRPMOverridesByUserAndGroups(ctx, userID, groupIDs)
}

type rpmStatusCountingGroupRepoStub struct {
	rpmStatusGroupRepoStub
	singleCalls atomic.Int64
	batchCalls  atomic.Int64
}

func (s *rpmStatusCountingGroupRepoStub) GetByIDLite(ctx context.Context, id int64) (*Group, error) {
	s.singleCalls.Add(1)
	return s.rpmStatusGroupRepoStub.GetByIDLite(ctx, id)
}

func (s *rpmStatusCountingGroupRepoStub) GetByIDsLite(ctx context.Context, ids []int64) (map[int64]*Group, error) {
	s.batchCalls.Add(1)
	return s.rpmStatusGroupRepoStub.GetByIDsLite(ctx, ids)
}

// TestAdminService_GetUserRPMStatus_NoN1Over100Groups guards the v.14 batch
// primitive: a single call must scale to 100 groups without:
//   - issuing per-group queries against the group repo, or
//   - issuing per-group override fetches against the rate repo, or
//   - blowing past a 1-second budget under stub-only IO.
//
// If batched primitives ever regress to per-group lookups, both call counts
// climb to 100 and the latency budget surfaces it loudly in CI.
func TestAdminService_GetUserRPMStatus_NoN1Over100Groups(t *testing.T) {
	const groupCount = 100

	groups := make(map[int64]*Group, groupCount)
	keys := make([]APIKey, 0, groupCount)
	groupUsed := make(map[int64]int, groupCount)
	overrides := make(map[int64]*int, groupCount)

	for i := int64(1); i <= groupCount; i++ {
		groups[i] = &Group{ID: i, Name: "group", RPMLimit: 10}
		gid := i
		keys = append(keys, APIKey{ID: 1000 + i, UserID: 42, GroupID: &gid})
		groupUsed[i] = int(i % 5)
		if i%3 == 0 {
			v := int(i)
			overrides[i] = &v
		}
	}

	groupRepo := &rpmStatusCountingGroupRepoStub{
		rpmStatusGroupRepoStub: rpmStatusGroupRepoStub{groups: groups},
	}
	rateRepo := &rpmStatusCountingRateRepoStub{
		rpmStatusRateRepoStub: rpmStatusRateRepoStub{overrides: overrides},
	}

	svc := &adminServiceImpl{
		userRepo: &rpmStatusUserRepoStub{user: &User{
			ID:       42,
			RPMLimit: 200,
		}},
		apiKeyRepo:        &rpmStatusAPIKeyRepoStub{keys: keys},
		groupRepo:         groupRepo,
		userGroupRateRepo: rateRepo,
		userRPMCache: &rpmStatusCacheStub{
			userUsed:  77,
			groupUsed: groupUsed,
		},
	}

	start := time.Now()
	status, err := svc.GetUserRPMStatus(context.Background(), 42)
	elapsed := time.Since(start)

	require.NoError(t, err)
	require.NotNil(t, status)
	require.Len(t, status.PerGroup, groupCount)

	// Budget: stub IO is nanosecond-cheap; 1s is a comfortably loose ceiling
	// that still bites if anyone reintroduces per-row work.
	require.Less(t, elapsed, time.Second,
		"GetUserRPMStatus took %s for %d groups — possible N+1 regression", elapsed, groupCount)

	require.LessOrEqual(t, groupRepo.singleCalls.Load(), int64(0),
		"group repo per-id fetches must not be issued; got %d", groupRepo.singleCalls.Load())
	require.LessOrEqual(t, rateRepo.singleCalls.Load(), int64(0),
		"rate repo per-id fetches must not be issued; got %d", rateRepo.singleCalls.Load())

	require.GreaterOrEqual(t, groupRepo.batchCalls.Load(), int64(1),
		"group repo batch primitive must be used")
	require.GreaterOrEqual(t, rateRepo.batchCalls.Load(), int64(1),
		"rate repo batch primitive must be used")
}
