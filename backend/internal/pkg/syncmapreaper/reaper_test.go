package syncmapreaper

import (
	"sync"
	"testing"
	"time"
)

type testEntry struct {
	ts  time.Time
	ttl time.Duration
}

func (e *testEntry) ExpiredAt(now time.Time) bool {
	return now.Sub(e.ts) > e.ttl
}

func TestReaper_RemovesExpired(t *testing.T) {
	var m sync.Map
	stop := make(chan struct{})
	defer close(stop)

	m.Store("fresh", &testEntry{ts: time.Now(), ttl: time.Hour})
	m.Store("stale", &testEntry{ts: time.Now().Add(-2 * time.Hour), ttl: time.Hour})

	StartReaper(&m, 50*time.Millisecond, stop)
	time.Sleep(200 * time.Millisecond)

	if _, ok := m.Load("fresh"); !ok {
		t.Error("fresh entry should not be reaped")
	}
	if _, ok := m.Load("stale"); ok {
		t.Error("stale entry should have been reaped")
	}
}

func TestReaper_StopsOnClose(t *testing.T) {
	var m sync.Map
	stop := make(chan struct{})

	m.Store("a", &testEntry{ts: time.Now().Add(-2 * time.Hour), ttl: time.Hour})
	StartReaper(&m, 10*time.Second, stop)
	close(stop)
	time.Sleep(50 * time.Millisecond)
	// Should not panic or leak goroutine
}
