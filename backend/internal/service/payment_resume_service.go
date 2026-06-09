package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/telagod/subme/internal/payment"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
)

const paymentResultReturnPath = "/payment/result"

const (
	PaymentSourceHostedRedirect    = "hosted_redirect"
	PaymentSourceWechatInAppResume = "wechat_in_app_resume"

	SettingPaymentVisibleMethodAlipaySource  = "payment_visible_method_alipay_source"
	SettingPaymentVisibleMethodWxpaySource   = "payment_visible_method_wxpay_source"
	SettingPaymentVisibleMethodAlipayEnabled = "payment_visible_method_alipay_enabled"
	SettingPaymentVisibleMethodWxpayEnabled  = "payment_visible_method_wxpay_enabled"

	VisibleMethodSourceOfficialAlipay = "official_alipay"
	VisibleMethodSourceEasyPayAlipay  = "easypay_alipay"
	VisibleMethodSourceOfficialWechat = "official_wxpay"
	VisibleMethodSourceEasyPayWechat  = "easypay_wxpay"

	wechatPaymentResumeTokenType = "wechat_payment_resume"

	paymentResumeNotConfiguredCode    = "PAYMENT_RESUME_NOT_CONFIGURED"
	paymentResumeNotConfiguredMessage = "payment resume tokens require a configured signing key"

	paymentResumeTokenTTL       = 24 * time.Hour
	wechatPaymentResumeTokenTTL = 15 * time.Minute
)

type ResumeTokenClaims struct {
	OrderID            int64  `json:"oid"`
	UserID             int64  `json:"uid,omitempty"`
	ProviderInstanceID string `json:"pi,omitempty"`
	ProviderKey        string `json:"pk,omitempty"`
	PaymentType        string `json:"pt,omitempty"`
	CanonicalReturnURL string `json:"ru,omitempty"`
	IssuedAt           int64  `json:"iat"`
	ExpiresAt          int64  `json:"exp,omitempty"`
}

type WeChatPaymentResumeClaims struct {
	TokenType   string `json:"tk,omitempty"`
	OpenID      string `json:"openid"`
	PaymentType string `json:"pt,omitempty"`
	Amount      string `json:"amt,omitempty"`
	OrderType   string `json:"ot,omitempty"`
	PlanID      int64  `json:"pid,omitempty"`
	RedirectTo  string `json:"rd,omitempty"`
	Scope       string `json:"scp,omitempty"`
	IssuedAt    int64  `json:"iat"`
	ExpiresAt   int64  `json:"exp,omitempty"`
}

type PaymentResumeService struct {
	signingKey []byte
	verifyKeys [][]byte
}

type visibleMethodLoadBalancer struct {
	inner         payment.LoadBalancer
	configService *PaymentConfigService
}

func NewPaymentResumeService(signingKey []byte, verifyFallbacks ...[]byte) *PaymentResumeService {
	svc := &PaymentResumeService{}
	if len(signingKey) > 0 {
		svc.signingKey = append([]byte(nil), signingKey...)
		svc.verifyKeys = append(svc.verifyKeys, svc.signingKey)
	}
	for _, fb := range verifyFallbacks {
		if len(fb) == 0 {
			continue
		}
		copied := append([]byte(nil), fb...)
		isDuplicate := false
		for _, existing := range svc.verifyKeys {
			if bytes.Equal(existing, copied) {
				isDuplicate = true
				break
			}
		}
		if !isDuplicate {
			svc.verifyKeys = append(svc.verifyKeys, copied)
		}
	}
	return svc
}

func (s *PaymentResumeService) isSigningConfigured() bool {
	return s != nil && len(s.signingKey) > 0
}

func (s *PaymentResumeService) ensureSigningKey() error {
	if s.isSigningConfigured() {
		return nil
	}
	return infraerrors.ServiceUnavailable(paymentResumeNotConfiguredCode, paymentResumeNotConfiguredMessage)
}

func NormalizeVisibleMethod(method string) string {
	return payment.GetBasePaymentType(strings.TrimSpace(method))
}

func NormalizeVisibleMethods(methods []string) []string {
	if len(methods) == 0 {
		return nil
	}
	visited := make(map[string]struct{}, len(methods))
	result := make([]string, 0, len(methods))
	for _, m := range methods {
		norm := NormalizeVisibleMethod(m)
		if norm == "" {
			continue
		}
		if _, already := visited[norm]; already {
			continue
		}
		visited[norm] = struct{}{}
		result = append(result, norm)
	}
	return result
}

func NormalizePaymentSource(source string) string {
	lowered := strings.ToLower(strings.TrimSpace(source))
	switch lowered {
	case "", PaymentSourceHostedRedirect:
		return PaymentSourceHostedRedirect
	case "wechat_in_app", "wxpay_resume", PaymentSourceWechatInAppResume:
		return PaymentSourceWechatInAppResume
	default:
		return lowered
	}
}

func NormalizeVisibleMethodSource(method, source string) string {
	baseMethod := NormalizeVisibleMethod(method)
	loweredSource := strings.ToLower(strings.TrimSpace(source))
	switch baseMethod {
	case payment.TypeAlipay:
		switch loweredSource {
		case VisibleMethodSourceOfficialAlipay, payment.TypeAlipay, payment.TypeAlipayDirect, "official":
			return VisibleMethodSourceOfficialAlipay
		case VisibleMethodSourceEasyPayAlipay, payment.TypeEasyPay:
			return VisibleMethodSourceEasyPayAlipay
		}
	case payment.TypeWxpay:
		switch loweredSource {
		case VisibleMethodSourceOfficialWechat, payment.TypeWxpay, payment.TypeWxpayDirect, "wechat", "official":
			return VisibleMethodSourceOfficialWechat
		case VisibleMethodSourceEasyPayWechat, payment.TypeEasyPay:
			return VisibleMethodSourceEasyPayWechat
		}
	}
	return ""
}

func VisibleMethodProviderKeyForSource(method, source string) (string, bool) {
	normalized := NormalizeVisibleMethodSource(method, source)
	switch normalized {
	case VisibleMethodSourceOfficialAlipay:
		return payment.TypeAlipay, NormalizeVisibleMethod(method) == payment.TypeAlipay
	case VisibleMethodSourceEasyPayAlipay:
		return payment.TypeEasyPay, NormalizeVisibleMethod(method) == payment.TypeAlipay
	case VisibleMethodSourceOfficialWechat:
		return payment.TypeWxpay, NormalizeVisibleMethod(method) == payment.TypeWxpay
	case VisibleMethodSourceEasyPayWechat:
		return payment.TypeEasyPay, NormalizeVisibleMethod(method) == payment.TypeWxpay
	default:
		return "", false
	}
}

func newVisibleMethodLoadBalancer(inner payment.LoadBalancer, configService *PaymentConfigService) payment.LoadBalancer {
	if inner == nil || configService == nil || configService.entClient == nil {
		return inner
	}
	return &visibleMethodLoadBalancer{inner: inner, configService: configService}
}

func (lb *visibleMethodLoadBalancer) GetInstanceConfig(ctx context.Context, instanceID int64) (map[string]string, error) {
	return lb.inner.GetInstanceConfig(ctx, instanceID)
}

func (lb *visibleMethodLoadBalancer) SelectInstance(ctx context.Context, providerKey string, paymentType payment.PaymentType, strategy payment.Strategy, orderAmount float64) (*payment.InstanceSelection, error) {
	baseMethod := NormalizeVisibleMethod(paymentType)
	if providerKey != "" || (baseMethod != payment.TypeAlipay && baseMethod != payment.TypeWxpay) {
		return lb.inner.SelectInstance(ctx, providerKey, paymentType, strategy, orderAmount)
	}

	resolved, resolveErr := lb.configService.resolveEnabledVisibleMethodInstance(ctx, baseMethod)
	if resolveErr != nil {
		return nil, resolveErr
	}
	if resolved == nil {
		return nil, fmt.Errorf("visible payment method %s has no enabled provider instance", baseMethod)
	}
	return lb.inner.SelectInstance(ctx, resolved.ProviderKey, paymentType, strategy, orderAmount)
}

func visibleMethodEnabledSettingKey(method string) string {
	switch NormalizeVisibleMethod(method) {
	case payment.TypeAlipay:
		return SettingPaymentVisibleMethodAlipayEnabled
	case payment.TypeWxpay:
		return SettingPaymentVisibleMethodWxpayEnabled
	default:
		return ""
	}
}

func visibleMethodSourceSettingKey(method string) string {
	switch NormalizeVisibleMethod(method) {
	case payment.TypeAlipay:
		return SettingPaymentVisibleMethodAlipaySource
	case payment.TypeWxpay:
		return SettingPaymentVisibleMethodWxpaySource
	default:
		return ""
	}
}

func CanonicalizeReturnURL(raw string, srcHost string, srcURL string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	parsed, parseErr := url.Parse(trimmed)
	if parseErr != nil || !parsed.IsAbs() || parsed.Host == "" {
		return "", infraerrors.BadRequest("INVALID_RETURN_URL", "return_url must be an absolute http/https URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", infraerrors.BadRequest("INVALID_RETURN_URL", "return_url must use http or https")
	}
	parsed.Fragment = ""
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	if parsed.Path != paymentResultReturnPath {
		return "", infraerrors.BadRequest("INVALID_RETURN_URL", "return_url must target the canonical internal payment result page")
	}
	if !isAllowedReturnHost(parsed.Host, srcHost, srcURL) {
		return "", infraerrors.BadRequest("INVALID_RETURN_URL", "return_url must use the same host as the current site or browser origin")
	}
	return parsed.String(), nil
}

func isAllowedReturnHost(returnHost string, requestHost string, refererURL string) bool {
	if hostsMatchOrigin(returnHost, requestHost) {
		return true
	}

	ref := strings.TrimSpace(refererURL)
	if ref == "" {
		return false
	}
	parsedRef, parseErr := url.Parse(ref)
	if parseErr != nil || parsedRef.Host == "" {
		return false
	}
	return hostsMatchOrigin(returnHost, parsedRef.Host)
}

func buildPaymentReturnURL(base string, orderID int64, outTradeNo string, resumeToken string) (string, error) {
	canonical := strings.TrimSpace(base)
	if canonical == "" {
		return "", nil
	}

	parsed, parseErr := url.Parse(canonical)
	if parseErr != nil {
		return "", infraerrors.BadRequest("INVALID_RETURN_URL", "return_url must be a valid URL")
	}
	if !parsed.IsAbs() || parsed.Host == "" {
		return "", infraerrors.BadRequest("INVALID_RETURN_URL", "return_url must be a valid absolute URL")
	}
	parsed.Fragment = ""

	params := parsed.Query()
	if orderID > 0 {
		params.Set("order_id", strconv.FormatInt(orderID, 10))
	}
	if trimmedTrade := strings.TrimSpace(outTradeNo); trimmedTrade != "" {
		params.Set("out_trade_no", trimmedTrade)
	}
	if trimmedToken := strings.TrimSpace(resumeToken); trimmedToken != "" {
		params.Set("resume_token", trimmedToken)
	}
	params.Set("status", "success")
	parsed.RawQuery = params.Encode()

	return parsed.String(), nil
}

func hostsMatchOrigin(hostA string, hostB string) bool {
	a := strings.TrimSpace(hostA)
	b := strings.TrimSpace(hostB)
	if a == "" || b == "" {
		return false
	}
	if strings.EqualFold(a, b) {
		return true
	}

	nameA, portA := splitHostAndPort(a)
	nameB, portB := splitHostAndPort(b)
	if nameA == "" || nameB == "" {
		return false
	}
	return strings.EqualFold(nameA, nameB) && portA == portB
}

func splitHostAndPort(raw string) (string, string) {
	if hostname, port, splitErr := net.SplitHostPort(raw); splitErr == nil {
		return hostname, port
	}
	return raw, ""
}

func (s *PaymentResumeService) CreateToken(claims ResumeTokenClaims) (string, error) {
	if keyErr := s.ensureSigningKey(); keyErr != nil {
		return "", keyErr
	}
	if claims.OrderID <= 0 {
		return "", fmt.Errorf("resume token requires a valid order id")
	}
	if claims.IssuedAt == 0 {
		claims.IssuedAt = time.Now().Unix()
	}
	if claims.ExpiresAt == 0 {
		claims.ExpiresAt = time.Now().Add(paymentResumeTokenTTL).Unix()
	}
	return s.mintSignedToken(claims)
}

func (s *PaymentResumeService) ParseToken(token string) (*ResumeTokenClaims, error) {
	if keyErr := s.ensureSigningKey(); keyErr != nil {
		return nil, keyErr
	}
	var claims ResumeTokenClaims
	if decodeErr := s.decodeSignedToken(token, &claims); decodeErr != nil {
		return nil, infraerrors.BadRequest("INVALID_RESUME_TOKEN", "resume token payload is invalid")
	}
	if claims.OrderID <= 0 {
		return nil, infraerrors.BadRequest("INVALID_RESUME_TOKEN", "resume token missing order id")
	}
	if expiryErr := checkResumeTokenExpiry(claims.ExpiresAt, "INVALID_RESUME_TOKEN", "resume token has expired"); expiryErr != nil {
		return nil, expiryErr
	}
	return &claims, nil
}

func (s *PaymentResumeService) CreateWeChatPaymentResumeToken(claims WeChatPaymentResumeClaims) (string, error) {
	if keyErr := s.ensureSigningKey(); keyErr != nil {
		return "", keyErr
	}
	claims.OpenID = strings.TrimSpace(claims.OpenID)
	if claims.OpenID == "" {
		return "", fmt.Errorf("wechat payment resume token requires an openid")
	}
	if claims.IssuedAt == 0 {
		claims.IssuedAt = time.Now().Unix()
	}
	if claims.ExpiresAt == 0 {
		claims.ExpiresAt = time.Now().Add(wechatPaymentResumeTokenTTL).Unix()
	}
	if norm := NormalizeVisibleMethod(claims.PaymentType); norm != "" {
		claims.PaymentType = norm
	}
	if claims.PaymentType == "" {
		claims.PaymentType = payment.TypeWxpay
	}
	if claims.OrderType == "" {
		claims.OrderType = payment.OrderTypeBalance
	}
	claims.TokenType = wechatPaymentResumeTokenType
	return s.mintSignedToken(claims)
}

func (s *PaymentResumeService) ParseWeChatPaymentResumeToken(token string) (*WeChatPaymentResumeClaims, error) {
	if keyErr := s.ensureSigningKey(); keyErr != nil {
		return nil, keyErr
	}
	var claims WeChatPaymentResumeClaims
	if decodeErr := s.decodeSignedToken(token, &claims); decodeErr != nil {
		return nil, infraerrors.BadRequest("INVALID_WECHAT_PAYMENT_RESUME_TOKEN", "wechat payment resume token payload is invalid")
	}
	if claims.TokenType != wechatPaymentResumeTokenType {
		return nil, infraerrors.BadRequest("INVALID_WECHAT_PAYMENT_RESUME_TOKEN", "wechat payment resume token type mismatch")
	}
	claims.OpenID = strings.TrimSpace(claims.OpenID)
	if claims.OpenID == "" {
		return nil, infraerrors.BadRequest("INVALID_WECHAT_PAYMENT_RESUME_TOKEN", "wechat payment resume token missing openid")
	}
	if expiryErr := checkResumeTokenExpiry(claims.ExpiresAt, "INVALID_WECHAT_PAYMENT_RESUME_TOKEN", "wechat payment resume token has expired"); expiryErr != nil {
		return nil, expiryErr
	}
	if norm := NormalizeVisibleMethod(claims.PaymentType); norm != "" {
		claims.PaymentType = norm
	}
	if claims.PaymentType == "" {
		claims.PaymentType = payment.TypeWxpay
	}
	if claims.OrderType == "" {
		claims.OrderType = payment.OrderTypeBalance
	}
	return &claims, nil
}

func (s *PaymentResumeService) mintSignedToken(claims any) (string, error) {
	raw, marshalErr := json.Marshal(claims)
	if marshalErr != nil {
		return "", fmt.Errorf("unable to marshal resume claims: %w", marshalErr)
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	return encoded + "." + s.computeSignature(encoded), nil
}

func (s *PaymentResumeService) decodeSignedToken(token string, dest any) error {
	segments := strings.Split(token, ".")
	if len(segments) != 2 || segments[0] == "" || segments[1] == "" {
		return infraerrors.BadRequest("INVALID_RESUME_TOKEN", "resume token is malformed")
	}
	if !s.isSignatureValid(segments[0], segments[1]) {
		return infraerrors.BadRequest("INVALID_RESUME_TOKEN", "resume token signature mismatch")
	}
	decoded, decErr := base64.RawURLEncoding.DecodeString(segments[0])
	if decErr != nil {
		return infraerrors.BadRequest("INVALID_RESUME_TOKEN", "resume token payload is malformed")
	}
	return json.Unmarshal(decoded, dest)
}

func (s *PaymentResumeService) isSignatureValid(payload string, signature string) bool {
	if s == nil {
		return false
	}
	for _, k := range s.verifyKeys {
		if hmac.Equal([]byte(signature), []byte(computeResumePayloadMAC(payload, k))) {
			return true
		}
	}
	return false
}

func checkResumeTokenExpiry(expiresAt int64, code, message string) error {
	if expiresAt <= 0 {
		return nil
	}
	if time.Now().Unix() > expiresAt {
		return infraerrors.BadRequest(code, message)
	}
	return nil
}

func (s *PaymentResumeService) computeSignature(payload string) string {
	return computeResumePayloadMAC(payload, s.signingKey)
}

func computeResumePayloadMAC(payload string, key []byte) string {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}
