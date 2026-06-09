package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash/fnv"
	"sort"
	"strings"
	"sync"
	"time"

	"entgo.io/ent/dialect"
	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/identityadoptiondecision"
	"github.com/telagod/subme/ent/pendingauthsession"
	dbpredicate "github.com/telagod/subme/ent/predicate"
	infraerrors "github.com/telagod/subme/internal/pkg/errors"

	entsql "entgo.io/ent/dialect/sql"
)

var (
	ErrPendingAuthSessionNotFound = infraerrors.NotFound("PENDING_AUTH_SESSION_NOT_FOUND", "pending auth session not found")
	ErrPendingAuthSessionExpired  = infraerrors.Unauthorized("PENDING_AUTH_SESSION_EXPIRED", "pending auth session has expired")
	ErrPendingAuthSessionConsumed = infraerrors.Unauthorized("PENDING_AUTH_SESSION_CONSUMED", "pending auth session has already been used")
	ErrPendingAuthCodeInvalid     = infraerrors.Unauthorized("PENDING_AUTH_CODE_INVALID", "pending auth completion code is invalid")
	ErrPendingAuthCodeExpired     = infraerrors.Unauthorized("PENDING_AUTH_CODE_EXPIRED", "pending auth completion code has expired")
	ErrPendingAuthCodeConsumed    = infraerrors.Unauthorized("PENDING_AUTH_CODE_CONSUMED", "pending auth completion code has already been used")
	ErrPendingAuthBrowserMismatch = infraerrors.Unauthorized("PENDING_AUTH_BROWSER_MISMATCH", "pending auth completion code does not match this browser session")
)

const (
	defaultPendingAuthTTL           = 15 * time.Minute
	defaultPendingAuthCompletionTTL = 5 * time.Minute
)

type PendingAuthIdentityKey struct {
	ProviderType    string
	ProviderKey     string
	ProviderSubject string
}

type CreatePendingAuthSessionInput struct {
	SessionToken             string
	Intent                   string
	Identity                 PendingAuthIdentityKey
	TargetUserID             *int64
	RedirectTo               string
	ResolvedEmail            string
	RegistrationPasswordHash string
	BrowserSessionKey        string
	UpstreamIdentityClaims   map[string]any
	LocalFlowState           map[string]any
	ExpiresAt                time.Time
}

type IssuePendingAuthCompletionCodeInput struct {
	PendingAuthSessionID int64
	BrowserSessionKey    string
	TTL                  time.Duration
}

type IssuePendingAuthCompletionCodeResult struct {
	Code      string
	ExpiresAt time.Time
}

type PendingIdentityAdoptionDecisionInput struct {
	PendingAuthSessionID int64
	IdentityID           *int64
	AdoptDisplayName     bool
	AdoptAvatar          bool
}

type AuthPendingIdentityService struct {
	entClient *dbent.Client
}

var pendingIdentityScopedLockStore = initPendingIdentityScopedLockStore()

type pendingIdentityScopedLockStore_t struct {
	guard   sync.Mutex
	entries map[string]*pendingIdentityLockSlot
}

type pendingIdentityLockSlot struct {
	mu       sync.Mutex
	refCount int
}

func initPendingIdentityScopedLockStore() *pendingIdentityScopedLockStore_t {
	return &pendingIdentityScopedLockStore_t{
		entries: make(map[string]*pendingIdentityLockSlot),
	}
}

func (store *pendingIdentityScopedLockStore_t) acquire(keys ...string) func() {
	sorted := deduplicateAndSortLockKeys(keys...)
	if len(sorted) == 0 {
		return func() {}
	}

	slots := make([]*pendingIdentityLockSlot, 0, len(sorted))
	store.guard.Lock()
	for _, k := range sorted {
		slot, found := store.entries[k]
		if !found {
			slot = &pendingIdentityLockSlot{}
			store.entries[k] = slot
		}
		slot.refCount++
		slots = append(slots, slot)
	}
	store.guard.Unlock()

	for _, slot := range slots {
		slot.mu.Lock()
	}

	return func() {
		for idx := len(slots) - 1; idx >= 0; idx-- {
			slots[idx].mu.Unlock()
		}

		store.guard.Lock()
		defer store.guard.Unlock()
		for i, k := range sorted {
			slots[i].refCount--
			if slots[i].refCount == 0 {
				delete(store.entries, k)
			}
		}
	}
}

func deduplicateAndSortLockKeys(keys ...string) []string {
	if len(keys) == 0 {
		return nil
	}

	unique := make(map[string]struct{}, len(keys))
	for _, k := range keys {
		trimmed := strings.TrimSpace(k)
		if trimmed != "" {
			unique[trimmed] = struct{}{}
		}
	}
	if len(unique) == 0 {
		return nil
	}

	sorted := make([]string, 0, len(unique))
	for k := range unique {
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)
	return sorted
}

func computeAdvisoryLockHash(key string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(key))
	return int64(h.Sum64())
}

func acquirePendingIdentityDBLocks(ctx context.Context, client *dbent.Client, keys ...string) (func(), error) {
	releaseLocal := pendingIdentityScopedLockStore.acquire(keys...)
	sorted := deduplicateAndSortLockKeys(keys...)
	if len(sorted) == 0 || client == nil || client.Driver().Dialect() != dialect.Postgres {
		return releaseLocal, nil
	}

	for _, k := range sorted {
		var resultRows entsql.Rows
		if queryErr := client.Driver().Query(ctx, "SELECT pg_advisory_xact_lock($1)", []any{computeAdvisoryLockHash(k)}, &resultRows); queryErr != nil {
			releaseLocal()
			return nil, queryErr
		}
		_ = resultRows.Close()
	}

	return releaseLocal, nil
}

func buildAdoptionLockKeys(pendingSessionID int64, identityID *int64) []string {
	result := []string{fmt.Sprintf("pending-auth-adoption:pending:%d", pendingSessionID)}
	if identityID != nil && *identityID > 0 {
		result = append(result, fmt.Sprintf("pending-auth-adoption:identity:%d", *identityID))
	}
	return result
}

func NewAuthPendingIdentityService(entClient *dbent.Client) *AuthPendingIdentityService {
	return &AuthPendingIdentityService{entClient: entClient}
}

func (s *AuthPendingIdentityService) CreatePendingSession(ctx context.Context, input CreatePendingAuthSessionInput) (*dbent.PendingAuthSession, error) {
	if s == nil || s.entClient == nil {
		return nil, fmt.Errorf("pending auth ent client is not configured")
	}

	token := strings.TrimSpace(input.SessionToken)
	if token == "" {
		generated, genErr := randomOpaqueToken(24)
		if genErr != nil {
			return nil, genErr
		}
		token = generated
	}

	deadline := input.ExpiresAt.UTC()
	if deadline.IsZero() {
		deadline = time.Now().UTC().Add(defaultPendingAuthTTL)
	}

	builder := s.entClient.PendingAuthSession.Create().
		SetSessionToken(token).
		SetIntent(strings.TrimSpace(input.Intent)).
		SetProviderType(strings.TrimSpace(input.Identity.ProviderType)).
		SetProviderKey(strings.TrimSpace(input.Identity.ProviderKey)).
		SetProviderSubject(strings.TrimSpace(input.Identity.ProviderSubject)).
		SetRedirectTo(strings.TrimSpace(input.RedirectTo)).
		SetResolvedEmail(strings.TrimSpace(input.ResolvedEmail)).
		SetRegistrationPasswordHash(strings.TrimSpace(input.RegistrationPasswordHash)).
		SetBrowserSessionKey(strings.TrimSpace(input.BrowserSessionKey)).
		SetUpstreamIdentityClaims(cloneMapShallow(input.UpstreamIdentityClaims)).
		SetLocalFlowState(cloneMapShallow(input.LocalFlowState)).
		SetExpiresAt(deadline)
	if input.TargetUserID != nil {
		builder = builder.SetTargetUserID(*input.TargetUserID)
	}
	return builder.Save(ctx)
}

func (s *AuthPendingIdentityService) IssueCompletionCode(ctx context.Context, input IssuePendingAuthCompletionCodeInput) (*IssuePendingAuthCompletionCodeResult, error) {
	if s == nil || s.entClient == nil {
		return nil, fmt.Errorf("pending auth ent client is not configured")
	}

	sess, getErr := s.entClient.PendingAuthSession.Get(ctx, input.PendingAuthSessionID)
	if getErr != nil {
		if dbent.IsNotFound(getErr) {
			return nil, ErrPendingAuthSessionNotFound
		}
		return nil, getErr
	}

	opaqueCode, genErr := randomOpaqueToken(24)
	if genErr != nil {
		return nil, genErr
	}
	duration := input.TTL
	if duration <= 0 {
		duration = defaultPendingAuthCompletionTTL
	}
	deadline := time.Now().UTC().Add(duration)

	mut := s.entClient.PendingAuthSession.UpdateOneID(sess.ID).
		SetCompletionCodeHash(digestPendingAuthCode(opaqueCode)).
		SetCompletionCodeExpiresAt(deadline)
	if strings.TrimSpace(input.BrowserSessionKey) != "" {
		mut = mut.SetBrowserSessionKey(strings.TrimSpace(input.BrowserSessionKey))
	}
	if _, saveErr := mut.Save(ctx); saveErr != nil {
		return nil, saveErr
	}

	return &IssuePendingAuthCompletionCodeResult{
		Code:      opaqueCode,
		ExpiresAt: deadline,
	}, nil
}

func (s *AuthPendingIdentityService) ConsumeCompletionCode(ctx context.Context, rawCode, browserSessionKey string) (*dbent.PendingAuthSession, error) {
	if s == nil || s.entClient == nil {
		return nil, fmt.Errorf("pending auth ent client is not configured")
	}

	digest := digestPendingAuthCode(strings.TrimSpace(rawCode))
	sess, queryErr := s.entClient.PendingAuthSession.Query().
		Where(pendingauthsession.CompletionCodeHashEQ(digest)).
		Only(ctx)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return nil, ErrPendingAuthCodeInvalid
		}
		return nil, queryErr
	}

	return s.markSessionConsumed(ctx, sess, browserSessionKey, ErrPendingAuthCodeExpired, ErrPendingAuthCodeConsumed)
}

func (s *AuthPendingIdentityService) ConsumeBrowserSession(ctx context.Context, sessionToken, browserSessionKey string) (*dbent.PendingAuthSession, error) {
	if s == nil || s.entClient == nil {
		return nil, fmt.Errorf("pending auth ent client is not configured")
	}

	sess, lookupErr := s.lookupBrowserSession(ctx, sessionToken)
	if lookupErr != nil {
		return nil, lookupErr
	}

	return s.markSessionConsumed(ctx, sess, browserSessionKey, ErrPendingAuthSessionExpired, ErrPendingAuthSessionConsumed)
}

func (s *AuthPendingIdentityService) GetBrowserSession(ctx context.Context, sessionToken, browserSessionKey string) (*dbent.PendingAuthSession, error) {
	if s == nil || s.entClient == nil {
		return nil, fmt.Errorf("pending auth ent client is not configured")
	}

	sess, lookupErr := s.lookupBrowserSession(ctx, sessionToken)
	if lookupErr != nil {
		return nil, lookupErr
	}
	if stateErr := checkPendingSessionValidity(sess, browserSessionKey, ErrPendingAuthSessionExpired, ErrPendingAuthSessionConsumed); stateErr != nil {
		return nil, stateErr
	}
	return sess, nil
}

func (s *AuthPendingIdentityService) lookupBrowserSession(ctx context.Context, sessionToken string) (*dbent.PendingAuthSession, error) {
	if s == nil || s.entClient == nil {
		return nil, fmt.Errorf("pending auth ent client is not configured")
	}

	token := strings.TrimSpace(sessionToken)
	if token == "" {
		return nil, ErrPendingAuthSessionNotFound
	}

	sess, queryErr := s.entClient.PendingAuthSession.Query().
		Where(pendingauthsession.SessionTokenEQ(token)).
		Only(ctx)
	if queryErr != nil {
		if dbent.IsNotFound(queryErr) {
			return nil, ErrPendingAuthSessionNotFound
		}
		return nil, queryErr
	}
	return sess, nil
}

func (s *AuthPendingIdentityService) markSessionConsumed(
	ctx context.Context,
	sess *dbent.PendingAuthSession,
	browserSessionKey string,
	expiredErr error,
	consumedErr error,
) (*dbent.PendingAuthSession, error) {
	if stateErr := checkPendingSessionValidity(sess, browserSessionKey, expiredErr, consumedErr); stateErr != nil {
		return nil, stateErr
	}

	cleanedState := stripSensitiveFlowState(sess.LocalFlowState)
	now := time.Now().UTC()
	mut := s.entClient.PendingAuthSession.UpdateOneID(sess.ID).
		Where(
			pendingauthsession.ConsumedAtIsNil(),
			pendingauthsession.ExpiresAtGTE(now),
			pendingauthsession.Or(
				pendingauthsession.CompletionCodeExpiresAtIsNil(),
				pendingauthsession.CompletionCodeExpiresAtGTE(now),
			),
		).
		SetConsumedAt(now).
		SetLocalFlowState(cleanedState).
		SetCompletionCodeHash("").
		ClearCompletionCodeExpiresAt()
	if expectedKey := strings.TrimSpace(sess.BrowserSessionKey); expectedKey != "" {
		mut = mut.Where(pendingauthsession.BrowserSessionKeyEQ(expectedKey))
	}
	saved, saveErr := mut.Save(ctx)
	if saveErr == nil {
		return saved, nil
	}
	if !dbent.IsNotFound(saveErr) {
		return nil, saveErr
	}

	refreshed, refreshErr := s.entClient.PendingAuthSession.Get(ctx, sess.ID)
	if refreshErr != nil {
		if dbent.IsNotFound(refreshErr) {
			return nil, ErrPendingAuthSessionNotFound
		}
		return nil, refreshErr
	}
	if stateErr := checkPendingSessionValidity(refreshed, browserSessionKey, expiredErr, consumedErr); stateErr != nil {
		return nil, stateErr
	}
	return nil, consumedErr
}

func stripSensitiveFlowState(flowState map[string]any) map[string]any {
	cleaned := cloneMapShallow(flowState)
	if len(cleaned) == 0 {
		return cleaned
	}

	rawCompletion, exists := cleaned["completion_response"]
	if !exists {
		return cleaned
	}
	completionMap, ok := rawCompletion.(map[string]any)
	if !ok {
		return cleaned
	}

	redacted := cloneMapShallow(completionMap)
	sensitiveKeys := []string{"access_token", "refresh_token", "expires_in", "token_type"}
	for _, sk := range sensitiveKeys {
		delete(redacted, sk)
	}
	cleaned["completion_response"] = redacted
	return cleaned
}

func checkPendingSessionValidity(sess *dbent.PendingAuthSession, browserSessionKey string, expiredErr error, consumedErr error) error {
	if sess == nil {
		return ErrPendingAuthSessionNotFound
	}

	now := time.Now().UTC()
	if sess.ConsumedAt != nil {
		return consumedErr
	}
	if !sess.ExpiresAt.IsZero() && now.After(sess.ExpiresAt) {
		return expiredErr
	}
	if sess.CompletionCodeExpiresAt != nil && now.After(*sess.CompletionCodeExpiresAt) {
		return expiredErr
	}
	if strings.TrimSpace(sess.BrowserSessionKey) != "" && strings.TrimSpace(browserSessionKey) != strings.TrimSpace(sess.BrowserSessionKey) {
		return ErrPendingAuthBrowserMismatch
	}
	return nil
}

func (s *AuthPendingIdentityService) UpsertAdoptionDecision(ctx context.Context, input PendingIdentityAdoptionDecisionInput) (*dbent.IdentityAdoptionDecision, error) {
	if s == nil || s.entClient == nil {
		return nil, fmt.Errorf("pending auth ent client is not configured")
	}

	newTx, txErr := s.entClient.Tx(ctx)
	if txErr != nil && !errors.Is(txErr, dbent.ErrTxStarted) {
		return nil, txErr
	}

	dbClient := s.entClient
	txCtx := ctx
	if txErr == nil {
		defer func() { _ = newTx.Rollback() }()
		dbClient = newTx.Client()
		txCtx = dbent.NewTxContext(ctx, newTx)
	} else if activeTx := dbent.TxFromContext(ctx); activeTx != nil {
		dbClient = activeTx.Client()
	}

	releaseLocks, lockErr := acquirePendingIdentityDBLocks(txCtx, dbClient, buildAdoptionLockKeys(input.PendingAuthSessionID, input.IdentityID)...)
	if lockErr != nil {
		return nil, lockErr
	}
	defer releaseLocks()

	if input.IdentityID != nil && *input.IdentityID > 0 {
		if _, clearErr := dbClient.IdentityAdoptionDecision.Update().
			Where(
				identityadoptiondecision.IdentityIDEQ(*input.IdentityID),
				dbpredicate.IdentityAdoptionDecision(func(s *entsql.Selector) {
					col := s.C(identityadoptiondecision.FieldPendingAuthSessionID)
					s.Where(entsql.Or(
						entsql.IsNull(col),
						entsql.NEQ(col, input.PendingAuthSessionID),
					))
				}),
			).
			ClearIdentityID().
			Save(txCtx); clearErr != nil {
			return nil, clearErr
		}
	}

	builder := dbClient.IdentityAdoptionDecision.Create().
		SetPendingAuthSessionID(input.PendingAuthSessionID).
		SetAdoptDisplayName(input.AdoptDisplayName).
		SetAdoptAvatar(input.AdoptAvatar).
		SetDecidedAt(time.Now().UTC())
	if input.IdentityID != nil && *input.IdentityID > 0 {
		builder = builder.SetIdentityID(*input.IdentityID)
	}

	rowID, upsertErr := builder.
		OnConflictColumns(identityadoptiondecision.FieldPendingAuthSessionID).
		UpdateNewValues().
		ID(txCtx)
	if upsertErr != nil {
		return nil, upsertErr
	}

	decision, getErr := dbClient.IdentityAdoptionDecision.Get(txCtx, rowID)
	if getErr != nil {
		return nil, getErr
	}

	if newTx != nil {
		if commitErr := newTx.Commit(); commitErr != nil {
			return nil, commitErr
		}
	}

	return decision, nil
}

func cloneMapShallow(src map[string]any) map[string]any {
	if len(src) == 0 {
		return map[string]any{}
	}
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func randomOpaqueToken(byteLen int) (string, error) {
	if byteLen <= 0 {
		byteLen = 16
	}
	raw := make([]byte, byteLen)
	if _, readErr := rand.Read(raw); readErr != nil {
		return "", readErr
	}
	return hex.EncodeToString(raw), nil
}

func digestPendingAuthCode(code string) string {
	digest := sha256.Sum256([]byte(code))
	return hex.EncodeToString(digest[:])
}
