package service

import (
	"context"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/alitto/pond/v2"
)

// MonitorScheduler is the scheduler interface for ChannelMonitorService CRUD callbacks.
// Injected via setter to avoid service <-> runner wire dependency cycle.
type MonitorScheduler interface {
	// Schedule creates (or resets) an independent timer task for the given monitor.
	// When m.Enabled=false, this is equivalent to Unschedule(m.ID).
	Schedule(m *ChannelMonitor)
	// Unschedule cancels the timer task for the given monitor (if one exists).
	Unschedule(id int64)
}

// monitorRunnerSvc defines the minimal service interface the runner depends on:
//   - loading enabled monitors at startup
//   - executing a check on each ticker fire
//
// Using an interface instead of *ChannelMonitorService allows lightweight stub injection
// in unit tests without requiring the full repo + encryptor chain.
type monitorRunnerSvc interface {
	ListEnabledMonitors(reqCtx context.Context) ([]*ChannelMonitor, error)
	RunCheck(reqCtx context.Context, monitorID int64) ([]*CheckResult, error)
}

// ChannelMonitorRunner is the channel monitor scheduler.
//
// Design:
//   - Each enabled monitor gets its own goroutine + ticker (per IntervalSeconds)
//   - Start loads all enabled monitors and creates tasks for each
//   - Service calls Schedule/Unschedule via MonitorScheduler after CRUD operations
//   - Actual HTTP checks are submitted to a pond pool (capped at monitorWorkerConcurrency)
//
// History cleanup and daily aggregation are handled by OpsCleanupService via
// ChannelMonitorService.RunDailyMaintenance (shared leader lock + heartbeat).
type ChannelMonitorRunner struct {
	svc            monitorRunnerSvc
	settingService *SettingService

	workerPool pond.Pool
	rootCtx    context.Context
	rootCancel context.CancelFunc

	guard    sync.Mutex
	taskMap  map[int64]*scheduledMonitor
	waitGrp  sync.WaitGroup
	launched bool
	halted   bool

	// activeJobs tracks monitor IDs currently executing. The fire method checks
	// this before submitting to prevent duplicate concurrent checks when a single
	// check takes longer than the interval.
	activeJobs   map[int64]struct{}
	activeJobsMu sync.Mutex
}

// scheduledMonitor holds the runtime context for a single monitor's timer loop.
type scheduledMonitor struct {
	id       int64
	name     string
	interval time.Duration
	jitter   time.Duration // ± [0, jitter] per-tick uniform offset; 0 = fixed interval
	cancel   context.CancelFunc
}

// nextDelay computes the next wait duration: interval ± [0, jitter] uniform random offset.
// Validation already ensures interval - jitter >= monitorMinIntervalSeconds, but we still
// clamp here as a defense against dirty rows that violate the DB-side constraint.
func (s *scheduledMonitor) nextDelay() time.Duration {
	if s.jitter <= 0 {
		return s.interval
	}
	offset := time.Duration(rand.Int64N(int64(2*s.jitter) + 1)) // [0, 2*jitter]
	d := s.interval - s.jitter + offset
	if floor := monitorMinIntervalSeconds * time.Second; d < floor {
		d = floor
	}
	return d
}

// NewChannelMonitorRunner constructs the scheduler. Start is called once from wire.
// settingService is used to check the feature toggle before each fire; pass nil to always enable (test compat).
//
// The pool is created at construction time to avoid race conditions between Start (inside guard)
// and fire/Stop (outside guard). pond.NewPool is near-zero overhead so this is safe.
func NewChannelMonitorRunner(svc *ChannelMonitorService, settingService *SettingService) *ChannelMonitorRunner {
	return newChannelMonitorRunner(svc, settingService)
}

// newChannelMonitorRunner is the internal constructor accepting the minimal interface for testability.
func newChannelMonitorRunner(svc monitorRunnerSvc, settingService *SettingService) *ChannelMonitorRunner {
	bgCtx, bgCancel := context.WithCancel(context.Background())
	return &ChannelMonitorRunner{
		svc:            svc,
		settingService: settingService,
		workerPool:     pond.NewPool(monitorWorkerConcurrency),
		rootCtx:        bgCtx,
		rootCancel:     bgCancel,
		taskMap:        make(map[int64]*scheduledMonitor),
		activeJobs:     make(map[int64]struct{}),
	}
}

// Start loads all enabled monitors and creates an independent timer task for each.
// Callers must ensure this is invoked exactly once (enforced by the wire provider).
func (r *ChannelMonitorRunner) Start() {
	if r == nil || r.svc == nil {
		return
	}
	r.guard.Lock()
	if r.launched || r.halted {
		r.guard.Unlock()
		return
	}
	r.launched = true
	r.guard.Unlock()

	loadCtx, loadCancel := context.WithTimeout(context.Background(), monitorStartupLoadTimeout)
	defer loadCancel()
	enabledMonitors, loadErr := r.svc.ListEnabledMonitors(loadCtx)
	if loadErr != nil {
		slog.Error("channel_monitor: startup load of enabled monitors failed", "error", loadErr)
		return
	}
	for idx := 0; idx < len(enabledMonitors); idx++ {
		r.Schedule(enabledMonitors[idx])
	}
	slog.Info("channel_monitor: runner started", "scheduled_tasks", len(enabledMonitors))
}

// Schedule creates (or resets) an independent timer task for the given monitor.
//   - m.Enabled=false -> equivalent to Unschedule(m.ID)
//   - Existing tasks are cancelled and recreated (handles IntervalSeconds changes)
//   - New tasks fire immediately, then repeat at IntervalSeconds
func (r *ChannelMonitorRunner) Schedule(m *ChannelMonitor) {
	if r == nil || m == nil {
		return
	}
	if !m.Enabled {
		r.Unschedule(m.ID)
		return
	}
	tickInterval := time.Duration(m.IntervalSeconds) * time.Second
	if tickInterval <= 0 {
		slog.Error("channel_monitor: skipping schedule due to non-positive interval",
			"monitor_id", m.ID, "interval_seconds", m.IntervalSeconds)
		return
	}
	jitterDur := time.Duration(m.JitterSeconds) * time.Second
	if jitterDur < 0 {
		jitterDur = 0
	}

	r.guard.Lock()
	if r.halted {
		r.guard.Unlock()
		return
	}
	if !r.launched {
		r.guard.Unlock()
		slog.Warn("channel_monitor: schedule called before runner started, ignoring",
			"monitor_id", m.ID, "name", m.Name)
		return
	}
	if prev, exists := r.taskMap[m.ID]; exists {
		prev.cancel()
	}
	taskCtx, taskCancel := context.WithCancel(r.rootCtx)
	entry := &scheduledMonitor{
		id:       m.ID,
		name:     m.Name,
		interval: tickInterval,
		jitter:   jitterDur,
		cancel:   taskCancel,
	}
	r.taskMap[m.ID] = entry
	r.waitGrp.Add(1)
	r.guard.Unlock()

	go r.runScheduled(taskCtx, entry)
}

// Unschedule cancels the timer task for the given monitor (if one exists).
// In-flight checks receive the cancellation signal through context.
func (r *ChannelMonitorRunner) Unschedule(monitorID int64) {
	if r == nil {
		return
	}
	r.guard.Lock()
	entry, exists := r.taskMap[monitorID]
	if exists {
		delete(r.taskMap, monitorID)
	}
	r.guard.Unlock()
	if exists {
		entry.cancel()
	}
}

// Stop gracefully shuts down: cancels all tasks and drains the pool.
func (r *ChannelMonitorRunner) Stop() {
	if r == nil {
		return
	}
	r.guard.Lock()
	if r.halted {
		r.guard.Unlock()
		return
	}
	r.halted = true
	r.rootCancel()
	r.taskMap = nil
	r.guard.Unlock()

	r.waitGrp.Wait()
	r.workerPool.StopAndWait()
}

// runScheduled is the per-monitor loop: fires immediately (so new/enabled monitors run at once),
// then repeats at interval ± jitter; exits when context is cancelled.
// Uses time.Timer rather than time.Ticker because the wait duration must be
// re-randomized every cycle when jitter > 0.
func (r *ChannelMonitorRunner) runScheduled(taskCtx context.Context, entry *scheduledMonitor) {
	defer r.waitGrp.Done()

	r.fire(taskCtx, entry)

	tick := time.NewTimer(entry.nextDelay())
	defer tick.Stop()
	for {
		select {
		case <-taskCtx.Done():
			return
		case <-tick.C:
			r.fire(taskCtx, entry)
			tick.Reset(entry.nextDelay())
		}
	}
}

// fire submits a single check to the worker pool. Skips if the feature toggle is off,
// if the monitor is already in-flight, or if the pool is full.
func (r *ChannelMonitorRunner) fire(taskCtx context.Context, entry *scheduledMonitor) {
	if r.settingService != nil && !r.settingService.GetChannelMonitorRuntime(taskCtx).Enabled {
		return
	}
	if !r.tryAcquireInFlight(entry.id) {
		slog.Debug("channel_monitor: skipping already in-flight check",
			"monitor_id", entry.id, "name", entry.name)
		return
	}
	if _, submitted := r.workerPool.TrySubmit(func() {
		r.runOne(entry.id, entry.name)
	}); !submitted {
		// Pool full: release the in-flight slot to avoid permanently blocking this monitor.
		r.releaseInFlight(entry.id)
		slog.Warn("channel_monitor: worker pool full, dropping check submission",
			"monitor_id", entry.id, "name", entry.name)
	}
}

// tryAcquireInFlight atomically reserves the in-flight slot for a monitor.
// Returns false if already reserved (caller should skip this submission).
func (r *ChannelMonitorRunner) tryAcquireInFlight(monitorID int64) bool {
	r.activeJobsMu.Lock()
	defer r.activeJobsMu.Unlock()
	if _, occupied := r.activeJobs[monitorID]; occupied {
		return false
	}
	r.activeJobs[monitorID] = struct{}{}
	return true
}

// releaseInFlight frees the in-flight slot. Must be called after runOne completes (including panic recovery).
func (r *ChannelMonitorRunner) releaseInFlight(monitorID int64) {
	r.activeJobsMu.Lock()
	delete(r.activeJobs, monitorID)
	r.activeJobsMu.Unlock()
}

// runOne executes a single monitor check. All errors are logged only, never propagated.
// The in-flight slot is always released on exit (including panic recovery).
func (r *ChannelMonitorRunner) runOne(monitorID int64, monitorName string) {
	checkCtx, checkCancel := context.WithTimeout(context.Background(), monitorRequestTimeout+monitorPingTimeout+monitorRunOneBuffer)
	defer checkCancel()

	defer r.releaseInFlight(monitorID)

	defer func() {
		if recovered := recover(); recovered != nil {
			slog.Error("channel_monitor: runner panicked",
				"monitor_id", monitorID, "name", monitorName, "panic", recovered)
		}
	}()

	if _, checkErr := r.svc.RunCheck(checkCtx, monitorID); checkErr != nil {
		slog.Warn("channel_monitor: check execution failed",
			"monitor_id", monitorID, "name", monitorName, "error", checkErr)
	}
}
