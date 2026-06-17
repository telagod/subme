package config

import (
	"errors"
	"strings"
	"testing"

	"github.com/spf13/viper"
)

// Validate(): hardening flags off by default → behavior unchanged.
func TestHardeningDefaultOff_PreservesBehavior(t *testing.T) {
	cfg := minimalValidConfig(t)
	if err := cfg.Validate(); err != nil {
		t.Fatalf("baseline Validate failed: %v", err)
	}
}

// G2/G10: strict CORS — empty origins with credentials → error.
func TestHardening_StrictCORS_EmptyOrigins(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.Hardening.CORSStrictValidation = true
	cfg.CORS.AllowCredentials = true
	cfg.CORS.AllowedOrigins = nil

	err := cfg.Validate()
	if err == nil {
		t.Fatalf("expected strict CORS to reject empty origins with credentials")
	}
	if !errors.Is(err, errStrictCORSEmpty) {
		t.Fatalf("expected errStrictCORSEmpty, got: %v", err)
	}
}

// G2/G10: strict CORS — wildcard '*' with credentials → error.
func TestHardening_StrictCORS_WildcardOrigin(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.Hardening.CORSStrictValidation = true
	cfg.CORS.AllowCredentials = true
	cfg.CORS.AllowedOrigins = []string{"*"}

	err := cfg.Validate()
	if err == nil {
		t.Fatalf("expected strict CORS to reject wildcard with credentials")
	}
	if !errors.Is(err, errStrictCORSWildcard) {
		t.Fatalf("expected errStrictCORSWildcard, got: %v", err)
	}
}

// G2/G10: strict CORS — explicit origins + credentials → OK.
func TestHardening_StrictCORS_ExplicitOriginsOK(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.Hardening.CORSStrictValidation = true
	cfg.CORS.AllowCredentials = true
	cfg.CORS.AllowedOrigins = []string{"https://example.com"}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("explicit origins with credentials should pass: %v", err)
	}
}

// G2/G10: strict CORS — credentials off → no check applied.
func TestHardening_StrictCORS_CredentialsOff(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.Hardening.CORSStrictValidation = true
	cfg.CORS.AllowCredentials = false
	cfg.CORS.AllowedOrigins = nil

	if err := cfg.Validate(); err != nil {
		t.Fatalf("strict CORS without credentials must pass: %v", err)
	}
}

// G6: previous_secret rotation — empty → no-op.
func TestHardening_PreviousJWT_Empty(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.JWT.PreviousSecret = ""
	if err := cfg.Validate(); err != nil {
		t.Fatalf("empty previous_secret should be allowed: %v", err)
	}
}

// G6: previous_secret rotation — too short → error.
func TestHardening_PreviousJWT_TooShort(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.JWT.PreviousSecret = "short"
	err := cfg.Validate()
	if !errors.Is(err, errPreviousJWTTooShort) {
		t.Fatalf("expected errPreviousJWTTooShort, got: %v", err)
	}
}

// G6: previous_secret rotation — equal to current → error (no-op rotation).
func TestHardening_PreviousJWT_SameAsCurrent(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.JWT.PreviousSecret = cfg.JWT.Secret
	err := cfg.Validate()
	if !errors.Is(err, errPreviousJWTSameAsCurrent) {
		t.Fatalf("expected errPreviousJWTSameAsCurrent, got: %v", err)
	}
}

// G6: previous_secret rotation — valid distinct 32+ byte secret → OK.
func TestHardening_PreviousJWT_Valid(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.JWT.PreviousSecret = strings.Repeat("y", 32)
	if err := cfg.Validate(); err != nil {
		t.Fatalf("valid previous_secret should pass: %v", err)
	}
}

// G3: server.mode hardening hook (unit-level — checks the gate itself).
func TestHardening_ServerMode_StrictMode(t *testing.T) {
	cfg := &Config{}
	cfg.Hardening.ServerRequireExplicitMode = true

	if err := cfg.hardeningServerModeValidate(""); !errors.Is(err, errStrictServerModeEmpty) {
		t.Fatalf("expected errStrictServerModeEmpty, got: %v", err)
	}
	if err := cfg.hardeningServerModeValidate("release"); err != nil {
		t.Fatalf("non-empty mode should pass: %v", err)
	}

	cfg.Hardening.ServerRequireExplicitMode = false
	if err := cfg.hardeningServerModeValidate(""); err != nil {
		t.Fatalf("strict-off should always pass: %v", err)
	}
}

// G5: TOTP hardening hook (unit-level).
func TestHardening_TOTP_StrictKeyRequired(t *testing.T) {
	cfg := &Config{}
	cfg.Hardening.TOTPRequireConfiguredKey = true

	if err := cfg.hardeningTOTPValidate(""); !errors.Is(err, errStrictTOTPMissing) {
		t.Fatalf("expected errStrictTOTPMissing, got: %v", err)
	}
	if err := cfg.hardeningTOTPValidate("deadbeef"); err != nil {
		t.Fatalf("non-empty TOTP key should pass: %v", err)
	}

	cfg.Hardening.TOTPRequireConfiguredKey = false
	if err := cfg.hardeningTOTPValidate(""); err != nil {
		t.Fatalf("strict-off should always pass: %v", err)
	}
}

// G4: OAuth auto-disable — incomplete linuxdo provider gets disabled.
func TestHardening_OAuthAutoDisable_LinuxDoIncomplete(t *testing.T) {
	cfg := &Config{}
	cfg.Hardening.OAuthAutoDisableIncomplete = true
	cfg.LinuxDo.Enabled = true
	// Missing client_id et al.

	disabled := cfg.hardeningOAuthMaybeDisable()
	if len(disabled) != 1 || disabled[0] != "linuxdo_connect" {
		t.Fatalf("expected linuxdo_connect to be disabled, got: %v", disabled)
	}
	if cfg.LinuxDo.Enabled {
		t.Fatalf("LinuxDo.Enabled should be false after auto-disable")
	}
}

// G4: OAuth auto-disable — off by default leaves provider enabled.
func TestHardening_OAuthAutoDisable_OffByDefault(t *testing.T) {
	cfg := &Config{}
	cfg.Hardening.OAuthAutoDisableIncomplete = false
	cfg.LinuxDo.Enabled = true
	disabled := cfg.hardeningOAuthMaybeDisable()
	if len(disabled) != 0 {
		t.Fatalf("auto-disable off should be no-op, got: %v", disabled)
	}
	if !cfg.LinuxDo.Enabled {
		t.Fatalf("LinuxDo.Enabled must remain true when hardening disabled")
	}
}

// G8: redactSecret never exposes content.
func TestRedactSecret(t *testing.T) {
	if got := redactSecret(""); got != "<empty>" {
		t.Fatalf("empty secret should be <empty>, got: %s", got)
	}
	if got := redactSecret("   "); got != "<empty>" {
		t.Fatalf("whitespace secret should be <empty>, got: %s", got)
	}
	if got := redactSecret("super-secret-value"); got != "<redacted>" {
		t.Fatalf("non-empty secret must be <redacted>, got: %s", got)
	}
}

// G8: header-name sanitizer redacts sensitive auth headers, passes others.
func TestSanitizeHeaderNamesForLog(t *testing.T) {
	in := []string{"X-Trace-ID", "Authorization", "cookie", "X-Custom"}
	out := sanitizeHeaderNamesForLog(in)
	want := []string{"X-Trace-ID", "<sensitive-header>", "<sensitive-header>", "X-Custom"}
	if len(out) != len(want) {
		t.Fatalf("len mismatch: got=%v want=%v", out, want)
	}
	for i := range out {
		if out[i] != want[i] {
			t.Fatalf("index %d: got=%q want=%q", i, out[i], want[i])
		}
	}
}

// G8: RedactedSummary never leaks raw secret values.
func TestRedactedSummary_NoLeak(t *testing.T) {
	cfg := minimalValidConfig(t)
	cfg.Database.Password = "plaintext-db-pass"
	cfg.JWT.PreviousSecret = strings.Repeat("y", 32)
	cfg.LinuxDo.ClientSecret = "oauth-secret-XYZ"

	summary := cfg.RedactedSummary()
	for k, v := range summary {
		s, ok := v.(string)
		if !ok {
			continue
		}
		switch k {
		case "database.password":
			if strings.Contains(s, "plaintext-db-pass") {
				t.Fatalf("database.password leaked: %s", s)
			}
		case "jwt.previous_secret":
			if strings.Contains(s, "y") && len(s) > len("<redacted>")+2 {
				// "<redacted>" itself doesn't contain "y"; guard against full leak.
				t.Fatalf("jwt.previous_secret leaked: %s", s)
			}
		case "linuxdo.client_secret":
			if strings.Contains(s, "XYZ") {
				t.Fatalf("linuxdo.client_secret leaked: %s", s)
			}
		}
	}
}

// minimalValidConfig loads a default-populated Config through Load() and
// resets the JWT secret so Validate() passes baseline. This avoids hand-
// maintaining a long list of required gateway/openai_ws fields.
//
// Each call resets viper to keep test isolation.
func minimalValidConfig(t *testing.T) *Config {
	t.Helper()
	viper.Reset()
	t.Setenv("JWT_SECRET", strings.Repeat("x", 32))
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error in test seed: %v", err)
	}
	return cfg
}
