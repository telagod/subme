<script lang="ts">
	/**
	 * OpsAlertRulesCard · Svelte 5 (runes) · Phase C M13
	 *
	 * Vue ref: frontend/src/views/admin/ops/components/OpsAlertRulesCard.vue (05c44218).
	 *
	 * Self-contained CRUD card for ops alert rules. Rendered INSIDE a StandardDialog
	 * opened from the ops filter bar; the PAGE owns the opsMonitoringEnabled gate
	 * (ops.ts gating note: feature flags are read once by the page, not duplicated
	 * per-component — single source of truth).
	 *
	 * Owns:
	 *   - the rules table (loading / empty / error states),
	 *   - the create/edit flow via the co-located OpsAlertRuleEditDialog component,
	 *   - an inline delete-confirm StandardDialog.
	 *
	 * Props are intentionally empty ({}) so the route can drop it in with zero wiring;
	 * data is self-fetched via listOpsAlertRules.
	 *
	 * Red lines:
	 *   - Zinc-only palette; semantic tokens only (no raw hex).
	 *   - NativeSelect (used by the edit dialog) keeps non-empty sentinels.
	 *   - Reuse lib/ui primitives + the shared edit dialog; no duplicated editor.
	 *   - No top-level chart.js import (this card renders no chart; TDZ trap N/A).
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Pencil, Trash2, RefreshCw, Plus } from '@lucide/svelte';
	import {
		listOpsAlertRules,
		deleteOpsAlertRule,
		updateOpsAlertRule,
		type AlertRule,
		type OpsSeverity
	} from '$lib/api/admin/ops';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import OpsAlertRuleEditDialog, {
		METRIC_DEFINITIONS
	} from './OpsAlertRuleEditDialog.svelte';

	// ── local types ──────────────────────────────────────────────────────
	type LoadState = 'idle' | 'loading' | 'ready' | 'error';

	function metricLabel(type: string): string {
		const def = METRIC_DEFINITIONS.find((m) => m.type === type);
		if (!def) return type;
		return $_(`admin.ops.alertRules.metrics.${def.labelKey}`, { default: def.labelDefault });
	}

	// Self-contained datetime formatter (no cross-feature coupling).
	function formatDateTime(value?: string | null): string {
		if (!value) return '—';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value);
		return date.toLocaleString();
	}

	function severityVariant(sev: OpsSeverity): 'destructive' | 'default' | 'secondary' {
		if (sev === 'P0' || sev === 'P1') return 'destructive';
		if (sev === 'P2') return 'default';
		return 'secondary';
	}

	// ── list state ───────────────────────────────────────────────────────
	let loadState = $state<LoadState>('idle');
	let rules = $state<AlertRule[]>([]);
	let loadError = $state('');

	const sortedRules = $derived([...rules].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)));

	async function load() {
		loadState = 'loading';
		loadError = '';
		try {
			rules = await listOpsAlertRules();
			loadState = 'ready';
		} catch (err) {
			rules = [];
			loadState = 'error';
			loadError =
				(err as { message?: string })?.message ??
				$_('admin.ops.alertRules.loadFailed', { default: 'Failed to load alert rules' });
		}
	}

	onMount(load);

	// ── inline enable/disable toggle ────────────────────────────────────
	let togglingIds = $state(new Set<number>());

	async function toggleEnabled(rule: AlertRule) {
		const id = rule.id;
		if (id == null) return;
		togglingIds.add(id);
		togglingIds = new Set(togglingIds);
		const nextEnabled = !rule.enabled;
		try {
			await updateOpsAlertRule(id, { enabled: nextEnabled });
			// Optimistic update in-place.
			rule.enabled = nextEnabled;
			rules = [...rules];
			showSuccess(
				nextEnabled
					? $_('admin.ops.alertRules.enabled', { default: 'Alert rule enabled.' })
					: $_('admin.ops.alertRules.disabled', { default: 'Alert rule disabled.' })
			);
		} catch (err) {
			showError(
				(err as { message?: string })?.message ??
					$_('admin.ops.alertRules.toggleFailed', { default: 'Failed to toggle alert rule.' })
			);
		} finally {
			togglingIds.delete(id);
			togglingIds = new Set(togglingIds);
		}
	}

	// ── editor (delegated to shared OpsAlertRuleEditDialog) ──────────────
	let editorOpen = $state(false);
	let editingRule = $state<AlertRule | null>(null);

	function openCreate() {
		editingRule = null;
		editorOpen = true;
	}

	function openEdit(rule: AlertRule) {
		// Pass a detached copy so the dialog can't mutate the table row in place.
		editingRule = structuredClone($state.snapshot(rule)) as AlertRule;
		editorOpen = true;
	}

	function onEditorClose() {
		editorOpen = false;
		editingRule = null;
	}

	async function onEditorSaved() {
		editorOpen = false;
		editingRule = null;
		await load();
	}

	// ── delete-confirm state ─────────────────────────────────────────────
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');
	let pendingDelete = $state<AlertRule | null>(null);

	function requestDelete(rule: AlertRule) {
		pendingDelete = rule;
		deleteError = '';
		deleteOpen = true;
	}

	async function confirmDelete() {
		const id = pendingDelete?.id;
		if (id == null) return;
		deleting = true;
		deleteError = '';
		try {
			await deleteOpsAlertRule(id);
			deleteOpen = false;
			pendingDelete = null;
			await load();
		} catch (err) {
			deleteError =
				(err as { message?: string })?.message ??
				$_('admin.ops.alertRules.deleteFailed', { default: 'Failed to delete alert rule' });
		} finally {
			deleting = false;
		}
	}
</script>

<Card class="flex flex-col gap-3.5">
	<div class="flex items-start justify-between gap-3">
		<div>
			<h3 class="text-sm font-semibold text-foreground">
				{$_('admin.ops.alertRules.title', { default: 'Alert rules' })}
			</h3>
			<p class="mt-0.5 text-xs text-muted-foreground">
				{$_('admin.ops.alertRules.description', {
					default: 'Define metric thresholds that trigger ops alerts.'
				})}
			</p>
		</div>
		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="sm"
				disabled={loadState === 'loading'}
				onclick={openCreate}
				data-testid="ops-alert-rule-create"
			>
				<Plus class="h-3.5 w-3.5" />
				{$_('admin.ops.alertRules.create', { default: 'New rule' })}
			</Button>
			<Button
				variant="outline"
				size="icon"
				disabled={loadState === 'loading'}
				onclick={load}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
				data-testid="ops-alert-rule-refresh"
			>
				<RefreshCw class={'h-3.5 w-3.5' + (loadState === 'loading' ? ' animate-spin' : '')} />
			</Button>
		</div>
	</div>

	{#if loadState === 'error'}
		<Alert variant="destructive" data-testid="ops-alert-rule-error">{loadError}</Alert>
	{/if}

	{#if loadState === 'loading' || loadState === 'idle'}
		<div class="py-7 text-center text-sm text-muted-foreground">
			{$_('admin.ops.alertRules.loading', { default: 'Loading…' })}
		</div>
	{:else if sortedRules.length === 0}
		<div
			class="rounded-lg border border-dashed border-border px-7 py-7 text-center text-sm text-muted-foreground"
			data-testid="ops-alert-rule-empty"
		>
			{$_('admin.ops.alertRules.empty', { default: 'No alert rules yet.' })}
		</div>
	{:else}
		<div class="overflow-auto rounded-lg border border-border" style="max-height:520px;">
			<table class="w-full border-collapse text-sm" data-testid="ops-alert-rule-table">
				<thead class="sticky top-0 z-10 bg-muted">
					<tr class="text-left text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">
						<th class="px-3.5 py-2.5">{$_('admin.ops.alertRules.table.name', { default: 'Name' })}</th>
						<th class="px-3.5 py-2.5">{$_('admin.ops.alertRules.table.metric', { default: 'Metric' })}</th>
						<th class="px-3.5 py-2.5">{$_('admin.ops.alertRules.table.condition', { default: 'Condition' })}</th>
						<th class="px-3.5 py-2.5">{$_('admin.ops.alertRules.table.window', { default: 'Window / Sustained' })}</th>
						<th class="px-3.5 py-2.5">{$_('admin.ops.alertRules.table.severity', { default: 'Severity' })}</th>
						<th class="px-3.5 py-2.5">{$_('admin.ops.alertRules.table.enabled', { default: 'Enabled' })}</th>
						<th class="px-3.5 py-2.5">{$_('admin.ops.alertRules.table.lastTriggered', { default: 'Last triggered' })}</th>
						<th class="px-3.5 py-2.5 text-right">{$_('admin.ops.alertRules.table.actions', { default: 'Actions' })}</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedRules as row (row.id)}
						<tr class="border-t border-border align-top">
							<td class="px-3.5 py-2.5">
								<div class="font-semibold text-foreground">{row.name}</div>
								{#if row.description}
									<div class="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{row.description}</div>
								{/if}
							</td>
							<td class="px-3.5 py-2.5 text-muted-foreground">
								<span class="font-mono tabular-nums text-xs">{metricLabel(row.metric_type)}</span>
							</td>
							<td class="whitespace-nowrap px-3.5 py-2.5 text-muted-foreground">
								<span class="text-muted-foreground/70">{row.operator}</span>
								<span class="ml-1 font-mono tabular-nums text-foreground">{row.threshold}</span>
							</td>
							<td class="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground tabular-nums">
								{row.window_minutes}m / {row.sustained_minutes}m
							</td>
							<td class="whitespace-nowrap px-3.5 py-2.5">
								<Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
							</td>
							<td class="whitespace-nowrap px-3.5 py-2.5">
								<Checkbox
									checked={row.enabled}
									disabled={togglingIds.has(row.id ?? -1)}
									aria-label={$_('admin.ops.alertRules.table.enabled', { default: 'Enabled' })}
									data-testid="ops-alert-rule-toggle"
									onchange={() => toggleEnabled(row)}
								/>
							</td>
							<td class="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground tabular-nums">
								{formatDateTime(row.last_triggered_at)}
							</td>
							<td class="whitespace-nowrap px-3.5 py-2.5 text-right">
								<Button
									variant="outline"
									size="icon"
									class="h-7 w-7"
									onclick={() => openEdit(row)}
									aria-label={$_('common.edit', { default: 'Edit' })}
									data-testid="ops-alert-rule-edit"
								>
									<Pencil class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									class="ml-1.5 h-7 w-7 text-destructive hover:border-destructive/40 hover:text-destructive"
									onclick={() => requestDelete(row)}
									aria-label={$_('common.delete', { default: 'Delete' })}
									data-testid="ops-alert-rule-delete"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>

<!-- Create / edit flow delegated to the shared editor dialog. -->
<OpsAlertRuleEditDialog
	bind:open={editorOpen}
	rule={editingRule}
	onClose={onEditorClose}
	onSaved={onEditorSaved}
/>

<!-- Delete confirmation dialog. -->
<ConfirmDialog
	bind:open={deleteOpen}
	title={$_('admin.ops.alertRules.deleteConfirmTitle', { default: 'Delete alert rule' })}
	description={$_('admin.ops.alertRules.deleteConfirmMessage', {
		default: 'This alert rule will be permanently removed. This action cannot be undone.'
	})}
	confirmLabel={deleting
		? $_('common.deleting', { default: 'Deleting…' })
		: $_('common.delete', { default: 'Delete' })}
	loading={deleting}
	onConfirm={confirmDelete}
	data-testid="ops-alert-rule-delete-confirm"
>
	{#if pendingDelete}
		<div class="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
			{pendingDelete.name}
		</div>
	{/if}
	{#if deleteError}
		<Alert variant="destructive" class="mt-2 text-xs">{deleteError}</Alert>
	{/if}
</ConfirmDialog>
