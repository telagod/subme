# Observability

Operator-focused reference for monitoring, logging, and incident response on
sub2api. Scope is limited to what the service exposes **today**. Items marked
`(planned)` are surfaces called out for a future change — they do not exist in
the current binary and operators should not depend on them.

---

## 1. Endpoints

### 1.1 Liveness — `GET /health`

- Registered in `backend/internal/server/routes/common.go`.
- Returns `200 OK` with `{"status":"ok"}` as long as the HTTP server is
  accepting connections.
- **Semantics: liveness only.** It does **not** probe Postgres, Redis, the
  scheduler, or upstream providers. A `200` means "the process is up and the
  router is serving" — nothing more.
- Excluded from the access-log middleware (`server/middleware/logger.go`) to
  avoid log spam from frequent probes.
- Use as a Kubernetes `livenessProbe` or load-balancer health check.

### 1.2 Setup probe — `GET /setup/status`

- Returns `{"needs_setup": false, "step": "completed"}` in normal mode.
- Used by the frontend to detect post-setup restarts; safe for unauthenticated
  polling but **not** a substitute for `/health`.

### 1.3 Admin health surfaces (authenticated)

These require an admin session and are intended for the admin UI / on-call
inspection, not for automated probes.

| Endpoint | Source | What it reports |
| --- | --- | --- |
| `GET /api/v1/admin/ops/system-logs/health` | `handler/admin/ops_system_log_handler.go::GetSystemLogIngestionHealth` | Status of the system-log ingestion sink (queue depth, drop counters). Returns `503` if the ops service is disabled. |
| `GET /api/v1/admin/data-management/agent/health` | `handler/admin/data_management_handler.go::GetAgentHealth` | Data-management agent reachability over its unix socket. Currently reports `Enabled=false` in this build — treat absence as "agent feature deprecated", not as an outage. |

### 1.4 Metrics — `(planned, not implemented)`

There is **no `/metrics` endpoint** today. The `go.opentelemetry.io/*` packages
that appear in `backend/go.mod` are pulled in as indirect dependencies and are
**not wired** to any exporter or instrumentation. Until a real wiring lands:

- Do not configure Prometheus scrape jobs against the service.
- Treat the OTel packages as inert; do not derive monitoring strategy from
  their presence.
- If a metrics endpoint is needed, the wiring point is `server/routes/common.go`
  and the natural exporter is `prometheus/client_golang` or an OTLP HTTP
  exporter — operator-side dashboards should remain log-derived until then.

### 1.5 Tracing — `(planned, not implemented)`

No tracer provider is initialised. The logger does **not** carry a `trace_id`
field; every request currently correlates via `request_id` (server-generated)
and `client_request_id` (echoed in the `X-Client-Request-ID` response header).
See §3.

---

## 2. Dashboards & key signals

Until a metrics endpoint exists, dashboards are log-derived (any pipeline that
ships the structured JSON logs into Loki / Elastic / ClickHouse will do). The
panels below describe what to compute from log fields.

| Panel | Source field(s) | What healthy looks like |
| --- | --- | --- |
| Request rate | `msg="request access"` count by `route` | Stable; sudden drop to zero on a hot route = upstream or LB issue. |
| HTTP error rate | `status >= 500` count / total | < 1% sustained over 5 min. |
| Gateway latency (p95) | `duration_ms` on gateway routes | Provider-dependent; alert at §4 thresholds. |
| Account exhaustion | `level=warn` + `component=scheduler` + `msg` containing `no available account` | Should be zero outside maintenance. |
| Token-refresh failures | `level=error` + `component=auth` + `msg=token refresh failed` | Spikes correlate with upstream auth outages. |
| System-log sink drops | `/api/v1/admin/ops/system-logs/health` response | `dropped` counter monotonically zero. |
| DB / Redis errors | `level=error` and `component` in `{db, redis, repository}` | Zero. Any sustained error here is a P1. |

Recommended grouping keys for any panel: `route`, `status`, `component`,
`platform`, `model`.

---

## 3. Log layout and correlation

### 3.1 Structure

Defined in `backend/internal/pkg/logger/logger.go` and configured under the
`log:` block in `deploy/config.example.yaml`.

- **Format**: `json` (recommended for production) or `console` (default in the
  example config — switch to `json` before shipping to any aggregator).
- **Levels**: `debug` / `info` / `warn` / `error`. Settable at runtime via
  `logger.SetLevel`.
- **Always-on fields**: `time`, `level`, `msg`, `service`, `env`, `caller`.
  `caller` can be disabled via `log.caller: false`.
- **Stacktraces**: emitted at `>= log.stacktrace_level` (default `error`).
- **Sampling**: off by default. Enable `log.sampling.enabled: true` only after
  validating a high-frequency repeated-message problem; sampling drops detail
  needed for incident review.

### 3.2 Outputs

Both sinks can be enabled simultaneously:

- `log.output.to_stdout`: keep `true` for container log collection.
- `log.output.to_file`: lumberjack-backed rotation. Defaults:
  `{DATA_DIR}/logs/sub2api.log` or `/app/data/logs/sub2api.log`. Rotation
  knobs: `max_size_mb` (100), `max_backups` (10), `max_age_days` (7),
  `compress` (true).

### 3.3 Correlation IDs

Every request carries two IDs (see `server/middleware/request_logger.go` and
`server/middleware/client_request_id.go`):

| Field | Source | Visible to client | Use |
| --- | --- | --- | --- |
| `request_id` | Server-generated UUID per request | No | Internal cross-component join. |
| `client_request_id` | `X-Client-Request-ID` header (echoed) or server-generated when absent | Yes (response header) | Pivot when a user reports an error — ask them for this ID. |

Both IDs are attached to the request-scoped `*zap.Logger` and propagate via
`context.Context` (`logger.FromContext`). Any structured log emitted inside a
request handler inherits them automatically.

**No `trace_id` field exists yet.** When OTel wiring lands, the integration
point is `server/middleware/request_logger.go` — extract the active span
context and add `trace_id` / `span_id` fields there.

### 3.4 Sink interface (system-log ingestion)

`logger.SetSink` lets the ops subsystem mirror log events into the admin-facing
`system_log` store, independently of the configured log level (see
`logger.WriteSinkEvent`). Operators do not need to wire this manually — the
ops service installs it on boot when monitoring is enabled. Its health is
reported by `GET /api/v1/admin/ops/system-logs/health`.

---

## 4. Alert thresholds

These are starting values. Tune per deployment after one week of baseline.

| Alert | Condition | Severity | First action |
| --- | --- | --- | --- |
| Service down | `/health` non-200 for 3 consecutive probes (30 s) | P1 | §5.1 |
| HTTP 5xx rate | `rate(status >= 500) / rate(total) > 5%` for 5 min | P2 | §5.2 |
| Gateway latency | `p95(duration_ms) > 60_000` for 5 min on `/v1/messages` or `/v1/chat/completions` | P2 | §5.3 |
| Token-refresh failures | `> 10` errors in 5 min from `component=auth` | P3 | §5.4 |
| Account exhaustion | Any `no available account` warn from `component=scheduler` | P3 | §5.5 |
| System-log sink drops | `dropped > 0` on the ops health endpoint | P3 | §5.6 |
| DB connection failure | `> 5` errors in 1 min from `component in {db, repository}` | P1 | §5.7 |
| Disk pressure (log volume) | `>80%` on the volume hosting `log.output.file_path` | P2 | §5.8 |

Pager routing should be by `service=sub2api` + `env` from the log fields.

---

## 5. On-call runbook hooks

Concise pointers; expand per-deployment as you accumulate incidents.

### 5.1 `/health` failing

1. Confirm the process is up (`systemctl status sub2api` or `docker ps`).
2. If up but unreachable: check listen port, reverse proxy, firewall.
3. If process is restart-looping: tail the file log (default
   `{DATA_DIR}/logs/sub2api.log`) for fatal stacktraces. Common causes:
   bad config, DB unreachable at boot, port already in use.

### 5.2 Elevated 5xx

1. Group logs by `route` and `component` for `level>=error` in the last 15 min.
2. If concentrated on gateway routes: §5.3.
3. If concentrated on DB-touching routes: §5.7.
4. Otherwise pivot on a single `client_request_id` from a failed request and
   trace the full path.

### 5.3 Gateway latency / timeouts

1. Identify the affected `platform` and `model` from `msg="request access"`
   logs filtered by `duration_ms`.
2. Check provider-side status (upstream incident) before touching config.
3. If upstream is healthy, inspect `scheduler` component logs for retry
   amplification or account starvation (§5.5).

### 5.4 Token-refresh failures

1. Group by `account_id` / `provider`. Single-account = credential rotated
   upstream; many accounts = upstream auth outage.
2. For single-account: rotate the credential via admin UI.
3. For mass failure: throttle scheduler via config to avoid retry storms.

### 5.5 Account exhaustion

1. Check admin UI → accounts: how many are `disabled` / `rate_limited` /
   `quota_exhausted`.
2. If a few: re-enable or rotate.
3. If most: upstream-wide quota or auth incident — coordinate with §5.4.

### 5.6 System-log sink drops

1. Sink is bounded; drops mean ingestion is slower than emission.
2. Check the admin ops UI for backlog depth and disk pressure on the log DB.
3. Short-term: raise `log.level` to `warn` to cut volume. Long-term: scale the
   sink store.

### 5.7 DB / Redis failures

1. Confirm reachability from the app host (`pg_isready`, `redis-cli ping`).
2. Check connection-pool exhaustion vs. server outage in the error message.
3. If pool exhausted: a slow query is blocking — capture the offending
   statement via the DB's slow-query log and kill it before restarting the app.

### 5.8 Log disk pressure

1. Verify `log.rotation.*` is configured (defaults: 100 MB × 10 backups,
   7 days, compressed).
2. If rotation is on but disk is full: a non-sub2api process is eating disk,
   or backups are not being shipped off-box.
3. Temporary relief: drop `log.output.to_file: false` and rely on stdout +
   container log collection.

---

## 6. Frontend error reporting

The axios client (`frontend/src/api/client.ts`) centralises error handling
(token refresh, `OPS_DISABLED` detection, network errors) but **does not**
ship errors to an external tracker (Sentry, etc.). Errors land in the browser
console only. If adopting a tracker later:

- The interceptor block is the single integration point.
- Honour the existing API error schema (response payload `{ code, message }`)
  before normalising into the tracker's event shape.
- Do not log full request bodies — they may contain prompts or PII.

---

## 7. What this doc deliberately does not cover

- Marketing-style architecture overview — see `DEV_GUIDE.md`.
- Payment integration runbooks — see `docs/PAYMENT.md` and
  `docs/ADMIN_PAYMENT_INTEGRATION_API.md`.
- Tracing implementation details — none exist yet; this doc will be updated
  when OTel wiring lands.
