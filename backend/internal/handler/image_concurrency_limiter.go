package handler

import (
	"context"
	"sync"
	"time"
)

type imageConcurrencyLimiter struct {
	mu      sync.Mutex
	notify  chan struct{}
	limit   int
	active  int
	waiting int
	enabled bool
}

func (l *imageConcurrencyLimiter) TryAcquire(enabled bool, limit int) (func(), bool) {
	return l.acquireSlot(context.Background(), enabled, limit, false, 0, 0)
}

func (l *imageConcurrencyLimiter) Acquire(ctx context.Context, enabled bool, limit int, wait bool, timeout time.Duration, maxWaiting int) (func(), bool) {
	return l.acquireSlot(ctx, enabled, limit, wait, timeout, maxWaiting)
}

func (l *imageConcurrencyLimiter) acquireSlot(ctx context.Context, enabled bool, limit int, wait bool, timeout time.Duration, maxWaiting int) (func(), bool) {
	if !enabled || limit <= 0 {
		return nil, true
	}

	if ctx == nil {
		ctx = context.Background()
	}

	if wait {
		if timeout <= 0 {
			return nil, false
		}
		bounded, cancelBounded := context.WithTimeout(ctx, timeout)
		defer cancelBounded()
		ctx = bounded
	}

	if maxWaiting < 0 {
		maxWaiting = 0
	}

	for {
		releaser, got, waiterCleanup, signal := l.tryLockAndAcquire(enabled, limit, wait, maxWaiting)
		if got {
			return releaser, true
		}
		if !wait || signal == nil {
			return nil, false
		}

		if !l.awaitSlot(ctx, signal) {
			if waiterCleanup != nil {
				waiterCleanup()
			}
			return nil, false
		}
		if waiterCleanup != nil {
			waiterCleanup()
		}
	}
}

func (l *imageConcurrencyLimiter) tryLockAndAcquire(enabled bool, limit int, wait bool, maxWaiting int) (func(), bool, func(), <-chan struct{}) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.notify == nil {
		l.notify = make(chan struct{})
	}

	// Sync dynamic config changes.
	if l.enabled != enabled || l.limit != limit {
		l.enabled = enabled
		l.limit = limit
	}

	if l.active < l.limit {
		l.active++
		return l.buildReleaser(), true, nil, nil
	}

	if !wait {
		return nil, false, nil, nil
	}

	if maxWaiting > 0 && l.waiting >= maxWaiting {
		return nil, false, nil, nil
	}

	l.waiting++
	return nil, false, l.buildWaiterCleanup(), l.notify
}

func (l *imageConcurrencyLimiter) awaitSlot(ctx context.Context, signal <-chan struct{}) bool {
	select {
	case <-signal:
		return true
	case <-ctx.Done():
		return false
	}
}

func (l *imageConcurrencyLimiter) buildReleaser() func() {
	var callOnce sync.Once
	return func() {
		callOnce.Do(func() {
			l.mu.Lock()
			if l.active > 0 {
				l.active--
			}
			// Broadcast to all waiters by closing and recreating the channel.
			if l.notify != nil {
				close(l.notify)
				l.notify = make(chan struct{})
			}
			l.mu.Unlock()
		})
	}
}

func (l *imageConcurrencyLimiter) buildWaiterCleanup() func() {
	var callOnce sync.Once
	return func() {
		callOnce.Do(func() {
			l.mu.Lock()
			if l.waiting > 0 {
				l.waiting--
			}
			l.mu.Unlock()
		})
	}
}
