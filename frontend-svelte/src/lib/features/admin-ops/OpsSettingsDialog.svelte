<script lang="ts" module>
	/**
	 * Severity sentinel — the backend stores an empty string for "all severities".
	 * NativeSelect forbids empty values, so the UI binds a non-empty sentinel and
	 * maps it back to '' on save (and from '' on load).
	 */
	export const SEVERITY_ALL = '__all__';

	export const SEVERITY_OPTIONS: { value: string; labelKey: string; labelDefault: string }[] = [
		{ value: SEVERITY_ALL, labelKey: 'minSeverityAll', labelDefault: 'All severities' },
		{ value: 'critical', labelKey: 'severityCritical', labelDefault: 'Critical' },
		{ value: 'warning', labelKey: 'severityWarning', labelDefault: 'Warning' },
		{ value: 'info', labelKey: 'severityInfo', labelDefault: 'Info' }
	];

	/** Auto-refresh interval choices (seconds), mirroring the Vue source. */
	export const REFRESH_INTERVALS = [15, 30, 60] as const;

	/** Section identifiers for the tabbed/sectioned layout. */
	export type OpsSettingsSection = 'email' | 'runtime' | 'advanced' | 'thresholds';

	export const OPS_SETTINGS_SECTIONS: {
		id: OpsSettingsSection;
		labelKey: string;
		labelDefault: string;
	}[] = [
		{ id: 'email', labelKey: 'sectionEmail', labelDefault: 'Email' },
		{ id: 'runtime', labelKey: 'sectionRuntime', labelDefault: 'Runtime alert' },
		{ id: 'advanced', labelKey: 'sectionAdvanced', labelDefault: 'Advanced' },
		{ id: 'thresholds', labelKey: 'sectionThresholds', labelDefault: 'Thresholds' }
	];

	/** Default metric thresholds (used when the backend returns none). */
	export const DEFAULT_METRIC_THRESHOLDS = {
		sla_percent_min: 99.5,
		ttft_p99_ms_max: 500,
		request_error_rate_percent_max: 5,
		upstream_error_rate_percent_max: 5
	} as const;

	/** Ignore-* toggles in Section C (advanced), in display order. */
	export const IGNORE_FLAGS = [
		'ignore_count_tokens_errors',
		'ignore_context_canceled',
		'ignore_no_available_accounts',
		'ignore_invalid_api_key_errors',
		'ignore_insufficient_balance_errors'
	] as const;

	export function isValidEmailAddress(email: string): boolean {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	/** Backend stores OpenAI quota auto-pause as a 0..1 fraction; UI shows 0..100 %. */
	export function fractionToPercent(v: number | null | undefined): number | null {
		return v != null && v > 0 ? Math.round(v * 1000) / 10 : null;
	}
	export function percentToFraction(v: number | null | undefined): number {
		return v != null && v > 0 ? v / 100 : 0;
	}
</script>

<script lang="ts">
	/**
	 * OpsSettingsDialog · the ops dashboard's 4-section settings editor.
	 *
	 * Vue parity:
	 *   frontend/src/views/admin/ops/components/OpsSettingsDialog.vue (@05c44218)
	 *   (+ OpsEmailNotificationCard.vue / OpsRuntimeSettingsCard.vue inlined here).
	 *
	 * Behaviour:
	 *   - On open, Promise.all loads runtime alert settings, email notification
	 *     config, advanced settings and metric thresholds.
	 *   - One save submits every changed section (Promise.all of the four
	 *     update endpoints), then fires onSaved().
	 *
	 * Hard rules honoured:
	 *   - Zinc-only palette; no raw hex — colours via design tokens / amber utility
	 *     classes already used across the admin-ops feature.
	 *   - <NativeSelect> never receives an empty value: the severity select binds
	 *     the explicit __all__ sentinel and maps it to '' only at the API boundary.
	 *   - lib/ui primitives only (StandardDialog, Input, NativeSelect, Checkbox,
	 *     Button, Alert, Badge) — no hand-rolled dialog/select.
	 *   - i18n via $_(key, { default }) — no locale file edits.
	 *   - No chart in this dialog → no chart.js import at all (no TDZ trap).
	 */
	import { _ } from 'svelte-i18n';
	import {
		getOpsAlertRuntimeSettings,
		updateOpsAlertRuntimeSettings,
		getOpsEmailNotificationConfig,
		updateOpsEmailNotificationConfig,
		getOpsAdvancedSettings,
		updateOpsAdvancedSettings,
		getOpsMetricThresholds,
		updateOpsMetricThresholds,
		type OpsAlertRuntimeSettings,
		type EmailNotificationConfig,
		type OpsAdvancedSettings,
		type OpsMetricThresholds
	} from '$lib/api/admin/ops';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		onClose: () => void;
		onSaved: () => void;
	};

	let { open = $bindable(false), onClose, onSaved }: Props = $props();

	// ── loaded section state (null until first load resolves) ────────────────
	let runtime = $state<OpsAlertRuntimeSettings | null>(null);
	let email = $state<EmailNotificationConfig | null>(null);
	let advanced = $state<OpsAdvancedSettings | null>(null);
	let thresholds = $state<OpsMetricThresholds>({ ...DEFAULT_METRIC_THRESHOLDS });

	// severity sentinel mirror (kept in sync with email.alert.min_severity).
	let alertMinSeverity = $state<string>(SEVERITY_ALL);

	let activeSection = $state<OpsSettingsSection>('email');
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state('');

	// recipient text inputs (transient — not persisted directly).
	let alertRecipientInput = $state('');
	let reportRecipientInput = $state('');

	// Snapshot of the open identity so re-opening re-loads exactly once.
	let loadedFor = $state<boolean>(false);

	const loaded = $derived(runtime != null && email != null && advanced != null);

	function severityFromApi(raw: string | null | undefined): string {
		return raw && raw.trim() ? raw : SEVERITY_ALL;
	}
	function severityToApi(sentinel: string): string {
		return sentinel === SEVERITY_ALL ? '' : sentinel;
	}

	async function loadAll() {
		loading = true;
		loadError = '';
		try {
			const [r, e, a, t] = await Promise.all([
				getOpsAlertRuntimeSettings(),
				getOpsEmailNotificationConfig(),
				getOpsAdvancedSettings(),
				getOpsMetricThresholds()
			]);
			// Compatibility: older payloads may omit nested objects — backfill so
			// the form can always bind.
			if (a && !a.openai_account_quota_auto_pause) {
				a.openai_account_quota_auto_pause = { default_threshold_5h: 0, default_threshold_7d: 0 };
			}
			runtime = r;
			email = e;
			advanced = a;
			alertMinSeverity = severityFromApi(e?.alert?.min_severity);
			thresholds =
				t && Object.keys(t).length > 0
					? {
							sla_percent_min: t.sla_percent_min ?? DEFAULT_METRIC_THRESHOLDS.sla_percent_min,
							ttft_p99_ms_max: t.ttft_p99_ms_max ?? DEFAULT_METRIC_THRESHOLDS.ttft_p99_ms_max,
							request_error_rate_percent_max:
								t.request_error_rate_percent_max ??
								DEFAULT_METRIC_THRESHOLDS.request_error_rate_percent_max,
							upstream_error_rate_percent_max:
								t.upstream_error_rate_percent_max ??
								DEFAULT_METRIC_THRESHOLDS.upstream_error_rate_percent_max
						}
					: { ...DEFAULT_METRIC_THRESHOLDS };
		} catch (err) {
			loadError =
				(err as Error)?.message ??
				$_('admin.ops.settings.loadFailed', { default: 'Failed to load settings.' });
			showError(loadError);
		} finally {
			loading = false;
		}
	}

	// Load once per open transition.
	$effect(() => {
		if (open && !loadedFor) {
			loadedFor = true;
			activeSection = 'email';
			loadAll();
		}
		if (!open) {
			loadedFor = false;
		}
	});

	// ── OpenAI quota auto-pause percent <-> fraction bridges ──────────────────
	const quota5hPercent = $derived(
		fractionToPercent(advanced?.openai_account_quota_auto_pause?.default_threshold_5h)
	);
	const quota7dPercent = $derived(
		fractionToPercent(advanced?.openai_account_quota_auto_pause?.default_threshold_7d)
	);
	function setQuota5h(v: number | null) {
		if (advanced?.openai_account_quota_auto_pause)
			advanced.openai_account_quota_auto_pause.default_threshold_5h = percentToFraction(v);
	}
	function setQuota7d(v: number | null) {
		if (advanced?.openai_account_quota_auto_pause)
			advanced.openai_account_quota_auto_pause.default_threshold_7d = percentToFraction(v);
	}

	// ── recipients ────────────────────────────────────────────────────────────
	function addRecipient(target: 'alert' | 'report') {
		if (!email) return;
		const raw = (target === 'alert' ? alertRecipientInput : reportRecipientInput).trim();
		if (!raw) return;
		if (!isValidEmailAddress(raw)) {
			showError($_('common.invalidEmail', { default: 'Invalid email address.' }));
			return;
		}
		const normalized = raw.toLowerCase();
		const list = target === 'alert' ? email.alert.recipients : email.report.recipients;
		if (!list.includes(normalized)) list.push(normalized);
		if (target === 'alert') alertRecipientInput = '';
		else reportRecipientInput = '';
	}
	function removeRecipient(target: 'alert' | 'report', addr: string) {
		if (!email) return;
		const list = target === 'alert' ? email.alert.recipients : email.report.recipients;
		const idx = list.indexOf(addr);
		if (idx >= 0) list.splice(idx, 1);
	}

	// ── validation (mirrors Vue validation) ───────────────────────────────────
	function validate(): string[] {
		const errors: string[] = [];
		if (runtime) {
			const s = runtime.evaluation_interval_seconds;
			if (!Number.isFinite(s) || s < 1 || s > 86400)
				errors.push(
					$_('admin.ops.settings.validation.evalIntervalRange', {
						default: 'Evaluation interval must be between 1 and 86400 seconds.'
					})
				);
		}
		if (advanced) {
			const {
				error_log_retention_days: el,
				minute_metrics_retention_days: mm,
				hourly_metrics_retention_days: hm
			} = advanced.data_retention;
			for (const d of [el, mm, hm]) {
				if (!Number.isFinite(d) || d < 0 || d > 365) {
					errors.push(
						$_('admin.ops.settings.validation.retentionDaysRange', {
							default: 'Retention days must be between 0 and 365.'
						})
					);
					break;
				}
			}
			const { default_threshold_5h: q5, default_threshold_7d: q7 } =
				advanced.openai_account_quota_auto_pause;
			if (q5 < 0 || q5 > 1 || q7 < 0 || q7 > 1)
				errors.push(
					$_('admin.ops.settings.validation.openaiQuotaAutoPauseRange', {
						default: 'Quota auto-pause thresholds must be between 0% and 100%.'
					})
				);
			if (
				advanced.auto_refresh_enabled &&
				!REFRESH_INTERVALS.includes(
					advanced.auto_refresh_interval_seconds as (typeof REFRESH_INTERVALS)[number]
				)
			)
				errors.push(
					$_('admin.ops.settings.validation.refreshIntervalRange', {
						default: 'Refresh interval must be 15, 30 or 60 seconds.'
					})
				);
		}
		const { sla_percent_min, ttft_p99_ms_max, request_error_rate_percent_max, upstream_error_rate_percent_max } =
			thresholds;
		if (sla_percent_min != null && (sla_percent_min < 0 || sla_percent_min > 100))
			errors.push(
				$_('admin.ops.settings.validation.slaMinPercentRange', {
					default: 'SLA minimum must be between 0% and 100%.'
				})
			);
		if (ttft_p99_ms_max != null && ttft_p99_ms_max < 0)
			errors.push(
				$_('admin.ops.settings.validation.ttftP99MaxRange', {
					default: 'TTFT p99 maximum must be non-negative.'
				})
			);
		if (
			request_error_rate_percent_max != null &&
			(request_error_rate_percent_max < 0 || request_error_rate_percent_max > 100)
		)
			errors.push(
				$_('admin.ops.settings.validation.requestErrorRateMaxRange', {
					default: 'Request error rate maximum must be between 0% and 100%.'
				})
			);
		if (
			upstream_error_rate_percent_max != null &&
			(upstream_error_rate_percent_max < 0 || upstream_error_rate_percent_max > 100)
		)
			errors.push(
				$_('admin.ops.settings.validation.upstreamErrorRateMaxRange', {
					default: 'Upstream error rate maximum must be between 0% and 100%.'
				})
			);
		return errors;
	}

	const validationErrors = $derived(loaded ? validate() : []);
	const isValid = $derived(validationErrors.length === 0);

	async function save() {
		if (!loaded) return;
		const errs = validate();
		if (errs.length > 0) {
			showError(errs[0]);
			return;
		}
		saving = true;
		try {
			if (email) {
				// fold the sentinel back to the API representation.
				email.alert.min_severity = severityToApi(alertMinSeverity);
				// auto-disable channels that have no recipients.
				if (email.alert.enabled && email.alert.recipients.length === 0) email.alert.enabled = false;
				if (email.report.enabled && email.report.recipients.length === 0)
					email.report.enabled = false;
			}
			await Promise.all([
				runtime ? updateOpsAlertRuntimeSettings(runtime) : Promise.resolve(),
				email ? updateOpsEmailNotificationConfig(email) : Promise.resolve(),
				advanced ? updateOpsAdvancedSettings(advanced) : Promise.resolve(),
				updateOpsMetricThresholds(thresholds)
			]);
			showSuccess($_('admin.ops.settings.saveSuccess', { default: 'Settings saved.' }));
			onSaved();
		} catch (err) {
			const msg =
				(err as Error)?.message ??
				$_('admin.ops.settings.saveFailed', { default: 'Failed to save settings.' });
			showError(msg);
		} finally {
			saving = false;
		}
	}

	function handleOpenChange(next: boolean) {
		if (next) {
			open = true;
			return;
		}
		open = false;
		onClose();
	}
	function cancel() {
		open = false;
		onClose();
	}

	const sectionLabel = (s: (typeof OPS_SETTINGS_SECTIONS)[number]) =>
		$_(`admin.ops.settings.${s.labelKey}`, { default: s.labelDefault });
	const severityLabel = (o: (typeof SEVERITY_OPTIONS)[number]) =>
		$_(`admin.ops.email.${o.labelKey}`, { default: o.labelDefault });
</script>

<StandardDialog
	bind:open
	onOpenChange={handleOpenChange}
	width="lg"
	title={$_('admin.ops.settings.title', { default: 'Ops dashboard settings' })}
	description={$_('admin.ops.settings.description', {
		default: 'Email reports, runtime alerting, retention and metric thresholds.'
	})}
	data-testid="ops-settings-dialog"
>
	<div class="mt-4 flex flex-col gap-4">
		{#if loading}
			<p class="py-9 text-center text-sm text-muted-foreground" data-testid="ops-settings-loading">
				{$_('common.loading', { default: 'Loading...' })}
			</p>
		{:else if loadError}
			<Alert variant="destructive" class="text-xs" data-testid="ops-settings-load-error">
				{loadError}
			</Alert>
		{:else if loaded && runtime && email && advanced}
			{#if !isValid}
				<Alert variant="warning" class="text-xs" data-testid="ops-settings-validation">
					<div class="font-semibold">
						{$_('admin.ops.settings.validation.title', { default: 'Please fix the following:' })}
					</div>
					<ul class="mt-1 list-inside list-disc pl-1">
						{#each validationErrors as msg (msg)}
							<li>{msg}</li>
						{/each}
					</ul>
				</Alert>
			{/if}

			<!-- section tabs -->
			<div class="flex flex-wrap gap-1.5" role="tablist" data-testid="ops-settings-tabs">
				{#each OPS_SETTINGS_SECTIONS as s (s.id)}
					<Button
						variant={activeSection === s.id ? 'default' : 'outline'}
						size="sm"
						role="tab"
						aria-selected={activeSection === s.id}
						data-testid={`ops-settings-tab-${s.id}`}
						onclick={() => (activeSection = s.id)}
					>
						{sectionLabel(s)}
					</Button>
				{/each}
			</div>

			<div class="max-h-[60vh] overflow-y-auto pr-1">
				<!-- ── Section A · Email ─────────────────────────────────────── -->
				{#if activeSection === 'email'}
					<div class="flex flex-col gap-4" data-testid="ops-settings-section-email">
						<!-- alert channel -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-semibold text-foreground">
									{$_('admin.ops.settings.alertConfig', { default: 'Alert emails' })}
								</h4>
								<Checkbox
									data-testid="ops-email-alert-enabled"
									bind:checked={email.alert.enabled}
								/>
							</div>
							{#if email.alert.enabled}
								<div class="mt-3 flex flex-col gap-3">
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.alertRecipients', { default: 'Recipients' })}
										</span>
										<div class="flex gap-1.5">
											<Input
												type="email"
												data-testid="ops-email-alert-recipient-input"
												bind:value={alertRecipientInput}
												onkeydown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														addRecipient('alert');
													}
												}}
												placeholder={$_('admin.ops.settings.emailPlaceholder', {
													default: 'name@example.com'
												})}
											/>
											<Button
												variant="outline"
												size="sm"
												class="shrink-0"
												data-testid="ops-email-alert-add"
												onclick={() => addRecipient('alert')}
											>
												{$_('common.add', { default: 'Add' })}
											</Button>
										</div>
										<div class="flex flex-wrap gap-1.5">
											{#each email.alert.recipients as addr (addr)}
												<Badge variant="outline" class="gap-1.5">
													{addr}
													<button
														type="button"
														class="opacity-70 hover:opacity-100"
														aria-label={$_('common.remove', { default: 'Remove' })}
														onclick={() => removeRecipient('alert', addr)}>×</button
													>
												</Badge>
											{/each}
										</div>
									</div>
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.minSeverity', { default: 'Minimum severity' })}
										</span>
										<NativeSelect
											class="w-full"
											data-testid="ops-email-min-severity"
											bind:value={alertMinSeverity}
										>
											{#each SEVERITY_OPTIONS as o (o.value)}
												<option value={o.value}>{severityLabel(o)}</option>
											{/each}
										</NativeSelect>
									</div>
									<div class="grid grid-cols-2 gap-3">
										<div class="space-y-1.5">
											<span class="text-xs font-medium text-muted-foreground">
												{$_('admin.ops.settings.rateLimitPerHour', { default: 'Rate limit / hour' })}
											</span>
											<Input
												type="number"
												min="0"
												data-testid="ops-email-rate-limit"
												bind:value={email.alert.rate_limit_per_hour}
											/>
										</div>
										<div class="space-y-1.5">
											<span class="text-xs font-medium text-muted-foreground">
												{$_('admin.ops.settings.batchingWindowSeconds', {
													default: 'Batching window (s)'
												})}
											</span>
											<Input
												type="number"
												min="0"
												data-testid="ops-email-batching-window"
												bind:value={email.alert.batching_window_seconds}
											/>
										</div>
									</div>
									<label class="flex items-center justify-between gap-3">
										<span class="text-xs text-muted-foreground">
											{$_('admin.ops.settings.includeResolvedAlerts', {
												default: 'Include resolved alerts'
											})}
										</span>
										<Checkbox
											data-testid="ops-email-include-resolved"
											bind:checked={email.alert.include_resolved_alerts}
										/>
									</label>
								</div>
							{/if}
						</div>

						<!-- report channel -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-semibold text-foreground">
									{$_('admin.ops.settings.reportConfig', { default: 'Scheduled reports' })}
								</h4>
								<Checkbox
									data-testid="ops-email-report-enabled"
									bind:checked={email.report.enabled}
								/>
							</div>
							{#if email.report.enabled}
								<div class="mt-3 flex flex-col gap-3">
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.reportRecipients', { default: 'Recipients' })}
										</span>
										<div class="flex gap-1.5">
											<Input
												type="email"
												data-testid="ops-email-report-recipient-input"
												bind:value={reportRecipientInput}
												onkeydown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														addRecipient('report');
													}
												}}
												placeholder={$_('admin.ops.settings.emailPlaceholder', {
													default: 'name@example.com'
												})}
											/>
											<Button
												variant="outline"
												size="sm"
												class="shrink-0"
												data-testid="ops-email-report-add"
												onclick={() => addRecipient('report')}
											>
												{$_('common.add', { default: 'Add' })}
											</Button>
										</div>
										<div class="flex flex-wrap gap-1.5">
											{#each email.report.recipients as addr (addr)}
												<Badge variant="outline" class="gap-1.5">
													{addr}
													<button
														type="button"
														class="opacity-70 hover:opacity-100"
														aria-label={$_('common.remove', { default: 'Remove' })}
														onclick={() => removeRecipient('report', addr)}>×</button
													>
												</Badge>
											{/each}
										</div>
									</div>
									<div class="grid grid-cols-2 gap-3">
										<label class="flex items-center justify-between gap-3">
											<span class="text-xs text-muted-foreground">
												{$_('admin.ops.settings.dailySummary', { default: 'Daily summary' })}
											</span>
											<Checkbox bind:checked={email.report.daily_summary_enabled} />
										</label>
										{#if email.report.daily_summary_enabled}
											<Input
												type="text"
												placeholder="0 9 * * *"
												bind:value={email.report.daily_summary_schedule}
											/>
										{:else}
											<span></span>
										{/if}
										<label class="flex items-center justify-between gap-3">
											<span class="text-xs text-muted-foreground">
												{$_('admin.ops.settings.weeklySummary', { default: 'Weekly summary' })}
											</span>
											<Checkbox bind:checked={email.report.weekly_summary_enabled} />
										</label>
										{#if email.report.weekly_summary_enabled}
											<Input
												type="text"
												placeholder="0 9 * * 1"
												bind:value={email.report.weekly_summary_schedule}
											/>
										{:else}
											<span></span>
										{/if}
										<label class="flex items-center justify-between gap-3">
											<span class="text-xs text-muted-foreground">
												{$_('admin.ops.settings.errorDigest', { default: 'Error digest' })}
											</span>
											<Checkbox bind:checked={email.report.error_digest_enabled} />
										</label>
										{#if email.report.error_digest_enabled}
											<Input
												type="text"
												placeholder="0 8 * * *"
												bind:value={email.report.error_digest_schedule}
											/>
										{:else}
											<span></span>
										{/if}
										<label class="flex items-center justify-between gap-3">
											<span class="text-xs text-muted-foreground">
												{$_('admin.ops.settings.accountHealth', { default: 'Account health' })}
											</span>
											<Checkbox bind:checked={email.report.account_health_enabled} />
										</label>
										{#if email.report.account_health_enabled}
											<Input
												type="text"
												placeholder="0 8 * * 1"
												bind:value={email.report.account_health_schedule}
											/>
										{:else}
											<span></span>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- ── Section B · Runtime alert ─────────────────────────────── -->
				{#if activeSection === 'runtime'}
					<div class="flex flex-col gap-4" data-testid="ops-settings-section-runtime">
						<div class="rounded-lg border border-border bg-card p-3.5">
							<h4 class="mb-2.5 text-sm font-semibold text-foreground">
								{$_('admin.ops.settings.dataCollection', { default: 'Evaluation' })}
							</h4>
							<div class="space-y-1.5">
								<span class="text-xs font-medium text-muted-foreground">
									{$_('admin.ops.settings.evaluationInterval', {
										default: 'Evaluation interval (seconds)'
									})}
								</span>
								<Input
									type="number"
									min="1"
									max="86400"
									data-testid="ops-runtime-eval-interval"
									bind:value={runtime.evaluation_interval_seconds}
								/>
								<p class="text-[11px] text-muted-foreground">
									{$_('admin.ops.settings.evaluationIntervalHint', {
										default: 'How often alert rules are evaluated.'
									})}
								</p>
							</div>
						</div>

						<!-- distributed lock -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-semibold text-foreground">
									{$_('admin.ops.settings.distributedLock', { default: 'Distributed lock' })}
								</h4>
								<Checkbox
									data-testid="ops-runtime-lock-enabled"
									bind:checked={runtime.distributed_lock.enabled}
								/>
							</div>
							{#if runtime.distributed_lock.enabled}
								<div class="mt-3 grid grid-cols-2 gap-3">
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.lockKey', { default: 'Lock key' })}
										</span>
										<Input
											type="text"
											data-testid="ops-runtime-lock-key"
											bind:value={runtime.distributed_lock.key}
										/>
									</div>
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.lockTtlSeconds', { default: 'Lock TTL (s)' })}
										</span>
										<Input
											type="number"
											min="0"
											data-testid="ops-runtime-lock-ttl"
											bind:value={runtime.distributed_lock.ttl_seconds}
										/>
									</div>
								</div>
							{/if}
						</div>

						<!-- silencing -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-semibold text-foreground">
									{$_('admin.ops.settings.silencing', { default: 'Global silencing' })}
								</h4>
								<Checkbox
									data-testid="ops-runtime-silence-enabled"
									bind:checked={runtime.silencing.enabled}
								/>
							</div>
							{#if runtime.silencing.enabled}
								<div class="mt-3 flex flex-col gap-3">
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.silenceUntil', { default: 'Silence until (RFC3339)' })}
										</span>
										<Input
											type="text"
											placeholder="2026-01-01T00:00:00Z"
											data-testid="ops-runtime-silence-until"
											bind:value={runtime.silencing.global_until_rfc3339}
										/>
									</div>
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.silenceReason', { default: 'Reason' })}
										</span>
										<Input
											type="text"
											data-testid="ops-runtime-silence-reason"
											bind:value={runtime.silencing.global_reason}
										/>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- ── Section C · Advanced ──────────────────────────────────── -->
				{#if activeSection === 'advanced'}
					<div class="flex flex-col gap-4" data-testid="ops-settings-section-advanced">
						<!-- data retention -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-semibold text-foreground">
									{$_('admin.ops.settings.dataRetention', { default: 'Data retention' })}
								</h4>
								<Checkbox
									data-testid="ops-adv-cleanup-enabled"
									bind:checked={advanced.data_retention.cleanup_enabled}
								/>
							</div>
							<div class="mt-3 flex flex-col gap-3">
								{#if advanced.data_retention.cleanup_enabled}
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.cleanupSchedule', { default: 'Cleanup schedule (cron)' })}
										</span>
										<Input
											type="text"
											placeholder="0 2 * * *"
											data-testid="ops-adv-cleanup-schedule"
											bind:value={advanced.data_retention.cleanup_schedule}
										/>
									</div>
								{/if}
								<div class="grid grid-cols-3 gap-2.5">
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.errorLogRetentionDays', { default: 'Error logs (days)' })}
										</span>
										<Input
											type="number"
											min="0"
											max="365"
											bind:value={advanced.data_retention.error_log_retention_days}
										/>
									</div>
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.minuteMetricsRetentionDays', {
												default: 'Minute metrics (days)'
											})}
										</span>
										<Input
											type="number"
											min="0"
											max="365"
											bind:value={advanced.data_retention.minute_metrics_retention_days}
										/>
									</div>
									<div class="space-y-1.5">
										<span class="text-xs font-medium text-muted-foreground">
											{$_('admin.ops.settings.hourlyMetricsRetentionDays', {
												default: 'Hourly metrics (days)'
											})}
										</span>
										<Input
											type="number"
											min="0"
											max="365"
											bind:value={advanced.data_retention.hourly_metrics_retention_days}
										/>
									</div>
								</div>
							</div>
						</div>

						<!-- aggregation -->
						<label
							class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3.5"
						>
							<span class="text-sm font-medium text-foreground">
								{$_('admin.ops.settings.enableAggregation', { default: 'Enable pre-aggregation' })}
							</span>
							<Checkbox
								data-testid="ops-adv-aggregation"
								bind:checked={advanced.aggregation.aggregation_enabled}
							/>
						</label>

						<!-- OpenAI quota auto-pause -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<h4 class="mb-1 text-sm font-semibold text-foreground">
								{$_('admin.ops.settings.openaiQuotaAutoPause', {
									default: 'OpenAI quota auto-pause'
								})}
							</h4>
							<p class="mb-3 text-[11px] text-muted-foreground">
								{$_('admin.ops.settings.openaiQuotaAutoPauseHint', {
									default: 'Pause accounts when quota usage exceeds these thresholds.'
								})}
							</p>
							<div class="grid grid-cols-2 gap-2.5">
								<div class="space-y-1.5">
									<span class="text-xs font-medium text-muted-foreground">
										{$_('admin.ops.settings.openaiQuotaAutoPauseDefault5h', { default: '5h threshold (%)' })}
									</span>
									<Input
										type="number"
										min="0"
										max="100"
										step="0.1"
										data-testid="ops-quota-auto-pause-5h"
										value={quota5hPercent}
										oninput={(e) => {
											const raw = (e.currentTarget as HTMLInputElement).value;
											setQuota5h(raw === '' ? null : Number(raw));
										}}
									/>
								</div>
								<div class="space-y-1.5">
									<span class="text-xs font-medium text-muted-foreground">
										{$_('admin.ops.settings.openaiQuotaAutoPauseDefault7d', { default: '7d threshold (%)' })}
									</span>
									<Input
										type="number"
										min="0"
										max="100"
										step="0.1"
										data-testid="ops-quota-auto-pause-7d"
										value={quota7dPercent}
										oninput={(e) => {
											const raw = (e.currentTarget as HTMLInputElement).value;
											setQuota7d(raw === '' ? null : Number(raw));
										}}
									/>
								</div>
							</div>
						</div>

						<!-- error filtering -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<h4 class="mb-3 text-sm font-semibold text-foreground">
								{$_('admin.ops.settings.errorFiltering', { default: 'Error filtering' })}
							</h4>
							<div class="flex flex-col gap-2.5">
								{#each IGNORE_FLAGS as flag (flag)}
									<label class="flex items-center justify-between gap-3">
										<span class="text-xs text-muted-foreground">
											{$_(`admin.ops.settings.${flag}`, { default: flag })}
										</span>
										<Checkbox
											data-testid={`ops-adv-${flag}`}
											bind:checked={advanced[flag]}
										/>
									</label>
								{/each}
							</div>
						</div>

						<!-- auto refresh -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-semibold text-foreground">
									{$_('admin.ops.settings.autoRefresh', { default: 'Auto refresh' })}
								</h4>
								<Checkbox
									data-testid="ops-adv-auto-refresh-enabled"
									bind:checked={advanced.auto_refresh_enabled}
								/>
							</div>
							{#if advanced.auto_refresh_enabled}
								<div class="mt-3 space-y-1.5">
									<span class="text-xs font-medium text-muted-foreground">
										{$_('admin.ops.settings.refreshInterval', { default: 'Refresh interval' })}
									</span>
									<NativeSelect
										class="w-full"
										data-testid="ops-adv-auto-refresh-interval"
										value={String(advanced.auto_refresh_interval_seconds)}
										onchange={(e) => {
											if (advanced) advanced.auto_refresh_interval_seconds = Number(
												(e.currentTarget as HTMLSelectElement).value
											);
										}}
									>
										{#each REFRESH_INTERVALS as iv (iv)}
											<option value={String(iv)}
												>{$_('admin.ops.settings.refreshIntervalSeconds', {
													default: '{seconds}s',
													values: { seconds: iv }
												})}</option
											>
										{/each}
									</NativeSelect>
								</div>
							{/if}
						</div>

						<!-- dashboard card toggles -->
						<div class="rounded-lg border border-border bg-card p-3.5">
							<h4 class="mb-3 text-sm font-semibold text-foreground">
								{$_('admin.ops.settings.dashboardCards', { default: 'Dashboard cards' })}
							</h4>
							<div class="flex flex-col gap-2.5">
								<label class="flex items-center justify-between gap-3">
									<span class="text-xs text-muted-foreground">
										{$_('admin.ops.settings.displayAlertEvents', { default: 'Show alert events' })}
									</span>
									<Checkbox
										data-testid="ops-adv-display-alert-events"
										bind:checked={advanced.display_alert_events}
									/>
								</label>
								<label class="flex items-center justify-between gap-3">
									<span class="text-xs text-muted-foreground">
										{$_('admin.ops.settings.displayOpenAITokenStats', {
											default: 'Show OpenAI token stats'
										})}
									</span>
									<Checkbox
										data-testid="ops-adv-display-token-stats"
										bind:checked={advanced.display_openai_token_stats}
									/>
								</label>
							</div>
						</div>
					</div>
				{/if}

				<!-- ── Section D · Thresholds ────────────────────────────────── -->
				{#if activeSection === 'thresholds'}
					<div class="flex flex-col gap-3" data-testid="ops-settings-section-thresholds">
						<p class="text-[11px] text-muted-foreground">
							{$_('admin.ops.settings.metricThresholdsHint', {
								default: 'Thresholds that colour the dashboard health indicators.'
							})}
						</p>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<span class="text-xs font-medium text-muted-foreground">
									{$_('admin.ops.settings.slaMinPercent', { default: 'SLA minimum (%)' })}
								</span>
								<Input
									type="number"
									min="0"
									max="100"
									step="0.1"
									data-testid="ops-threshold-sla-min"
									bind:value={thresholds.sla_percent_min}
								/>
							</div>
							<div class="space-y-1.5">
								<span class="text-xs font-medium text-muted-foreground">
									{$_('admin.ops.settings.ttftP99MaxMs', { default: 'TTFT p99 maximum (ms)' })}
								</span>
								<Input
									type="number"
									min="0"
									step="50"
									data-testid="ops-threshold-ttft-max"
									bind:value={thresholds.ttft_p99_ms_max}
								/>
							</div>
							<div class="space-y-1.5">
								<span class="text-xs font-medium text-muted-foreground">
									{$_('admin.ops.settings.requestErrorRateMaxPercent', {
										default: 'Request error rate max (%)'
									})}
								</span>
								<Input
									type="number"
									min="0"
									max="100"
									step="0.1"
									data-testid="ops-threshold-request-error-max"
									bind:value={thresholds.request_error_rate_percent_max}
								/>
							</div>
							<div class="space-y-1.5">
								<span class="text-xs font-medium text-muted-foreground">
									{$_('admin.ops.settings.upstreamErrorRateMaxPercent', {
										default: 'Upstream error rate max (%)'
									})}
								</span>
								<Input
									type="number"
									min="0"
									max="100"
									step="0.1"
									data-testid="ops-threshold-upstream-error-max"
									bind:value={thresholds.upstream_error_rate_percent_max}
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<div class="flex items-center justify-end gap-2 pt-1">
			<Button
				variant="outline"
				class="h-9"
				disabled={saving}
				data-testid="ops-settings-cancel"
				onclick={cancel}
			>
				{$_('common.cancel', { default: 'Cancel' })}
			</Button>
			<Button
				class="h-9"
				disabled={saving || loading || !loaded || !isValid}
				data-testid="ops-settings-save"
				onclick={save}
			>
				{saving
					? $_('common.saving', { default: 'Saving...' })
					: $_('common.save', { default: 'Save' })}
			</Button>
		</div>
	</div>
</StandardDialog>
