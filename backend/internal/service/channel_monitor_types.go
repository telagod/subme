package service

import "time"

// MonitorBodyOverrideMode constants define how the request body is customized:
//
//   - off     use adapter default body (ignore BodyOverride)
//   - merge   shallow-merge adapter default body with BodyOverride (user takes priority;
//     model/messages/contents and other critical keys are silently dropped via checker deny list)
//   - replace use BodyOverride as the complete body; challenge validation is skipped,
//     and "HTTP 2xx + non-empty response" is used as the availability indicator
const (
	MonitorBodyOverrideModeOff     = "off"
	MonitorBodyOverrideModeMerge   = "merge"
	MonitorBodyOverrideModeReplace = "replace"
)

// MonitorAPIMode constants describe the OpenAI provider's request protocol:
//
//   - chat_completions  OpenAI-compatible Chat Completions: /v1/chat/completions + messages
//   - responses         OpenAI Responses API: /v1/responses + instructions/input
//
// Non-OpenAI providers always use chat_completions as a placeholder default.
const (
	MonitorAPIModeChatCompletions = "chat_completions"
	MonitorAPIModeResponses       = "responses"
)

// ChannelMonitor is the service-layer model for a channel monitor configuration.
// Not directly exposed as an ent type.
type ChannelMonitor struct {
	ID              int64
	Name            string
	Provider        string
	APIMode         string
	Endpoint        string
	APIKey          string // Decrypted plaintext API key (internal use only; handler layer must not serialize directly)
	PrimaryModel    string
	ExtraModels     []string
	GroupName       string
	Enabled         bool
	IntervalSeconds int
	JitterSeconds   int // 每次调度 ± [0, jitter] 的均匀随机偏移（秒）；0 = 固定间隔
	LastCheckedAt   *time.Time
	CreatedBy       int64
	CreatedAt       time.Time
	UpdatedAt       time.Time

	// Custom request snapshot (from template copy or manual entry; read directly at runtime)
	TemplateID       *int64            // UI grouping + one-click apply only; not used at runtime
	ExtraHeaders     map[string]string // Merged with adapter default headers; user takes priority
	BodyOverrideMode string            // off / merge / replace
	BodyOverride     map[string]any    // Used only when mode != off

	// APIKeyDecryptFailed indicates the APIKey field could not be decrypted (key mismatch or corruption).
	// When true, APIKey is empty string, and the runner/RunCheck must skip this monitor and prompt re-entry.
	APIKeyDecryptFailed bool
}

// ChannelMonitorListParams holds list query filter parameters.
type ChannelMonitorListParams struct {
	Page     int
	PageSize int
	Provider string
	Enabled  *bool
	Search   string
}

// ChannelMonitorCreateParams holds creation parameters.
type ChannelMonitorCreateParams struct {
	Name             string
	Provider         string
	APIMode          string
	Endpoint         string
	APIKey           string
	PrimaryModel     string
	ExtraModels      []string
	GroupName        string
	Enabled          bool
	IntervalSeconds  int
	JitterSeconds    int
	CreatedBy        int64
	TemplateID       *int64
	ExtraHeaders     map[string]string
	BodyOverrideMode string
	BodyOverride     map[string]any
}

// ChannelMonitorUpdateParams holds update parameters (pointer fields mean "not provided if nil").
type ChannelMonitorUpdateParams struct {
	Name            *string
	Provider        *string
	APIMode         *string
	Endpoint        *string
	APIKey          *string // Empty string = no change; non-empty = overwrite
	PrimaryModel    *string
	ExtraModels     *[]string
	GroupName       *string
	Enabled         *bool
	IntervalSeconds *int
	JitterSeconds   *int
	// Custom snapshot fields: nil pointer = no update, non-nil = overwrite.
	// TemplateID uses ClearTemplate flag for explicit three-state handling:
	// nil=no update, &nil=clear, &&id=set to id.
	TemplateID       *int64
	ClearTemplate    bool // When true, ignores TemplateID and sets monitor's template_id to NULL
	ExtraHeaders     *map[string]string
	BodyOverrideMode *string
	BodyOverride     *map[string]any
}

// CheckResult holds the outcome of a single model check.
type CheckResult struct {
	Model         string
	Status        string // operational / degraded / failed / error
	LatencyMs     *int
	PingLatencyMs *int
	Message       string
	CheckedAt     time.Time
}

// UserMonitorView is the read-only user overview of a monitor
// (primary model latest status + 7d availability + extra model statuses).
type UserMonitorView struct {
	ID                   int64
	Name                 string
	Provider             string
	GroupName            string
	PrimaryModel         string
	PrimaryStatus        string
	PrimaryLatencyMs     *int
	PrimaryPingLatencyMs *int    // Latest ping latency for the primary model
	Availability7d       float64 // 0-100
	ExtraModels          []ExtraModelStatus
	Timeline             []UserMonitorTimelinePoint // Primary model recent N history points (checked_at DESC, newest first)
}

// UserMonitorTimelinePoint is a lightweight timeline data point (message stripped to reduce payload).
type UserMonitorTimelinePoint struct {
	Status        string    `json:"status"`
	LatencyMs     *int      `json:"latency_ms"`
	PingLatencyMs *int      `json:"ping_latency_ms"`
	CheckedAt     time.Time `json:"checked_at"`
}

// ExtraModelStatus holds the latest status for an extra model.
type ExtraModelStatus struct {
	Model     string
	Status    string
	LatencyMs *int
}

// UserMonitorDetail is the read-only detail view of a monitor
// (all models with 7d/15d/30d availability and average latency).
type UserMonitorDetail struct {
	ID        int64
	Name      string
	Provider  string
	GroupName string
	Models    []ModelDetail
}

// ModelDetail holds availability and latency statistics for a single model.
type ModelDetail struct {
	Model           string
	LatestStatus    string
	LatestLatencyMs *int
	Availability7d  float64 // 0-100
	Availability15d float64
	Availability30d float64
	AvgLatency7dMs  *int
}

// ChannelMonitorHistoryRow is the data submitted to the repository for history insertion.
type ChannelMonitorHistoryRow struct {
	MonitorID     int64
	Model         string
	Status        string
	LatencyMs     *int
	PingLatencyMs *int
	Message       string
	CheckedAt     time.Time
}

// ChannelMonitorHistoryEntry is the data returned from history queries (includes ent primary key).
type ChannelMonitorHistoryEntry struct {
	ID            int64
	Model         string
	Status        string
	LatencyMs     *int
	PingLatencyMs *int
	Message       string
	CheckedAt     time.Time
}

// ChannelMonitorLatest holds the most recent check summary for a model (used in UserMonitorView aggregation).
type ChannelMonitorLatest struct {
	Model         string
	Status        string
	LatencyMs     *int
	PingLatencyMs *int
	CheckedAt     time.Time
}

// ChannelMonitorAvailability holds a model's availability and average latency
// within a given time window (used in UserMonitorDetail aggregation).
type ChannelMonitorAvailability struct {
	Model             string
	WindowDays        int
	TotalChecks       int
	OperationalChecks int // operational + degraded count as available
	AvailabilityPct   float64
	AvgLatencyMs      *int
}

// MonitorStatusSummary aggregates monitor status for admin list views (single repo query, no N+1).
// PrimaryStatus/PrimaryLatencyMs describe the primary model's latest state;
// Availability7d is the primary model's 7-day availability percentage;
// ExtraModels describe extra models' latest states (for hover display).
type MonitorStatusSummary struct {
	PrimaryStatus    string // Empty string means no history
	PrimaryLatencyMs *int
	Availability7d   float64 // 0-100; 0 when no history
	ExtraModels      []ExtraModelStatus
}
