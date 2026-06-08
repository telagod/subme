package syncmapreaper

import (
	"sync"
	"time"
)

type TimestampedEntry interface {
	ExpiredAt(now time.Time) bool
}

func StartReaper(m *sync.Map, interval time.Duration, stop <-chan struct{}) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case now := <-ticker.C:
				m.Range(func(key, value any) bool {
					if entry, ok := value.(TimestampedEntry); ok {
						if entry.ExpiredAt(now) {
							m.Delete(key)
						}
					}
					return true
				})
			}
		}
	}()
}

func StartTimeReaper(m *sync.Map, ttl time.Duration, interval time.Duration, stop <-chan struct{}) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case now := <-ticker.C:
				m.Range(func(key, value any) bool {
					if ts, ok := value.(time.Time); ok {
						if now.Sub(ts) > ttl {
							m.Delete(key)
						}
					}
					return true
				})
			}
		}
	}()
}
