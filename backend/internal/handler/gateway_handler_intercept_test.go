package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestDetectInterceptType_MaxTokensOneHaikuRequiresClaudeCodeClient(t *testing.T) {
	body := []byte(`{"messages":[{"role":"user","content":[{"type":"text","text":"hello"}]}]}`)

	notClaudeCode := detectInterceptType(body, "claude-haiku-4-5", 1, false)
	require.Equal(t, InterceptTypeNone, notClaudeCode)

	isClaudeCode := detectInterceptType(body, "claude-haiku-4-5", 1, true)
	require.Equal(t, InterceptTypeMaxTokensOneHaiku, isClaudeCode)
}

// TestIsMaxTokensOneHaikuRequest_StreamAndNonStream 锁定 streaming/非流式探测均会被识别
// 回归保护：cc-switch v3.9.0 起健康检查改为流式，需保证流式探测也被拦截而不是漏到上游。
func TestIsMaxTokensOneHaikuRequest_StreamAndNonStream(t *testing.T) {
	require.True(t, isMaxTokensOneHaikuRequest("claude-haiku-4-5", 1), "non-stream haiku probe must be intercepted")
	require.True(t, isMaxTokensOneHaikuRequest("claude-3-5-haiku-latest", 1), "stream haiku probe must be intercepted (signature lost isStream)")
	require.False(t, isMaxTokensOneHaikuRequest("claude-haiku-4-5", 2), "max_tokens != 1 must not be intercepted")
	require.False(t, isMaxTokensOneHaikuRequest("claude-sonnet-4-5", 1), "non-haiku model must not be intercepted")
}

func TestDetectInterceptType_SuggestionModeUnaffected(t *testing.T) {
	body := []byte(`{
		"messages":[{
			"role":"user",
			"content":[{"type":"text","text":"[SUGGESTION MODE:foo]"}]
		}],
		"system":[]
	}`)

	got := detectInterceptType(body, "claude-sonnet-4-5", 256, false)
	require.Equal(t, InterceptTypeSuggestionMode, got)
}

func TestSendMockInterceptResponse_MaxTokensOneHaiku(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)

	sendMockInterceptResponse(ctx, "claude-haiku-4-5", InterceptTypeMaxTokensOneHaiku)

	require.Equal(t, http.StatusOK, rec.Code)

	var response map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, "max_tokens", response["stop_reason"])

	id, ok := response["id"].(string)
	require.True(t, ok)
	require.True(t, strings.HasPrefix(id, "msg_bdrk_"))

	content, ok := response["content"].([]any)
	require.True(t, ok)
	require.NotEmpty(t, content)

	firstBlock, ok := content[0].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "#", firstBlock["text"])

	usage, ok := response["usage"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, float64(1), usage["output_tokens"])
}
