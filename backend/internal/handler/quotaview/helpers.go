// Package quotaview provides shared quota response helpers for user and admin handlers.
// Extracted to avoid import cycles between handler and handler/admin packages.
package quotaview

import (
	"time"

	"github.com/telagod/subme/internal/pkg/timezone"
	"github.com/telagod/subme/internal/service"
)

// LazyZeroQuotaForResponse zeroes expired window usage for display (no DB write).
// When includeWindowStart is true, *_window_start fields are added (admin debugging).
func LazyZeroQuotaForResponse(r service.UserPlatformQuotaRecord, now time.Time, includeWindowStart bool) map[string]any {
	daySlice := computeWindowSlice(r.DailyUsageUSD, r.DailyLimitUSD, r.DailyWindowStart, NeedsDailyReset(r.DailyWindowStart, now), nextDailyResetTime(now), includeWindowStart)
	weekSlice := computeWindowSlice(r.WeeklyUsageUSD, r.WeeklyLimitUSD, r.WeeklyWindowStart, NeedsWeeklyReset(r.WeeklyWindowStart, now), nextWeeklyResetTime(now), includeWindowStart)
	monthSlice := computeWindowSlice(r.MonthlyUsageUSD, r.MonthlyLimitUSD, r.MonthlyWindowStart, NeedsMonthlyReset(r.MonthlyWindowStart, now), NextMonthlyResetTimeFrom(r.MonthlyWindowStart, now), includeWindowStart)

	payload := map[string]any{
		"platform":                 r.Platform,
		"daily_usage_usd":          daySlice.usage,
		"daily_limit_usd":          daySlice.limit,
		"daily_window_resets_at":   daySlice.resetsAt,
		"weekly_usage_usd":         weekSlice.usage,
		"weekly_limit_usd":         weekSlice.limit,
		"weekly_window_resets_at":  weekSlice.resetsAt,
		"monthly_usage_usd":        monthSlice.usage,
		"monthly_limit_usd":        monthSlice.limit,
		"monthly_window_resets_at": monthSlice.resetsAt,
	}

	if includeWindowStart {
		payload["daily_window_start"] = daySlice.windowStart
		payload["weekly_window_start"] = weekSlice.windowStart
		payload["monthly_window_start"] = monthSlice.windowStart
	}
	return payload
}

type windowSlice struct {
	usage       float64
	limit       *float64
	resetsAt    *string
	windowStart *string
}

func computeWindowSlice(usage float64, limit *float64, start *time.Time, isExpired bool, nextReset time.Time, wantStart bool) windowSlice {
	ws := windowSlice{usage: usage, limit: limit}

	if isExpired {
		ws.usage = 0
		ws.resetsAt = nil
	} else if start != nil {
		formatted := nextReset.Format(time.RFC3339)
		ws.resetsAt = &formatted
	}

	if wantStart && start != nil {
		formatted := start.Format(time.RFC3339)
		ws.windowStart = &formatted
	}
	return ws
}

// NeedsDailyReset reports whether the daily window has expired.
// The window is expired when start is before today's midnight in the configured timezone.
func NeedsDailyReset(start *time.Time, now time.Time) bool {
	if start == nil {
		return false
	}
	return start.Before(timezone.StartOfDay(now))
}

func NeedsWeeklyReset(start *time.Time, now time.Time) bool {
	if start == nil {
		return false
	}
	return start.Before(timezone.StartOfWeek(now))
}

// NeedsMonthlyReset uses a 30-day rolling window (matches subscription model).
func NeedsMonthlyReset(start *time.Time, now time.Time) bool {
	if start == nil {
		return false
	}
	return now.Sub(*start) >= 30*24*time.Hour
}

func nextDailyResetTime(now time.Time) time.Time {
	return timezone.StartOfDay(now).AddDate(0, 0, 1)
}

func nextWeeklyResetTime(now time.Time) time.Time {
	return timezone.StartOfWeek(now).AddDate(0, 0, 7)
}

// NextMonthlyResetTimeFrom computes the next 30-day rolling window reset.
//
//   - start != nil: returns start + 30 days (aligned with billing_cache_service)
//   - start == nil:  falls back to now + 30 days to avoid nil panic
//
// Exported so tests can call it directly.
func NextMonthlyResetTimeFrom(start *time.Time, now time.Time) time.Time {
	if start == nil {
		return now.Add(30 * 24 * time.Hour)
	}
	return start.Add(30 * 24 * time.Hour)
}
