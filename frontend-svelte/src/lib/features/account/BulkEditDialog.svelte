<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import ModelWhitelistSelector from './ModelWhitelistSelector.svelte';
	import QuotaLimitEditor from './QuotaLimitEditor.svelte';
	import { bulkUpdateAccounts, batchUpdateAccountCredentials, type Account } from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		mode: 'selected' | 'filtered';
		selectedIds: number[];
		filteredIds: () => Promise<number[]>;
		previewCount: number | null;
		accounts: Account[];
		onDone: () => void;
	};
	let { open = $bindable(false), mode, selectedIds, filteredIds, previewCount, accounts, onDone }: Props = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);

	// Structured fields (each with enable checkbox)
	let enableStatus = $state(false);
	let statusVal = $state('active');
	let enablePriority = $state(false);
	let priorityVal = $state('');
	let enableWeight = $state(false);
	let weightVal = $state('');
	let enableConcurrency = $state(false);
	let concurrencyVal = $state('');
	let enableRateMultiplier = $state(false);
	let rateMultiplierVal = $state('');
	let enableSchedulable = $state(false);
	let schedulableVal = $state(true);
	let enablePrivacy = $state(false);
	let privacyVal = $state(false);
	let enablePoolMode = $state(false);
	let poolModeVal = $state(false);
	let enableBaseUrl = $state(false);
	let baseUrlVal = $state('');
	let enableModelWhitelist = $state(false);
	let modelWhitelist = $state<string[]>([]);
	let enableQuotaLimits = $state(false);
	let totalLimit = $state<number | null>(null);
	let dailyLimit = $state<number | null>(null);
	let weeklyLimit = $state<number | null>(null);
	let dailyResetMode = $state<string | null>(null);
	let dailyResetHour = $state<number | null>(null);
	let weeklyResetMode = $state<string | null>(null);
	let weeklyResetDay = $state<number | null>(null);
	let weeklyResetHour = $state<number | null>(null);
	let resetTimezone = $state<string | null>(null);

	// JSON mode is default for backward compat; structured mode available via toggle
	let rawMode = $state(true);
	let rawJson = $state('{ "status": "inactive" }');

	const statusOpts = [
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' },
		{ value: 'error', label: 'error' },
		{ value: 'rate_limited', label: 'rate_limited' }
	];

	const targetIds = $derived(mode === 'selected' ? selectedIds : []);
	const targetCount = $derived(mode === 'selected' ? selectedIds.length : (previewCount ?? 0));

	// Detect mixed platforms
	const targetPlatforms = $derived.by(() => {
		const ids = new Set(targetIds);
		return [...new Set(accounts.filter(a => ids.has(a.id)).map(a => a.platform))];
	});
	const isMixed = $derived(targetPlatforms.length > 1);

	function buildPayload(): Record<string, unknown> {
		const updates: Record<string, unknown> = {};
		const cred: Record<string, unknown> = {};

		if (enableStatus) updates.status = statusVal;
		if (enablePriority && priorityVal.trim()) updates.priority = Number(priorityVal);
		if (enableWeight && weightVal.trim()) updates.weight = Number(weightVal);
		if (enableConcurrency && concurrencyVal.trim()) updates.concurrency = Number(concurrencyVal);
		if (enableRateMultiplier && rateMultiplierVal.trim()) updates.rate_multiplier = Number(rateMultiplierVal);
		if (enableSchedulable) updates.schedulable = schedulableVal;
		if (enablePrivacy) updates.privacy_mode = privacyVal;
		if (enablePoolMode) cred.pool_mode = poolModeVal;
		if (enableBaseUrl) cred.base_url = baseUrlVal.trim() || null;

		if (enableModelWhitelist) {
			const mapping: Record<string, string> = {};
			for (const m of modelWhitelist) { if (m.trim() && !m.includes('*')) mapping[m.trim()] = m.trim(); }
			updates.model_mapping = Object.keys(mapping).length > 0 ? mapping : null;
		}

		if (enableQuotaLimits) {
			if (totalLimit != null) updates.quota_total_limit = totalLimit;
			if (dailyLimit != null) updates.quota_daily_limit = dailyLimit;
			if (weeklyLimit != null) updates.quota_weekly_limit = weeklyLimit;
			if (dailyResetMode) updates.quota_daily_reset_mode = dailyResetMode;
			if (dailyResetHour != null) updates.quota_daily_reset_hour = dailyResetHour;
			if (weeklyResetMode) updates.quota_weekly_reset_mode = weeklyResetMode;
			if (weeklyResetDay != null) updates.quota_weekly_reset_day = weeklyResetDay;
			if (weeklyResetHour != null) updates.quota_weekly_reset_hour = weeklyResetHour;
			if (resetTimezone) updates.quota_reset_timezone = resetTimezone;
		}

		if (Object.keys(cred).length > 0) updates.credentials = cred;
		return updates;
	}

	async function submit() {
		busy = true; error = null;
		try {
			const ids = selectedIds.length > 0 ? selectedIds : await filteredIds();
			if (!ids.length) { error = 'No accounts to update'; busy = false; return; }

			if (rawMode) {
				await bulkUpdateAccounts({ ids, updates: JSON.parse(rawJson) });
			} else {
				const updates = buildPayload();
				if (Object.keys(updates).length === 0) { error = 'No fields enabled'; busy = false; return; }
				await bulkUpdateAccounts({ ids, updates });
			}

			showSuccess(`Bulk update applied to ${ids.length} accounts`);
			open = false;
			onDone();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			showError(error);
		} finally {
			busy = false;
		}
	}
</script>

<StandardDialog bind:open title={$_('admin.accounts.bulkEdit.title', { default: mode === 'selected' ? 'Edit selected accounts' : 'Edit filtered accounts' })} width="lg" data-testid="accounts-bulk-edit-dialog">
	<div class="mt-4 space-y-4">
		<!-- Target info -->
		<div class="rounded-md border border-border bg-muted/30 px-4 py-3">
			<p class="text-sm">Apply to <strong>{targetCount}</strong> account{targetCount !== 1 ? 's' : ''}.</p>
			{#if isMixed}
				<p class="mt-1 text-xs text-amber-600">Mixed platforms: {targetPlatforms.join(', ')} -- some fields may not apply to all.</p>
			{/if}
		</div>

		{#if error}<Alert variant="destructive" data-testid="bulk-edit-error">{error}</Alert>{/if}

		<!-- Mode toggle -->
		<div class="flex items-center gap-2 text-sm">
			<Button variant={rawMode ? 'outline' : 'default'} size="sm" onclick={() => (rawMode = false)}>Structured</Button>
			<Button variant={rawMode ? 'default' : 'outline'} size="sm" onclick={() => (rawMode = true)}>Raw JSON</Button>
		</div>

		{#if rawMode}
			<Textarea rows={10} bind:value={rawJson} data-testid="accounts-bulk-edit-json" />
		{:else}
			<div class="space-y-3">
				<!-- Status -->
				<div class="flex items-center gap-3 rounded-md border border-border p-3">
					<Checkbox bind:checked={enableStatus} data-testid="bulk-enable-status" />
					<div class="flex-1" class:opacity-50={!enableStatus} class:pointer-events-none={!enableStatus}>
						<label class="grid gap-1 text-sm">
							<span class="font-medium">Status</span>
							<NativeSelect bind:value={statusVal} options={statusOpts} data-testid="bulk-status" />
						</label>
					</div>
				</div>

				<!-- Priority / Weight / Concurrency / Rate multiplier -->
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="flex items-center gap-3 rounded-md border border-border p-3">
						<Checkbox bind:checked={enablePriority} data-testid="bulk-enable-priority" />
						<label class="flex-1 grid gap-1 text-sm" class:opacity-50={!enablePriority} class:pointer-events-none={!enablePriority}>
							<span class="font-medium">Priority</span>
							<Input type="number" bind:value={priorityVal} data-testid="bulk-priority" />
						</label>
					</div>
					<div class="flex items-center gap-3 rounded-md border border-border p-3">
						<Checkbox bind:checked={enableWeight} data-testid="bulk-enable-weight" />
						<label class="flex-1 grid gap-1 text-sm" class:opacity-50={!enableWeight} class:pointer-events-none={!enableWeight}>
							<span class="font-medium">Weight</span>
							<Input type="number" bind:value={weightVal} data-testid="bulk-weight" />
						</label>
					</div>
					<div class="flex items-center gap-3 rounded-md border border-border p-3">
						<Checkbox bind:checked={enableConcurrency} data-testid="bulk-enable-concurrency" />
						<label class="flex-1 grid gap-1 text-sm" class:opacity-50={!enableConcurrency} class:pointer-events-none={!enableConcurrency}>
							<span class="font-medium">Concurrency</span>
							<Input type="number" bind:value={concurrencyVal} data-testid="bulk-concurrency" />
						</label>
					</div>
					<div class="flex items-center gap-3 rounded-md border border-border p-3">
						<Checkbox bind:checked={enableRateMultiplier} data-testid="bulk-enable-rate" />
						<label class="flex-1 grid gap-1 text-sm" class:opacity-50={!enableRateMultiplier} class:pointer-events-none={!enableRateMultiplier}>
							<span class="font-medium">Rate multiplier</span>
							<Input type="number" step="0.1" bind:value={rateMultiplierVal} data-testid="bulk-rate" />
						</label>
					</div>
				</div>

				<!-- Boolean toggles -->
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="flex items-center gap-3 rounded-md border border-border p-3">
						<Checkbox bind:checked={enableSchedulable} data-testid="bulk-enable-schedulable" />
						<div class="flex-1" class:opacity-50={!enableSchedulable} class:pointer-events-none={!enableSchedulable}>
							<label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={schedulableVal} />Schedulable</label>
						</div>
					</div>
					<div class="flex items-center gap-3 rounded-md border border-border p-3">
						<Checkbox bind:checked={enablePrivacy} data-testid="bulk-enable-privacy" />
						<div class="flex-1" class:opacity-50={!enablePrivacy} class:pointer-events-none={!enablePrivacy}>
							<label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={privacyVal} />Privacy mode</label>
						</div>
					</div>
					<div class="flex items-center gap-3 rounded-md border border-border p-3">
						<Checkbox bind:checked={enablePoolMode} data-testid="bulk-enable-pool" />
						<div class="flex-1" class:opacity-50={!enablePoolMode} class:pointer-events-none={!enablePoolMode}>
							<label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={poolModeVal} />Pool mode</label>
						</div>
					</div>
				</div>

				<!-- Base URL -->
				<div class="flex items-center gap-3 rounded-md border border-border p-3">
					<Checkbox bind:checked={enableBaseUrl} data-testid="bulk-enable-base-url" />
					<label class="flex-1 grid gap-1 text-sm" class:opacity-50={!enableBaseUrl} class:pointer-events-none={!enableBaseUrl}>
						<span class="font-medium">Base URL (credential field)</span>
						<Input bind:value={baseUrlVal} placeholder="https://api.example.com" data-testid="bulk-base-url" />
						<p class="text-xs text-muted-foreground">Overrides base_url in credentials for all selected accounts.</p>
					</label>
				</div>

				<!-- Model whitelist -->
				<div class="rounded-md border border-border p-3">
					<div class="flex items-center gap-3">
						<Checkbox bind:checked={enableModelWhitelist} data-testid="bulk-enable-models" />
						<span class="text-sm font-medium">Model restriction</span>
					</div>
					{#if enableModelWhitelist}
						<div class="mt-3">
							<ModelWhitelistSelector
								bind:selected={modelWhitelist}
								platforms={targetPlatforms}
								onUpdate={(m) => { modelWhitelist = m; }}
							/>
						</div>
					{/if}
				</div>

				<!-- Quota limits -->
				<div class="rounded-md border border-border p-3">
					<div class="flex items-center gap-3">
						<Checkbox bind:checked={enableQuotaLimits} data-testid="bulk-enable-quota" />
						<span class="text-sm font-medium">Quota limits</span>
					</div>
					{#if enableQuotaLimits}
						<div class="mt-3">
							<QuotaLimitEditor
								bind:totalLimit bind:dailyLimit bind:weeklyLimit
								bind:dailyResetMode bind:dailyResetHour
								bind:weeklyResetMode bind:weeklyResetDay bind:weeklyResetHour
								bind:resetTimezone
								onUpdate={() => {}}
							/>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={busy} onclick={submit} data-testid="accounts-bulk-edit-confirm">
				{busy ? 'Updating...' : 'Apply'}
			</Button>
		</div>
	</div>
</StandardDialog>
