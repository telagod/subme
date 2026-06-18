# Changelog

All notable changes to this fork are tracked here. This file follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) spirit
(pre-1.0 with a `subme.N` patch counter on top of `0.2.0`).

Versions earlier than `v0.2.0-subme.7` predate this changelog; consult
`git log v0.2.0-subme.6..` for the full historical record.

## [v0.2.0-subme.23] — 2026-06-18

Closing entry of the Vue era. Cleans up UI regressions accumulated since
the v.5 → v.20 reshadcn migration, publishes the Svelte 5 rewrite
construction blueprint, and removes 9 orphan components. After this tag,
new work moves to `feat/svelte-rewrite` per `docs/SVELTE_REWRITE_PLAN.md`.

### Added

- `docs/SVELTE_REWRITE_PLAN.md` (force-added past `docs/*` gitignore): ~370-line
  Svelte 5 rewrite construction blueprint — stack typing (Svelte 5 runes +
  SvelteKit 2 + adapter-static + shadcn-svelte/bits-ui), 5-category
  preservation set (OpenRouter pricing / orders+billing / plans+subscriptions
  / settings-registry / v22 AppShell+nav), Go dual-SPA embed strategy
  (build tag `frontend_svelte`), 5 hard-gate POCs (~10 days), 4-phase
  ~49-day roadmap, 8 enforcement rules ("aesthetic charter").
- `frontend/src/views/admin/settings-registry/special/SmtpSection.vue` —
  SMTP fields + Test Connection button calling
  `adminAPI.settings.testSmtpConnection()`.
- `frontend/src/views/admin/settings-registry/special/TestEmailSection.vue` —
  recipient input + Send button calling `adminAPI.settings.sendTestEmail()`.

### Fixed

- `AccountsPoolView`: filter values aligned to backend enum (`api_key`→`apikey`,
  `setup_token`→`setup-token`, added bedrock); `privacy_mode` boolean →
  4-option select (`__unset__` / `training_off` / `training_set_cf_blocked` /
  `training_set_failed`); added `temp_unschedulable` / `unschedulable` status
  options; export honors multi-select when non-empty; replaced inline
  prev/next with `<Pagination>` component.
- `AdminOrdersView`: dropped inline `<Dialog>` block, now renders
  `<AdminOrderDetail>` child component (props-driven
  `show/order/@close/@cancel/@retry/@refund`); removed unused
  Dialog/Separator/ScrollArea/formatOrderDateTime imports and inline
  audit-log fetch.
- `HomeView`: added background decorations (grid + 2 blur orbs), user-initial
  avatar pill in authenticated nav, Feature Tags pills row
  (subscription→API / sticky session / realtime billing).
- `SettingsRegistry`: SMTP section now async-loads dedicated component
  (`SmtpSection.vue` via `defineAsyncComponent`); added `testEmail` section;
  extracted `api_key_acl_trust_forwarded_ip` to its own `security.apiKeyAcl`
  section with `admin.settings.apiKeyAcl.*` i18n keys.
- `useAccountPoolActions`: export action accepts optional `ids?: number[]`
  for filtered-export; replaced hardcoded toast strings with i18n keys
  `admin.accountsQuench.{exportSuccess,exportError}`.

### Removed

- 9 orphan components with zero references repo-wide:
  `account/QuotaBadge.vue`, `account/CapacityBadge.vue`,
  `admin/account/{AccountBulkActionsBar,AccountTableActions,AccountTableFilters}.vue`,
  `common/{Skeleton,StatusBadge,TextArea}.vue`,
  `user/profile/ProfileAccountBindingsCard.vue`.

### i18n

- Added `home.tags.{subscriptionToApi, stickySession, realtimeBilling}` and
  `admin.accountsQuench.{statusTempUnschedulable, statusUnschedulable,
  exportSuccess, exportError}` (en + zh, parity test green).

Verified: vue-tsc clean, vite build 15.72s, single eager vendor chunk
preserved (477K raw / 157K gzip), 7 lazy islands intact
(xlsx / chart / i18n / markdown / airwallex / driver / stripe).

## [v0.2.0-subme.22] — 2026-06-18

See `c0875399`: user-side re-shadcn AppShell (`Quench*` → `App*` rename,
props-driven, no admin coupling); `nav.ts` split into adminNavGroups +
buildUserNavGroups with featureFlag + hideInSimpleMode contract; new
`shell/useNavFiltered` composable shared by admin/user; admin↔user
view-switch in AppTopbar avatar dropdown; piggyback fixes for
`/admin/subscriptions` filter-prefix triple-mismatch, admin own-user-view
access, and `SettingsRegistryView` O(n)→O(1) dirty-tracking.

## [v0.2.0-subme.21] — 2026-06-18

See `6ca8d04e`: collapse eager vendor chunks (TDZ circular dep white-screen
fix; single eager `vendor` chunk + 7 lazy islands — memory
`vendor-chunk-tdz-trap`).
See `61f4748a`: backend `gofmt -s` + unused symbol cleanup; frontend
eslint cleanup (no rules disabled).
See `5e0b73a9`: post-detach docs tidy + `docs/UPSTREAM_WATCH.md` as the
single fact source for upstream-watch workflow (checkpoint `4a5665da` @
2026-06-18, memory `upstream-watch-checkpoint`).

## [v0.2.0-subme.20] — 2026-06-17

### Fixed

- Backend: drop the `TestGetAccountsLoadBatch` skip in
  `concurrency_cache_integration_test.go` — the test now passes against the
  real Redis testcontainer (TTL-based score math was already correct).
- Frontend a11y: `BaseDialog` first-focus logic skipped close-X via
  `dataset.dialogClose === undefined`, which never matched because empty
  attribute values resolve to `""`. Switched to `hasAttribute()` so the body
  input — not the close-X button — actually receives initial focus.

### Added (regression tests)

- `frontend/src/__tests__/ui-portal.spec.ts` — focus-trap regression test for
  `BaseDialog`: asserts initial focus lands on body content, not close-X.
- `frontend/src/components/account/__tests__/AccountStatsModal.spec.ts` —
  integration test: when `adminAPI.accounts.getStats` rejects, `ErrorState`
  renders with a retry button that re-invokes the loader.
- `frontend/src/i18n/__tests__/localeKeyParity.spec.ts` — guards the v17
  EN/ZH zero-divergence work: equal leaf counts and identical key sets.
- `backend/internal/service/admin_service_rpm_status_test.go` —
  `TestAdminService_GetUserRPMStatus_NoN1Over100Groups`: enforces O(1) batch
  primitives (no per-group queries, 100 groups under 1s).

### Changed (technical-debt sweep)

- Replaced silent `nil` returns in `AccountService.TestCredentials` with
  `ErrCredentialProbeNotImplemented` (fail-closed) until per-platform
  credential probes ship.
- `RedeemService.GetStats` now backed by `RedeemCodeRepository.AggregateStats`
  (constant-round-trip SQL `COUNT/SUM/GROUP BY`); `AdminRedeemHandler.GetStats`
  returns real numbers instead of hard-coded zeros.
- `ProxyService.TestConnection` now performs a TCP-layer dial probe (3-second
  budget) instead of returning `nil` regardless of reachability.
- Documented deferral rationale on `ContentModerationService.enforceAccountBan`
  admin path and `adminServiceImpl.RefreshAccountCredentials` stub.
- Fork relationship: upstream edge formally detached 2026-06-18 at upstream HEAD
  `4a5665da`. Future upstream-watch workflow + 108-commit historical snapshot
  recorded in `docs/UPSTREAM_WATCH.md` (force-add required — `docs/*` is gitignored).

### Docs

- `README.md`: bumped Go badge (1.25.7 → 1.26.4) and Prerequisites (Go 1.21+ →
  Go 1.26+); added an Operations and Monitoring section linking
  `docs/observability.md`; added an explicit `go generate ./ent && go generate
  ./cmd/server` step to Build from Source so first-time contributors don't hit
  ent/wire `undefined:` errors.

## [v0.2.0-subme.19] — 2026-06-17

### Fixed

- Frontend: SSR-safe guards on `window` / `localStorage` access; defensive
  Enter-key search wiring on `OpsErrorDetailsModal`.
- Subscriptions store now wraps `useGenerationGuard`, defending against
  stale-commit races on rapid filter changes.

## [v0.2.0-subme.18] — 2026-06-15

### Added

- Backend: additive config hardening — opt-in strict flags + JWT signing-key
  rotation primitive.

### Changed

- CI: workflow concurrency, per-job timeouts, SBOM generation, env hoisting;
  release-tag flow preserved.

## [v0.2.0-subme.17] — 2026-06-13

### Removed

- i18n: cleaned 314 orphan keys across `en.ts` / `zh.ts`; divergence reduced
  to zero (final: 6595 keys each).

### Added

- Backend tests: 63 service-layer cases covering five high-value regression
  surfaces.

## [v0.2.0-subme.16] — 2026-06-11

### Changed

- Frontend: stores migrated to `useFetchState`; `ErrorState` UX standardized
  across views.

## [v0.2.0-subme.15] — 2026-06-09

### Changed

- Frontend a11y wave 2 — broader focus / keyboard fixes.
- Three foundation composables extracted from store call-sites for reuse.

### Fixed

- Backend tests: removed eight `time.Sleep`-based flakes; replaced with fake
  clock + `require.Eventually`.

## [v0.2.0-subme.14] — 2026-06-07

### Performance

- Frontend: critical-path bundle reduced ~135 KB (~12%) via lazy deps + better
  `manualChunks` grouping.
- Backend: eliminated eight N+1 hotspots using batch primitives (groups,
  user-group rates, account concurrency).

### Fixed

- pnpm-lock synced after `@lobehub/icons` removal.

## [v0.2.0-subme.13] — 2026-06-05

### Fixed

- Frontend: nine pinia store zombie-leak fixes; five critical a11y holes
  (focus trap, ARIA labelling, escape handling).

## [v0.2.0-subme.12] — 2026-06-04

### Removed

- Six dead backend routes dropped (phase-5 cleanup).

### Fixed

- Three console-error consistency fixes.
- Four dogfooding issues: dead APIs, silent loader failures, localStorage
  quota handling, auto-refresh stall.

### Docs

- Sweep: rebrand stragglers, stale references.

## [v0.2.0-subme.11] — 2026-06-02

### Fixed

- Three console issues caught during v.10 dogfooding.

## [v0.2.0-subme.10] — 2026-06-01

### Added

- Accounts pool: phase-1 through phase-4 — bulk-edit + scheduled-tests inline,
  compact summary strip, dataflow hardening, single-row toolbar, filtered
  bulk operations, four new columns, additional filters, proxy fallback
  support. Legacy `AccountsView` deleted; migration complete.

### Changed

- Frontend: paygo pricing view rewritten as a compact model list (matrix
  dropped).
- Catalog: `Repr.Tag` populated from OpenRouter slug prefix during
  `SyncModels`.

### Fixed

- Replaced `/admin/accounts/legacy` router push with inline
  `CreateAccountModal`.
- Rephrased CSS comment containing `<script>` in `OpsErrorLogTable` to
  avoid HTML parsing edge cases.

## [v0.2.0-subme.9] — 2026-05-29

### Added

- OpenAI: cyber_policy phase-2 — token-aware usage accounting, session-block
  enforcement, ban-exclusion list.

## [v0.2.0-subme.8] — 2026-05-28

### Added

- Bedrock: extended supported beta-tokens whitelist
  (`context-management`, `fine-grained-tool-streaming`).
- Settings: Claude OAuth mimic system-prompt injection is now admin-
  configurable.
- Usage analytics: auto-fill `reasoning_effort=high` for thinking-enabled
  passback models.
- OpenAI: cyber_policy phase-1 — detection, passthrough, ops logging.

### Docs

- Rebrand sweep: Sub2API → Subme across runtime, deploy, docs (low-risk
  pass).

## [v0.2.0-subme.7] — 2026-05-26

### Changed

- Release branding: goreleaser title renamed Sub2API → Subme.

[Unreleased]: https://github.com/telagod/subme/compare/v0.2.0-subme.19...HEAD
[v0.2.0-subme.19]: https://github.com/telagod/subme/compare/v0.2.0-subme.18...v0.2.0-subme.19
[v0.2.0-subme.18]: https://github.com/telagod/subme/compare/v0.2.0-subme.17...v0.2.0-subme.18
[v0.2.0-subme.17]: https://github.com/telagod/subme/compare/v0.2.0-subme.16...v0.2.0-subme.17
[v0.2.0-subme.16]: https://github.com/telagod/subme/compare/v0.2.0-subme.15...v0.2.0-subme.16
[v0.2.0-subme.15]: https://github.com/telagod/subme/compare/v0.2.0-subme.14...v0.2.0-subme.15
[v0.2.0-subme.14]: https://github.com/telagod/subme/compare/v0.2.0-subme.13...v0.2.0-subme.14
[v0.2.0-subme.13]: https://github.com/telagod/subme/compare/v0.2.0-subme.12...v0.2.0-subme.13
[v0.2.0-subme.12]: https://github.com/telagod/subme/compare/v0.2.0-subme.11...v0.2.0-subme.12
[v0.2.0-subme.11]: https://github.com/telagod/subme/compare/v0.2.0-subme.10...v0.2.0-subme.11
[v0.2.0-subme.10]: https://github.com/telagod/subme/compare/v0.2.0-subme.9...v0.2.0-subme.10
[v0.2.0-subme.9]: https://github.com/telagod/subme/compare/v0.2.0-subme.8...v0.2.0-subme.9
[v0.2.0-subme.8]: https://github.com/telagod/subme/compare/v0.2.0-subme.7...v0.2.0-subme.8
[v0.2.0-subme.7]: https://github.com/telagod/subme/compare/v0.2.0-subme.6...v0.2.0-subme.7
