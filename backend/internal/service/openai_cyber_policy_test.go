//go:build unit

package service

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestDetectCyberPolicy_Verdicts(t *testing.T) {
	cases := []struct {
		name     string
		payload  string
		want     CyberPolicyVerdict
		wantMsg  string
		wantCode string
	}{
		{
			name:     "blocked_top_level",
			payload:  `{"error":{"code":"cyber_policy","message":"flagged for cyber"}}`,
			want:     VerdictBlocked,
			wantMsg:  "flagged for cyber",
			wantCode: "cyber_policy",
		},
		{
			name:     "blocked_response_wrapped",
			payload:  `{"response":{"error":{"code":"cyber_policy","message":"  blocked  "}}}`,
			want:     VerdictBlocked,
			wantMsg:  "blocked",
			wantCode: "cyber_policy",
		},
		{
			name:     "blocked_case_insensitive",
			payload:  `{"error":{"code":"Cyber_Policy"}}`,
			want:     VerdictBlocked,
			wantMsg:  "",
			wantCode: "cyber_policy",
		},
		{
			name:     "suspicious_high_risk_keyword",
			payload:  `{"error":{"type":"safety_error","message":"high-risk cyber activity detected"}}`,
			want:     VerdictSuspicious,
			wantMsg:  "high-risk cyber activity detected",
			wantCode: "",
		},
		{
			name:    "none_content_policy",
			payload: `{"error":{"code":"content_policy","message":"x"}}`,
			want:    VerdictNone,
		},
		{
			name:    "none_upstream_error",
			payload: `{"error":{"code":"upstream_error"}}`,
			want:    VerdictNone,
		},
		{
			name:    "none_empty",
			payload: ``,
			want:    VerdictNone,
		},
		{
			name:    "none_invalid_json",
			payload: `{not json}`,
			want:    VerdictNone,
		},
		{
			name:    "none_no_error_field",
			payload: `{"output":[{"type":"message"}]}`,
			want:    VerdictNone,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := DetectCyberPolicy([]byte(tc.payload))
			require.Equal(t, tc.want, got.Verdict, "verdict mismatch")
			if tc.want == VerdictNone {
				require.False(t, got.Hit())
				return
			}
			require.True(t, got.Hit())
			require.Equal(t, tc.wantCode, got.Code)
			require.Equal(t, tc.wantMsg, got.Message)
			require.NotEmpty(t, got.Summary, "summary populated when hit")
		})
	}
}

func TestMarkAndGetOpsCyberPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	require.Nil(t, GetOpsCyberPolicy(c), "no mark initially")

	MarkOpsCyberPolicy(c, CyberPolicyMark{
		Verdict:        VerdictBlocked,
		Message:        "blocked",
		UpstreamStatus: 400,
	})

	got := GetOpsCyberPolicy(c)
	require.NotNil(t, got)
	require.Equal(t, "cyber_policy", got.Code, "code auto-filled when verdict=Blocked")
	require.Equal(t, "blocked", got.Message)
	require.Equal(t, 400, got.UpstreamStatus)
}

func TestMarkOpsCyberPolicy_FirstWins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	MarkOpsCyberPolicy(c, CyberPolicyMark{Verdict: VerdictBlocked, Message: "first"})
	MarkOpsCyberPolicy(c, CyberPolicyMark{Verdict: VerdictBlocked, Message: "second"})

	got := GetOpsCyberPolicy(c)
	require.NotNil(t, got)
	require.Equal(t, "first", got.Message, "first mark wins, later marks ignored")
}

func TestMarkOpsCyberPolicy_NilContext(t *testing.T) {
	MarkOpsCyberPolicy(nil, CyberPolicyMark{Verdict: VerdictBlocked})
	require.Nil(t, GetOpsCyberPolicy(nil))
}

func TestClearOpsCyberPolicy_AllowsRemark(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	MarkOpsCyberPolicy(c, CyberPolicyMark{Verdict: VerdictBlocked, Message: "first", UpstreamStatus: 200})
	require.NotNil(t, GetOpsCyberPolicy(c))

	ClearOpsCyberPolicy(c)
	require.Nil(t, GetOpsCyberPolicy(c), "mark invisible after Clear")

	MarkOpsCyberPolicy(c, CyberPolicyMark{Verdict: VerdictBlocked, Message: "second", UpstreamStatus: 400})
	got := GetOpsCyberPolicy(c)
	require.NotNil(t, got, "re-mark after Clear must take effect")
	require.Equal(t, "second", got.Message)
}

func TestDetectAndMarkOpsCyberPolicy_OnlyBlockedMarks(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("blocked marks", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		got := DetectAndMarkOpsCyberPolicy(c, []byte(`{"error":{"code":"cyber_policy","message":"m"}}`), 400)
		require.Equal(t, VerdictBlocked, got.Verdict)
		require.NotNil(t, GetOpsCyberPolicy(c))
		require.Equal(t, 400, GetOpsCyberPolicy(c).UpstreamStatus)
	})

	t.Run("suspicious does not mark", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		got := DetectAndMarkOpsCyberPolicy(c, []byte(`{"error":{"message":"high-risk cyber"}}`), 400)
		require.Equal(t, VerdictSuspicious, got.Verdict)
		require.Nil(t, GetOpsCyberPolicy(c), "suspicious does not auto-mark in phase-1")
	})

	t.Run("none does not mark", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		got := DetectAndMarkOpsCyberPolicy(c, []byte(`{"error":{"code":"content_policy"}}`), 400)
		require.Equal(t, VerdictNone, got.Verdict)
		require.Nil(t, GetOpsCyberPolicy(c))
	})
}

func TestCyberPolicyVerdict_String(t *testing.T) {
	require.Equal(t, "none", VerdictNone.String())
	require.Equal(t, "blocked", VerdictBlocked.String())
	require.Equal(t, "suspicious", VerdictSuspicious.String())
}

func TestRequestTypeCyberBlocked_Wire(t *testing.T) {
	require.Equal(t, "cyber", RequestTypeCyberBlocked.String())
	require.True(t, RequestTypeCyberBlocked.IsValid())
	require.Equal(t, RequestTypeCyberBlocked, RequestType(4).Normalize())

	parsed, err := ParseUsageRequestType("cyber")
	require.NoError(t, err)
	require.Equal(t, RequestTypeCyberBlocked, parsed)
}
