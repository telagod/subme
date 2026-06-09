package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/telagod/subme/internal/pkg/ctxkey"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// responsesFailedError matches the OpenAI Responses protocol error sub-object.
type responsesFailedError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// responsesFailedBody mirrors the response sub-object from apicompat.makeResponsesCompletedEvent.
// Output uses an empty slice (not nil) so it marshals to `[]` rather than `null`.
type responsesFailedBody struct {
	ID     string               `json:"id"`
	Object string               `json:"object"`
	Model  string               `json:"model,omitempty"`
	Status string               `json:"status"`
	Output []any                `json:"output"`
	Error  responsesFailedError `json:"error"`
}

// responsesFailedEvent is the top-level structure written into the SSE data line.
// sequence_number is intentionally omitted: the spec marks it optional, and the
// reliable last-seq is unavailable when this function is called.
type responsesFailedEvent struct {
	Type     string              `json:"type"`
	Response responsesFailedBody `json:"response"`
}

// writeResponsesFailedSSE emits a `response.failed` SSE event following the
// OpenAI Responses API protocol after the stream has already started.
//
// Once SSE headers and any data (e.g. keep-alive ping comments while waiting
// for a slot) have been flushed, the HTTP 200 status code is locked in.
// Subsequent gateway errors can only be communicated via SSE events.
// A generic `event: error` frame is not a protocol-defined terminal event;
// strict SDKs like Codex CLI would throw "stream closed before
// response.completed" without a proper terminal event.
//
// The field set mirrors apicompat.makeResponsesCompletedEvent:
// id/object/model/status/output/error. sequence_number is omitted to avoid
// violating monotonicity when the current stream sequence is unknown.
//
// Returns true if an SSE write was attempted (caller should return regardless
// of whether the underlying Write succeeded). Returns false when the writer
// does not support Flusher, meaning the error cannot be reported via SSE;
// the caller should also return and let the connection close.
func writeResponsesFailedSSE(c *gin.Context, errCategory, errMessage string) bool {
	flushWriter, canFlush := c.Writer.(http.Flusher)
	if !canFlush {
		return false
	}

	eventBytes, marshalErr := json.Marshal(responsesFailedEvent{
		Type: "response.failed",
		Response: responsesFailedBody{
			ID:     buildSyntheticResponseID(c),
			Object: "response",
			Model:  extractRequestModel(c),
			Status: "failed",
			Output: []any{},
			Error: responsesFailedError{
				Code:    translateResponsesErrorCode(errCategory),
				Message: errMessage,
			},
		},
	})
	if marshalErr != nil {
		_ = c.Error(marshalErr)
		return true
	}

	if _, writeErr := fmt.Fprintf(c.Writer, "event: response.failed\ndata: %s\n\n", eventBytes); writeErr != nil {
		_ = c.Error(writeErr)
		return true
	}
	flushWriter.Flush()
	return true
}

// inboundIsResponses determines whether the current request targets any
// /responses route variant.
//
// A direct comparison against GetInboundEndpoint(c) == EndpointResponses
// is insufficient because NormalizeInboundEndpoint only recognises paths
// containing "/v1/responses"; the project registers multiple route groups
// (gateway_v1, top-level bare, codex direct) where routes like
// r.POST("/responses", ...) have a FullPath without the "/v1/" prefix,
// causing them to be normalised to the raw path, which would prevent
// protocol-compliant terminal events from being emitted.
//
// Suffix-matching on FullPath covers all registered variants:
//   - /v1/responses
//   - /v1/responses/compact
//   - /responses
//   - /responses/compact
//   - /backend-api/codex/responses
//   - /backend-api/codex/responses/compact
func inboundIsResponses(c *gin.Context) bool {
	if c == nil {
		return false
	}
	routePath := strings.TrimRight(c.FullPath(), "/")
	if routePath == "" && c.Request != nil && c.Request.URL != nil {
		routePath = strings.TrimRight(c.Request.URL.Path, "/")
	}
	if routePath == "" {
		return false
	}
	return strings.HasSuffix(routePath, "/responses") || strings.Contains(routePath, "/responses/")
}

// buildSyntheticResponseID creates a stable id for synthesised response.failed events.
// It prefers the server-generated request_id (stored in request.Context by request_logger)
// so client-side errors can be correlated with server logs; falls back to a fresh UUID.
func buildSyntheticResponseID(c *gin.Context) string {
	if c != nil && c.Request != nil {
		if reqID, ok := c.Request.Context().Value(ctxkey.RequestID).(string); ok {
			if cleaned := strings.TrimSpace(reqID); cleaned != "" {
				return "resp_" + strings.ReplaceAll(cleaned, "-", "")
			}
		}
	}
	return "resp_" + strings.ReplaceAll(uuid.NewString(), "-", "")
}

// extractRequestModel retrieves the inbound model set by assignOpsRequestContext.
// Returns "" when absent; the caller decides whether to omit the field.
func extractRequestModel(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if val, exists := c.Get(opsModelKey); exists {
		if str, ok := val.(string); ok {
			return strings.TrimSpace(str)
		}
	}
	return ""
}

// translateResponsesErrorCode maps internal error categories to Responses protocol error.code values.
// Unrecognised categories are returned as-is to ensure readability.
func translateResponsesErrorCode(category string) string {
	switch category {
	case "rate_limit_error":
		return "rate_limit_exceeded"
	case "invalid_request_error":
		return "invalid_request"
	case "permission_error":
		return "permission_denied"
	case "authentication_error":
		return "authentication_failed"
	case "upstream_error":
		return "upstream_error"
	case "server_error", "api_error", "":
		return "server_error"
	default:
		return category
	}
}
