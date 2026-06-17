package service

import (
	"context"
	"net/url"
	"strings"
)

// Channel monitor parameter validation and normalization helpers.
// Validation failures return pre-defined Err* sentinel errors from channel_monitor_const.go.
// Error messages intentionally omit specific IP/hostname to avoid leaking internal topology.

// validateProvider checks whether the given provider string is registered in the adapter table.
// Adding a new provider only requires registering an adapter in channel_monitor_checker.go.
func validateProvider(prov string) error {
	if !isSupportedProvider(prov) {
		return ErrChannelMonitorInvalidProvider
	}
	return nil
}

// validateAPIMode checks the combination of provider and api_mode.
// The "responses" mode is only valid for the OpenAI provider; other providers use chat_completions.
func validateAPIMode(prov, mode string) error {
	normalized := defaultAPIMode(mode)
	if normalized == MonitorAPIModeChatCompletions {
		return nil
	}
	if normalized == MonitorAPIModeResponses {
		if prov == "" || prov == MonitorProviderOpenAI {
			return nil
		}
		return ErrChannelMonitorInvalidAPIMode
	}
	return ErrChannelMonitorInvalidAPIMode
}

// validateInterval checks that interval_seconds falls within the allowed range.
func validateInterval(seconds int) error {
	if seconds < monitorMinIntervalSeconds || seconds > monitorMaxIntervalSeconds {
		return ErrChannelMonitorInvalidInterval
	}
	return nil
}

// validateJitter 校验 jitter_seconds：必须非负，且 interval - jitter 不得低于最小检测间隔，
// 防止随机偏移后实际等待时长过短打爆上游。
func validateJitter(jitterSec, intervalSec int) error {
	if jitterSec < 0 || intervalSec-jitterSec < monitorMinIntervalSeconds {
		return ErrChannelMonitorInvalidJitter
	}
	return nil
}

// validateEndpoint checks the endpoint URL:
//   - scheme must be https (rejects http to avoid plaintext credentials and SSRF surface)
//   - must be origin-only (no path/query/fragment) to prevent path duplication
//   - hostname must not be localhost/metadata or other known metadata hostnames
//   - all resolved IPs must be public (rejects loopback/RFC1918/link-local/ULA for SSRF defense)
//
// Error messages do not expose specific IP/hostname to avoid leaking internal topology.
func validateEndpoint(rawEP string) error {
	trimmed := strings.TrimSpace(rawEP)
	if trimmed == "" {
		return ErrChannelMonitorInvalidEndpoint
	}
	parsed, parseErr := url.Parse(trimmed)
	if parseErr != nil {
		return ErrChannelMonitorInvalidEndpoint
	}
	if parsed.Scheme != "https" {
		return ErrChannelMonitorEndpointScheme
	}
	if parsed.Host == "" {
		return ErrChannelMonitorInvalidEndpoint
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return ErrChannelMonitorEndpointPath
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return ErrChannelMonitorEndpointPath
	}

	host := parsed.Hostname()
	resolveCtx, resolveCancel := context.WithTimeout(context.Background(), monitorEndpointResolveTimeout)
	defer resolveCancel()
	isBlocked, resolveErr := isPrivateOrLoopbackHost(resolveCtx, host)
	if resolveErr != nil {
		return ErrChannelMonitorEndpointUnreachable
	}
	if isBlocked {
		return ErrChannelMonitorEndpointPrivate
	}
	return nil
}

// normalizeEndpoint strips surrounding whitespace and trailing slashes to ensure
// consistent origin storage. validateEndpoint must have already verified format.
func normalizeEndpoint(rawEP string) string {
	cleaned := strings.TrimSpace(rawEP)
	cleaned = strings.TrimRight(cleaned, "/")
	return cleaned
}

// normalizeModels deduplicates and trims model names while preserving input order.
func normalizeModels(items []string) []string {
	if len(items) == 0 {
		return []string{}
	}
	visited := make(map[string]struct{}, len(items))
	deduped := make([]string, 0, len(items))
	for idx := 0; idx < len(items); idx++ {
		trimmed := strings.TrimSpace(items[idx])
		if trimmed == "" {
			continue
		}
		if _, exists := visited[trimmed]; exists {
			continue
		}
		visited[trimmed] = struct{}{}
		deduped = append(deduped, trimmed)
	}
	return deduped
}

// defaultAPIMode normalizes an empty api_mode to chat_completions for backward compatibility.
func defaultAPIMode(mode string) string {
	stripped := strings.TrimSpace(mode)
	if stripped == "" {
		return MonitorAPIModeChatCompletions
	}
	return stripped
}
