package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/paymentorder"
	"github.com/telagod/subme/ent/paymentproviderinstance"
	"github.com/telagod/subme/internal/payment"
)

// GetWebhookProvider returns the provider instance that should verify a webhook.
// It resolves the original provider instance from the order whenever possible and
// only falls back to a registry provider for legacy/single-instance scenarios.
func (s *PaymentService) GetWebhookProvider(ctx context.Context, providerKey, outTradeNo string) (payment.Provider, error) {
	candidates, lookupErr := s.GetWebhookProviders(ctx, providerKey, outTradeNo)
	if lookupErr != nil {
		return nil, lookupErr
	}
	if len(candidates) == 0 {
		return nil, payment.ErrProviderNotFound
	}
	return candidates[0], nil
}

// GetWebhookProviders returns provider candidates that can verify the webhook.
// Official WeChat Pay may require multiple candidates because the callback body
// cannot be bound to a merchant before decryption.
func (s *PaymentService) GetWebhookProviders(ctx context.Context, providerKey, outTradeNo string) ([]payment.Provider, error) {
	if outTradeNo != "" {
		row, queryErr := s.entClient.PaymentOrder.Query().Where(paymentorder.OutTradeNo(outTradeNo)).Only(ctx)
		if queryErr == nil {
			if orderHasPinnedInstance(row) {
				pinned, pinErr := s.loadPinnedOrderProvider(ctx, row)
				if pinErr != nil {
					return nil, pinErr
				}
				return []payment.Provider{pinned}, nil
			}
			inst, instErr := s.getOrderProviderInstance(ctx, row)
			if instErr != nil {
				return nil, fmt.Errorf("unable to load order provider instance: %w", instErr)
			}
			if inst != nil {
				prov, provErr := s.createProviderFromInstance(ctx, inst)
				if provErr != nil {
					return nil, provErr
				}
				return []payment.Provider{prov}, nil
			}
			if strings.TrimSpace(providerKey) == payment.TypeWxpay {
				return s.listEnabledWebhookProviders(ctx, providerKey)
			}
			if !s.webhookRegistryFallbackAllowed(ctx, providerKey) {
				return nil, fmt.Errorf("webhook provider fallback is ambiguous for %s", providerKey)
			}
			s.EnsureProviders(ctx)
			prov, regErr := s.registry.GetProviderByKey(providerKey)
			if regErr != nil {
				return nil, regErr
			}
			return []payment.Provider{prov}, nil
		}
	}

	if strings.TrimSpace(providerKey) == payment.TypeWxpay {
		return s.listEnabledWebhookProviders(ctx, providerKey)
	}

	if !s.webhookRegistryFallbackAllowed(ctx, providerKey) {
		return nil, fmt.Errorf("webhook provider fallback is ambiguous for %s", providerKey)
	}

	s.EnsureProviders(ctx)
	prov, regErr := s.registry.GetProviderByKey(providerKey)
	if regErr != nil {
		return nil, regErr
	}
	return []payment.Provider{prov}, nil
}

func (s *PaymentService) loadPinnedOrderProvider(ctx context.Context, order *dbent.PaymentOrder) (payment.Provider, error) {
	inst, instErr := s.getOrderProviderInstance(ctx, order)
	if instErr != nil {
		return nil, fmt.Errorf("unable to load order provider instance: %w", instErr)
	}
	if inst == nil {
		return nil, fmt.Errorf("order %d provider instance not found", order.ID)
	}
	return s.createProviderFromInstance(ctx, inst)
}

func (s *PaymentService) webhookRegistryFallbackAllowed(ctx context.Context, providerKey string) bool {
	trimmed := strings.TrimSpace(providerKey)
	if trimmed == "" || s == nil || s.entClient == nil {
		return false
	}

	total, countErr := s.entClient.PaymentProviderInstance.Query().
		Where(
			paymentproviderinstance.ProviderKeyEQ(trimmed),
			paymentproviderinstance.EnabledEQ(true),
		).
		Count(ctx)
	if countErr != nil {
		slog.Warn("payment webhook fallback instance count failed", "provider", trimmed, "error", countErr)
		return false
	}
	return total <= 1
}

func orderHasPinnedInstance(order *dbent.PaymentOrder) bool {
	return order != nil && (psOrderProviderSnapshot(order) != nil || (order.ProviderInstanceID != nil && strings.TrimSpace(*order.ProviderInstanceID) != ""))
}

func (s *PaymentService) listEnabledWebhookProviders(ctx context.Context, providerKey string) ([]payment.Provider, error) {
	trimmed := strings.TrimSpace(providerKey)
	rows, queryErr := s.entClient.PaymentProviderInstance.Query().
		Where(
			paymentproviderinstance.ProviderKeyEQ(trimmed),
			paymentproviderinstance.EnabledEQ(true),
		).
		Order(dbent.Asc(paymentproviderinstance.FieldSortOrder)).
		All(ctx)
	if queryErr != nil {
		return nil, fmt.Errorf("unable to query webhook provider instances: %w", queryErr)
	}
	if len(rows) == 0 {
		return nil, payment.ErrProviderNotFound
	}

	result := make([]payment.Provider, 0, len(rows))
	for _, row := range rows {
		prov, buildErr := s.createProviderFromInstance(ctx, row)
		if buildErr != nil {
			slog.Warn("skipping webhook provider instance", "provider", trimmed, "instanceID", row.ID, "error", buildErr)
			continue
		}
		result = append(result, prov)
	}
	if len(result) == 0 {
		return nil, payment.ErrProviderNotFound
	}
	return result, nil
}
