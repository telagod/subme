package admin

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestResolveRedeemCodeExpiresAt_FromDays(t *testing.T) {
	days := 3
	expiresAt, err := computeRedeemExpiry(nil, &days)
	require.NoError(t, err)
	require.NotNil(t, expiresAt)
	require.WithinDuration(t, time.Now().UTC().AddDate(0, 0, days), *expiresAt, 2*time.Second)
}

func TestResolveRedeemCodeExpiresAt_RejectsPastAbsoluteTime(t *testing.T) {
	past := time.Now().UTC().Add(-time.Minute)
	expiresAt, err := computeRedeemExpiry(&past, nil)
	require.Error(t, err)
	require.Nil(t, expiresAt)
}

func TestResolveRedeemCodeExpiresAt_RejectsNonPositiveDays(t *testing.T) {
	days := 0
	expiresAt, err := computeRedeemExpiry(nil, &days)
	require.Error(t, err)
	require.Nil(t, expiresAt)
}

func TestResolveRedeemCodeExpiresAt_RejectsConflictingInputs(t *testing.T) {
	future := time.Now().UTC().Add(time.Hour)
	days := 3
	expiresAt, err := computeRedeemExpiry(&future, &days)
	require.Error(t, err)
	require.Nil(t, expiresAt)
}
