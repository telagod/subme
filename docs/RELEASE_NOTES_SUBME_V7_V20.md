# Release Notes — v0.2.0-subme.7 → v0.2.0-subme.20

Synthesised from annotated git tags `v0.2.0-subme.7` … `v0.2.0-subme.19`
and the unreleased work currently on `main` targeted for `v0.2.0-subme.20`.

This document is a single-shot synthesis grouped by subsystem. Per-version
one-liners remain in `CHANGELOG.md`; this file is the long-form record an
operator can read end-to-end before upgrading across the range.

Source of truth for each claim: the annotated tag message
(`git tag -l 'v0.2.0-subme.<n>' -n200`) and the commits between tags
(`git log v0.2.0-subme.<n-1>..v0.2.0-subme.<n>`).

---

## Scope summary

| Version           | Date (commit author) | Headline                                               |
|-------------------|----------------------|--------------------------------------------------------|
| v0.2.0-subme.7    | 2026-05-26           | Upstream batches 1–5 reimplemented; reshadcn cleanup   |
| v0.2.0-subme.8    | 2026-05-28           | cyber_policy phase-1 + Sub2API → Subme rebrand sweep   |
| v0.2.0-subme.9    | 2026-05-29           | cyber_policy phase-2 (no-bill on block + ban-exclude)  |
| v0.2.0-subme.10   | 2026-06-01           | Accounts pool migration phases 1–4; pricing rewrite    |
| v0.2.0-subme.11   | 2026-06-02           | v.10 dogfooding console-error patch                    |
| v0.2.0-subme.12   | 2026-06-04           | Phase-5 cleanup + loader/quota silent-fail fixes       |
| v0.2.0-subme.13   | 2026-06-05           | 9 store zombie-leak + 5 a11y hole fixes                |
| v0.2.0-subme.14   | 2026-06-07           | Backend N+1 batch primitives + frontend −135 KB        |
| v0.2.0-subme.15   | 2026-06-09           | Backend test-rot kill; a11y wave 2; foundation hooks   |
| v0.2.0-subme.16   | 2026-06-11           | `useFetchState` adoption + shared `ErrorState`         |
| v0.2.0-subme.17   | 2026-06-13           | +63 backend service tests; i18n zero-divergence        |
| v0.2.0-subme.18   | 2026-06-15           | CI/CD hardening + observability doc + opt-in config    |
| v0.2.0-subme.19   | 2026-06-17           | `useGenerationGuard` for subscriptions + SSR-safe      |
| v0.2.0-subme.20   | unreleased           | Real-Redis test enable; final BaseDialog focus fix     |

---

## Backend

### Gateway / protocol handling (v.7)

- **`thinking_protocol.go` subsystem.** Routes Anthropic-compatible
  upstreams into `Strict / PassbackRequired / Unknown` families so
  DeepSeek, Kimi, GLM, qwen-thinking, MiniMax-M no longer get their
  thinking block stripped (and 400'd) by Anthropic-strict logic.
- **SSE `event:error` body preserved** through to ops logs and failover
  passthrough (was dropped before reaching the operator dashboard).
- **DeepSeek `reasoning_effort='max'` → `'xhigh'` normalisation.**
- **MiniMax M-series `thinking.type='enabled'` rewritten to
  `'adaptive'`** at the gateway boundary.
- **Streaming `max_tokens=1` Haiku probe** is now intercepted on the
  streaming path too (parity with non-streaming).
- **`MarkResponseCommitted` extended** to OpenAI, Gemini and
  Antigravity error paths (was Anthropic-only).
- **Bedrock**: strip top-level `provider` / `metadata`; plug
  empty-beta-token leak.
- **Antigravity Gemini**: collapse `system`-role messages in the array
  into top-level `systemInstruction` to avoid upstream 400.
- **`tool.strict` default `false`** on chat-completions → Responses
  conversion.
- **Non-JSON 2xx upstream responses trigger failover** instead of being
  returned to the caller.
- **zstd upstream response bodies decompressed.**

### N+1 elimination (v.14)

Eight hotspots replaced with batch IN-clause or ent aggregation
primitives. Most visible touchpoints:

- Admin group listing — single batched query for user-group rates
  instead of per-row.
- Account concurrency snapshot — one aggregate per call.
- Subscription / user roster join paths consolidated.

Coverage is pinned by `TestAdminService_GetUserRPMStatus_NoN1Over100Groups`
(added with v.20) which fails on regression past ~1 s for 100 groups.

### OpenAI cyber_policy (v.8 → v.9)

- **Phase-1 (v.8)**: detect ChatGPT-upstream hard-block responses in
  both top-level and response-wrapped shapes; emit ops log
  `cyber_policy_blocked`; new `RequestTypeCyberBlocked` enum value.
  Phase-1 is detection-only — response body is passed through unchanged.
- **Phase-2 (v.9)**: `Blocked` verdicts short-circuit through
  `recordCyberBlockedUsage` with `tokens=0 / cost=0`,
  bypassing `applyUsageBilling`. Billing, balance, subscription and
  quota are all left untouched. The identifying fields
  (`user_id`, `api_key_id`, `account_id`, `model`) are preserved for
  audit.
- **Ban-exclusion list**: new setting
  `cyber_policy_ban_excluded_accounts` (JSON array of account IDs).
  Excluded accounts still emit the ops audit log but do not trigger
  the `RecordUsage` short-circuit — they are billed normally.
- **Session-block store** (`CyberSessionBlockStore`) is in place
  (`sync.Map` + 10 min TTL singleton). WS multi-turn integration is
  explicitly deferred to phase-3.

> Operator behaviour note. cyber_policy-Blocked OpenAI traffic no
> longer counts towards balance deductions. Any dashboard or reconciliation
> script that depended on blocked traffic appearing in usage logs needs
> to switch to filtering on `request_type = cyber` (now persisted).

### OAuth / accounts / auth (v.7)

- **OAuth promo-code application** strictly new-user-only across all
  five provider handlers. `promo_code` flows through cookie +
  `LocalFlowState`.
- **`account_repo` batch ID-IN queries** chunked under the PG 65535
  bind-parameter cap (relevant once active-account list passes ~5 k).
- **Token-refresh retry suppression**:
  `SetTempUnschedulable` now guards with `RowsAffected`,
  `ListOAuthRefreshCandidates` uses a PG three-valued-logic predicate
  (`(a AND b) IS NOT TRUE`) so dead accounts are not requeued.
- **`invalid_refresh_token` / `app_session_terminated`** are treated as
  non-retryable — accounts move straight to `needs-reauth`.
- **API-key ACL denials** now include the client IP for operator
  diagnostics.
- **Anthropic 5h / 7d official window cooldown** takes precedence over
  customer-defined temp-unsched rules.

### Scheduler outbox (v.7)

- Dedup window 1 s → 10 s, plus consumed-row cleanup with a 10 s grace
  and advisory lock.
- **Migration `153_scheduler_outbox_cleanup_index.sql`** ships the
  index required for the cleanup query.

### Channel monitor jitter (v.7)

- Per-monitor positive/negative jitter on the detection interval to
  desynchronise probe storms.
- Schema field `jitter_seconds` (form-side validation
  `interval - jitter ≥ 15 s`).
- **Migration `154_channel_monitor_jitter.sql`.**

### Billing — Doubao Embedding Vision (v.7)

- New fields `ImageInputPricePerToken` / `ImageInputTokens` carried
  through `ModelPricing`, `UsageTokens`, `OpenAIUsage`. Text and image
  token streams bill at their respective rates instead of collapsing
  to a single rate.

### Pricing — OpenRouter live catalogue (v.7)

- `OpenRouter catalog service` foundation + live wiring; official
  prices now sourced from OpenRouter where present.
- `model_price_overrides` ent schema + migration
  `152_model_price_overrides.sql` for admin overrides.
- API response exposes `slug`, `capabilities`, `context`; multi-provider
  verify drawer ships on the frontend.
- `SyncModels` populates `Repr.Tag` from the OpenRouter slug prefix
  (fix in v.10) so the *Best Provider* column shows the real provider.

### Concurrency helper consolidation (v.7)

- Five handlers had 27 lines of duplicated wait-queue accounting.
  Replaced with `ConcurrencyHelper.AcquireUserSlotWithWait` and a typed
  `*WaitQueueFullError`. Log key `openai.user_slot_acquire_failed`
  unified — operators previously alerting on the `_after_wait` suffix
  need to fold that into the single key.

### Phase-5 cleanup (v.12)

Six dead admin routes removed end-to-end (registration, handler, request
struct, tests): `rpm-status`, `batch-concurrency`, `dashboard backfill`,
`create-and-redeem`, two `refresh-tier` paths. Service-layer methods
`GetUserRPMStatus` / `BatchUpdateConcurrency` were kept (still satisfy
the `AdminService` interface) pending product confirmation.

### Test rot kill (v.15)

Eight `time.Sleep`-based backend tests were converted to either
`benbjohnson/clock` fake clocks or `require.Eventually` polling.
Representative win: `TestRenewLease` 1.95 s → 41 ms wall-clock.

### Service test surface +63 (v.17)

Tests are pinned to real regression classes, not coverage padding:

- `payment_order_service_test.go`
- `payment_refund_service_test.go`
- `payment_stats_service_test.go`
- `account_credentials_service_test.go`
- `antigravity_token_refresher_test.go`

Each covers idempotency, refund/cancel transitions, and the failure
modes that previously only surfaced in integration tests.

### Config hardening — opt-in (v.18)

`backend/internal/config/hardening.go` (new) introduces `HardeningConfig`
with four strict flags, **all defaulting to `false`** so an existing
deployment loads with identical semantics:

| Flag                          | Strict behaviour                              |
|-------------------------------|-----------------------------------------------|
| `CORS.RequireExplicitOrigins` | Reject `*` origin                             |
| `Server.RequireReleaseMode`   | Require gin release-mode in production        |
| `TOTP.RequireConfiguredKey`   | Refuse boot when TOTP secret is empty         |
| `OAuth.AutoDisableWhenSecret` | Auto-disable a provider with missing secrets  |

Plus:

- `JWT.PreviousSecret` for graceful signing-secret rotation
  (dual-secret window validated by config `Validate()`).
- `RedactedSummary` + `redactSecret` helpers — log-safe config dump.
- Bootstrap-secret lifecycle warnings.
- `backend/.gitignore` blocks `config.local.yaml`.
- **+13 unit tests** in `hardening_test.go`.

> Migration note (operators). To opt in to JWT rotation set
> `jwt.previous_secret` to the outgoing key, deploy with the new
> `jwt.secret`, drain in-flight tokens, then clear `previous_secret`
> on the next deploy. All four hardening flags remain off until the
> operator flips them — there is no implicit lock-down on upgrade.

---

## Frontend

### Re-shadcn migration completion (v.7 → v.10)

The QUENCH cold-steel skin is fully retired. Re-shadcn migration
finished across:

- `useTheme` composable centralises theme state (kills three
  hand-rolled toggles).
- Stone tokens (warm paper white) become the default light palette;
  Zinc retained for dark.
- `Select` "all-sentinel" contract enforced — no empty `value=""`
  primitives (no sentinel-patch layers in wrappers).
- QUENCH cold-steel tokens purged from shell components.
- `SectionRenderer` inset shadow replaced with shadcn elevation.
- `SettingsRegistryView` empty-state i18n key
  (`settingsRegistry.noSearchResults`) added.

### Pricing view rewrite (v.10)

`/admin/pricing` is now a compact provider-pill / model-list table
(Anthropic, OpenAI, Google, x-AI, DeepSeek, Qwen, Z-AI, MiniMax,
MoonshotAI). Columns: Input, Output, Cache Read, Context,
Best Provider. Search, sort, *Only-overridden* toggle and override
indicator inline.

> Migration note (operators). The route `/admin/pricing/matrix` was
> removed. Rate-multiplier editing now lives on `/admin/groups` (the
> natural attribute of a group). Bookmarks and any external links to
> the matrix view must be updated.

### Accounts pool migration phases 1 → 4 (v.10)

Legacy `AccountsView` (1735 LOC) deleted; spec files and the
`/admin/accounts/legacy` route removed.

> Migration note (operators). `/admin/accounts/legacy` no longer
> resolves. Any external link or bookmark must be updated to
> `/admin/accounts`.

New composables in production: `useAccountAutoRefresh` (autoRefresh +
ETag state machine, with `consecutiveFailures` cap-3 self-disable from
v.12) and `useColumnVisibility` (generic, persisted in localStorage).

### Store hardening (v.13 → v.16, v.19)

- **9 pinia zombie-leak fixes** (v.13): auth try/finally on logout +
  single-flight refresh, `adminSettings` window-listener ownership
  hoisted to `App.vue`, subscriptions `force=true` mutex, payment error
  refs, announcements `pendingNextTimeoutId` + 5xx back-off, `app.toast`
  setTimeout handle tracking.
- **`useFetchState<T>` foundation** (v.15): cache + back-off +
  single-flight in one composable.
- **`useAppLifecycle`** (v.15) consolidates `App.vue` bus subscriptions.
- **`src/lib/tokenRefresher.ts`** (v.15) — kills the auth-store /
  interceptor dual-flight refresh race.
- **`useFetchState` adoption** (v.16): payment + announcements stores
  migrated. Subscriptions stayed put pending v.19.
- **`useGenerationGuard` wrapping `useFetchState`** (v.19): the
  subscriptions store now defends against stale-commit races on rapid
  filter changes. Stale commits after `clear()` / logout still resolve
  the Promise (polling contract preserved) but cannot mutate state.

### ErrorState UX standardisation (v.16)

Shared `ErrorState` component (block / compact, three kinds, retry slot)
replaces silent failures and duplicated toast wiring across 13 consumer
views. `apiError` canonical extractor + i18n strings centralised.

### Silent-failure repair (v.12)

`UsageView` + `DashboardView` loaders (`loadLogs`, `loadStats`,
`loadModelStats`, `loadChartData`, `usersTrend`, `spendingRanking`) used
to swallow errors into `console.error` and present an empty chart as
real data. Now `AbortError` returns early, anything else routes to
`appStore.showError` with a per-loader `*Error` ref.

`SubscriptionsView` `localStorage` writes detect `DOMException`
`QuotaExceededError` (Firefox + Safari dual name/code 22) and emit a
distinct toast — quota-full vs. write-failed.

### Bundle bloat reduction (v.14)

Critical-path JS down ~135 KB (~12%):

- `@lobehub/icons` removed entirely (then lock-sync follow-up).
- `driver.js`, `marked`, `dompurify` moved to lazy chunks.
- `vite` `manualChunks` refined so the admin bundle no longer drags in
  user-only views.

### A11y waves (v.13, v.15, v.20)

- **Wave 1 (v.13)**: `BaseDialog` aria-label i18n + first-focus skip
  Close-X; `TableRow` keyboard activation for `PricingModelListView`
  and `OpsErrorLogTable`; `AccountCardWall` icon-only `Button`
  aria-label.
- **Wave 2 (v.15)**: explicit focus-trap on Dialog / Sheet;
  skip-to-content + `<main id="main-content">`; `ImageUpload` / Profile
  / Proxies alt fallbacks; OAuth + CreateAccount `id`/`for` label
  binding + `radiogroup` ARIA; copy / help icon-only buttons gain
  `aria-label`. `BaseDialog` switches from `dialog-close-btn` class to
  `data-dialog-close` attribute (used by the focus-trap query).
- **v.20 follow-up**: the first-focus query previously used
  `dataset.dialogClose === undefined`, which never matched because an
  empty attribute value is `""` not `undefined`. Switched to
  `hasAttribute()` so the body input — not the close-X — receives
  initial focus. Regression pinned by
  `frontend/src/__tests__/ui-portal.spec.ts`.

### SSR-safe hardening (v.19)

Twelve files audited for `window` / `document` / `localStorage` /
`navigator` access on the SSR boundary and on Safari private mode.
Quota errors now surface as i18n'd `appStore.showError` instead of
console-only logs. `OpsErrorDetailsModal` Enter-key wiring fixed —
search now fires immediately on the first Enter.

### i18n zero-divergence (v.17, v.20)

- v.17: 314 orphan keys removed; 5 missing EN translations added.
  EN / ZH parity becomes exact at 6595 keys.
- v.20: `frontend/src/i18n/__tests__/localeKeyParity.spec.ts` guards
  the parity — equal leaf counts, identical key sets.

### Misc frontend fixes worth calling out

- `ApiKeyGroupFilterOption` index signature so `<Select :options>` accepts
  it (v.7 CI red).
- `MetaMonitorFormDialog` jitter validation links to interval limit
  (v.7).
- `CreateAccountModal` `BaseDialog` `width="wide"` (was
  `max-width="max-w-3xl"`, never applied) — Gemini guide dialog now
  renders at intended width (v.11).
- `OpsErrorLogTable` CSS comment containing literal `<script>` was
  triggering vite/esbuild SFC parser mis-identification; reworded
  (v.10).
- Bedrock CC compat toggle now actually persists (frontend was sending
  a `map`, backend cast to `bool` and silently dropped) (v.7).
- `/admin/ops/system-logs/cleanup` 400 — the relative `time_range="1h"`
  is now expanded to absolute `start_time`/`end_time` before being
  sent (v.11).

---

## CI / CD and infrastructure (v.18)

All defaults preserved. Per-workflow changes:

- `backend-ci.yml` / `security-scan.yml`: `concurrency` block with
  `cancel-in-progress: true` keyed on ref.
- Per-job `timeout-minutes` on every job (10 / 15 / 30 depending on
  cost), so a hung job no longer ties up the runner pool.
- `release.yml`: SBOM generation step
  (`anchore/sbom-action@v0` or equivalent) on the release pipeline.
  Tag flow and pnpm 9 lock preserved.
- Env hoisting — repeated `GO_VERSION` / `PNPM_VERSION` literals
  collapsed into `env:` at the workflow scope.

`docs/observability.md` ships with 8 alert thresholds and 8 runbook
hooks. The doc is honest about the gap — both `/metrics` and tracing
are flagged "planned, not implemented" rather than wishful.

---

## Tests added across the range

| Layer    | Count | What it pins                                                                 |
|----------|-------|------------------------------------------------------------------------------|
| Backend  |  +63  | v.17 — payment_order, payment_refund, payment_stats, account_credentials, antigravity_token_refresher service tests |
| Backend  |  +13  | v.18 — `hardening_test.go` (helpers + four-flag validation matrix)           |
| Backend  |  +16  | v.9 — cyber_policy short-circuit, session-block lifecycle, ban-exclusion parser |
| Backend  |  +1   | v.20 — `TestAdminService_GetUserRPMStatus_NoN1Over100Groups` (perf guard)    |
| Frontend |  +5   | v.16 — `ErrorState` consumer tests                                           |
| Frontend |  +3   | v.19 — `useGenerationGuard` stale-commit cases                               |
| Frontend |  +1   | v.20 — `AccountStatsModal` ErrorState integration                            |
| Frontend |  +1   | v.20 — `ui-portal.spec.ts` (BaseDialog first-focus regression)               |
| Frontend |  +1   | v.20 — `localeKeyParity.spec.ts` (EN/ZH key parity guard)                    |

Pre-v.7 sleep-based test refactor (v.15) is not counted as new cases
but materially reduced backend test wall-clock and flake rate.

---

## Migrations introduced

| File                                                | Origin   |
|-----------------------------------------------------|----------|
| `152_model_price_overrides.sql`                     | v.7      |
| `153_scheduler_outbox_cleanup_index.sql`            | v.7      |
| `154_channel_monitor_jitter.sql`                    | v.7      |

All are forward-only and idempotent. Apply in numeric order.

---

## Operator migration notes

Aggregated from the per-tag annotations so an operator stepping from
`v0.2.0-subme.6` (or earlier) to `v0.2.0-subme.20` has a single list.

1. **Routes removed.**
   - `/admin/accounts/legacy` (v.10) — point bookmarks at `/admin/accounts`.
   - `/admin/pricing/matrix` (v.10) — rate-multiplier editing lives on
     `/admin/groups`.
   - Six dead admin endpoints (v.12): `rpm-status`,
     `batch-concurrency`, dashboard backfill, `create-and-redeem`, two
     `refresh-tier` paths.
2. **Behaviour change.**
   - cyber_policy-Blocked OpenAI traffic is no longer billed
     (v.9). Filter on `request_type=cyber` if you need it in reports.
3. **Log-key fold.**
   - `openai.user_slot_acquire_failed_after_wait` was folded into
     `openai.user_slot_acquire_failed` (v.7). Alert rules using the
     `_after_wait` suffix need to retarget the single key.
4. **Schema.**
   - Apply migrations `152 → 154` in order.
5. **Lockfile.**
   - `pnpm install` is required to pick up the `form-data >= 4.0.6`
     override that fixes GHSA-hmw2-7cc7-3qxx (v.7).
6. **Opt-in hardening.**
   - The four `HardeningConfig` flags (v.18) are all off by default.
     Flip per environment when ready. CORS strict will reject `*` —
     verify your trusted origin list is exhaustive first.
7. **JWT rotation.**
   - To rotate, populate `jwt.previous_secret` with the outgoing key,
     deploy with the new `jwt.secret`, wait for the longest token TTL
     (default 24 h), then clear `previous_secret` on the next deploy.
8. **systemd unit file.**
   - Filename intentionally not renamed during the Sub2API → Subme
     rebrand (v.8). Existing `systemctl` links keep working without
     manual fix-up.

There are **no SemVer-breaking API changes** between v.7 and v.20.
Everything above is admin-surface or operator-visible rather than
client-API breaking.

---

## How this document was assembled

1. `git log --oneline v0.2.0-subme.6..HEAD` — full commit set.
2. `git tag -l 'v0.2.0-subme.*' -n200` — annotated per-tag changelog
   text (authoritative; the brief CHANGELOG.md root entries are a
   distillation).
3. Each subsystem section cross-checks the tag note against the actual
   touched files in `git show --stat <commit>`.
4. Marketing language was deliberately avoided — every bullet maps to
   a verifiable commit or test.
