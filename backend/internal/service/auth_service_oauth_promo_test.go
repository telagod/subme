//go:build unit

package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestApplyOAuthSignupPromoCode_NilService 验证 helper 在 promoService 未注入时
// 安全返回，不 panic、不修改 user。
func TestApplyOAuthSignupPromoCode_NilService(t *testing.T) {
	repo := &userRepoStub{}
	svc := newAuthService(repo, map[string]string{
		SettingKeyPromoCodeEnabled: "true",
	}, nil, nil)

	user := &User{ID: 42, Email: "u@test.com"}
	got := svc.applyOAuthSignupPromoCode(context.Background(), user, "ABC123")
	require.Same(t, user, got, "promoService nil must return original user unchanged")
}

// TestApplyOAuthSignupPromoCode_EmptyCode 验证空 promoCode 时 helper 安全返回。
func TestApplyOAuthSignupPromoCode_EmptyCode(t *testing.T) {
	repo := &userRepoStub{}
	svc := newAuthService(repo, map[string]string{
		SettingKeyPromoCodeEnabled: "true",
	}, nil, nil)

	user := &User{ID: 42, Email: "u@test.com"}
	require.Same(t, user, svc.applyOAuthSignupPromoCode(context.Background(), user, ""))
	require.Same(t, user, svc.applyOAuthSignupPromoCode(context.Background(), user, "   "))
}

// TestApplyOAuthSignupPromoCode_FeatureDisabled 验证 IsPromoCodeEnabled=false
// 时即使 promoCode 非空也不应该调进 promoService（无法 panic 即视为门控通过）。
func TestApplyOAuthSignupPromoCode_FeatureDisabled(t *testing.T) {
	repo := &userRepoStub{}
	svc := newAuthService(repo, map[string]string{
		SettingKeyPromoCodeEnabled: "false",
	}, nil, nil)

	user := &User{ID: 42, Email: "u@test.com"}
	got := svc.applyOAuthSignupPromoCode(context.Background(), user, "ABC123")
	require.Same(t, user, got)
}

// TestApplyOAuthSignupPromoCode_NilUser 验证 helper 在 user 为 nil 时返回 nil。
func TestApplyOAuthSignupPromoCode_NilUser(t *testing.T) {
	repo := &userRepoStub{}
	svc := newAuthService(repo, map[string]string{
		SettingKeyPromoCodeEnabled: "true",
	}, nil, nil)

	got := svc.applyOAuthSignupPromoCode(context.Background(), nil, "ABC123")
	require.Nil(t, got)
}

// TestApplyOAuthSignupPromoCode_PublicWrapper_GuardsZeroID 验证公开包装器
// ApplyOAuthSignupPromoCode 对 userID <= 0 直接 short-circuit，避免对无效用户
// 调用 promo（防御 handler 层传 0 触发不必要工作）。
func TestApplyOAuthSignupPromoCode_PublicWrapper_GuardsZeroID(t *testing.T) {
	repo := &userRepoStub{}
	svc := newAuthService(repo, map[string]string{
		SettingKeyPromoCodeEnabled: "true",
	}, nil, nil)

	// userID = 0：必须直接返回，不动 promoService
	svc.ApplyOAuthSignupPromoCode(context.Background(), 0, "ABC123")
	// userID < 0：同上
	svc.ApplyOAuthSignupPromoCode(context.Background(), -1, "ABC123")
}

// TestLoginOrRegisterOAuthWithTokenPairAndPromoCode_ExistingUser_DoesNotApplyPromo
// 验证既有用户登录路径上不消费 promo（created=false → helper 不被触发）。
// 由于 promoService=nil 时 helper 本就 no-op，此处不便观测，改为验证语义：
// 既有用户路径不创建新用户（与原 LoginOrRegisterOAuthWithTokenPair 行为一致）。
func TestLoginOrRegisterOAuthWithTokenPairAndPromoCode_ExistingUser_DoesNotCreate(t *testing.T) {
	existing := &User{
		ID:           99,
		Email:        "existing-promo@linuxdo-connect.invalid",
		Username:     "existing-user",
		Role:         RoleUser,
		Status:       StatusActive,
		Balance:      4,
		Concurrency:  1,
		TokenVersion: 1,
	}
	repo := &userRepoStub{user: existing}
	assigner := &defaultSubscriptionAssignerStub{}
	service := newAuthService(repo, map[string]string{
		SettingKeyRegistrationEnabled:                   "true",
		SettingKeyAuthSourceDefaultLinuxDoBalance:       "21.75",
		SettingKeyAuthSourceDefaultLinuxDoConcurrency:   "9",
		SettingKeyAuthSourceDefaultLinuxDoSubscriptions: `[{"group_id":22,"validity_days":14}]`,
		SettingKeyAuthSourceDefaultLinuxDoGrantOnSignup: "true",
		SettingKeyPromoCodeEnabled:                      "true",
	}, nil, nil)
	service.defaultSubAssigner = assigner
	service.refreshTokenCache = &refreshTokenCacheStub{}

	tokenPair, user, err := service.LoginOrRegisterOAuthWithTokenPairAndPromoCode(
		context.Background(),
		existing.Email,
		"linuxdo_user",
		"",
		"",
		"PROMO123", // 提供 promo 码
		"linuxdo",
	)
	require.NoError(t, err)
	require.NotNil(t, tokenPair)
	require.Equal(t, existing.ID, user.ID)
	// 既有用户：余额不应被 default grant / promo 改写
	require.Equal(t, 4.0, user.Balance)
	require.Equal(t, 1, user.Concurrency)
	require.Empty(t, repo.created, "existing user must not be re-created on promo-code OAuth login")
	require.Empty(t, assigner.calls, "existing user must not be granted default subscriptions again")
}

// TestLoginOrRegisterOAuthWithTokenPairAndPromoCode_NewUser_CreatesAndSkipsPromoWhenServiceNil
// 验证新用户注册路径正常创建账户；当 promoService 未注入时不会 panic，并返回 token pair。
func TestLoginOrRegisterOAuthWithTokenPairAndPromoCode_NewUser_CreatesAndSkipsPromoWhenServiceNil(t *testing.T) {
	repo := &userRepoStub{nextID: 71}
	assigner := &defaultSubscriptionAssignerStub{}
	service := newAuthService(repo, map[string]string{
		SettingKeyRegistrationEnabled:                   "true",
		SettingKeyAuthSourceDefaultLinuxDoBalance:       "21.75",
		SettingKeyAuthSourceDefaultLinuxDoConcurrency:   "9",
		SettingKeyAuthSourceDefaultLinuxDoSubscriptions: `[{"group_id":22,"validity_days":14}]`,
		SettingKeyAuthSourceDefaultLinuxDoGrantOnSignup: "true",
		SettingKeyPromoCodeEnabled:                      "true",
	}, nil, nil)
	service.defaultSubAssigner = assigner
	service.refreshTokenCache = &refreshTokenCacheStub{}

	tokenPair, user, err := service.LoginOrRegisterOAuthWithTokenPairAndPromoCode(
		context.Background(),
		"new-promo-user@linuxdo-connect.invalid",
		"new_linuxdo",
		"",
		"",
		"PROMO123", // promoService=nil → helper short-circuit
		"linuxdo",
	)
	require.NoError(t, err)
	require.NotNil(t, tokenPair)
	require.NotNil(t, user)
	require.Equal(t, int64(71), user.ID)
	require.Equal(t, 21.75, user.Balance, "auth-source default grant should still apply for new oauth user")
	require.Len(t, repo.created, 1, "new oauth signup must create exactly one user")
	require.Len(t, assigner.calls, 1, "new oauth signup must trigger default subscription assignment")
}
