package admin

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/telagod/subme/internal/pkg/openai"
	"github.com/telagod/subme/internal/pkg/response"
	"github.com/telagod/subme/internal/service"
)

const codexImportClockSkewSeconds int64 = 120

type CodexSessionImportRequest struct {
	Content                 string         `json:"content"`
	Contents                []string       `json:"contents"`
	Name                    string         `json:"name"`
	Notes                   *string        `json:"notes"`
	GroupIDs                []int64        `json:"group_ids"`
	ProxyID                 *int64         `json:"proxy_id"`
	Concurrency             *int           `json:"concurrency"`
	Priority                *int           `json:"priority"`
	RateMultiplier          *float64       `json:"rate_multiplier"`
	LoadFactor              *int           `json:"load_factor"`
	ExpiresAt               *int64         `json:"expires_at"`
	AutoPauseOnExpired      *bool          `json:"auto_pause_on_expired"`
	CredentialExtras        map[string]any `json:"credential_extras"`
	Extra                   map[string]any `json:"extra"`
	UpdateExisting          *bool          `json:"update_existing"`
	SkipDefaultGroupBind    *bool          `json:"skip_default_group_bind"`
	ConfirmMixedChannelRisk *bool          `json:"confirm_mixed_channel_risk"`
}

type CodexSessionImportResult struct {
	Total    int                         `json:"total"`
	Created  int                         `json:"created"`
	Updated  int                         `json:"updated"`
	Skipped  int                         `json:"skipped"`
	Failed   int                         `json:"failed"`
	Items    []CodexSessionImportItem    `json:"items,omitempty"`
	Warnings []CodexSessionImportMessage `json:"warnings,omitempty"`
	Errors   []CodexSessionImportMessage `json:"errors,omitempty"`
}

type CodexSessionImportItem struct {
	Index     int    `json:"index"`
	Name      string `json:"name,omitempty"`
	Action    string `json:"action"`
	AccountID int64  `json:"account_id,omitempty"`
	Message   string `json:"message,omitempty"`
}

type CodexSessionImportMessage struct {
	Index   int    `json:"index"`
	Name    string `json:"name,omitempty"`
	Message string `json:"message"`
}

type codexImportEntry struct {
	Index int
	Value any
}

type codexImportAccount struct {
	Name           string
	AccessToken    string
	RefreshToken   string
	IDToken        string
	Email          string
	AccountID      string
	UserID         string
	PlanType       string
	Organization   string
	Credentials    map[string]any
	Extra          map[string]any
	TokenExpiresAt *time.Time
	IdentityKeys   []string
	WarningTexts   []string
}

type codexJWTClaims struct {
	Sub        string                `json:"sub"`
	Email      string                `json:"email"`
	Exp        int64                 `json:"exp"`
	Iat        int64                 `json:"iat"`
	OpenAIAuth *codexJWTOpenAIClaims `json:"https://api.openai.com/auth,omitempty"`
}

type codexJWTOpenAIClaims struct {
	ChatGPTAccountID string                     `json:"chatgpt_account_id"`
	ChatGPTUserID    string                     `json:"chatgpt_user_id"`
	ChatGPTPlanType  string                     `json:"chatgpt_plan_type"`
	UserID           string                     `json:"user_id"`
	POID             string                     `json:"poid"`
	Organizations    []openai.OrganizationClaim `json:"organizations"`
}

type codexAccountIndex struct {
	accountsByKey map[string]service.Account
}

func (h *AccountHandler) ImportCodexSession(c *gin.Context) {
	var payload CodexSessionImportRequest
	if bindErr := c.ShouldBindJSON(&payload); bindErr != nil {
		response.BadRequest(c, "Invalid request: "+bindErr.Error())
		return
	}
	if payload.Concurrency != nil && *payload.Concurrency < 0 {
		response.BadRequest(c, "concurrency must be non-negative")
		return
	}
	if payload.Priority != nil && *payload.Priority < 0 {
		response.BadRequest(c, "priority must be non-negative")
		return
	}
	if payload.RateMultiplier != nil && *payload.RateMultiplier < 0 {
		response.BadRequest(c, "rate_multiplier must be non-negative")
		return
	}
	if payload.LoadFactor != nil && *payload.LoadFactor > 10000 {
		response.BadRequest(c, "load_factor must not exceed 10000")
		return
	}

	importEntries, parseErr := collectImportEntries(payload)
	if parseErr != nil {
		response.BadRequest(c, parseErr.Error())
		return
	}
	if len(importEntries) == 0 {
		response.BadRequest(c, "Please provide an accessToken or Codex session JSON")
		return
	}

	executeAdminIdempotentJSON(c, "admin.accounts.import_codex_session", payload, service.DefaultWriteIdempotencyTTL(), func(ctx context.Context) (any, error) {
		return h.executeCodexImport(ctx, payload, importEntries)
	})
}

func (h *AccountHandler) executeCodexImport(ctx context.Context, payload CodexSessionImportRequest, entries []codexImportEntry) (CodexSessionImportResult, error) {
	report := CodexSessionImportResult{
		Total: len(entries),
		Items: make([]CodexSessionImportItem, 0, len(entries)),
	}

	existingAccounts, listErr := h.listAccountsFiltered(ctx, service.PlatformOpenAI, service.AccountTypeOAuth, "", "", 0, "", "created_at", "desc")
	if listErr != nil {
		return report, listErr
	}
	idx := newAccountIndex(existingAccounts)

	allowUpdate := true
	if payload.UpdateExisting != nil {
		allowUpdate = *payload.UpdateExisting
	}
	concurrencyVal := 3
	if payload.Concurrency != nil {
		concurrencyVal = *payload.Concurrency
	}
	priorityVal := 50
	if payload.Priority != nil {
		priorityVal = *payload.Priority
	}
	cleanedExtras := filterProtectedCredentialKeys(payload.CredentialExtras)
	skipDefaultGroup := false
	if payload.SkipDefaultGroupBind != nil {
		skipDefaultGroup = *payload.SkipDefaultGroupBind
	}
	bypassMixedCheck := payload.ConfirmMixedChannelRisk != nil && *payload.ConfirmMixedChannelRisk

	visitedIdentity := map[string]int{}
	for _, entry := range entries {
		normalized, normErr := normalizeImportEntry(entry)
		if normErr != nil {
			report.Failed++
			report.Items = append(report.Items, CodexSessionImportItem{
				Index:   entry.Index,
				Action:  "failed",
				Message: normErr.Error(),
			})
			report.Errors = append(report.Errors, CodexSessionImportMessage{
				Index:   entry.Index,
				Message: normErr.Error(),
			})
			continue
		}
		displayName := deriveAccountDisplayName(payload.Name, normalized, entry.Index, len(entries))
		effectiveExpiry, credExpiry, autoPauseFlag, expiryWarns, expiryErr := computeImportExpiry(payload, normalized)
		if expiryErr != nil {
			report.Failed++
			report.Items = append(report.Items, CodexSessionImportItem{
				Index:   entry.Index,
				Name:    displayName,
				Action:  "failed",
				Message: expiryErr.Error(),
			})
			report.Errors = append(report.Errors, CodexSessionImportMessage{
				Index:   entry.Index,
				Name:    displayName,
				Message: expiryErr.Error(),
			})
			continue
		}
		normalized.WarningTexts = append(normalized.WarningTexts, expiryWarns...)
		if credExpiry != nil {
			normalized.Credentials["expires_at"] = credExpiry.Format(time.RFC3339)
		}
		mergedCreds := combineMaps(normalized.Credentials, cleanedExtras)
		mergedExtra := combineMaps(payload.Extra, normalized.Extra)
		for _, warnText := range normalized.WarningTexts {
			report.Warnings = append(report.Warnings, CodexSessionImportMessage{
				Index:   entry.Index,
				Name:    displayName,
				Message: warnText,
			})
		}

		if dupIdx, isDup := findFirstSeenIdentity(visitedIdentity, normalized.IdentityKeys); isDup {
			dupMsg := fmt.Sprintf("Duplicate of import entry #%d, skipped", dupIdx)
			report.Skipped++
			report.Items = append(report.Items, CodexSessionImportItem{
				Index:   entry.Index,
				Name:    displayName,
				Action:  "skipped",
				Message: dupMsg,
			})
			report.Warnings = append(report.Warnings, CodexSessionImportMessage{
				Index:   entry.Index,
				Name:    displayName,
				Message: dupMsg,
			})
			continue
		}
		recordSeenIdentity(visitedIdentity, normalized.IdentityKeys, entry.Index)

		if existing := idx.Find(normalized.IdentityKeys); existing != nil && allowUpdate {
			merged := mergeAccountCredentials(existing.Credentials, mergedCreds, normalized)
			mergedEx := combineMaps(existing.Extra, mergedExtra)
			updateReq := &service.UpdateAccountInput{
				Credentials:        merged,
				Extra:              mergedEx,
				Concurrency:        payload.Concurrency,
				Priority:           payload.Priority,
				RateMultiplier:     payload.RateMultiplier,
				LoadFactor:         payload.LoadFactor,
				ExpiresAt:          effectiveExpiry,
				AutoPauseOnExpired: autoPauseFlag,
			}
			if payload.ProxyID != nil {
				updateReq.ProxyID = payload.ProxyID
			}
			if len(payload.GroupIDs) > 0 {
				gids := append([]int64(nil), payload.GroupIDs...)
				updateReq.GroupIDs = &gids
				updateReq.SkipMixedChannelCheck = bypassMixedCheck
			}
			updated, updateErr := h.adminService.UpdateAccount(ctx, existing.ID, updateReq)
			if updateErr != nil {
				report.Failed++
				report.Items = append(report.Items, CodexSessionImportItem{
					Index:   entry.Index,
					Name:    displayName,
					Action:  "failed",
					Message: updateErr.Error(),
				})
				report.Errors = append(report.Errors, CodexSessionImportMessage{
					Index:   entry.Index,
					Name:    displayName,
					Message: updateErr.Error(),
				})
				continue
			}
			if h.tokenCacheInvalidator != nil && updated != nil {
				_ = h.tokenCacheInvalidator.InvalidateToken(ctx, updated)
			}
			report.Updated++
			aid := existing.ID
			if updated != nil {
				aid = updated.ID
				idx.Add(*updated)
			}
			report.Items = append(report.Items, CodexSessionImportItem{
				Index:     entry.Index,
				Name:      displayName,
				Action:    "updated",
				AccountID: aid,
			})
			continue
		}

		created, createErr := h.adminService.CreateAccount(ctx, &service.CreateAccountInput{
			Name:                  displayName,
			Notes:                 payload.Notes,
			Platform:              service.PlatformOpenAI,
			Type:                  service.AccountTypeOAuth,
			Credentials:           mergedCreds,
			Extra:                 mergedExtra,
			ProxyID:               payload.ProxyID,
			Concurrency:           concurrencyVal,
			Priority:              priorityVal,
			RateMultiplier:        payload.RateMultiplier,
			LoadFactor:            payload.LoadFactor,
			GroupIDs:              payload.GroupIDs,
			ExpiresAt:             effectiveExpiry,
			AutoPauseOnExpired:    autoPauseFlag,
			SkipDefaultGroupBind:  skipDefaultGroup,
			SkipMixedChannelCheck: bypassMixedCheck,
		})
		if createErr != nil {
			report.Failed++
			report.Items = append(report.Items, CodexSessionImportItem{
				Index:   entry.Index,
				Name:    displayName,
				Action:  "failed",
				Message: createErr.Error(),
			})
			report.Errors = append(report.Errors, CodexSessionImportMessage{
				Index:   entry.Index,
				Name:    displayName,
				Message: createErr.Error(),
			})
			continue
		}
		if created != nil {
			idx.Add(*created)
		}
		report.Created++
		aid := int64(0)
		if created != nil {
			aid = created.ID
		}
		report.Items = append(report.Items, CodexSessionImportItem{
			Index:     entry.Index,
			Name:      displayName,
			Action:    "created",
			AccountID: aid,
		})
	}

	return report, nil
}

func collectImportEntries(payload CodexSessionImportRequest) ([]codexImportEntry, error) {
	rawContents := make([]string, 0, 1+len(payload.Contents))
	if strings.TrimSpace(payload.Content) != "" {
		rawContents = append(rawContents, payload.Content)
	}
	for _, c := range payload.Contents {
		if strings.TrimSpace(c) != "" {
			rawContents = append(rawContents, c)
		}
	}

	var result []codexImportEntry
	for _, raw := range rawContents {
		parsed, parseErr := parseImportContent(raw)
		if parseErr != nil {
			return nil, parseErr
		}
		for _, val := range parsed {
			result = append(result, codexImportEntry{
				Index: len(result) + 1,
				Value: val,
			})
		}
	}
	return result, nil
}

func parseImportContent(raw string) ([]any, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}

	if startsWithJSON(trimmed) {
		decoded, decErr := decodeJSONStream(trimmed)
		if decErr != nil {
			if strings.Contains(trimmed, "\n") {
				if lineVals, lineErr := parseImportByLines(trimmed); lineErr == nil {
					return lineVals, nil
				}
			}
			return nil, fmt.Errorf("JSON parse error: %w", decErr)
		}
		return flattenImportValues(decoded), nil
	}

	return parseImportByLines(trimmed)
}

func parseImportByLines(raw string) ([]any, error) {
	collected := make([]any, 0)
	for _, ln := range strings.Split(raw, "\n") {
		ln = strings.TrimSpace(ln)
		if ln == "" {
			continue
		}
		if startsWithJSON(ln) {
			decoded, decErr := decodeJSONStream(ln)
			if decErr != nil {
				return nil, fmt.Errorf("JSON parse error at entry %d: %w", len(collected)+1, decErr)
			}
			collected = append(collected, flattenImportValues(decoded)...)
			continue
		}
		collected = append(collected, ln)
	}
	return collected, nil
}

func decodeJSONStream(raw string) ([]any, error) {
	dec := json.NewDecoder(strings.NewReader(raw))
	dec.UseNumber()
	vals := make([]any, 0, 1)
	for {
		var val any
		decErr := dec.Decode(&val)
		if errors.Is(decErr, io.EOF) {
			break
		}
		if decErr != nil {
			return nil, decErr
		}
		vals = append(vals, val)
	}
	if len(vals) == 0 {
		return nil, errors.New("empty JSON content")
	}
	return vals, nil
}

func flattenImportValues(vals []any) []any {
	flat := make([]any, 0, len(vals))
	var recurse func(any)
	recurse = func(v any) {
		if arr, ok := v.([]any); ok {
			for _, elem := range arr {
				recurse(elem)
			}
			return
		}
		flat = append(flat, v)
	}
	for _, v := range vals {
		recurse(v)
	}
	return flat
}

func normalizeImportEntry(entry codexImportEntry) (*codexImportAccount, error) {
	ts := time.Now().UTC()
	acct := &codexImportAccount{
		Credentials: map[string]any{},
		Extra: map[string]any{
			"import_source": "codex_session",
			"imported_at":   ts.Format(time.RFC3339),
		},
	}

	switch raw := entry.Value.(type) {
	case string:
		acct.AccessToken = strings.TrimSpace(raw)
	case map[string]any:
		acct.AccessToken = extractNestedString(raw,
			[]string{"tokens", "access_token"},
			[]string{"tokens", "accessToken"},
			[]string{"access_token"},
			[]string{"accessToken"},
			[]string{"token"},
		)
		acct.RefreshToken = extractNestedString(raw,
			[]string{"tokens", "refresh_token"},
			[]string{"tokens", "refreshToken"},
			[]string{"refresh_token"},
			[]string{"refreshToken"},
		)
		acct.IDToken = extractNestedString(raw,
			[]string{"tokens", "id_token"},
			[]string{"tokens", "idToken"},
			[]string{"id_token"},
			[]string{"idToken"},
		)
		acct.Email = extractNestedString(raw, []string{"email"}, []string{"user", "email"})
		acct.AccountID = extractNestedString(raw,
			[]string{"chatgpt_account_id"},
			[]string{"chatgptAccountId"},
			[]string{"account_id"},
			[]string{"accountId"},
			[]string{"account", "id"},
			[]string{"account", "account_id"},
			[]string{"account", "chatgpt_account_id"},
		)
		acct.UserID = extractNestedString(raw,
			[]string{"chatgpt_user_id"},
			[]string{"chatgptUserId"},
			[]string{"user_id"},
			[]string{"userId"},
			[]string{"user", "id"},
		)
		acct.PlanType = extractNestedString(raw,
			[]string{"plan_type"},
			[]string{"planType"},
			[]string{"account", "plan_type"},
			[]string{"account", "planType"},
		)
		acct.Organization = extractNestedString(raw,
			[]string{"organization_id"},
			[]string{"organizationId"},
			[]string{"org_id"},
			[]string{"orgId"},
		)
		acct.Name = extractNestedString(raw, []string{"name"}, []string{"user", "name"})
		if provider := extractNestedString(raw, []string{"auth_provider"}, []string{"authProvider"}); provider != "" {
			acct.Extra["auth_provider"] = provider
		}
		if sessToken := extractNestedString(raw, []string{"session_token"}, []string{"sessionToken"}); sessToken != "" {
			acct.Extra["session_token_present"] = true
			acct.WarningTexts = append(acct.WarningTexts, "sessionToken was ignored and will not be stored as an OAuth refresh_token")
		}
		if sessionExp, ok := resolveTimeAtPath(raw, []string{"expires"}); ok {
			acct.Extra["session_expires_at"] = sessionExp.Format(time.RFC3339)
		}
		if tokenExp, ok := resolveFirstTime(raw,
			[]string{"tokens", "expires_at"},
			[]string{"tokens", "expiresAt"},
			[]string{"expires_at"},
			[]string{"expiresAt"},
		); ok {
			if tokenExp.Unix() <= ts.Unix()-codexImportClockSkewSeconds {
				return nil, fmt.Errorf("access_token has expired: %s", tokenExp.Format(time.RFC3339))
			}
			acct.TokenExpiresAt = &tokenExp
			acct.Credentials["expires_at"] = tokenExp.Format(time.RFC3339)
		}
		copyExtraString(raw, acct.Extra, "user_image", []string{"user", "image"})
		copyExtraString(raw, acct.Extra, "user_picture", []string{"user", "picture"})
		copyExtraString(raw, acct.Extra, "account_structure", []string{"account", "structure"})
		copyExtraString(raw, acct.Extra, "account_residency_region", []string{"account", "residencyRegion"})
		copyExtraString(raw, acct.Extra, "compute_residency", []string{"account", "computeResidency"})
	default:
		return nil, fmt.Errorf("unsupported format for entry #%d", entry.Index)
	}

	if acct.AccessToken == "" {
		return nil, errors.New("missing accessToken or access_token field")
	}
	acct.Credentials["access_token"] = acct.AccessToken
	if acct.RefreshToken != "" {
		acct.Credentials["refresh_token"] = acct.RefreshToken
		acct.Credentials["client_id"] = openai.ClientID
	}
	if acct.IDToken != "" {
		acct.Credentials["id_token"] = acct.IDToken
		_ = enrichFromJWT(acct, acct.IDToken, false, ts)
	}
	if enrichErr := enrichFromJWT(acct, acct.AccessToken, true, ts); enrichErr != nil {
		return nil, enrichErr
	}
	if _, ok := acct.Credentials["expires_at"]; !ok {
		acct.WarningTexts = append(acct.WarningTexts, "Unable to parse token expiry from accessToken; verify validity manually after import")
	}
	if acct.RefreshToken == "" {
		acct.WarningTexts = append(acct.WarningTexts, "No refresh_token provided; automatic token renewal will not work after expiry")
	}

	setCredentialIfPresent(acct.Credentials, "email", acct.Email)
	setCredentialIfPresent(acct.Credentials, "chatgpt_account_id", acct.AccountID)
	setCredentialIfPresent(acct.Credentials, "chatgpt_user_id", acct.UserID)
	setCredentialIfPresent(acct.Credentials, "organization_id", acct.Organization)
	setCredentialIfPresent(acct.Credentials, "plan_type", acct.PlanType)

	fp := computeTokenFingerprint(acct.AccessToken)
	acct.Extra["access_token_sha256"] = fp
	acct.IdentityKeys = assembleIdentityKeys(acct.AccountID, acct.UserID, acct.Email, acct.AccessToken)
	acct.Name = deriveImportAccountName(acct, entry.Index)

	return acct, nil
}

func enrichFromJWT(acct *codexImportAccount, token string, checkExpiry bool, now time.Time) error {
	claims, decErr := decodeJWTPayload(token)
	if decErr != nil {
		if checkExpiry {
			acct.WarningTexts = append(acct.WarningTexts, "accessToken is not a parseable JWT; cannot verify expiry or account identity")
		}
		return nil
	}
	if checkExpiry && claims.Exp > 0 {
		if now.Unix() > claims.Exp+codexImportClockSkewSeconds {
			return fmt.Errorf("access_token has expired: %s", time.Unix(claims.Exp, 0).UTC().Format(time.RFC3339))
		}
		exp := time.Unix(claims.Exp, 0).UTC()
		acct.TokenExpiresAt = &exp
		acct.Credentials["expires_at"] = exp.Format(time.RFC3339)
	}
	if acct.Email == "" {
		acct.Email = strings.TrimSpace(claims.Email)
	}
	if claims.OpenAIAuth == nil {
		if acct.UserID == "" {
			acct.UserID = strings.TrimSpace(claims.Sub)
		}
		return nil
	}
	if acct.AccountID == "" {
		acct.AccountID = strings.TrimSpace(claims.OpenAIAuth.ChatGPTAccountID)
	}
	if acct.UserID == "" {
		acct.UserID = strings.TrimSpace(claims.OpenAIAuth.ChatGPTUserID)
	}
	if acct.UserID == "" {
		acct.UserID = strings.TrimSpace(claims.OpenAIAuth.UserID)
	}
	if acct.PlanType == "" {
		acct.PlanType = strings.TrimSpace(claims.OpenAIAuth.ChatGPTPlanType)
	}
	if acct.Organization == "" {
		acct.Organization = strings.TrimSpace(claims.OpenAIAuth.POID)
	}
	if acct.Organization == "" {
		for _, org := range claims.OpenAIAuth.Organizations {
			if org.IsDefault {
				acct.Organization = org.ID
				break
			}
		}
	}
	if acct.Organization == "" && len(claims.OpenAIAuth.Organizations) > 0 {
		acct.Organization = claims.OpenAIAuth.Organizations[0].ID
	}
	if acct.UserID == "" {
		acct.UserID = strings.TrimSpace(claims.Sub)
	}
	return nil
}

func decodeJWTPayload(token string) (*codexJWTClaims, error) {
	segments := strings.Split(token, ".")
	if len(segments) != 3 {
		return nil, fmt.Errorf("token does not have three JWT segments")
	}
	decoded, decErr := decodeBase64Segment(segments[1])
	if decErr != nil {
		return nil, decErr
	}
	var claims codexJWTClaims
	if unmarshalErr := json.Unmarshal(decoded, &claims); unmarshalErr != nil {
		return nil, unmarshalErr
	}
	return &claims, nil
}

func decodeBase64Segment(seg string) ([]byte, error) {
	if decoded, err := base64.RawURLEncoding.DecodeString(seg); err == nil {
		return decoded, nil
	}
	if decoded, err := base64.RawStdEncoding.DecodeString(seg); err == nil {
		return decoded, nil
	}
	padded := seg
	if remainder := len(padded) % 4; remainder > 0 {
		padded += strings.Repeat("=", 4-remainder)
	}
	if decoded, err := base64.URLEncoding.DecodeString(padded); err == nil {
		return decoded, nil
	}
	return base64.StdEncoding.DecodeString(padded)
}

func deriveImportAccountName(acct *codexImportAccount, index int) string {
	candidates := []string{acct.Name, acct.Email, acct.AccountID, acct.UserID}
	for _, c := range candidates {
		c = strings.TrimSpace(c)
		if c != "" {
			return c
		}
	}
	return fmt.Sprintf("Codex Import Account %d", index)
}

func deriveAccountDisplayName(baseName string, acct *codexImportAccount, index, totalCount int) string {
	baseName = strings.TrimSpace(baseName)
	if baseName == "" {
		if acct == nil {
			return fmt.Sprintf("Codex Import Account %d", index)
		}
		return acct.Name
	}
	if totalCount > 1 {
		return fmt.Sprintf("%s #%d", baseName, index)
	}
	return baseName
}

func computeImportExpiry(payload CodexSessionImportRequest, acct *codexImportAccount) (*int64, *time.Time, *bool, []string, error) {
	if acct == nil {
		return nil, nil, nil, nil, errors.New("import entry is nil")
	}

	var requestExpiry *time.Time
	if payload.ExpiresAt != nil && *payload.ExpiresAt > 0 {
		t := time.Unix(*payload.ExpiresAt, 0).UTC()
		requestExpiry = &t
	}

	var accountExpiry *time.Time
	var credExpiry *time.Time
	warnings := make([]string, 0, 2)
	if acct.RefreshToken == "" {
		if acct.TokenExpiresAt != nil {
			exp := acct.TokenExpiresAt.UTC()
			accountExpiry = &exp
			credExpiry = &exp
		}
		if requestExpiry != nil {
			accountExpiry = pickEarlierTime(accountExpiry, requestExpiry)
			credExpiry = pickEarlierTime(credExpiry, requestExpiry)
		}
		if accountExpiry == nil {
			return nil, nil, nil, nil, errors.New("no refresh_token and unable to determine token expiry; set an explicit expiry before importing")
		}
		if accountExpiry.Unix() <= time.Now().UTC().Unix()-codexImportClockSkewSeconds {
			return nil, nil, nil, nil, fmt.Errorf("expiry has already passed: %s", accountExpiry.Format(time.RFC3339))
		}
		warnings = append(warnings, "No refresh_token present; auto-pause will be enabled at token/account expiry")
		if payload.AutoPauseOnExpired != nil && !*payload.AutoPauseOnExpired {
			warnings = append(warnings, "No refresh_token present; auto-pause on expiry has been force-enabled")
		}
		enablePause := true
		expiryEpoch := accountExpiry.Unix()
		return &expiryEpoch, credExpiry, &enablePause, warnings, nil
	}

	if requestExpiry != nil {
		accountExpiry = requestExpiry
	}
	if acct.TokenExpiresAt != nil {
		exp := acct.TokenExpiresAt.UTC()
		credExpiry = &exp
	}
	var expiryEpoch *int64
	if accountExpiry != nil {
		v := accountExpiry.Unix()
		expiryEpoch = &v
	}
	return expiryEpoch, credExpiry, payload.AutoPauseOnExpired, warnings, nil
}

func pickEarlierTime(a, b *time.Time) *time.Time {
	if b == nil {
		return a
	}
	if a == nil || b.Before(*a) {
		t := b.UTC()
		return &t
	}
	t := a.UTC()
	return &t
}

func filterProtectedCredentialKeys(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}
	reserved := map[string]struct{}{
		"access_token":       {},
		"refresh_token":      {},
		"id_token":           {},
		"expires_at":         {},
		"email":              {},
		"chatgpt_account_id": {},
		"chatgpt_user_id":    {},
		"organization_id":    {},
		"plan_type":          {},
		"client_id":          {},
	}
	filtered := make(map[string]any, len(input))
	for k, v := range input {
		cleaned := strings.TrimSpace(k)
		if cleaned == "" {
			continue
		}
		if _, isReserved := reserved[strings.ToLower(cleaned)]; isReserved {
			continue
		}
		filtered[cleaned] = v
	}
	if len(filtered) == 0 {
		return nil
	}
	return filtered
}

func assembleIdentityKeys(accountID, userID, email, accessToken string) []string {
	keys := make([]string, 0, 4)
	accountID = strings.TrimSpace(accountID)
	userID = strings.TrimSpace(userID)
	if accountID != "" {
		keys = append(keys, "account:"+accountID)
	}
	if userID != "" {
		keys = append(keys, "user:"+userID)
	}
	if accountID == "" && userID == "" {
		if email = strings.ToLower(strings.TrimSpace(email)); email != "" {
			keys = append(keys, "email:"+email)
		}
	}
	if accessToken = strings.TrimSpace(accessToken); accessToken != "" {
		keys = append(keys, "access:"+computeTokenFingerprint(accessToken))
	}
	return keys
}

func newAccountIndex(accounts []service.Account) *codexAccountIndex {
	idx := &codexAccountIndex{accountsByKey: map[string]service.Account{}}
	for _, a := range accounts {
		idx.Add(a)
	}
	return idx
}

func (ci *codexAccountIndex) Add(account service.Account) {
	if ci == nil {
		return
	}
	if ci.accountsByKey == nil {
		ci.accountsByKey = map[string]service.Account{}
	}
	keys := assembleIdentityKeys(
		credentialStr(account.Credentials, "chatgpt_account_id"),
		credentialStr(account.Credentials, "chatgpt_user_id"),
		credentialStr(account.Credentials, "email"),
		credentialStr(account.Credentials, "access_token"),
	)
	for _, k := range keys {
		ci.accountsByKey[k] = account
	}
}

func (ci *codexAccountIndex) Find(keys []string) *service.Account {
	if ci == nil {
		return nil
	}
	for _, k := range keys {
		if acct, exists := ci.accountsByKey[k]; exists {
			return &acct
		}
	}
	return nil
}

func findFirstSeenIdentity(visited map[string]int, keys []string) (int, bool) {
	for _, k := range keys {
		if idx, exists := visited[k]; exists {
			return idx, true
		}
	}
	return 0, false
}

func recordSeenIdentity(visited map[string]int, keys []string, index int) {
	for _, k := range keys {
		visited[k] = index
	}
}

func combineMaps(base, overlay map[string]any) map[string]any {
	merged := make(map[string]any, len(base)+len(overlay))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range overlay {
		merged[k] = v
	}
	return merged
}

func mergeAccountCredentials(existing, incoming map[string]any, acct *codexImportAccount) map[string]any {
	merged := combineMaps(existing, incoming)
	if acct == nil {
		return merged
	}
	if strings.TrimSpace(acct.RefreshToken) == "" {
		delete(merged, "refresh_token")
		delete(merged, "client_id")
	}
	if strings.TrimSpace(acct.IDToken) == "" {
		delete(merged, "id_token")
	}
	return merged
}

func credentialStr(creds map[string]any, key string) string {
	if creds == nil {
		return ""
	}
	return anyToString(creds[key])
}

func computeTokenFingerprint(token string) string {
	digest := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(digest[:])
}

func startsWithJSON(raw string) bool {
	if raw == "" {
		return false
	}
	switch raw[0] {
	case '{', '[':
		return true
	default:
		return false
	}
}

func extractNestedString(obj map[string]any, paths ...[]string) string {
	for _, path := range paths {
		if val, ok := walkPath(obj, path); ok {
			if s := anyToString(val); s != "" {
				return s
			}
		}
	}
	return ""
}

func copyExtraString(obj map[string]any, extra map[string]any, key string, path []string) {
	val := extractNestedString(obj, path)
	if val != "" {
		extra[key] = val
	}
}

func resolveFirstTime(obj map[string]any, paths ...[]string) (time.Time, bool) {
	for _, path := range paths {
		if t, ok := resolveTimeAtPath(obj, path); ok {
			return t, true
		}
	}
	return time.Time{}, false
}

func resolveTimeAtPath(obj map[string]any, path []string) (time.Time, bool) {
	val, ok := walkPath(obj, path)
	if !ok {
		return time.Time{}, false
	}
	return interpretTimeValue(val)
}

func walkPath(obj map[string]any, path []string) (any, bool) {
	var cursor any = obj
	for _, segment := range path {
		m, ok := cursor.(map[string]any)
		if !ok {
			return nil, false
		}
		val, exists := m[segment]
		if !exists {
			return nil, false
		}
		cursor = val
	}
	return cursor, true
}

func anyToString(val any) string {
	switch typed := val.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return strings.TrimSpace(typed.String())
	case float64:
		return strings.TrimSpace(strconv.FormatFloat(typed, 'f', -1, 64))
	case float32:
		return strings.TrimSpace(strconv.FormatFloat(float64(typed), 'f', -1, 32))
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int32:
		return strconv.FormatInt(int64(typed), 10)
	default:
		return ""
	}
}

func setCredentialIfPresent(creds map[string]any, key, val string) {
	val = strings.TrimSpace(val)
	if val != "" {
		creds[key] = val
	}
}

func interpretTimeValue(val any) (time.Time, bool) {
	switch typed := val.(type) {
	case string:
		typed = strings.TrimSpace(typed)
		if typed == "" {
			return time.Time{}, false
		}
		if parsed, parseErr := time.Parse(time.RFC3339Nano, typed); parseErr == nil {
			return parsed.UTC(), true
		}
		if epoch, parseErr := strconv.ParseInt(typed, 10, 64); parseErr == nil {
			return normalizeEpoch(epoch), true
		}
	case json.Number:
		if epoch, err := typed.Int64(); err == nil {
			return normalizeEpoch(epoch), true
		}
		if flt, err := typed.Float64(); err == nil {
			return normalizeEpoch(int64(flt)), true
		}
	case float64:
		return normalizeEpoch(int64(typed)), true
	case int:
		return normalizeEpoch(int64(typed)), true
	case int64:
		return normalizeEpoch(typed), true
	}
	return time.Time{}, false
}

func normalizeEpoch(val int64) time.Time {
	if val > 1_000_000_000_000 {
		return time.UnixMilli(val).UTC()
	}
	return time.Unix(val, 0).UTC()
}
