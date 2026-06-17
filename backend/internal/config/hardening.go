// Package config — security hardening helpers.
//
// This file adds opt-in strict-validation switches and secret-redaction helpers
// without changing existing default behavior. All hardening flags default to
// false / disabled so previously valid deployments continue to load.
//
// Findings addressed (additive only):
//
//	G2/G10 — CORS strict credentials validation (cors.strict_validation)
//	G3     — Server mode strict validation (server.require_explicit_mode)
//	G4     — OAuth/OIDC graceful degradation (oauth.auto_disable_incomplete)
//	G5     — TOTP strict key requirement (totp.require_configured_key)
//	G6     — JWT rotation support (jwt.previous_secret)
//	G8     — Sensitive config redaction (RedactedSummary)
//	G9     — Bootstrap secret lifecycle warnings
package config

import (
	"log/slog"
	"strings"
)

// HardeningConfig 收纳安全加固相关的开关，与既有字段并列。
//
// 设计原则：
//   - 所有字段默认 false / 空值，等价于既有行为。
//   - 开启后才会变更校验/降级语义；不破坏既有部署。
//   - 仅在 Validate() 与 load() 中读取；运行时其它代码无需感知。
type HardeningConfig struct {
	// CORSStrictValidation: 严格 CORS 凭据校验。
	// 开启后：cors.allow_credentials=true 且 allowed_origins 为空或含 '*' → Validate 返回错误。
	// 关闭（默认）：保持既有行为（cors.go 中静默降级 + 日志告警）。
	CORSStrictValidation bool `mapstructure:"cors_strict_validation"`

	// ServerRequireExplicitMode: 强制要求 server.mode 显式配置。
	// 开启后：mode 为空时返回错误（不再回落到 debug）。
	// 关闭（默认）：保持既有 debug 回落行为，但发出 warning。
	ServerRequireExplicitMode bool `mapstructure:"server_require_explicit_mode"`

	// OAuthAutoDisableIncomplete: OAuth/OIDC 缺字段时优雅降级。
	// 开启后：enabled=true 但缺关键字段 → 自动 disable + warn，不阻塞启动。
	// 关闭（默认）：保持既有严格校验语义。
	OAuthAutoDisableIncomplete bool `mapstructure:"oauth_auto_disable_incomplete"`

	// TOTPRequireConfiguredKey: 强制要求 totp.encryption_key 显式配置。
	// 开启后：encryption_key 为空时返回错误（不再自动生成）。
	// 关闭（默认）：保持既有自动生成 + warning 行为。
	TOTPRequireConfiguredKey bool `mapstructure:"totp_require_configured_key"`
}

// RedactedSummary 返回适合写入日志的脱敏配置摘要。
// 不包含全部字段，仅高价值审计字段；敏感字段统一脱敏。
//
// 调用方典型用途：
//
//	slog.Info("config loaded", "summary", cfg.RedactedSummary())
func (c *Config) RedactedSummary() map[string]any {
	if c == nil {
		return nil
	}
	return map[string]any{
		"run_mode":                          c.RunMode,
		"server.mode":                       c.Server.Mode,
		"server.host":                       c.Server.Host,
		"server.port":                       c.Server.Port,
		"server.frontend_url":               c.Server.FrontendURL,
		"log.level":                         c.Log.Level,
		"log.format":                        c.Log.Format,
		"cors.allowed_origins":              c.CORS.AllowedOrigins,
		"cors.allow_credentials":            c.CORS.AllowCredentials,
		"database.host":                     c.Database.Host,
		"database.port":                     c.Database.Port,
		"database.user":                     c.Database.User,
		"database.dbname":                   c.Database.DBName,
		"database.password":                 redactSecret(c.Database.Password),
		"redis.host":                        c.Redis.Host,
		"redis.port":                        c.Redis.Port,
		"redis.password":                    redactSecret(c.Redis.Password),
		"jwt.secret":                        redactSecret(c.JWT.Secret),
		"jwt.previous_secret":               redactSecret(c.JWT.PreviousSecret),
		"jwt.expire_hour":                   c.JWT.ExpireHour,
		"totp.encryption_key":               redactSecret(c.Totp.EncryptionKey),
		"totp.encryption_key_configured":    c.Totp.EncryptionKeyConfigured,
		"linuxdo.enabled":                   c.LinuxDo.Enabled,
		"linuxdo.client_secret":             redactSecret(c.LinuxDo.ClientSecret),
		"oidc.enabled":                      c.OIDC.Enabled,
		"oidc.client_secret":                redactSecret(c.OIDC.ClientSecret),
		"dingtalk.enabled":                  c.DingTalk.Enabled,
		"dingtalk.client_secret":            redactSecret(c.DingTalk.ClientSecret),
		"github_oauth.enabled":              c.GitHubOAuth.Enabled,
		"github_oauth.client_secret":        redactSecret(c.GitHubOAuth.ClientSecret),
		"google_oauth.enabled":              c.GoogleOAuth.Enabled,
		"google_oauth.client_secret":        redactSecret(c.GoogleOAuth.ClientSecret),
		"gemini.oauth.client_secret":        redactSecret(c.Gemini.OAuth.ClientSecret),
		"hardening.cors_strict_validation":  c.Hardening.CORSStrictValidation,
		"hardening.server_require_mode":     c.Hardening.ServerRequireExplicitMode,
		"hardening.oauth_auto_disable":      c.Hardening.OAuthAutoDisableIncomplete,
		"hardening.totp_require_configured": c.Hardening.TOTPRequireConfiguredKey,
	}
}

// sanitizeHeaderNamesForLog redacts header names that look like auth credentials.
// Header NAMES themselves are not secrets, but operators occasionally allowlist
// or force-remove headers such as Authorization/Cookie/Set-Cookie/X-API-Key,
// which leak intent and may correlate with adjacent log fields. Mask those.
func sanitizeHeaderNamesForLog(names []string) []string {
	if len(names) == 0 {
		return nil
	}
	sensitive := map[string]struct{}{
		"authorization":       {},
		"proxy-authorization": {},
		"cookie":              {},
		"set-cookie":          {},
		"x-api-key":           {},
		"x-auth-token":        {},
	}
	out := make([]string, 0, len(names))
	for _, n := range names {
		key := strings.ToLower(strings.TrimSpace(n))
		if _, hit := sensitive[key]; hit {
			out = append(out, "<sensitive-header>")
			continue
		}
		out = append(out, n)
	}
	return out
}

// redactSecret returns a fixed-length mask for any non-empty secret.
// Empty values are reported as "<empty>" so leaks of empty secrets remain visible.
// Non-empty values are never partially exposed (no first-N-char preview):
// even short prefixes can dramatically narrow brute-force surface for low-entropy strings.
func redactSecret(s string) string {
	if strings.TrimSpace(s) == "" {
		return "<empty>"
	}
	return "<redacted>"
}

// hardeningCORSValidate enforces strict CORS credentials rules when enabled.
// Returns nil when hardening is off (default), preserving prior behavior.
func (c *Config) hardeningCORSValidate() error {
	if !c.Hardening.CORSStrictValidation {
		return nil
	}
	if !c.CORS.AllowCredentials {
		return nil
	}
	origins := c.CORS.AllowedOrigins
	if len(origins) == 0 {
		return errStrictCORSEmpty
	}
	for _, o := range origins {
		if strings.TrimSpace(o) == "*" {
			return errStrictCORSWildcard
		}
	}
	return nil
}

// hardeningServerModeValidate enforces strict server.mode rules when enabled.
// Caller must invoke BEFORE the implicit "debug" fallback in load().
func (c *Config) hardeningServerModeValidate(rawMode string) error {
	if !c.Hardening.ServerRequireExplicitMode {
		return nil
	}
	if strings.TrimSpace(rawMode) == "" {
		return errStrictServerModeEmpty
	}
	return nil
}

// hardeningTOTPValidate enforces strict TOTP encryption key rules when enabled.
// Caller invokes BEFORE the auto-generate branch in load().
func (c *Config) hardeningTOTPValidate(rawKey string) error {
	if !c.Hardening.TOTPRequireConfiguredKey {
		return nil
	}
	if strings.TrimSpace(rawKey) == "" {
		return errStrictTOTPMissing
	}
	return nil
}

// hardeningOAuthMaybeDisable inspects providers and disables those with
// incomplete enabled=true configs when auto-disable is on. Returns the set
// of provider names that were disabled (for logging).
//
// Recognizes: linuxdo_connect, oidc_connect, github_oauth, google_oauth.
// WeChat/DingTalk providers have richer state machines and remain strict.
func (c *Config) hardeningOAuthMaybeDisable() []string {
	if !c.Hardening.OAuthAutoDisableIncomplete {
		return nil
	}
	var disabled []string

	if c.LinuxDo.Enabled && !linuxDoComplete(&c.LinuxDo) {
		c.LinuxDo.Enabled = false
		disabled = append(disabled, "linuxdo_connect")
	}
	if c.OIDC.Enabled && !oidcComplete(&c.OIDC) {
		c.OIDC.Enabled = false
		disabled = append(disabled, "oidc_connect")
	}
	if c.GitHubOAuth.Enabled && !emailOAuthComplete(&c.GitHubOAuth) {
		c.GitHubOAuth.Enabled = false
		disabled = append(disabled, "github_oauth")
	}
	if c.GoogleOAuth.Enabled && !emailOAuthComplete(&c.GoogleOAuth) {
		c.GoogleOAuth.Enabled = false
		disabled = append(disabled, "google_oauth")
	}
	return disabled
}

func linuxDoComplete(cfg *LinuxDoConnectConfig) bool {
	if strings.TrimSpace(cfg.ClientID) == "" ||
		strings.TrimSpace(cfg.AuthorizeURL) == "" ||
		strings.TrimSpace(cfg.TokenURL) == "" ||
		strings.TrimSpace(cfg.UserInfoURL) == "" ||
		strings.TrimSpace(cfg.RedirectURL) == "" ||
		strings.TrimSpace(cfg.FrontendRedirectURL) == "" {
		return false
	}
	method := strings.ToLower(strings.TrimSpace(cfg.TokenAuthMethod))
	if method == "" || method == "client_secret_post" || method == "client_secret_basic" {
		if strings.TrimSpace(cfg.ClientSecret) == "" {
			return false
		}
	}
	return true
}

func oidcComplete(cfg *OIDCConnectConfig) bool {
	if strings.TrimSpace(cfg.ClientID) == "" ||
		strings.TrimSpace(cfg.IssuerURL) == "" ||
		strings.TrimSpace(cfg.RedirectURL) == "" ||
		strings.TrimSpace(cfg.FrontendRedirectURL) == "" {
		return false
	}
	if !scopeContainsOpenID(cfg.Scopes) {
		return false
	}
	method := strings.ToLower(strings.TrimSpace(cfg.TokenAuthMethod))
	if method == "" || method == "client_secret_post" || method == "client_secret_basic" {
		if strings.TrimSpace(cfg.ClientSecret) == "" {
			return false
		}
	}
	return true
}

func emailOAuthComplete(cfg *EmailOAuthProviderConfig) bool {
	if strings.TrimSpace(cfg.ClientID) == "" ||
		strings.TrimSpace(cfg.ClientSecret) == "" ||
		strings.TrimSpace(cfg.RedirectURL) == "" ||
		strings.TrimSpace(cfg.FrontendRedirectURL) == "" {
		return false
	}
	return true
}

// validatePreviousJWTSecret enforces JWT rotation field hygiene without
// changing semantics for existing deployments.
//
// Rules:
//   - Empty (default) → no-op, rotation disabled.
//   - Non-empty → must be >= 32 bytes (same as primary secret).
//   - Non-empty AND equal to current secret → error (rotation is a no-op).
//
// Verification semantics (accepting tokens signed by either key) live in the
// JWT verification module; this function only gates config-shape errors.
func (c *Config) validatePreviousJWTSecret() error {
	prev := strings.TrimSpace(c.JWT.PreviousSecret)
	if prev == "" {
		return nil
	}
	if len([]byte(prev)) < 32 {
		return errPreviousJWTTooShort
	}
	if prev == strings.TrimSpace(c.JWT.Secret) {
		return errPreviousJWTSameAsCurrent
	}
	slog.Warn("jwt.previous_secret configured; running in dual-key verification mode. " +
		"Plan to clear this field after the rotation window closes.")
	return nil
}

// Sentinel errors — kept as package-level vars for test assertions.
var (
	errStrictCORSEmpty          = newConfigError("cors.allow_credentials=true requires explicit cors.allowed_origins (hardening.cors_strict_validation enabled)")
	errStrictCORSWildcard       = newConfigError("cors.allow_credentials=true cannot be combined with wildcard '*' origin (hardening.cors_strict_validation enabled)")
	errStrictServerModeEmpty    = newConfigError("server.mode is required (hardening.server_require_explicit_mode enabled); set to 'debug' or 'release'")
	errStrictTOTPMissing        = newConfigError("totp.encryption_key is required (hardening.totp_require_configured_key enabled); set a 64-hex-char value")
	errPreviousJWTTooShort      = newConfigError("jwt.previous_secret must be at least 32 bytes when set")
	errPreviousJWTSameAsCurrent = newConfigError("jwt.previous_secret must differ from jwt.secret (rotation no-op)")
)

type configError struct{ msg string }

func newConfigError(msg string) error { return &configError{msg: msg} }
func (e *configError) Error() string  { return e.msg }
