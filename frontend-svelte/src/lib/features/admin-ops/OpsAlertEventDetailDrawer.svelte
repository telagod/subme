<script lang="ts">
	/**
	 * OpsAlertEventDetailDrawer · 单条告警事件详情面板（Phase C · admin-ops）
	 *
	 * 设计：
	 *   - StandardDrawer 右侧贴边面板。Vue 原型是 OpsAlertEventsCard.vue 里的 detail dialog +
	 *     silence panel，这里搬成独立可复用 drawer。
	 *   - $effect 监听 open + event.id 变化 → getOpsAlertEvent(id) 重新拉一份权威 detail。
	 *   - 展示：severity / status / metric_value / threshold_value / dimensions /
	 *     fired_at / resolved_at（与 AlertEvent 字段对齐）。
	 *   - Silence form：rule_id / platform / group_id? / until (datetime-local) / reason
	 *     → createOpsAlertSilence。rule_id/platform/group_id 默认从 event.dimensions 预填，
	 *     仍可在表单内覆写。until 用 datetime-local，提交时转 RFC3339（toISOString）。
	 *   - Manual-resolve Button → updateOpsAlertEventStatus(id, 'manual_resolved')
	 *     → onResolved() + refetch 当前 detail。
	 *
	 * 调色板红线：Zinc-only，无裸 hex。状态/严重度色调复用 ops.ts 的 alertTone()
	 *   （amber/destructive/zinc tokens 已审核），不在本文件硬编码颜色。
	 *
	 * Props（路由按此精确 wire）：
	 *   { open: boolean; event: AlertEvent | null; onClose: () => void; onResolved: () => void }
	 */
	import { _ } from 'svelte-i18n';
	import { X, BellOff, CheckCircle2, RefreshCw, AlertTriangle } from '@lucide/svelte';
	import {
		getOpsAlertEvent,
		updateOpsAlertEventStatus,
		createOpsAlertSilence,
		type AlertEvent
	} from '$lib/api/admin/ops';
	import { alertTone, formatDateTime } from '$lib/features/admin-ops/ops';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Alert from '$lib/ui/Alert.svelte';

	type Props = {
		open: boolean;
		event: AlertEvent | null;
		onClose: () => void;
		onResolved: () => void;
	};

	let { open = $bindable(false), event = null, onClose, onResolved }: Props = $props();

	// ── detail fetch state ───────────────────────────────────────────────────
	let detail = $state<AlertEvent | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let lastLoadedId = $state<number | null>(null);

	// ── action state ─────────────────────────────────────────────────────────
	let resolving = $state(false);
	let silencing = $state(false);

	// ── silence form ─────────────────────────────────────────────────────────
	let silRuleId = $state('');
	let silPlatform = $state('');
	let silGroupId = $state('');
	let silUntil = $state('');
	let silReason = $state('');

	// 当前展示用的事件 —— 优先权威 detail，回退到入参 event
	const shown = $derived(detail ?? event);

	function dimString(ev: AlertEvent | null, key: string): string {
		const v = ev?.dimensions?.[key];
		if (v == null) return '';
		if (typeof v === 'string') return v;
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		return '';
	}

	function metricPair(ev: AlertEvent | null): string {
		if (!ev) return '—';
		const m = ev.metric_value;
		const t = ev.threshold_value;
		const mStr = typeof m === 'number' ? m.toFixed(2) : '—';
		const tStr = typeof t === 'number' ? t.toFixed(2) : '—';
		return `${mStr} / ${tStr}`;
	}

	function statusLabel(status: string | undefined): string {
		const s = String(status ?? '')
			.trim()
			.toLowerCase();
		if (s === 'firing') return $_('admin.ops.alertEvents.status.firing', { default: 'Firing' });
		if (s === 'resolved') return $_('admin.ops.alertEvents.status.resolved', { default: 'Resolved' });
		if (s === 'manual_resolved')
			return $_('admin.ops.alertEvents.status.manualResolved', { default: 'Manually resolved' });
		return s ? s.toUpperCase() : '—';
	}

	const isResolved = $derived(
		shown != null &&
			(String(shown.status ?? '').toLowerCase() === 'resolved' ||
				String(shown.status ?? '').toLowerCase() === 'manual_resolved')
	);

	// 用一份事件预填 silence 表单（platform / group_id / rule_id / 默认 +1h until）
	function prefillSilence(ev: AlertEvent | null) {
		if (!ev) return;
		silRuleId = String(ev.rule_id ?? '');
		silPlatform = dimString(ev, 'platform');
		const g = ev.dimensions?.group_id;
		silGroupId = g != null && g !== '' ? String(g) : '';
		silReason = '';
		// 默认静默到 1 小时后；datetime-local 需要本地无时区的 `YYYY-MM-DDTHH:mm`
		const until = new Date(Date.now() + 60 * 60 * 1000);
		until.setSeconds(0, 0);
		const pad = (n: number) => String(n).padStart(2, '0');
		silUntil = `${until.getFullYear()}-${pad(until.getMonth() + 1)}-${pad(until.getDate())}T${pad(until.getHours())}:${pad(until.getMinutes())}`;
	}

	$effect(() => {
		if (open && event && event.id !== lastLoadedId) {
			lastLoadedId = event.id;
			detail = event;
			prefillSilence(event);
			void loadDetail(event.id);
		}
		if (!open) {
			lastLoadedId = null;
			detail = null;
			loadError = null;
			resolving = false;
			silencing = false;
		}
	});

	async function loadDetail(id: number) {
		loading = true;
		loadError = null;
		try {
			const fresh = await getOpsAlertEvent(id);
			detail = fresh;
			prefillSilence(fresh);
		} catch (err) {
			loadError =
				err instanceof Error
					? err.message
					: $_('admin.ops.alertEvents.detail.loadFailed', { default: 'Failed to load alert detail.' });
		} finally {
			loading = false;
		}
	}

	async function manualResolve() {
		const ev = shown;
		if (!ev || resolving) return;
		resolving = true;
		try {
			await updateOpsAlertEventStatus(ev.id, 'manual_resolved');
			showSuccess(
				$_('admin.ops.alertEvents.detail.manualResolvedSuccess', { default: 'Alert resolved.' })
			);
			onResolved();
			await loadDetail(ev.id);
		} catch (err) {
			showError(
				err instanceof Error
					? err.message
					: $_('admin.ops.alertEvents.detail.manualResolvedFailed', {
							default: 'Failed to resolve alert.'
						})
			);
		} finally {
			resolving = false;
		}
	}

	async function submitSilence() {
		const ev = shown;
		if (!ev || silencing) return;

		const ruleId = Number(silRuleId);
		if (!Number.isFinite(ruleId) || ruleId <= 0) {
			showError(
				$_('admin.ops.alertEvents.detail.silenceRuleRequired', {
					default: 'A valid rule id is required.'
				})
			);
			return;
		}
		if (!silUntil) {
			showError(
				$_('admin.ops.alertEvents.detail.silenceUntilRequired', {
					default: 'A silence-until time is required.'
				})
			);
			return;
		}
		const untilDate = new Date(silUntil);
		if (Number.isNaN(untilDate.getTime())) {
			showError(
				$_('admin.ops.alertEvents.detail.silenceUntilInvalid', {
					default: 'The silence-until time is invalid.'
				})
			);
			return;
		}

		const groupId = silGroupId.trim() === '' ? undefined : Number(silGroupId);
		if (groupId !== undefined && !Number.isFinite(groupId)) {
			showError(
				$_('admin.ops.alertEvents.detail.silenceGroupInvalid', {
					default: 'Group id must be a number.'
				})
			);
			return;
		}

		silencing = true;
		try {
			await createOpsAlertSilence({
				rule_id: ruleId,
				platform: silPlatform.trim(),
				group_id: groupId,
				until: untilDate.toISOString(),
				reason: silReason.trim() || undefined
			});
			showSuccess(
				$_('admin.ops.alertEvents.detail.silenceSuccess', { default: 'Silence created.' })
			);
		} catch (err) {
			showError(
				err instanceof Error
					? err.message
					: $_('admin.ops.alertEvents.detail.silenceFailed', {
							default: 'Failed to create silence.'
						})
			);
		} finally {
			silencing = false;
		}
	}

	function handleClose() {
		open = false;
		onClose();
	}
</script>

<StandardDrawer
	bind:open
	width="lg"
	title={$_('admin.ops.alertEvents.detail.title', { default: 'Alert event detail' })}
	description={$_('admin.ops.alertEvents.detail.subtitle', {
		default: 'Inspect, silence, or manually resolve this alert.'
	})}
	data-testid="ops-alert-event-drawer"
>
	<div class="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
		{#if loading && !shown}
			<div
				class="flex items-center gap-2 py-8 text-sm text-muted-foreground"
				role="status"
				data-testid="ops-alert-event-loading"
			>
				<RefreshCw class="h-4 w-4 animate-spin" aria-hidden="true" />
				{$_('admin.ops.alertEvents.detail.loading', { default: 'Loading alert detail…' })}
			</div>
		{:else if !shown}
			<div class="py-8 text-center text-sm text-muted-foreground" data-testid="ops-alert-event-empty">
				{$_('admin.ops.alertEvents.detail.empty', { default: 'No alert selected.' })}
			</div>
		{:else}
			{#if loadError}
				<Alert variant="destructive" data-testid="ops-alert-event-error">
					<AlertTriangle class="h-4 w-4" aria-hidden="true" />
					<span>{loadError}</span>
				</Alert>
			{/if}

			<!-- Summary: severity + status + title -->
			<section class="rounded-xl border border-border bg-muted/40 p-4">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="outline" class={alertTone(shown)}>
						{shown.severity || '—'}
					</Badge>
					<Badge variant="outline" class={alertTone(shown)}>
						{statusLabel(shown.status)}
					</Badge>
				</div>
				<h3 class="mt-3 text-sm font-semibold text-foreground">{shown.title || '—'}</h3>
				{#if shown.description}
					<p class="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{shown.description}</p>
				{/if}
			</section>

			<!-- Meta grid -->
			<section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="rounded-lg border border-border bg-card p-3">
					<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						{$_('admin.ops.alertEvents.detail.metric', { default: 'Metric / threshold' })}
					</div>
					<div class="mt-1 font-mono text-sm text-foreground" data-testid="ops-alert-event-metric">
						{metricPair(shown)}
					</div>
				</div>
				<div class="rounded-lg border border-border bg-card p-3">
					<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						{$_('admin.ops.alertEvents.detail.ruleId', { default: 'Rule id' })}
					</div>
					<div class="mt-1 font-mono text-sm font-semibold text-foreground">#{shown.rule_id}</div>
				</div>
				<div class="rounded-lg border border-border bg-card p-3">
					<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						{$_('admin.ops.alertEvents.detail.firedAt', { default: 'Fired at' })}
					</div>
					<div class="mt-1 text-sm text-foreground">
						{formatDateTime(shown.fired_at || shown.created_at)}
					</div>
				</div>
				<div class="rounded-lg border border-border bg-card p-3">
					<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						{$_('admin.ops.alertEvents.detail.resolvedAt', { default: 'Resolved at' })}
					</div>
					<div class="mt-1 text-sm text-foreground">
						{shown.resolved_at ? formatDateTime(shown.resolved_at) : '—'}
					</div>
				</div>
				<div class="rounded-lg border border-border bg-card p-3 sm:col-span-2">
					<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						{$_('admin.ops.alertEvents.detail.dimensions', { default: 'Dimensions' })}
					</div>
					<div class="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
						{#if dimString(shown, 'platform')}
							<div>platform={dimString(shown, 'platform')}</div>
						{/if}
						{#if shown.dimensions?.group_id != null && shown.dimensions?.group_id !== ''}
							<div>group_id={String(shown.dimensions.group_id)}</div>
						{/if}
						{#if dimString(shown, 'region')}
							<div>region={dimString(shown, 'region')}</div>
						{/if}
						{#if !dimString(shown, 'platform') && (shown.dimensions?.group_id == null || shown.dimensions?.group_id === '') && !dimString(shown, 'region')}
							<div>—</div>
						{/if}
					</div>
				</div>
			</section>

			<!-- Silence form -->
			<section class="rounded-xl border border-border bg-card p-4" data-testid="ops-alert-silence-form">
				<h4 class="text-sm font-semibold text-foreground">
					{$_('admin.ops.alertEvents.detail.silence', { default: 'Silence' })}
				</h4>
				<p class="mt-0.5 text-xs text-muted-foreground">
					{$_('admin.ops.alertEvents.detail.silenceHint', {
						default: 'Suppress matching alerts until the given time.'
					})}
				</p>

				<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label class="flex flex-col gap-1 text-xs">
						<span class="font-medium text-foreground">
							{$_('admin.ops.alertEvents.detail.silenceRuleId', { default: 'Rule id' })}
						</span>
						<Input
							type="number"
							bind:value={silRuleId}
							inputmode="numeric"
							data-testid="ops-silence-rule-id"
						/>
					</label>
					<label class="flex flex-col gap-1 text-xs">
						<span class="font-medium text-foreground">
							{$_('admin.ops.alertEvents.detail.silencePlatform', { default: 'Platform' })}
						</span>
						<Input
							type="text"
							bind:value={silPlatform}
							placeholder={$_('admin.ops.alertEvents.detail.silencePlatformPlaceholder', {
								default: 'e.g. openai'
							})}
							data-testid="ops-silence-platform"
						/>
					</label>
					<label class="flex flex-col gap-1 text-xs">
						<span class="font-medium text-foreground">
							{$_('admin.ops.alertEvents.detail.silenceGroupId', { default: 'Group id (optional)' })}
						</span>
						<Input
							type="number"
							bind:value={silGroupId}
							inputmode="numeric"
							data-testid="ops-silence-group-id"
						/>
					</label>
					<label class="flex flex-col gap-1 text-xs">
						<span class="font-medium text-foreground">
							{$_('admin.ops.alertEvents.detail.silenceUntil', { default: 'Until' })}
						</span>
						<Input
							type="datetime-local"
							bind:value={silUntil}
							data-testid="ops-silence-until"
						/>
					</label>
					<label class="flex flex-col gap-1 text-xs sm:col-span-2">
						<span class="font-medium text-foreground">
							{$_('admin.ops.alertEvents.detail.silenceReason', { default: 'Reason (optional)' })}
						</span>
						<Textarea
							bind:value={silReason}
							rows={2}
							placeholder={$_('admin.ops.alertEvents.detail.silenceReasonPlaceholder', {
								default: 'Why are you silencing this alert?'
							})}
							data-testid="ops-silence-reason"
						/>
					</label>
				</div>

				<div class="mt-3 flex justify-end">
					<Button
						variant="outline"
						size="sm"
						disabled={silencing}
						onclick={submitSilence}
						data-testid="ops-silence-submit"
					>
						<BellOff class="h-4 w-4" aria-hidden="true" />
						{$_('admin.ops.alertEvents.detail.silenceApply', { default: 'Create silence' })}
					</Button>
				</div>
			</section>
		{/if}
	</div>

	<!-- Footer actions -->
	<div class="mt-4 flex flex-shrink-0 items-center justify-between gap-2 border-t border-border pt-4">
		<Button variant="ghost" size="sm" onclick={handleClose} data-testid="ops-alert-event-close">
			<X class="h-4 w-4" aria-hidden="true" />
			{$_('common.close', { default: 'Close' })}
		</Button>
		<Button
			variant="default"
			size="sm"
			disabled={!shown || resolving || isResolved}
			onclick={manualResolve}
			data-testid="ops-alert-manual-resolve"
		>
			<CheckCircle2 class="h-4 w-4" aria-hidden="true" />
			{$_('admin.ops.alertEvents.detail.manualResolve', { default: 'Mark resolved' })}
		</Button>
	</div>
</StandardDrawer>
