package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
)

const statusClientClosedRequest = 499

func concurrencyErrorResponse(err error, slot string) (int, string, string) {
	var waitQueueFullErr *WaitQueueFullError
	if errors.As(err, &waitQueueFullErr) {
		return http.StatusTooManyRequests, "rate_limit_error",
			"Too many pending requests, please retry later"
	}

	var ce *ConcurrencyError
	if errors.As(err, &ce) {
		label := slot
		if ce.SlotType != "" {
			label = ce.SlotType
		}
		msg := fmt.Sprintf("Concurrency limit exceeded for %s, please retry later", label)
		return http.StatusTooManyRequests, "rate_limit_error", msg
	}

	if errors.Is(err, context.Canceled) {
		return statusClientClosedRequest, "api_error", "context canceled"
	}

	return http.StatusServiceUnavailable, "api_error",
		"Service temporarily unavailable, please retry later"
}
