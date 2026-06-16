package service

import (
	"time"

	infraerrors "github.com/telagod/subme/internal/pkg/errors"
)

// Global constants for channel monitor subsystem.
// Hard-coded for MVP phase; can be promoted to config as needed.
const (
	// monitorRequestTimeout is the total timeout for a single model request (including body read).
	monitorRequestTimeout = 45 * time.Second
	// monitorPingTimeout is the timeout for HEAD request to endpoint origin.
	monitorPingTimeout = 8 * time.Second
	// monitorDegradedThreshold marks a successful request as degraded if it exceeds this duration.
	monitorDegradedThreshold = 6 * time.Second
	// monitorHistoryRetentionDays controls how many days of raw history to keep.
	// At 60s default interval * 30 days ~ 43200 rows/monitor/model, well within PG capacity.
	// The daily rollup table serves as a long-term fallback.
	monitorHistoryRetentionDays = 30
	// monitorRollupRetentionDays controls how many days of daily rollups to keep.
	monitorRollupRetentionDays = 30
	// monitorMaintenanceMaxDaysPerRun caps how many days a single maintenance run aggregates.
	monitorMaintenanceMaxDaysPerRun = 35
	// monitorWorkerConcurrency sets the pond pool size for concurrent monitor checks.
	monitorWorkerConcurrency = 5
	// monitorStartupLoadTimeout is the deadline for loading all enabled monitors at startup.
	monitorStartupLoadTimeout = 10 * time.Second
	// monitorMinIntervalSeconds and monitorMaxIntervalSeconds bound the user-configurable check interval.
	monitorMinIntervalSeconds = 15
	monitorMaxIntervalSeconds = 3600
	// monitorMessageMaxBytes caps the message field (aligned with schema/migration).
	monitorMessageMaxBytes = 500
	// monitorResponseMaxBytes caps the response body read per model request to prevent OOM.
	monitorResponseMaxBytes = 64 * 1024
	// monitorErrorBodySnippetMaxBytes caps the upstream error body snippet.
	// 300 bytes covers typical structured errors while leaving room for the prefix.
	monitorErrorBodySnippetMaxBytes = 300
	// monitorChallengeMin and monitorChallengeMax define the challenge operand range.
	monitorChallengeMin = 1
	monitorChallengeMax = 50

	// providerOpenAIPath is the OpenAI Chat Completions endpoint path.
	providerOpenAIPath = "/v1/chat/completions"
	// providerOpenAIResponsesPath is the OpenAI Responses API endpoint path.
	providerOpenAIResponsesPath = "/v1/responses"
	// providerAnthropicPath is the Anthropic Messages endpoint path.
	providerAnthropicPath = "/v1/messages"
	// providerGeminiPathTemplate is the Gemini generateContent path template with model placeholder.
	providerGeminiPathTemplate = "/v1beta/models/%s:generateContent"

	// MonitorProviderOpenAI, MonitorProviderAnthropic, MonitorProviderGemini are provider string constants (matching ent enum values).
	MonitorProviderOpenAI    = "openai"
	MonitorProviderAnthropic = "anthropic"
	MonitorProviderGemini    = "gemini"

	// MonitorStatusOperational and related constants are monitor status strings (matching ent enum).
	MonitorStatusOperational = "operational"
	MonitorStatusDegraded    = "degraded"
	MonitorStatusFailed      = "failed"
	MonitorStatusError       = "error"

	// Availability query windows in days.
	monitorAvailability7Days  = 7
	monitorAvailability15Days = 15
	monitorAvailability30Days = 30

	// MonitorHistoryDefaultLimit is the default number of history rows returned (shared with handler layer).
	MonitorHistoryDefaultLimit = 100
	// MonitorHistoryMaxLimit is the maximum number of history rows returned (shared with handler layer).
	MonitorHistoryMaxLimit = 1000

	// monitorTimelineMaxPoints caps the per-monitor timeline points in user view.
	monitorTimelineMaxPoints = 60

	// monitorEndpointResolveTimeout is the deadline for DNS resolution during endpoint validation.
	monitorEndpointResolveTimeout = 5 * time.Second

	// Checker / runner behavior parameters (eliminate magic numbers).

	// monitorAnthropicAPIVersion is the Anthropic Messages API version header value.
	monitorAnthropicAPIVersion = "2023-06-01"
	// monitorChallengeMaxTokens caps max_tokens for challenge requests.
	monitorChallengeMaxTokens = 50

	// monitorRunOneBuffer is the extra timeout buffer for runOne beyond request and ping timeouts.
	monitorRunOneBuffer = 10 * time.Second

	// HTTP transport parameters.
	monitorIdleConnTimeout       = 30 * time.Second
	monitorTLSHandshakeTimeout   = 10 * time.Second
	monitorResponseHeaderTimeout = 30 * time.Second
	monitorPingDiscardMaxBytes   = 1024

	// Custom dialer parameters.
	monitorDialTimeout   = 10 * time.Second
	monitorDialKeepAlive = 30 * time.Second
)

// Sentinel errors for channel monitor business logic.
var (
	ErrChannelMonitorNotFound = infraerrors.NotFound(
		"CHANNEL_MONITOR_NOT_FOUND", "the requested channel monitor does not exist",
	)
	ErrChannelMonitorInvalidProvider = infraerrors.BadRequest(
		"CHANNEL_MONITOR_INVALID_PROVIDER", "provider must be one of openai/anthropic/gemini",
	)
	ErrChannelMonitorInvalidAPIMode = infraerrors.BadRequest(
		"CHANNEL_MONITOR_INVALID_API_MODE", "api_mode must be chat_completions or responses; responses is only supported for openai",
	)
	ErrChannelMonitorInvalidRequestBody = infraerrors.BadRequest(
		"CHANNEL_MONITOR_INVALID_REQUEST_BODY", "openai replace-mode body_override must include non-empty messages for chat_completions or non-empty instructions and input for responses",
	)
	ErrChannelMonitorInvalidInterval = infraerrors.BadRequest(
		"CHANNEL_MONITOR_INVALID_INTERVAL", "interval_seconds must be in [15, 3600]",
	)
	ErrChannelMonitorInvalidJitter = infraerrors.BadRequest(
		"CHANNEL_MONITOR_INVALID_JITTER", "jitter_seconds must be >= 0 and interval_seconds - jitter_seconds must be >= 15",
	)
	ErrChannelMonitorInvalidEndpoint = infraerrors.BadRequest(
		"CHANNEL_MONITOR_INVALID_ENDPOINT", "endpoint must be a valid https URL",
	)
	ErrChannelMonitorEndpointScheme = infraerrors.BadRequest(
		"CHANNEL_MONITOR_ENDPOINT_SCHEME", "endpoint must use https scheme",
	)
	ErrChannelMonitorEndpointPath = infraerrors.BadRequest(
		"CHANNEL_MONITOR_ENDPOINT_PATH", "endpoint must be base origin only (no path/query/fragment)",
	)
	ErrChannelMonitorEndpointPrivate = infraerrors.BadRequest(
		"CHANNEL_MONITOR_ENDPOINT_PRIVATE", "endpoint must be a public host",
	)
	ErrChannelMonitorEndpointUnreachable = infraerrors.BadRequest(
		"CHANNEL_MONITOR_ENDPOINT_UNREACHABLE", "endpoint hostname could not be resolved",
	)
	ErrChannelMonitorMissingAPIKey = infraerrors.BadRequest(
		"CHANNEL_MONITOR_MISSING_API_KEY", "api_key is required when creating a monitor",
	)
	ErrChannelMonitorMissingPrimaryModel = infraerrors.BadRequest(
		"CHANNEL_MONITOR_MISSING_PRIMARY_MODEL", "primary_model is required",
	)
	ErrChannelMonitorAPIKeyDecryptFailed = infraerrors.InternalServer(
		"CHANNEL_MONITOR_KEY_DECRYPT_FAILED", "api key decryption failed; please re-edit the monitor with a fresh key",
	)
)
