//go:build unit

package service

import (
	"errors"
	"testing"
	"time"
)

// TestScheduledMonitor_NextDelay_NoJitter 验证 jitter=0 时返回固定 interval。
func TestScheduledMonitor_NextDelay_NoJitter(t *testing.T) {
	entry := &scheduledMonitor{interval: 60 * time.Second, jitter: 0}
	for i := 0; i < 32; i++ {
		got := entry.nextDelay()
		if got != 60*time.Second {
			t.Fatalf("jitter=0 must return fixed interval, got %v", got)
		}
	}
}

// TestScheduledMonitor_NextDelay_NegativeJitterTreatedAsZero 验证脏数据 jitter<0 也走固定间隔。
func TestScheduledMonitor_NextDelay_NegativeJitterTreatedAsZero(t *testing.T) {
	entry := &scheduledMonitor{interval: 60 * time.Second, jitter: -5 * time.Second}
	for i := 0; i < 16; i++ {
		got := entry.nextDelay()
		if got != 60*time.Second {
			t.Fatalf("jitter<0 must clamp to fixed interval, got %v", got)
		}
	}
}

// TestScheduledMonitor_NextDelay_BoundedRange 验证 jitter>0 时结果落在 [interval-jitter, interval+jitter]
// 且不会低于 monitorMinIntervalSeconds 秒下限。
func TestScheduledMonitor_NextDelay_BoundedRange(t *testing.T) {
	interval := 60 * time.Second
	jitter := 10 * time.Second
	entry := &scheduledMonitor{interval: interval, jitter: jitter}
	floor := time.Duration(monitorMinIntervalSeconds) * time.Second
	lower := interval - jitter
	upper := interval + jitter

	// 重复 200 次以覆盖随机分布两端。
	sawBelowInterval := false
	sawAboveInterval := false
	for i := 0; i < 200; i++ {
		got := entry.nextDelay()
		if got < floor {
			t.Fatalf("nextDelay %v fell below the safety floor %v", got, floor)
		}
		if got < lower || got > upper {
			t.Fatalf("nextDelay %v outside [%v, %v]", got, lower, upper)
		}
		if got < interval {
			sawBelowInterval = true
		}
		if got > interval {
			sawAboveInterval = true
		}
	}
	if !sawBelowInterval || !sawAboveInterval {
		t.Fatalf("jitter must produce both negative and positive offsets across 200 samples (saw< =%v saw>=%v)", sawBelowInterval, sawAboveInterval)
	}
}

// TestScheduledMonitor_NextDelay_FloorClampsDirtyRow 验证就算 interval-jitter 低于 floor
// （应被 service 层校验拦截，但 DB 脏数据兜底），nextDelay 仍不会返回比 floor 更短的等待。
func TestScheduledMonitor_NextDelay_FloorClampsDirtyRow(t *testing.T) {
	entry := &scheduledMonitor{interval: 20 * time.Second, jitter: 19 * time.Second}
	floor := time.Duration(monitorMinIntervalSeconds) * time.Second
	for i := 0; i < 200; i++ {
		got := entry.nextDelay()
		if got < floor {
			t.Fatalf("dirty-row nextDelay %v dropped below floor %v", got, floor)
		}
	}
}

// TestValidateJitter_TableDriven 表驱动覆盖校验函数的合法/非法边界。
func TestValidateJitter_TableDriven(t *testing.T) {
	cases := []struct {
		name     string
		jitter   int
		interval int
		wantErr  error
	}{
		{"zero jitter ok", 0, 60, nil},
		{"jitter equals interval minus floor ok", 45, 60, nil},
		{"negative jitter rejected", -1, 60, ErrChannelMonitorInvalidJitter},
		{"interval minus jitter below floor rejected", 50, 60, ErrChannelMonitorInvalidJitter},
		{"exactly floor combo ok", 0, monitorMinIntervalSeconds, nil},
		{"max jitter for min interval", monitorMinIntervalSeconds - monitorMinIntervalSeconds, monitorMinIntervalSeconds, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := validateJitter(tc.jitter, tc.interval)
			if !errors.Is(got, tc.wantErr) {
				t.Fatalf("validateJitter(%d, %d) = %v; want %v", tc.jitter, tc.interval, got, tc.wantErr)
			}
		})
	}
}
