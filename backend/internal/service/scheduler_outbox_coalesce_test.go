package service

import (
	"context"
	"testing"
)

type coalesceCacheStub struct {
	SchedulerCache
	setAccountCalls    int
	deleteAccountCalls int
}

func (s *coalesceCacheStub) SetAccount(_ context.Context, _ *Account) error {
	s.setAccountCalls++
	return nil
}
func (s *coalesceCacheStub) DeleteAccount(_ context.Context, _ int64) error {
	s.deleteAccountCalls++
	return nil
}

type coalesceAccountRepoStub struct {
	AccountRepository
	accounts map[int64]*Account
}

func (r *coalesceAccountRepoStub) GetByID(_ context.Context, id int64) (*Account, error) {
	if acc, ok := r.accounts[id]; ok {
		return acc, nil
	}
	return nil, ErrAccountNotFound
}

func (r *coalesceAccountRepoStub) GetByIDs(_ context.Context, ids []int64) ([]*Account, error) {
	var out []*Account
	for _, id := range ids {
		if acc, ok := r.accounts[id]; ok {
			out = append(out, acc)
		}
	}
	return out, nil
}

func TestCoalescedHandleEvent_MergesMultipleAccountChanges(t *testing.T) {
	cache := &coalesceCacheStub{}
	repo := &coalesceAccountRepoStub{accounts: map[int64]*Account{
		1: {ID: 1, Platform: PlatformAnthropic, GroupIDs: []int64{10, 20}},
		2: {ID: 2, Platform: PlatformAnthropic, GroupIDs: []int64{10}},
		3: {ID: 3, Platform: PlatformGemini, GroupIDs: []int64{10}},
	}}
	svc := &SchedulerSnapshotService{cache: cache, accountRepo: repo}

	rebuildSet := make(map[batchSeenKey]struct{})
	var needFull bool

	id1 := int64(1)
	id2 := int64(2)
	id3 := int64(3)

	events := []SchedulerOutboxEvent{
		{EventType: SchedulerOutboxEventAccountChanged, AccountID: &id1},
		{EventType: SchedulerOutboxEventAccountChanged, AccountID: &id2},
		{EventType: SchedulerOutboxEventAccountChanged, AccountID: &id3},
	}

	for _, event := range events {
		err := svc.coalescedHandleEvent(context.Background(), event, rebuildSet, &needFull)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}

	if needFull {
		t.Error("should not need full rebuild")
	}
	if cache.setAccountCalls != 3 {
		t.Errorf("expected 3 SetAccount calls, got %d", cache.setAccountCalls)
	}

	// All 3 accounts are in group 10.
	// Account 1 (anthropic) → {10, anthropic}, {20, anthropic}
	// Account 2 (anthropic) → {10, anthropic}  (deduped)
	// Account 3 (gemini)    → {10, gemini}
	// Total unique: {10,anthropic}, {20,anthropic}, {10,gemini}
	if len(rebuildSet) != 3 {
		t.Errorf("expected 3 unique rebuild keys, got %d: %v", len(rebuildSet), rebuildSet)
	}

	expected := []batchSeenKey{
		{10, PlatformAnthropic},
		{20, PlatformAnthropic},
		{10, PlatformGemini},
	}
	for _, key := range expected {
		if _, ok := rebuildSet[key]; !ok {
			t.Errorf("missing expected rebuild key: %v", key)
		}
	}
}

func TestCoalescedHandleEvent_FullRebuildCoalesces(t *testing.T) {
	repo := &coalesceAccountRepoStub{accounts: map[int64]*Account{
		1: {ID: 1, Platform: PlatformAnthropic, GroupIDs: []int64{10}},
	}}
	cache := &coalesceCacheStub{}
	svc := &SchedulerSnapshotService{accountRepo: repo, cache: cache}
	rebuildSet := make(map[batchSeenKey]struct{})
	var needFull bool

	id1 := int64(1)
	events := []SchedulerOutboxEvent{
		{EventType: SchedulerOutboxEventAccountChanged, AccountID: &id1},
		{EventType: SchedulerOutboxEventFullRebuild},
	}

	for _, event := range events {
		_ = svc.coalescedHandleEvent(context.Background(), event, rebuildSet, &needFull)
	}

	if !needFull {
		t.Error("should need full rebuild when FullRebuild event present")
	}
}

func TestCoalescedHandleEvent_DeletedAccountAddsGroupsToRebuild(t *testing.T) {
	cache := &coalesceCacheStub{}
	repo := &coalesceAccountRepoStub{accounts: map[int64]*Account{}}
	svc := &SchedulerSnapshotService{cache: cache, accountRepo: repo}

	rebuildSet := make(map[batchSeenKey]struct{})
	var needFull bool

	id1 := int64(99)
	err := svc.coalescedHandleEvent(context.Background(), SchedulerOutboxEvent{
		EventType: SchedulerOutboxEventAccountChanged,
		AccountID: &id1,
		Payload:   map[string]any{"group_ids": []any{float64(10)}},
	}, rebuildSet, &needFull)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cache.deleteAccountCalls != 1 {
		t.Errorf("expected 1 DeleteAccount call, got %d", cache.deleteAccountCalls)
	}
	// Deleted account: rebuild all platforms for its groups
	if len(rebuildSet) != 4 {
		t.Errorf("expected 4 rebuild keys (4 platforms × 1 group), got %d", len(rebuildSet))
	}
}
