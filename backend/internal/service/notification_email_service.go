package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	NotificationEmailEventAuthVerifyCode              = "auth.verify_code"
	NotificationEmailEventAuthPasswordReset           = "auth.password_reset"
	NotificationEmailEventNotificationEmailVerifyCode = "notification_email.verify_code"
	NotificationEmailEventSubscriptionPurchaseSuccess = "subscription.purchase_success"
	NotificationEmailEventSubscriptionExpiryReminder  = "subscription.expiry_reminder"
	NotificationEmailEventBalanceLow                  = "balance.low"
	NotificationEmailEventBalanceRechargeSuccess      = "balance.recharge_success"
	NotificationEmailEventAccountQuotaAlert           = "account.quota_alert"
	NotificationEmailEventContentModerationViolation  = "content_moderation.violation_notice"
	NotificationEmailEventContentModerationDisabled   = "content_moderation.account_disabled"
	NotificationEmailEventOpsAlert                    = "ops.alert"
	NotificationEmailEventOpsScheduledReport          = "ops.scheduled_report"

	notificationEmailTemplateKeyPrefix    = "notification_email_template:"
	notificationEmailPreferenceKeyPrefix  = "notification_email_preference:"
	notificationEmailDeliveryKeyPrefix    = "notification_email_delivery:"
	notificationEmailLocaleUserKeyPrefix  = "notification_email_locale:user:"
	notificationEmailLocaleEmailKeyPrefix = "notification_email_locale:email:"
	notificationEmailUnsubscribeSecretKey = "notification_email_unsubscribe_secret"
	notificationEmailDefaultLocale        = "en"
	notificationEmailLocaleChinese        = "zh"
	notificationEmailMaxSubjectLength     = 200
	notificationEmailMaxHTMLLength        = 30000
	notificationEmailUnsubscribeTTL       = 365 * 24 * time.Hour
)

var (
	notificationEmailPlaceholderPattern = regexp.MustCompile(`{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}`)
	notificationEmailLocales            = []string{notificationEmailDefaultLocale, notificationEmailLocaleChinese}
	notificationEmailCommonPlaceholders = []string{"site_name", "recipient_name", "recipient_email"}
)

type NotificationEmailService struct {
	settingRepo  SettingRepository
	emailService *EmailService
}

type NotificationEmailEventInfo struct {
	Event        string   `json:"event"`
	Label        string   `json:"label"`
	Description  string   `json:"description"`
	Category     string   `json:"category"`
	Optional     bool     `json:"optional"`
	Placeholders []string `json:"placeholders"`
}

type NotificationEmailTemplate struct {
	Event        string     `json:"event"`
	Locale       string     `json:"locale"`
	Subject      string     `json:"subject"`
	HTML         string     `json:"html"`
	IsCustom     bool       `json:"is_custom"`
	UpdatedAt    *time.Time `json:"updated_at,omitempty"`
	Placeholders []string   `json:"placeholders"`
}

type NotificationEmailPreview struct {
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

type NotificationEmailPreviewInput struct {
	Event     string            `json:"event"`
	Locale    string            `json:"locale"`
	Subject   string            `json:"subject"`
	HTML      string            `json:"html"`
	Variables map[string]string `json:"variables,omitempty"`
}

type NotificationEmailSendInput struct {
	Event            string
	Locale           string
	RecipientEmail   string
	RecipientName    string
	UserID           int64
	SourceType       string
	SourceID         string
	ReminderKey      string
	Variables        map[string]string
	RawHTMLVariables map[string]string
}

type NotificationEmailUnsubscribeResult struct {
	Event string `json:"event"`
	Email string `json:"email"`
	Done  bool   `json:"done"`
}

type notificationEmailStoredTemplate struct {
	Subject   string    `json:"subject"`
	HTML      string    `json:"html"`
	UpdatedAt time.Time `json:"updated_at"`
}

type notificationEmailOfficialTemplate struct {
	Subject string
	HTML    string
}

type notifTemplateValidationError struct {
	Err error
}

func (e notifTemplateValidationError) Error() string {
	return e.Err.Error()
}

func (e notifTemplateValidationError) Unwrap() error {
	return e.Err
}

type notifConfigurationError struct {
	Err error
}

func (e notifConfigurationError) Error() string {
	return e.Err.Error()
}

func (e notifConfigurationError) Unwrap() error {
	return e.Err
}

type notifTransportError struct {
	Err error
}

func (e notifTransportError) Error() string {
	return e.Err.Error()
}

func (e notifTransportError) Unwrap() error {
	return e.Err
}

type notificationEmailUnsubscribeClaims struct {
	Email string `json:"email"`
	Event string `json:"event"`
	Exp   int64  `json:"exp"`
}

func NewNotificationEmailService(settingRepo SettingRepository, emailService *EmailService) *NotificationEmailService {
	inst := &NotificationEmailService{settingRepo: settingRepo, emailService: emailService}
	if emailService != nil {
		emailService.SetNotificationEmailService(inst)
	}
	return inst
}

func wrapNotifTemplateError(cause error) error {
	if cause == nil {
		return nil
	}
	return notifTemplateValidationError{Err: cause}
}

func wrapNotifConfigError(cause error) error {
	if cause == nil {
		return nil
	}
	return notifConfigurationError{Err: cause}
}

func wrapNotifTransportError(cause error) error {
	if cause == nil {
		return nil
	}
	return notifTransportError{Err: cause}
}

func shouldFallbackNotificationEmail(err error) bool {
	if err == nil {
		return false
	}
	var templateErr notifTemplateValidationError
	if errors.As(err, &templateErr) {
		return true
	}
	var configErr notifConfigurationError
	return errors.As(err, &configErr)
}

func isNotificationEmailDeliveryError(err error) bool {
	var xportErr notifTransportError
	return errors.As(err, &xportErr)
}

func (s *NotificationEmailService) ListEventInfos() []NotificationEmailEventInfo {
	out := make([]NotificationEmailEventInfo, 0, len(notificationEmailEventDefinitions))
	for _, key := range notificationEmailEventOrder {
		info := notificationEmailEventDefinitions[key]
		info.Placeholders = append([]string(nil), info.Placeholders...)
		out = append(out, info)
	}
	return out
}

func (s *NotificationEmailService) SupportedLocales() []string {
	return append([]string(nil), notificationEmailLocales...)
}

func (s *NotificationEmailService) ListTemplates(ctx context.Context) ([]NotificationEmailTemplate, error) {
	// 一次性批量加载所有 event x locale 的自定义模板覆盖，避免对每个组合发起独立的
	// settingRepo.GetValue 查询（N+1）。GetMultiple 只返回实际存在的 key，缺失的项
	// 自然退化到内置模板，保持与 GetTemplate 单点路径相同的语义。
	storageKeys := make([]string, 0, len(notificationEmailEventOrder)*len(notificationEmailLocales))
	for _, evKey := range notificationEmailEventOrder {
		for _, lang := range notificationEmailLocales {
			storageKeys = append(storageKeys, notifTemplateStorageKey(evKey, lang))
		}
	}
	overrides := map[string]string{}
	if s != nil && s.settingRepo != nil && len(storageKeys) > 0 {
		loaded, readErr := s.settingRepo.GetMultiple(ctx, storageKeys)
		if readErr != nil {
			return nil, readErr
		}
		overrides = loaded
	}

	allTemplates := make([]NotificationEmailTemplate, 0, len(notificationEmailEventOrder)*len(notificationEmailLocales))
	for _, evKey := range notificationEmailEventOrder {
		for _, lang := range notificationEmailLocales {
			tpl, readErr := s.buildTemplateFromOverrides(evKey, lang, overrides)
			if readErr != nil {
				return nil, readErr
			}
			allTemplates = append(allTemplates, tpl)
		}
	}
	return allTemplates, nil
}

// buildTemplateFromOverrides resolves a single template entry from a pre-loaded
// map of custom-override JSON blobs keyed by setting key. Behaves the same as
// GetTemplate's storage-lookup branch but reads from the batched map.
func (s *NotificationEmailService) buildTemplateFromOverrides(event, locale string, overrides map[string]string) (NotificationEmailTemplate, error) {
	evDef, normalizedEvent, lookupErr := s.lookupEventDef(event)
	if lookupErr != nil {
		return NotificationEmailTemplate{}, lookupErr
	}
	normalizedLocale := normalizeNotifLocale(locale)
	stock, exists := notificationEmailOfficialTemplates[normalizedEvent][normalizedLocale]
	if !exists {
		return NotificationEmailTemplate{}, fmt.Errorf("no built-in template for event=%s locale=%s", normalizedEvent, normalizedLocale)
	}

	tpl := NotificationEmailTemplate{
		Event:        normalizedEvent,
		Locale:       normalizedLocale,
		Subject:      stock.Subject,
		HTML:         stock.HTML,
		Placeholders: append([]string(nil), evDef.Placeholders...),
	}

	rawJSON, found := overrides[notifTemplateStorageKey(normalizedEvent, normalizedLocale)]
	if !found || strings.TrimSpace(rawJSON) == "" {
		return tpl, nil
	}

	var custom notificationEmailStoredTemplate
	if unmarshalErr := json.Unmarshal([]byte(rawJSON), &custom); unmarshalErr != nil {
		return NotificationEmailTemplate{}, fmt.Errorf("corrupted custom email template JSON: %w", unmarshalErr)
	}
	if valErr := validateNotifTemplateFields(normalizedEvent, custom.Subject, custom.HTML); valErr != nil {
		return NotificationEmailTemplate{}, valErr
	}
	tpl.Subject = custom.Subject
	tpl.HTML = custom.HTML
	tpl.IsCustom = true
	updatedCopy := custom.UpdatedAt
	tpl.UpdatedAt = &updatedCopy
	return tpl, nil
}

func (s *NotificationEmailService) GetTemplate(ctx context.Context, event, locale string) (NotificationEmailTemplate, error) {
	evDef, normalizedEvent, lookupErr := s.lookupEventDef(event)
	if lookupErr != nil {
		return NotificationEmailTemplate{}, lookupErr
	}
	normalizedLocale := normalizeNotifLocale(locale)
	stock, exists := notificationEmailOfficialTemplates[normalizedEvent][normalizedLocale]
	if !exists {
		return NotificationEmailTemplate{}, fmt.Errorf("no built-in template for event=%s locale=%s", normalizedEvent, normalizedLocale)
	}

	tpl := NotificationEmailTemplate{
		Event:        normalizedEvent,
		Locale:       normalizedLocale,
		Subject:      stock.Subject,
		HTML:         stock.HTML,
		Placeholders: append([]string(nil), evDef.Placeholders...),
	}

	rawJSON, readErr := s.settingRepo.GetValue(ctx, notifTemplateStorageKey(normalizedEvent, normalizedLocale))
	if readErr != nil {
		if errors.Is(readErr, ErrSettingNotFound) {
			return tpl, nil
		}
		return NotificationEmailTemplate{}, readErr
	}
	if strings.TrimSpace(rawJSON) == "" {
		return tpl, nil
	}

	var custom notificationEmailStoredTemplate
	if unmarshalErr := json.Unmarshal([]byte(rawJSON), &custom); unmarshalErr != nil {
		return NotificationEmailTemplate{}, fmt.Errorf("corrupted custom email template JSON: %w", unmarshalErr)
	}
	if valErr := validateNotifTemplateFields(normalizedEvent, custom.Subject, custom.HTML); valErr != nil {
		return NotificationEmailTemplate{}, valErr
	}
	tpl.Subject = custom.Subject
	tpl.HTML = custom.HTML
	tpl.IsCustom = true
	updatedCopy := custom.UpdatedAt
	tpl.UpdatedAt = &updatedCopy
	return tpl, nil
}

func (s *NotificationEmailService) UpdateTemplate(ctx context.Context, event, locale, subject, htmlContent string) (NotificationEmailTemplate, error) {
	_, normalizedEvent, lookupErr := s.lookupEventDef(event)
	if lookupErr != nil {
		return NotificationEmailTemplate{}, lookupErr
	}
	normalizedLocale := normalizeNotifLocale(locale)
	if valErr := validateNotifTemplateFields(normalizedEvent, subject, htmlContent); valErr != nil {
		return NotificationEmailTemplate{}, valErr
	}
	stored := notificationEmailStoredTemplate{
		Subject:   strings.TrimSpace(subject),
		HTML:      htmlContent,
		UpdatedAt: time.Now().UTC(),
	}
	blob, marshalErr := json.Marshal(stored)
	if marshalErr != nil {
		return NotificationEmailTemplate{}, marshalErr
	}
	if persistErr := s.settingRepo.Set(ctx, notifTemplateStorageKey(normalizedEvent, normalizedLocale), string(blob)); persistErr != nil {
		return NotificationEmailTemplate{}, persistErr
	}
	return s.GetTemplate(ctx, normalizedEvent, normalizedLocale)
}

func (s *NotificationEmailService) RestoreOfficialTemplate(ctx context.Context, event, locale string) (NotificationEmailTemplate, error) {
	_, normalizedEvent, lookupErr := s.lookupEventDef(event)
	if lookupErr != nil {
		return NotificationEmailTemplate{}, lookupErr
	}
	normalizedLocale := normalizeNotifLocale(locale)
	if delErr := s.settingRepo.Delete(ctx, notifTemplateStorageKey(normalizedEvent, normalizedLocale)); delErr != nil && !errors.Is(delErr, ErrSettingNotFound) {
		return NotificationEmailTemplate{}, delErr
	}
	return s.GetTemplate(ctx, normalizedEvent, normalizedLocale)
}

func (s *NotificationEmailService) PreviewTemplate(ctx context.Context, input NotificationEmailPreviewInput) (NotificationEmailPreview, error) {
	_, normalizedEvent, lookupErr := s.lookupEventDef(input.Event)
	if lookupErr != nil {
		return NotificationEmailPreview{}, lookupErr
	}
	normalizedLocale := normalizeNotifLocale(input.Locale)
	subj := input.Subject
	body := input.HTML
	if strings.TrimSpace(subj) == "" || strings.TrimSpace(body) == "" {
		tpl, readErr := s.GetTemplate(ctx, normalizedEvent, normalizedLocale)
		if readErr != nil {
			return NotificationEmailPreview{}, readErr
		}
		if strings.TrimSpace(subj) == "" {
			subj = tpl.Subject
		}
		if strings.TrimSpace(body) == "" {
			body = tpl.HTML
		}
	}
	if valErr := validateNotifTemplateFields(normalizedEvent, subj, body); valErr != nil {
		return NotificationEmailPreview{}, valErr
	}
	vars := s.assembleSampleVars(ctx, normalizedEvent, normalizedLocale)
	for k, v := range input.Variables {
		vars[k] = v
	}
	return renderNotifEmail(normalizedEvent, subj, body, vars, nil)
}

func (s *NotificationEmailService) Send(ctx context.Context, input NotificationEmailSendInput) error {
	evDef, normalizedEvent, lookupErr := s.lookupEventDef(input.Event)
	if lookupErr != nil {
		return wrapNotifTemplateError(lookupErr)
	}
	recipientAddr := strings.TrimSpace(input.RecipientEmail)
	if recipientAddr == "" {
		return nil
	}
	if evDef.Optional {
		suppressed, checkErr := s.IsUnsubscribed(ctx, recipientAddr, normalizedEvent)
		if checkErr != nil {
			return checkErr
		}
		if suppressed {
			slog.Info("notification email suppressed due to unsubscribe preference", "event", normalizedEvent, "recipient_hash", hashNotifEmail(recipientAddr))
			return nil
		}
	}

	lang := normalizeNotifLocale(input.Locale)
	if strings.TrimSpace(input.Locale) == "" {
		lang = s.ResolveRecipientLocale(ctx, input.UserID, recipientAddr)
	}
	tpl, readErr := s.GetTemplate(ctx, normalizedEvent, lang)
	if readErr != nil {
		return wrapNotifTemplateError(readErr)
	}
	vars := s.assembleRuntimeVars(ctx, normalizedEvent, lang, input)
	result, renderErr := renderNotifEmail(normalizedEvent, tpl.Subject, tpl.HTML, vars, input.RawHTMLVariables)
	if renderErr != nil {
		return wrapNotifTemplateError(renderErr)
	}

	dedupeKey := computeNotifDeliveryKey(normalizedEvent, input.SourceType, input.SourceID, recipientAddr, input.ReminderKey)
	if dedupeKey != "" {
		sent, checkErr := s.checkDeliveryRecord(ctx, dedupeKey, legacyNotifDeliveryKey(normalizedEvent, input.SourceType, input.SourceID, recipientAddr, input.ReminderKey))
		if checkErr != nil {
			return checkErr
		}
		if sent {
			return nil
		}
	}

	if s.emailService == nil {
		return wrapNotifConfigError(errors.New("email delivery service not configured"))
	}
	if deliverErr := s.emailService.SendEmail(ctx, recipientAddr, result.Subject, result.HTML); deliverErr != nil {
		return wrapNotifTransportError(deliverErr)
	}
	if dedupeKey != "" {
		if saveErr := s.settingRepo.Set(ctx, dedupeKey, time.Now().UTC().Format(time.RFC3339Nano)); saveErr != nil {
			return saveErr
		}
	}
	return nil
}

func (s *NotificationEmailService) RememberRecipientLocale(ctx context.Context, userID int64, email, acceptLanguage string) {
	lang := normalizeNotifLocale(acceptLanguage)
	if strings.TrimSpace(acceptLanguage) == "" || s == nil || s.settingRepo == nil {
		return
	}
	if userID > 0 {
		_ = s.settingRepo.Set(ctx, notificationEmailLocaleUserKeyPrefix+strconv.FormatInt(userID, 10), lang)
	}
	if digest := hashNotifEmail(email); digest != "" {
		_ = s.settingRepo.Set(ctx, notificationEmailLocaleEmailKeyPrefix+digest, lang)
	}
}

func (s *NotificationEmailService) ResolveRecipientLocale(ctx context.Context, userID int64, email string) string {
	if s == nil || s.settingRepo == nil {
		return notificationEmailDefaultLocale
	}
	if userID > 0 {
		if saved, readErr := s.settingRepo.GetValue(ctx, notificationEmailLocaleUserKeyPrefix+strconv.FormatInt(userID, 10)); readErr == nil && strings.TrimSpace(saved) != "" {
			return normalizeNotifLocale(saved)
		}
	}
	if digest := hashNotifEmail(email); digest != "" {
		if saved, readErr := s.settingRepo.GetValue(ctx, notificationEmailLocaleEmailKeyPrefix+digest); readErr == nil && strings.TrimSpace(saved) != "" {
			return normalizeNotifLocale(saved)
		}
	}
	return notificationEmailDefaultLocale
}

func (s *NotificationEmailService) IsUnsubscribed(ctx context.Context, email, event string) (bool, error) {
	evDef, normalizedEvent, lookupErr := s.lookupEventDef(event)
	if lookupErr != nil {
		return false, lookupErr
	}
	if !evDef.Optional {
		return false, nil
	}
	keyCandidates := []string{
		notifPreferenceStorageKey(normalizedEvent, email),
		legacyNotifPreferenceKey(normalizedEvent, email),
	}
	for _, k := range keyCandidates {
		if strings.TrimSpace(k) == "" {
			continue
		}
		val, readErr := s.settingRepo.GetValue(ctx, k)
		if readErr == nil {
			return strings.EqualFold(strings.TrimSpace(val), "unsubscribed"), nil
		}
		if !errors.Is(readErr, ErrSettingNotFound) {
			return false, readErr
		}
	}
	return false, nil
}

func (s *NotificationEmailService) Unsubscribe(ctx context.Context, token string) (NotificationEmailUnsubscribeResult, error) {
	claims, parseErr := s.validateUnsubToken(ctx, token)
	if parseErr != nil {
		return NotificationEmailUnsubscribeResult{}, parseErr
	}
	evDef, normalizedEvent, lookupErr := s.lookupEventDef(claims.Event)
	if lookupErr != nil {
		return NotificationEmailUnsubscribeResult{}, lookupErr
	}
	if !evDef.Optional {
		return NotificationEmailUnsubscribeResult{}, fmt.Errorf("event %s cannot be unsubscribed because it is mandatory", normalizedEvent)
	}
	if saveErr := s.settingRepo.Set(ctx, notifPreferenceStorageKey(normalizedEvent, claims.Email), "unsubscribed"); saveErr != nil {
		return NotificationEmailUnsubscribeResult{}, saveErr
	}
	return NotificationEmailUnsubscribeResult{Event: normalizedEvent, Email: claims.Email, Done: true}, nil
}

// lookupEventDef resolves a notification event key and returns its definition
// together with the canonical (lowercased, trimmed) key.
func (s *NotificationEmailService) lookupEventDef(event string) (NotificationEmailEventInfo, string, error) {
	normalized := strings.ToLower(strings.TrimSpace(event))
	info, ok := notificationEmailEventDefinitions[normalized]
	if !ok {
		return NotificationEmailEventInfo{}, "", fmt.Errorf("unrecognized notification email event: %s", event)
	}
	return info, normalized, nil
}

func (s *NotificationEmailService) assembleSampleVars(ctx context.Context, event, locale string) map[string]string {
	evDef := notificationEmailEventDefinitions[event]
	vars := make(map[string]string, len(evDef.Placeholders))
	for k, v := range notifSampleDataForLocale(locale) {
		vars[k] = v
	}
	vars["site_name"] = s.fetchSiteName(ctx)
	if vars["unsubscribe_url"] == "" && evDef.Optional {
		vars["unsubscribe_url"] = "https://example.com/unsubscribe"
	}
	return vars
}

func (s *NotificationEmailService) assembleRuntimeVars(ctx context.Context, event, locale string, input NotificationEmailSendInput) map[string]string {
	vars := s.assembleSampleVars(ctx, event, locale)
	for k, v := range input.Variables {
		vars[k] = v
	}
	vars["site_name"] = s.fetchSiteName(ctx)
	vars["recipient_email"] = input.RecipientEmail
	if strings.TrimSpace(input.RecipientName) != "" {
		vars["recipient_name"] = input.RecipientName
	}
	if notificationEmailEventDefinitions[event].Optional {
		if link, linkErr := s.buildUnsubLink(ctx, input.RecipientEmail, event); linkErr == nil {
			vars["unsubscribe_url"] = link
		}
	}
	return vars
}

func (s *NotificationEmailService) fetchSiteName(ctx context.Context) string {
	if s == nil || s.settingRepo == nil {
		return defaultSiteName
	}
	name, readErr := s.settingRepo.GetValue(ctx, SettingKeySiteName)
	if readErr != nil || strings.TrimSpace(name) == "" {
		return defaultSiteName
	}
	return strings.TrimSpace(name)
}

func (s *NotificationEmailService) baseURL(ctx context.Context) string {
	if s == nil || s.settingRepo == nil {
		return ""
	}
	for _, key := range []string{SettingKeyAPIBaseURL, SettingKeyFrontendURL} {
		val, readErr := s.settingRepo.GetValue(ctx, key)
		if readErr == nil && strings.TrimSpace(val) != "" {
			return strings.TrimRight(strings.TrimSpace(val), "/")
		}
	}
	return ""
}

func (s *NotificationEmailService) buildUnsubLink(ctx context.Context, email, event string) (string, error) {
	tok, signErr := s.issueUnsubToken(ctx, email, event)
	if signErr != nil {
		return "", signErr
	}
	path := "/api/v1/settings/email-unsubscribe?token=" + url.QueryEscape(tok)
	base := s.baseURL(ctx)
	if base == "" {
		return path, nil
	}
	return base + path, nil
}

func (s *NotificationEmailService) issueUnsubToken(ctx context.Context, email, event string) (string, error) {
	secret, keyErr := s.ensureUnsubSecret(ctx)
	if keyErr != nil {
		return "", keyErr
	}
	payload := notificationEmailUnsubscribeClaims{
		Email: strings.TrimSpace(email),
		Event: event,
		Exp:   time.Now().Add(notificationEmailUnsubscribeTTL).Unix(),
	}
	payloadJSON, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		return "", marshalErr
	}
	encoded := base64.RawURLEncoding.EncodeToString(payloadJSON)
	signature := hmacNotifToken(secret, encoded)
	return encoded + "." + signature, nil
}

func (s *NotificationEmailService) validateUnsubToken(ctx context.Context, rawToken string) (notificationEmailUnsubscribeClaims, error) {
	parts := strings.Split(strings.TrimSpace(rawToken), ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return notificationEmailUnsubscribeClaims{}, errors.New("unsubscribe token has invalid format")
	}
	secret, keyErr := s.ensureUnsubSecret(ctx)
	if keyErr != nil {
		return notificationEmailUnsubscribeClaims{}, keyErr
	}
	expected := hmacNotifToken(secret, parts[0])
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return notificationEmailUnsubscribeClaims{}, errors.New("unsubscribe token signature mismatch")
	}
	decoded, decErr := base64.RawURLEncoding.DecodeString(parts[0])
	if decErr != nil {
		return notificationEmailUnsubscribeClaims{}, errors.New("unsubscribe token payload cannot be decoded")
	}
	var claims notificationEmailUnsubscribeClaims
	if jsonErr := json.Unmarshal(decoded, &claims); jsonErr != nil {
		return notificationEmailUnsubscribeClaims{}, errors.New("unsubscribe token payload cannot be decoded")
	}
	if strings.TrimSpace(claims.Email) == "" || strings.TrimSpace(claims.Event) == "" {
		return notificationEmailUnsubscribeClaims{}, errors.New("unsubscribe token lacks required fields")
	}
	if claims.Exp <= time.Now().Unix() {
		return notificationEmailUnsubscribeClaims{}, errors.New("unsubscribe token is no longer valid")
	}
	return claims, nil
}

func (s *NotificationEmailService) ensureUnsubSecret(ctx context.Context) (string, error) {
	saved, readErr := s.settingRepo.GetValue(ctx, notificationEmailUnsubscribeSecretKey)
	if readErr == nil && strings.TrimSpace(saved) != "" {
		return strings.TrimSpace(saved), nil
	}
	if readErr != nil && !errors.Is(readErr, ErrSettingNotFound) {
		return "", readErr
	}
	randomBytes := make([]byte, 32)
	if _, randErr := rand.Read(randomBytes); randErr != nil {
		return "", randErr
	}
	generated := base64.RawURLEncoding.EncodeToString(randomBytes)
	if persistErr := s.settingRepo.Set(ctx, notificationEmailUnsubscribeSecretKey, generated); persistErr != nil {
		return "", persistErr
	}
	return generated, nil
}

func (s *NotificationEmailService) checkDeliveryRecord(ctx context.Context, keys ...string) (bool, error) {
	for _, k := range keys {
		if strings.TrimSpace(k) == "" {
			continue
		}
		_, readErr := s.settingRepo.GetValue(ctx, k)
		if readErr == nil {
			return true, nil
		}
		if !errors.Is(readErr, ErrSettingNotFound) {
			return false, readErr
		}
	}
	return false, nil
}

func validateNotifTemplateFields(event, subjectLine, htmlBody string) error {
	subj := strings.TrimSpace(subjectLine)
	if subj == "" {
		return errors.New("notification email subject cannot be blank")
	}
	if len([]rune(subj)) > notificationEmailMaxSubjectLength {
		return fmt.Errorf("notification email subject exceeds the %d-character limit", notificationEmailMaxSubjectLength)
	}
	if strings.TrimSpace(htmlBody) == "" {
		return errors.New("notification email body cannot be blank")
	}
	if len([]byte(htmlBody)) > notificationEmailMaxHTMLLength {
		return fmt.Errorf("notification email body exceeds the %d-byte limit", notificationEmailMaxHTMLLength)
	}
	allowed := permittedPlaceholderSet(event)
	for _, name := range collectPlaceholderNames(subjectLine + "\n" + htmlBody) {
		if _, ok := allowed[name]; !ok {
			return fmt.Errorf("placeholder {{%s}} is not valid for event %s", name, event)
		}
	}
	return nil
}

func renderNotifEmail(event, subjectLine, htmlBody string, vars map[string]string, rawHTMLVars map[string]string) (NotificationEmailPreview, error) {
	if valErr := validateNotifTemplateFields(event, subjectLine, htmlBody); valErr != nil {
		return NotificationEmailPreview{}, valErr
	}
	renderedSubject, subjErr := substituteNotifPlaceholders(event, subjectLine, vars, nil, false)
	if subjErr != nil {
		return NotificationEmailPreview{}, subjErr
	}
	renderedBody, bodyErr := substituteNotifPlaceholders(event, htmlBody, vars, rawHTMLVars, true)
	if bodyErr != nil {
		return NotificationEmailPreview{}, bodyErr
	}
	return NotificationEmailPreview{Subject: sanitizeEmailHeader(renderedSubject), HTML: renderedBody}, nil
}

func substituteNotifPlaceholders(event, template string, vars map[string]string, rawHTMLVars map[string]string, escapeHTML bool) (string, error) {
	allowed := permittedPlaceholderSet(event)
	var substErr error
	result := notificationEmailPlaceholderPattern.ReplaceAllStringFunc(template, func(match string) string {
		if substErr != nil {
			return ""
		}
		groups := notificationEmailPlaceholderPattern.FindStringSubmatch(match)
		if len(groups) != 2 {
			return ""
		}
		name := groups[1]
		if _, ok := allowed[name]; !ok {
			substErr = fmt.Errorf("placeholder {{%s}} is not valid for event %s", name, event)
			return ""
		}
		val := vars[name]
		if escapeHTML && isNotifRawHTMLVar(event, name) {
			if rawHTMLVars != nil {
				if rawVal, found := rawHTMLVars[name]; found {
					return rawVal
				}
			}
		}
		if strings.HasSuffix(name, "_url") && !isAllowedNotifURL(val) {
			val = ""
		}
		if escapeHTML {
			return html.EscapeString(val)
		}
		return sanitizeEmailHeader(val)
	})
	if substErr != nil {
		return "", substErr
	}
	return result, nil
}

func isNotifRawHTMLVar(event, name string) bool {
	return event == NotificationEmailEventOpsScheduledReport && name == "report_html"
}

func permittedPlaceholderSet(event string) map[string]struct{} {
	evDef := notificationEmailEventDefinitions[event]
	set := make(map[string]struct{}, len(evDef.Placeholders))
	for _, ph := range evDef.Placeholders {
		set[ph] = struct{}{}
	}
	return set
}

func collectPlaceholderNames(text string) []string {
	matches := notificationEmailPlaceholderPattern.FindAllStringSubmatch(text, -1)
	seen := make(map[string]struct{}, len(matches))
	names := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) != 2 {
			continue
		}
		if _, dup := seen[m[1]]; dup {
			continue
		}
		seen[m[1]] = struct{}{}
		names = append(names, m[1])
	}
	return names
}

func normalizeNotifLocale(raw string) string {
	lower := strings.ToLower(strings.TrimSpace(raw))
	if lower == "" {
		return notificationEmailDefaultLocale
	}
	for _, part := range strings.Split(lower, ",") {
		tag := strings.TrimSpace(strings.Split(part, ";")[0])
		if strings.HasPrefix(tag, "zh") || tag == "cn" {
			return notificationEmailLocaleChinese
		}
		if strings.HasPrefix(tag, "en") {
			return notificationEmailDefaultLocale
		}
	}
	return notificationEmailDefaultLocale
}

func notifTemplateStorageKey(event, locale string) string {
	return notificationEmailTemplateKeyPrefix + event + ":" + locale
}

func notifPreferenceStorageKey(event, email string) string {
	if strings.TrimSpace(event) == "" || strings.TrimSpace(email) == "" {
		return ""
	}
	combined := strings.TrimSpace(event) + "\x00" + strings.ToLower(strings.TrimSpace(email))
	return notificationEmailPreferenceKeyPrefix + "v2:" + hashNotifEmail(combined)
}

func legacyNotifPreferenceKey(event, email string) string {
	return notificationEmailPreferenceKeyPrefix + event + ":" + hashNotifEmail(email)
}

func computeNotifDeliveryKey(event, srcType, srcID, recipient, reminderKey string) string {
	if strings.TrimSpace(srcType) == "" || strings.TrimSpace(srcID) == "" || strings.TrimSpace(recipient) == "" {
		return ""
	}
	combined := strings.Join([]string{
		strings.ToLower(strings.TrimSpace(event)),
		cleanNotifKeyPart(srcType),
		cleanNotifKeyPart(srcID),
		strings.ToLower(strings.TrimSpace(recipient)),
		cleanNotifKeyPart(reminderKey),
	}, "\x00")
	return notificationEmailDeliveryKeyPrefix + "v2:" + hashNotifEmail(combined)
}

func legacyNotifDeliveryKey(event, srcType, srcID, recipient, reminderKey string) string {
	if strings.TrimSpace(srcType) == "" || strings.TrimSpace(srcID) == "" || strings.TrimSpace(recipient) == "" {
		return ""
	}
	parts := []string{notificationEmailDeliveryKeyPrefix, event, ":", cleanNotifKeyPart(srcType), ":", cleanNotifKeyPart(srcID), ":", hashNotifEmail(recipient)}
	if strings.TrimSpace(reminderKey) != "" {
		parts = append(parts, ":", cleanNotifKeyPart(reminderKey))
	}
	return strings.Join(parts, "")
}

func hashNotifEmail(input string) string {
	lower := strings.ToLower(strings.TrimSpace(input))
	if lower == "" {
		return ""
	}
	digest := sha256.Sum256([]byte(lower))
	return hex.EncodeToString(digest[:])
}

// notificationEmailHash is a compatibility alias used by callers across
// the service package (content_moderation, email_service, user_service).
func notificationEmailHash(value string) string {
	return hashNotifEmail(value)
}

func cleanNotifKeyPart(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	var sb strings.Builder
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '_', r == '-', r == '.':
			_, _ = sb.WriteRune(r)
		default:
			_, _ = sb.WriteRune('_')
		}
	}
	return sb.String()
}

func hmacNotifToken(key, data string) string {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func isAllowedNotifURL(raw string) bool {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return true
	}
	parsed, parseErr := url.Parse(trimmed)
	if parseErr != nil {
		return false
	}
	if parsed.IsAbs() {
		scheme := strings.ToLower(parsed.Scheme)
		return scheme == "http" || scheme == "https" || scheme == "mailto"
	}
	return strings.HasPrefix(trimmed, "/")
}

func notifSampleDataForLocale(locale string) map[string]string {
	if normalizeNotifLocale(locale) == notificationEmailLocaleChinese {
		return map[string]string{
			"site_name":           defaultSiteName,
			"recipient_name":      "张三",
			"recipient_email":     "user@example.com",
			"verification_code":   "123456",
			"expires_in_minutes":  "15",
			"reset_url":           "https://example.com/reset-password?token=preview",
			"subscription_group":  "Claude Pro",
			"subscription_days":   "30",
			"expiry_time":         "2026-06-18 12:00",
			"days_remaining":      "3",
			"current_balance":     "12.34",
			"threshold":           "20.00",
			"recharge_url":        "https://example.com/recharge",
			"recharge_amount":     "50.00",
			"order_id":            "1024",
			"unsubscribe_url":     "https://example.com/unsubscribe",
			"account_id":          "1001",
			"account_name":        "openai-main",
			"platform":            "openai",
			"quota_dimension":     "每日额度",
			"quota_used":          "80.00",
			"quota_limit":         "100.00",
			"quota_remaining":     "20.00",
			"quota_threshold":     "20%",
			"triggered_at":        "2026-05-20 12:00:00",
			"group_name":          "默认分组",
			"moderation_category": "violence",
			"moderation_score":    "0.982",
			"violation_count":     "2",
			"ban_threshold":       "3",
			"rule_name":           "错误率过高",
			"severity":            "critical",
			"alert_status":        "firing",
			"metric_type":         "error_rate",
			"operator":            ">=",
			"metric_value":        "12.50",
			"threshold_value":     "10.00",
			"alert_description":   "最近 10 分钟错误率超过阈值",
			"report_name":         "日报",
			"report_type":         "daily_summary",
			"report_start_time":   "2026-05-19 12:00",
			"report_end_time":     "2026-05-20 12:00",
			"report_html":         "<h2>日报</h2><p>请求量：1024</p>",
		}
	}
	return map[string]string{
		"site_name":           defaultSiteName,
		"recipient_name":      "Alex",
		"recipient_email":     "user@example.com",
		"verification_code":   "123456",
		"expires_in_minutes":  "15",
		"reset_url":           "https://example.com/reset-password?token=preview",
		"subscription_group":  "Claude Pro",
		"subscription_days":   "30",
		"expiry_time":         "2026-06-18 12:00",
		"days_remaining":      "3",
		"current_balance":     "12.34",
		"threshold":           "20.00",
		"recharge_url":        "https://example.com/recharge",
		"recharge_amount":     "50.00",
		"order_id":            "1024",
		"unsubscribe_url":     "https://example.com/unsubscribe",
		"account_id":          "1001",
		"account_name":        "openai-main",
		"platform":            "openai",
		"quota_dimension":     "Daily quota",
		"quota_used":          "80.00",
		"quota_limit":         "100.00",
		"quota_remaining":     "20.00",
		"quota_threshold":     "20%",
		"triggered_at":        "2026-05-20 12:00:00",
		"group_name":          "Default group",
		"moderation_category": "violence",
		"moderation_score":    "0.982",
		"violation_count":     "2",
		"ban_threshold":       "3",
		"rule_name":           "High error rate",
		"severity":            "critical",
		"alert_status":        "firing",
		"metric_type":         "error_rate",
		"operator":            ">=",
		"metric_value":        "12.50",
		"threshold_value":     "10.00",
		"alert_description":   "Error rate exceeded threshold in the last 10 minutes.",
		"report_name":         "Daily summary",
		"report_type":         "daily_summary",
		"report_start_time":   "2026-05-19 12:00",
		"report_end_time":     "2026-05-20 12:00",
		"report_html":         "<h2>Daily summary</h2><p>Requests: 1024</p>",
	}
}

var notificationEmailEventOrder = []string{
	NotificationEmailEventAuthVerifyCode,
	NotificationEmailEventAuthPasswordReset,
	NotificationEmailEventNotificationEmailVerifyCode,
	NotificationEmailEventSubscriptionPurchaseSuccess,
	NotificationEmailEventSubscriptionExpiryReminder,
	NotificationEmailEventBalanceLow,
	NotificationEmailEventBalanceRechargeSuccess,
	NotificationEmailEventAccountQuotaAlert,
	NotificationEmailEventContentModerationViolation,
	NotificationEmailEventContentModerationDisabled,
	NotificationEmailEventOpsAlert,
	NotificationEmailEventOpsScheduledReport,
}

var notificationEmailEventDefinitions = map[string]NotificationEmailEventInfo{
	NotificationEmailEventAuthVerifyCode: {
		Event:        NotificationEmailEventAuthVerifyCode,
		Label:        "Email verification code",
		Description:  "Sent for registration, email binding, OAuth pending email, and TOTP verification flows.",
		Category:     "auth",
		Optional:     false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...), "verification_code", "expires_in_minutes"),
	},
	NotificationEmailEventAuthPasswordReset: {
		Event:        NotificationEmailEventAuthPasswordReset,
		Label:        "Password reset",
		Description:  "Sent when a user requests a password reset link.",
		Category:     "auth",
		Optional:     false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...), "reset_url", "expires_in_minutes"),
	},
	NotificationEmailEventNotificationEmailVerifyCode: {
		Event:        NotificationEmailEventNotificationEmailVerifyCode,
		Label:        "Notification email verification code",
		Description:  "Sent when a user verifies an extra notification email address.",
		Category:     "auth",
		Optional:     false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...), "verification_code", "expires_in_minutes"),
	},
	NotificationEmailEventSubscriptionPurchaseSuccess: {
		Event:        NotificationEmailEventSubscriptionPurchaseSuccess,
		Label:        "Subscription purchase success",
		Description:  "Sent after a subscription purchase is fulfilled.",
		Category:     "subscription",
		Optional:     false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...), "subscription_group", "subscription_days", "expiry_time", "order_id"),
	},
	NotificationEmailEventSubscriptionExpiryReminder: {
		Event:        NotificationEmailEventSubscriptionExpiryReminder,
		Label:        "Subscription expiry reminder",
		Description:  "Optional reminder sent before an active subscription expires.",
		Category:     "subscription",
		Optional:     true,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...), "subscription_group", "expiry_time", "days_remaining", "unsubscribe_url"),
	},
	NotificationEmailEventBalanceLow: {
		Event:        NotificationEmailEventBalanceLow,
		Label:        "Low balance alert",
		Description:  "Optional alert sent when balance crosses the configured low-balance threshold.",
		Category:     "billing",
		Optional:     true,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...), "current_balance", "threshold", "recharge_url", "unsubscribe_url"),
	},
	NotificationEmailEventBalanceRechargeSuccess: {
		Event:        NotificationEmailEventBalanceRechargeSuccess,
		Label:        "Balance recharge success",
		Description:  "Sent after a balance recharge order is fulfilled.",
		Category:     "billing",
		Optional:     false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...), "recharge_amount", "current_balance", "order_id"),
	},
	NotificationEmailEventAccountQuotaAlert: {
		Event:       NotificationEmailEventAccountQuotaAlert,
		Label:       "Account quota alert",
		Description: "Sent to configured admin notification emails when an upstream account quota threshold is crossed.",
		Category:    "admin",
		Optional:    false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...),
			"account_id", "account_name", "platform", "quota_dimension", "quota_used", "quota_limit", "quota_remaining", "quota_threshold"),
	},
	NotificationEmailEventContentModerationViolation: {
		Event:       NotificationEmailEventContentModerationViolation,
		Label:       "Risk control violation notice",
		Description: "Sent to users when a request triggers content moderation/risk control rules.",
		Category:    "risk_control",
		Optional:    false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...),
			"triggered_at", "group_name", "moderation_category", "moderation_score", "violation_count", "ban_threshold"),
	},
	NotificationEmailEventContentModerationDisabled: {
		Event:       NotificationEmailEventContentModerationDisabled,
		Label:       "Risk control account disabled",
		Description: "Sent to users when content moderation automatically disables their account.",
		Category:    "risk_control",
		Optional:    false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...),
			"triggered_at", "group_name", "moderation_category", "moderation_score", "violation_count", "ban_threshold"),
	},
	NotificationEmailEventOpsAlert: {
		Event:       NotificationEmailEventOpsAlert,
		Label:       "Ops alert",
		Description: "Sent to configured operations recipients when an ops alert rule fires.",
		Category:    "ops",
		Optional:    false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...),
			"rule_name", "severity", "alert_status", "metric_type", "operator", "metric_value", "threshold_value", "triggered_at", "alert_description"),
	},
	NotificationEmailEventOpsScheduledReport: {
		Event:       NotificationEmailEventOpsScheduledReport,
		Label:       "Ops scheduled report",
		Description: "Sent to configured operations recipients for scheduled daily/weekly/error/account-health reports.",
		Category:    "ops",
		Optional:    false,
		Placeholders: append(append([]string{}, notificationEmailCommonPlaceholders...),
			"report_name", "report_type", "report_start_time", "report_end_time", "report_html"),
	},
}

var notificationEmailOfficialTemplates = map[string]map[string]notificationEmailOfficialTemplate{
	NotificationEmailEventAuthVerifyCode: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Email verification code",
			HTML: assembleNotifCardHTML("#4f46e5", "Email verification code", `
<p>Hello {{recipient_name}},</p>
<p>Your verification code is:</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{verification_code}}</p>
<p>This code expires in <strong>{{expires_in_minutes}}</strong> minutes.</p>
<p>If you did not request this code, please ignore this email.</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 邮箱验证码",
			HTML: assembleNotifCardHTML("#4f46e5", "邮箱验证码", `
<p>{{recipient_name}}，您好：</p>
<p>您的验证码是：</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{verification_code}}</p>
<p>验证码将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。</p>
<p>如果不是您本人操作，请忽略此邮件。</p>`),
		},
	},
	NotificationEmailEventAuthPasswordReset: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Password reset request",
			HTML: assembleNotifCardHTML("#7c3aed", "Password reset", `
<p>Hello {{recipient_name}},</p>
<p>We received a request to reset your password. Click the button below to set a new password.</p>
<p><a class="button" href="{{reset_url}}">Reset password</a></p>
<p>This link expires in <strong>{{expires_in_minutes}}</strong> minutes.</p>
<p class="muted">If the button does not work, copy this link into your browser:<br>{{reset_url}}</p>
<p>If you did not request this, you can safely ignore this email.</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 密码重置请求",
			HTML: assembleNotifCardHTML("#7c3aed", "密码重置", `
<p>{{recipient_name}}，您好：</p>
<p>我们收到了您的密码重置请求，请点击下方按钮设置新密码。</p>
<p><a class="button" href="{{reset_url}}">重置密码</a></p>
<p>此链接将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。</p>
<p class="muted">如果按钮无法点击，请复制以下链接到浏览器中打开：<br>{{reset_url}}</p>
<p>如果不是您本人操作，请忽略此邮件。</p>`),
		},
	},
	NotificationEmailEventNotificationEmailVerifyCode: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Notification email verification code",
			HTML: assembleNotifCardHTML("#0ea5e9", "Notification email verification", `
<p>Hello {{recipient_name}},</p>
<p>You are adding this address as an extra notification email.</p>
<p>Your verification code is:</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{verification_code}}</p>
<p>This code expires in <strong>{{expires_in_minutes}}</strong> minutes.</p>
<p>If you did not request this code, please ignore this email.</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 通知邮箱验证码",
			HTML: assembleNotifCardHTML("#0ea5e9", "通知邮箱验证", `
<p>{{recipient_name}}，您好：</p>
<p>您正在添加额外的通知邮箱，请输入以下验证码完成验证。</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{verification_code}}</p>
<p>验证码将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。</p>
<p>如果不是您本人操作，请忽略此邮件。</p>`),
		},
	},
	NotificationEmailEventSubscriptionPurchaseSuccess: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Subscription purchase successful",
			HTML: assembleNotifCardHTML("#2563eb", "Subscription activated", `
<p>Hello {{recipient_name}},</p>
<p>Your subscription for <strong>{{subscription_group}}</strong> has been activated for <strong>{{subscription_days}}</strong> days.</p>
<p>Expiry time: <strong>{{expiry_time}}</strong></p>
<p>Order ID: {{order_id}}</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 订阅购买成功",
			HTML: assembleNotifCardHTML("#2563eb", "订阅已开通", `
<p>{{recipient_name}}，您好：</p>
<p>您的 <strong>{{subscription_group}}</strong> 订阅已成功开通，有效期 <strong>{{subscription_days}}</strong> 天。</p>
<p>到期时间：<strong>{{expiry_time}}</strong></p>
<p>订单号：{{order_id}}</p>`),
		},
	},
	NotificationEmailEventSubscriptionExpiryReminder: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Subscription expires in {{days_remaining}} day(s)",
			HTML: assembleNotifCardHTML("#f97316", "Subscription expiry reminder", `
<p>Hello {{recipient_name}},</p>
<p>Your <strong>{{subscription_group}}</strong> subscription will expire in <strong>{{days_remaining}}</strong> day(s).</p>
<p>Expiry time: <strong>{{expiry_time}}</strong></p>
<p class="muted"><a href="{{unsubscribe_url}}">Unsubscribe from optional subscription reminders</a></p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 订阅将在 {{days_remaining}} 天后到期",
			HTML: assembleNotifCardHTML("#f97316", "订阅到期提醒", `
<p>{{recipient_name}}，您好：</p>
<p>您的 <strong>{{subscription_group}}</strong> 订阅将在 <strong>{{days_remaining}}</strong> 天后到期。</p>
<p>到期时间：<strong>{{expiry_time}}</strong></p>
<p class="muted"><a href="{{unsubscribe_url}}">退订此类订阅提醒</a></p>`),
		},
	},
	NotificationEmailEventBalanceLow: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Low balance alert",
			HTML: assembleNotifCardHTML("#d97706", "Low balance alert", `
<p>Hello {{recipient_name}},</p>
<p>Your current balance is <strong>${{current_balance}}</strong>, below the configured alert threshold of <strong>${{threshold}}</strong>.</p>
<p>Please recharge in time to avoid service interruption.</p>
<p><a class="button" href="{{recharge_url}}">Recharge now</a></p>
<p class="muted"><a href="{{unsubscribe_url}}">Unsubscribe from optional balance alerts</a></p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 余额不足提醒",
			HTML: assembleNotifCardHTML("#d97706", "余额不足提醒", `
<p>{{recipient_name}}，您好：</p>
<p>您当前余额为 <strong>${{current_balance}}</strong>，已低于提醒阈值 <strong>${{threshold}}</strong>。</p>
<p>请及时充值以免服务中断。</p>
<p><a class="button" href="{{recharge_url}}">立即充值</a></p>
<p class="muted"><a href="{{unsubscribe_url}}">退订此类余额提醒</a></p>`),
		},
	},
	NotificationEmailEventBalanceRechargeSuccess: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Balance recharge successful",
			HTML: assembleNotifCardHTML("#16a34a", "Recharge successful", `
<p>Hello {{recipient_name}},</p>
<p>Your balance recharge of <strong>${{recharge_amount}}</strong> has been completed.</p>
<p>Current balance: <strong>${{current_balance}}</strong></p>
<p>Order ID: {{order_id}}</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 余额充值成功",
			HTML: assembleNotifCardHTML("#16a34a", "余额充值成功", `
<p>{{recipient_name}}，您好：</p>
<p>您的余额充值 <strong>${{recharge_amount}}</strong> 已完成。</p>
<p>当前余额：<strong>${{current_balance}}</strong></p>
			<p>订单号：{{order_id}}</p>`),
		},
	},
	NotificationEmailEventAccountQuotaAlert: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Account quota alert - {{account_name}}",
			HTML: assembleNotifCardHTML("#dc2626", "Account quota alert", `
<p>The upstream account <strong>{{account_name}}</strong> has crossed its configured quota alert threshold.</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td>Account ID</td><td>{{account_id}}</td></tr>
  <tr><td>Platform</td><td>{{platform}}</td></tr>
  <tr><td>Dimension</td><td>{{quota_dimension}}</td></tr>
  <tr><td>Used / Limit</td><td>{{quota_used}} / {{quota_limit}}</td></tr>
  <tr><td>Remaining</td><td>{{quota_remaining}}</td></tr>
  <tr><td>Threshold</td><td>{{quota_threshold}}</td></tr>
</table>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 账号限额告警 - {{account_name}}",
			HTML: assembleNotifCardHTML("#dc2626", "账号限额告警", `
<p>上游账号 <strong>{{account_name}}</strong> 已触发配置的额度告警阈值。</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td>账号 ID</td><td>{{account_id}}</td></tr>
  <tr><td>平台</td><td>{{platform}}</td></tr>
  <tr><td>维度</td><td>{{quota_dimension}}</td></tr>
  <tr><td>已用 / 限额</td><td>{{quota_used}} / {{quota_limit}}</td></tr>
  <tr><td>剩余额度</td><td>{{quota_remaining}}</td></tr>
  <tr><td>告警阈值</td><td>{{quota_threshold}}</td></tr>
</table>`),
		},
	},
	NotificationEmailEventContentModerationViolation: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Risk control notice",
			HTML: assembleNotifCardHTML("#ef4444", "Risk control notice", `
<p>Hello {{recipient_name}},</p>
<p>Your API request triggered the platform content moderation/risk-control policy.</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td>Triggered at</td><td>{{triggered_at}}</td></tr>
  <tr><td>Group</td><td>{{group_name}}</td></tr>
  <tr><td>Category / Score</td><td>{{moderation_category}} / {{moderation_score}}</td></tr>
  <tr><td>Violation count</td><td>{{violation_count}} / {{ban_threshold}}</td></tr>
</table>
<p>Please review your request content to avoid future service interruptions.</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 账户风控提醒",
			HTML: assembleNotifCardHTML("#ef4444", "账户风控提醒", `
<p>{{recipient_name}}，您好：</p>
<p>您的 API 请求触发了平台内容审核/风控策略。</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td>触发时间</td><td>{{triggered_at}}</td></tr>
  <tr><td>所属分组</td><td>{{group_name}}</td></tr>
  <tr><td>命中类别 / 分数</td><td>{{moderation_category}} / {{moderation_score}}</td></tr>
  <tr><td>累计触发次数</td><td>{{violation_count}} / {{ban_threshold}}</td></tr>
</table>
<p>请检查请求内容，避免后续服务受到影响。</p>`),
		},
	},
	NotificationEmailEventContentModerationDisabled: {
		notificationEmailDefaultLocale: {
			Subject: "[{{site_name}}] Account disabled by risk control",
			HTML: assembleNotifCardHTML("#b91c1c", "Account disabled", `
<p>Hello {{recipient_name}},</p>
<p>Your account has repeatedly triggered platform content moderation/risk-control rules and has been automatically disabled.</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td>Disabled at</td><td>{{triggered_at}}</td></tr>
  <tr><td>Group</td><td>{{group_name}}</td></tr>
  <tr><td>Category / Score</td><td>{{moderation_category}} / {{moderation_score}}</td></tr>
  <tr><td>Violation count</td><td>{{violation_count}} / {{ban_threshold}}</td></tr>
</table>
<p>Please contact the administrator if you need to appeal or restore access.</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[{{site_name}}] 账户已被禁用",
			HTML: assembleNotifCardHTML("#b91c1c", "账户已被禁用", `
<p>{{recipient_name}}，您好：</p>
<p>您的账户在统计周期内多次触发平台内容审核/风控规则，系统已自动禁用该账户。</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td>禁用时间</td><td>{{triggered_at}}</td></tr>
  <tr><td>所属分组</td><td>{{group_name}}</td></tr>
  <tr><td>命中类别 / 分数</td><td>{{moderation_category}} / {{moderation_score}}</td></tr>
  <tr><td>累计触发次数</td><td>{{violation_count}} / {{ban_threshold}}</td></tr>
</table>
<p>如需申诉或恢复账号，请联系平台管理员处理。</p>`),
		},
	},
	NotificationEmailEventOpsAlert: {
		notificationEmailDefaultLocale: {
			Subject: "[Ops Alert][{{severity}}] {{rule_name}}",
			HTML: assembleNotifCardHTML("#ea580c", "Ops alert", `
<p><strong>Rule</strong>: {{rule_name}}</p>
<p><strong>Severity</strong>: {{severity}}</p>
<p><strong>Status</strong>: {{alert_status}}</p>
<p><strong>Metric</strong>: {{metric_type}} {{operator}} {{metric_value}} (threshold {{threshold_value}})</p>
<p><strong>Fired at</strong>: {{triggered_at}}</p>
<p><strong>Description</strong>: {{alert_description}}</p>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[运维告警][{{severity}}] {{rule_name}}",
			HTML: assembleNotifCardHTML("#ea580c", "运维告警", `
<p><strong>规则</strong>：{{rule_name}}</p>
<p><strong>严重级别</strong>：{{severity}}</p>
<p><strong>状态</strong>：{{alert_status}}</p>
<p><strong>指标</strong>：{{metric_type}} {{operator}} {{metric_value}}（阈值 {{threshold_value}}）</p>
<p><strong>触发时间</strong>：{{triggered_at}}</p>
<p><strong>说明</strong>：{{alert_description}}</p>`),
		},
	},
	NotificationEmailEventOpsScheduledReport: {
		notificationEmailDefaultLocale: {
			Subject: "[Ops Report] {{report_name}}",
			HTML: assembleNotifCardHTML("#0891b2", "Ops report", `
<p><strong>Report</strong>: {{report_name}}</p>
<p><strong>Type</strong>: {{report_type}}</p>
<p><strong>Range</strong>: {{report_start_time}} - {{report_end_time}}</p>
<div>{{report_html}}</div>`),
		},
		notificationEmailLocaleChinese: {
			Subject: "[运维报表] {{report_name}}",
			HTML: assembleNotifCardHTML("#0891b2", "运维报表", `
<p><strong>报表</strong>：{{report_name}}</p>
<p><strong>类型</strong>：{{report_type}}</p>
<p><strong>时间范围</strong>：{{report_start_time}} - {{report_end_time}}</p>
<div>{{report_html}}</div>`),
		},
	},
}

func assembleNotifCardHTML(accentColor, heading, body string) string {
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 24px; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18181b; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.10); }
    .header { background: ` + accentColor + `; color: #ffffff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 24px; line-height: 1.25; }
    .content { padding: 32px; font-size: 15px; line-height: 1.7; }
    .button { display: inline-block; margin-top: 12px; padding: 11px 18px; border-radius: 8px; background: ` + accentColor + `; color: #ffffff; text-decoration: none; font-weight: 600; }
    .muted { color: #71717a; font-size: 13px; }
    .footer { padding: 18px 32px; background: #fafafa; color: #a1a1aa; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>` + heading + `</h1></div>
    <div class="content">` + body + `</div>
    <div class="footer">This email was sent by {{site_name}}. Please do not reply directly.</div>
  </div>
</body>
</html>`
}
