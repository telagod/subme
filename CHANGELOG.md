# Changelog

All notable changes to this fork are tracked here. This file follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) spirit
(pre-1.0 with a `subme.N` patch counter on top of `0.2.0`).

Versions earlier than `v0.2.0-subme.7` predate this changelog; consult
`git log v0.2.0-subme.6..` for the full historical record.

## [Unreleased] — v0.2.0-subme.20

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
