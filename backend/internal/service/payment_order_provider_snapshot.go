package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/internal/payment"
)

type paymentOrderProviderSnapshot struct {
	SchemaVersion      int
	ProviderInstanceID string
	ProviderKey        string
	PaymentMode        string
	MerchantAppID      string
	MerchantID         string
	Currency           string
}

func psOrderProviderSnapshot(order *dbent.PaymentOrder) *paymentOrderProviderSnapshot {
	if order == nil || len(order.ProviderSnapshot) == 0 {
		return nil
	}

	snap := &paymentOrderProviderSnapshot{
		SchemaVersion:      extractSnapshotInt(order.ProviderSnapshot["schema_version"]),
		ProviderInstanceID: extractSnapshotString(order.ProviderSnapshot["provider_instance_id"]),
		ProviderKey:        extractSnapshotString(order.ProviderSnapshot["provider_key"]),
		PaymentMode:        extractSnapshotString(order.ProviderSnapshot["payment_mode"]),
		MerchantAppID:      extractSnapshotString(order.ProviderSnapshot["merchant_app_id"]),
		MerchantID:         extractSnapshotString(order.ProviderSnapshot["merchant_id"]),
		Currency:           extractSnapshotString(order.ProviderSnapshot["currency"]),
	}
	if snap.SchemaVersion == 0 &&
		snap.ProviderInstanceID == "" &&
		snap.ProviderKey == "" &&
		snap.PaymentMode == "" &&
		snap.MerchantAppID == "" &&
		snap.MerchantID == "" &&
		snap.Currency == "" {
		return nil
	}
	return snap
}

func extractSnapshotString(val any) string {
	if s, ok := val.(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func extractSnapshotInt(val any) int {
	switch v := val.(type) {
	case int:
		return v
	case int32:
		return int(v)
	case int64:
		return int(v)
	case float32:
		return int(v)
	case float64:
		return int(v)
	case string:
		if n, convErr := strconv.Atoi(strings.TrimSpace(v)); convErr == nil {
			return n
		}
	}
	return 0
}

func (s *PaymentService) resolveSnapshotOrderProviderInstance(ctx context.Context, order *dbent.PaymentOrder, snapshot *paymentOrderProviderSnapshot) (*dbent.PaymentProviderInstance, error) {
	if s == nil || s.entClient == nil || order == nil || snapshot == nil {
		return nil, nil
	}

	snapInstID := strings.TrimSpace(snapshot.ProviderInstanceID)
	colInstID := strings.TrimSpace(psStringValueV2(order.ProviderInstanceID))
	if snapInstID == "" {
		snapInstID = colInstID
	}
	if snapInstID == "" {
		return nil, fmt.Errorf("order %d provider snapshot lacks provider_instance_id", order.ID)
	}
	if colInstID != "" && snapshot.ProviderInstanceID != "" && !strings.EqualFold(colInstID, snapshot.ProviderInstanceID) {
		return nil, fmt.Errorf("order %d provider instance mismatch: snapshot=%s column=%s", order.ID, snapshot.ProviderInstanceID, colInstID)
	}

	numericID, parseErr := strconv.ParseInt(snapInstID, 10, 64)
	if parseErr != nil {
		return nil, fmt.Errorf("order %d provider snapshot instance id is not valid: %s", order.ID, snapInstID)
	}

	inst, getErr := s.entClient.PaymentProviderInstance.Get(ctx, numericID)
	if getErr != nil {
		if dbent.IsNotFound(getErr) {
			return nil, fmt.Errorf("order %d provider snapshot instance %s not found", order.ID, snapInstID)
		}
		return nil, getErr
	}

	if snapshot.ProviderKey != "" && !strings.EqualFold(strings.TrimSpace(inst.ProviderKey), snapshot.ProviderKey) {
		return nil, fmt.Errorf("order %d provider key mismatch: snapshot=%s instance=%s", order.ID, snapshot.ProviderKey, inst.ProviderKey)
	}

	return inst, nil
}

func expectedNotificationProviderKeyForOrder(registry *payment.Registry, order *dbent.PaymentOrder, instanceProviderKey string) string {
	if order == nil {
		return strings.TrimSpace(instanceProviderKey)
	}

	orderPKey := psStringValueV2(order.ProviderKey)
	if snap := psOrderProviderSnapshot(order); snap != nil && snap.ProviderKey != "" {
		orderPKey = snap.ProviderKey
	}

	return expectedNotificationProviderKeyV2(registry, order.PaymentType, orderPKey, instanceProviderKey)
}

func validateProviderSnapshotMetadata(order *dbent.PaymentOrder, providerKey string, metadata map[string]string) error {
	if order == nil || len(metadata) == 0 {
		return nil
	}

	snap := psOrderProviderSnapshot(order)
	if snap == nil {
		return nil
	}

	trimmedKey := strings.TrimSpace(providerKey)
	switch trimmedKey {
	case payment.TypeWxpay:
		if want := strings.TrimSpace(snap.MerchantAppID); want != "" {
			got := strings.TrimSpace(metadata["appid"])
			if got == "" {
				return fmt.Errorf("wxpay callback missing appid")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("wxpay appid mismatch: want %s, got %s", want, got)
			}
		}
		if want := strings.TrimSpace(snap.MerchantID); want != "" {
			got := strings.TrimSpace(metadata["mchid"])
			if got == "" {
				return fmt.Errorf("wxpay callback missing mchid")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("wxpay mchid mismatch: want %s, got %s", want, got)
			}
		}
		if want := strings.TrimSpace(snap.Currency); want != "" {
			got := strings.ToUpper(strings.TrimSpace(metadata["currency"]))
			if got == "" {
				return fmt.Errorf("wxpay callback missing currency")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("wxpay currency mismatch: want %s, got %s", want, got)
			}
		}
		if state := strings.TrimSpace(metadata["trade_state"]); state != "" && !strings.EqualFold(state, "SUCCESS") {
			return fmt.Errorf("wxpay trade_state unexpected: want SUCCESS, got %s", state)
		}
	case payment.TypeAlipay:
		if want := strings.TrimSpace(snap.MerchantAppID); want != "" {
			got := strings.TrimSpace(metadata["app_id"])
			if got == "" {
				return fmt.Errorf("alipay callback missing app_id")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("alipay app_id mismatch: want %s, got %s", want, got)
			}
		}
	case payment.TypeEasyPay:
		if want := strings.TrimSpace(snap.MerchantID); want != "" {
			got := strings.TrimSpace(metadata["pid"])
			if got == "" {
				return fmt.Errorf("easypay callback missing pid")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("easypay pid mismatch: want %s, got %s", want, got)
			}
		}
	case payment.TypeStripe:
		if want := strings.TrimSpace(snap.Currency); want != "" {
			got := strings.ToUpper(strings.TrimSpace(metadata["currency"]))
			if got == "" {
				return fmt.Errorf("stripe callback missing currency")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("stripe currency mismatch: want %s, got %s", want, got)
			}
		}
	case payment.TypeAirwallex:
		if want := strings.TrimSpace(snap.MerchantID); want != "" {
			got := strings.TrimSpace(metadata["account_id"])
			if got == "" {
				return fmt.Errorf("airwallex callback missing account_id")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("airwallex account_id mismatch: want %s, got %s", want, got)
			}
		}
		if want := strings.TrimSpace(snap.Currency); want != "" {
			got := strings.ToUpper(strings.TrimSpace(metadata["currency"]))
			if got == "" {
				return fmt.Errorf("airwallex callback missing currency")
			}
			if !strings.EqualFold(want, got) {
				return fmt.Errorf("airwallex currency mismatch: want %s, got %s", want, got)
			}
		}
		if status := strings.TrimSpace(metadata["status"]); status != "" && !strings.EqualFold(status, "SUCCEEDED") {
			return fmt.Errorf("airwallex status unexpected: want SUCCEEDED, got %s", status)
		}
	}

	return nil
}

func providerMerchantIdentityMetadata(prov payment.Provider) map[string]string {
	if prov == nil {
		return nil
	}
	reporter, ok := prov.(payment.MerchantIdentityProvider)
	if !ok {
		return nil
	}
	return reporter.MerchantIdentityMetadata()
}
