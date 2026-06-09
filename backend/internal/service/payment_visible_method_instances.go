package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/paymentproviderinstance"
	"github.com/telagod/subme/internal/payment"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"
)

func enabledVisibleMethodsForProvider(providerKey, supportedTypes string) []string {
	collected := make(map[string]struct{}, 2)
	register := func(m string) {
		norm := NormalizeVisibleMethod(m)
		if norm == payment.TypeAlipay || norm == payment.TypeWxpay {
			collected[norm] = struct{}{}
		}
	}

	trimmedKey := strings.TrimSpace(providerKey)
	switch trimmedKey {
	case payment.TypeAlipay:
		if strings.TrimSpace(supportedTypes) == "" {
			register(payment.TypeAlipay)
		} else {
			for _, st := range splitTypes(supportedTypes) {
				if NormalizeVisibleMethod(st) == payment.TypeAlipay {
					register(payment.TypeAlipay)
					break
				}
			}
		}
	case payment.TypeWxpay:
		if strings.TrimSpace(supportedTypes) == "" {
			register(payment.TypeWxpay)
		} else {
			for _, st := range splitTypes(supportedTypes) {
				if NormalizeVisibleMethod(st) == payment.TypeWxpay {
					register(payment.TypeWxpay)
					break
				}
			}
		}
	case payment.TypeEasyPay:
		for _, st := range splitTypes(supportedTypes) {
			register(st)
		}
	}

	ordered := make([]string, 0, len(collected))
	for _, candidate := range []string{payment.TypeAlipay, payment.TypeWxpay} {
		if _, present := collected[candidate]; present {
			ordered = append(ordered, candidate)
		}
	}
	return ordered
}

func providerSupportsVisibleMethod(inst *dbent.PaymentProviderInstance, method string) bool {
	if inst == nil || !inst.Enabled {
		return false
	}
	norm := NormalizeVisibleMethod(method)
	for _, supported := range enabledVisibleMethodsForProvider(inst.ProviderKey, inst.SupportedTypes) {
		if supported == norm {
			return true
		}
	}
	return false
}

func filterEnabledVisibleMethodInstances(instances []*dbent.PaymentProviderInstance, method string) []*dbent.PaymentProviderInstance {
	matching := make([]*dbent.PaymentProviderInstance, 0, len(instances))
	for _, inst := range instances {
		if providerSupportsVisibleMethod(inst, method) {
			matching = append(matching, inst)
		}
	}
	return matching
}

func filterVisibleMethodInstancesByProviderKey(instances []*dbent.PaymentProviderInstance, method string, providerKey string) []*dbent.PaymentProviderInstance {
	matching := make([]*dbent.PaymentProviderInstance, 0, len(instances))
	for _, inst := range instances {
		if !providerSupportsVisibleMethod(inst, method) {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(inst.ProviderKey), strings.TrimSpace(providerKey)) {
			continue
		}
		matching = append(matching, inst)
	}
	return matching
}

func distinctVisibleMethodProviderKeys(instances []*dbent.PaymentProviderInstance) []string {
	visited := make(map[string]struct{}, len(instances))
	result := make([]string, 0, len(instances))
	for _, inst := range instances {
		if inst == nil {
			continue
		}
		trimmed := strings.TrimSpace(inst.ProviderKey)
		if trimmed == "" {
			continue
		}
		lowered := strings.ToLower(trimmed)
		if _, already := visited[lowered]; already {
			continue
		}
		visited[lowered] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func selectVisibleMethodInstanceByProviderKey(instances []*dbent.PaymentProviderInstance, providerKey string) *dbent.PaymentProviderInstance {
	target := strings.TrimSpace(providerKey)
	if target == "" {
		return nil
	}
	for _, inst := range instances {
		if strings.EqualFold(strings.TrimSpace(inst.ProviderKey), target) {
			return inst
		}
	}
	return nil
}

func (s *PaymentConfigService) validateVisibleMethodEnablementConflicts(
	ctx context.Context,
	excludeID int64,
	providerKey string,
	supportedTypes string,
	enabled bool,
) error {
	// Visible methods are selected by configured source (official/easypay),
	// so multiple enabled providers can intentionally claim the same user-facing
	// method. Order creation and limits will route through the configured source.
	_, _, _, _, _ = ctx, excludeID, providerKey, supportedTypes, enabled
	return nil
}

func (s *PaymentConfigService) resolveVisibleMethodSourceProviderKey(ctx context.Context, method string) (string, error) {
	norm := NormalizeVisibleMethod(method)
	settingKey := visibleMethodSourceSettingKey(norm)
	rawSource := ""
	if s != nil && s.settingRepo != nil && settingKey != "" {
		val, getErr := s.settingRepo.GetValue(ctx, settingKey)
		if getErr != nil {
			if !errors.Is(getErr, ErrSettingNotFound) {
				return "", fmt.Errorf("unable to get %s: %w", settingKey, getErr)
			}
		} else {
			rawSource = val
		}
	}

	normalizedSrc, normErr := normalizeVisibleMethodSettingSource(norm, rawSource, true)
	if normErr != nil {
		return "", normErr
	}
	if normalizedSrc == "" {
		return "", nil
	}
	pKey, valid := VisibleMethodProviderKeyForSource(norm, normalizedSrc)
	if !valid {
		return "", infraerrors.BadRequest(
			"INVALID_PAYMENT_VISIBLE_METHOD_SOURCE",
			fmt.Sprintf("%s source must be one of the supported payment providers", norm),
		)
	}
	return pKey, nil
}

func (s *PaymentConfigService) resolveVisibleMethodProviderKey(
	ctx context.Context,
	method string,
	matching []*dbent.PaymentProviderInstance,
) (string, error) {
	pKeys := distinctVisibleMethodProviderKeys(matching)
	switch len(pKeys) {
	case 0:
		return "", nil
	case 1:
		return strings.TrimSpace(pKeys[0]), nil
	default:
		resolved, resolveErr := s.resolveVisibleMethodSourceProviderKey(ctx, method)
		if resolveErr != nil {
			return "", resolveErr
		}
		if resolved == "" {
			return "", nil
		}
		picked := selectVisibleMethodInstanceByProviderKey(matching, resolved)
		if picked == nil {
			return "", infraerrors.BadRequest(
				"INVALID_PAYMENT_VISIBLE_METHOD_SOURCE",
				fmt.Sprintf("%s source has no enabled provider instance", method),
			)
		}
		return strings.TrimSpace(picked.ProviderKey), nil
	}
}

func (s *PaymentConfigService) resolveEnabledVisibleMethodInstance(
	ctx context.Context,
	method string,
) (*dbent.PaymentProviderInstance, error) {
	if s == nil || s.entClient == nil {
		return nil, nil
	}

	norm := NormalizeVisibleMethod(method)
	if norm != payment.TypeAlipay && norm != payment.TypeWxpay {
		return nil, nil
	}

	allEnabled, queryErr := s.entClient.PaymentProviderInstance.Query().
		Where(paymentproviderinstance.EnabledEQ(true)).
		Order(paymentproviderinstance.BySortOrder()).
		All(ctx)
	if queryErr != nil {
		return nil, fmt.Errorf("unable to query enabled payment providers: %w", queryErr)
	}

	candidates := filterEnabledVisibleMethodInstances(allEnabled, norm)
	pKey, resolveErr := s.resolveVisibleMethodProviderKey(ctx, norm, candidates)
	if resolveErr != nil {
		return nil, resolveErr
	}
	if pKey == "" {
		if len(candidates) == 0 {
			return nil, nil
		}
		return &dbent.PaymentProviderInstance{ProviderKey: ""}, nil
	}
	return selectVisibleMethodInstanceByProviderKey(candidates, pKey), nil
}
