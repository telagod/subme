<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Save } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import ResponseSettingsTab from './ResponseSettingsTab.svelte';
	import ThresholdsGrid from './ThresholdsGrid.svelte';
	import ScopeSettingsTab from './ScopeSettingsTab.svelte';
	import {
		updateRiskConfig,
		type ContentModerationConfig,
		type KeywordBlockingMode,
		type ModerationMode
	} from '$lib/api/admin/riskControl';
	import type { AdminGroup } from '$lib/api/admin/groups';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		cloneConfig,
		DEFAULT_CONFIG,
		parseLines,
		thresholdsFromConfig,
		thresholdsToPayload,
		SETTINGS_TABS,
		type SettingsTab
	} from './risk-control';

	type Props = {
		open: boolean;
		config: ContentModerationConfig;
		groups: AdminGroup[];
		onsaved?: (updated: ContentModerationConfig) => void;
	};

	let { open = $bindable(), config, groups, onsaved }: Props = $props();

	const MODE_OPTIONS: Array<{ value: ModerationMode; label: string }> = [
		{ value: 'pre_block', label: 'Pre-block' },
		{ value: 'observe', label: 'Observe' },
		{ value: 'off', label: 'Off' }
	];
	const KEYWORD_MODES: Array<{ value: KeywordBlockingMode; label: string }> = [
		{ value: 'keyword_and_api', label: 'Keyword + API' },
		{ value: 'keyword_only', label: 'Keyword only' },
		{ value: 'api_only', label: 'API only' }
	];

	let activeTab = $state<SettingsTab>('basic');
	let saving = $state(false);

	// Editable form state -- initialized via $effect below
	let form = $state<ContentModerationConfig>(cloneConfig(DEFAULT_CONFIG));
	let apiKeysText = $state('');
	let apiKeysMode = $state<'append' | 'replace'>('append');
	let blockedKeywordsText = $state('');
	let modelFilterText = $state('');
	let thresholds = $state<Record<string, number>>({});

	// Reset form when dialog opens with latest config prop
	$effect(() => {
		if (open) {
			form = cloneConfig(config);
			apiKeysText = '';
			apiKeysMode = 'append';
			blockedKeywordsText = form.blocked_keywords.join('\n');
			modelFilterText = form.model_filter.models.join('\n');
			thresholds = thresholdsFromConfig(form.thresholds);
			activeTab = 'basic';
		}
	});

	async function save() {
		saving = true;
		try {
			const models = parseLines(modelFilterText);
			if (form.model_filter.type !== 'all' && models.length === 0) {
				showError('Model filter requires at least one model');
				return;
			}
			const keys = parseLines(apiKeysText);
			const updated = await updateRiskConfig({
				enabled: form.enabled,
				mode: form.mode,
				base_url: form.base_url,
				model: form.model,
				timeout_ms: Number(form.timeout_ms) || 3000,
				retry_count: Number(form.retry_count) || 0,
				sample_rate: Number(form.sample_rate) || 0,
				all_groups: form.all_groups,
				group_ids: form.all_groups ? [] : [...form.group_ids],
				record_non_hits: form.record_non_hits,
				worker_count: Number(form.worker_count) || 4,
				queue_size: Number(form.queue_size) || 32768,
				block_status: Number(form.block_status) || 403,
				block_message: form.block_message,
				email_on_hit: form.email_on_hit,
				auto_ban_enabled: form.auto_ban_enabled,
				ban_threshold: Number(form.ban_threshold) || 10,
				violation_window_hours: Number(form.violation_window_hours) || 720,
				hit_retention_days: Number(form.hit_retention_days) || 180,
				non_hit_retention_days: Math.min(Math.max(Number(form.non_hit_retention_days) || 3, 1), 3),
				pre_hash_check_enabled: form.pre_hash_check_enabled,
				blocked_keywords: parseLines(blockedKeywordsText),
				keyword_blocking_mode: form.keyword_blocking_mode,
				model_filter: { type: form.model_filter.type, models },
				thresholds: thresholdsToPayload(thresholds),
				api_keys: keys.length ? keys : undefined,
				api_keys_mode: keys.length ? apiKeysMode : undefined
			});
			open = false;
			showSuccess('Risk-control configuration saved');
			onsaved?.(updated);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}
</script>

<StandardDialog bind:open title="Risk Control Settings" width="lg" data-testid="risk-settings-dialog">
	<div class="space-y-5">
		<!-- Tab bar -->
		<div class="flex gap-1 overflow-x-auto border-b border-border pb-px">
			{#each SETTINGS_TABS as tab (tab.id)}
				<button
					type="button"
					class="whitespace-nowrap rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors
						{activeTab === tab.id
							? 'border-b-2 border-primary bg-primary/5 text-primary'
							: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
					onclick={() => (activeTab = tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<!-- Basic tab -->
		{#if activeTab === 'basic'}
			<div class="space-y-4">
				<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
					<label class="flex min-h-14 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm">
						<Checkbox bind:checked={form.enabled} />
						<span>
							<span class="block text-xs font-medium text-foreground">Enabled</span>
							<span class="block text-[11px] text-muted-foreground">Enable content moderation</span>
						</span>
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-xs text-muted-foreground">Mode</span>
						<NativeSelect bind:value={form.mode} options={MODE_OPTIONS} />
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-xs text-muted-foreground">Base URL</span>
						<Input bind:value={form.base_url} placeholder="https://api.openai.com" />
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-xs text-muted-foreground">Model</span>
						<Input bind:value={form.model} placeholder="omni-moderation-latest" />
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-xs text-muted-foreground">Timeout (ms)</span>
						<Input type="number" min={500} max={30000} bind:value={form.timeout_ms} />
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-xs text-muted-foreground">Retry count</span>
						<Input type="number" min={0} max={5} bind:value={form.retry_count} />
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-xs text-muted-foreground">Sample rate (%)</span>
						<Input type="number" min={0} max={100} bind:value={form.sample_rate} />
					</label>
				</div>

				<!-- API keys section -->
				<div class="space-y-3 rounded-md border p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h3 class="text-xs font-semibold text-foreground">API Keys</h3>
							<p class="text-[11px] text-muted-foreground">
								{form.api_key_configured ? `${form.api_key_count} key(s) stored` : 'No keys configured'}
							</p>
						</div>
						<div class="inline-flex rounded-md border bg-muted p-0.5">
							<button type="button" class="rounded px-2 py-0.5 text-[11px] font-medium {apiKeysMode === 'append' ? 'bg-background shadow-sm' : 'text-muted-foreground'}" onclick={() => (apiKeysMode = 'append')}>Append</button>
							<button type="button" class="rounded px-2 py-0.5 text-[11px] font-medium {apiKeysMode === 'replace' ? 'bg-amber-500/20 text-amber-700 shadow-sm dark:text-amber-300' : 'text-muted-foreground'}" onclick={() => (apiKeysMode = 'replace')}>Replace</button>
						</div>
					</div>
					<Textarea class="min-h-20 font-mono text-xs" bind:value={apiKeysText} placeholder="Paste API keys, one per line" autocomplete="new-password" />
					{#if apiKeysMode === 'replace'}
						<Badge variant="outline" class="border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">
							Replace mode: all existing keys will be overwritten on save
						</Badge>
					{/if}
				</div>
			</div>

		<!-- Scope tab -->
		{:else if activeTab === 'scope'}
			<ScopeSettingsTab bind:config={form} {groups} bind:modelFilterText />

		<!-- Runtime tab -->
		{:else if activeTab === 'runtime'}
			<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<label class="space-y-1 text-sm">
					<span class="text-xs text-muted-foreground">Worker count</span>
					<Input type="number" min={1} max={32} bind:value={form.worker_count} />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-xs text-muted-foreground">Queue size</span>
					<Input type="number" min={100} max={100000} bind:value={form.queue_size} />
				</label>
				<label class="flex min-h-14 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2">
					<Checkbox bind:checked={form.record_non_hits} />
					<span>
						<span class="block text-xs font-medium text-foreground">Record non-hits</span>
						<span class="block text-[11px] text-muted-foreground">Log requests that passed moderation (increases storage)</span>
					</span>
				</label>
				<label class="flex min-h-14 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2">
					<Checkbox bind:checked={form.pre_hash_check_enabled} />
					<span>
						<span class="block text-xs font-medium text-foreground">Pre-hash check</span>
						<span class="block text-[11px] text-muted-foreground">Skip API calls for previously flagged content hashes</span>
					</span>
				</label>
			</div>

		<!-- Response tab -->
		{:else if activeTab === 'response'}
			<ResponseSettingsTab bind:config={form} />

		<!-- Thresholds tab -->
		{:else if activeTab === 'riskThresholds'}
			<ThresholdsGrid bind:thresholds />

		<!-- Keywords tab -->
		{:else if activeTab === 'keywords'}
			<div class="space-y-4">
				<div>
					<h3 class="text-sm font-semibold text-foreground">Keyword Blocking</h3>
					<p class="mt-1 text-xs text-muted-foreground">
						Block requests containing specific keywords before they reach the moderation API.
					</p>
				</div>
				<label class="space-y-1 text-sm">
					<span class="text-xs text-muted-foreground">Blocking mode</span>
					<NativeSelect bind:value={form.keyword_blocking_mode} options={KEYWORD_MODES} />
				</label>
				{#if form.keyword_blocking_mode !== 'api_only'}
					<label class="space-y-1.5 text-sm">
						<span class="text-xs text-muted-foreground">Blocked keywords (one per line)</span>
						<Textarea class="min-h-40 font-mono text-xs" bind:value={blockedKeywordsText} placeholder="Enter keywords to block, one per line..." />
						<span class="text-[11px] text-muted-foreground">
							{parseLines(blockedKeywordsText).length} keyword(s) &middot; max 10,000
						</span>
					</label>
				{:else}
					<div class="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
						Keyword blocking is disabled. Only API-based moderation is active.
					</div>
				{/if}
			</div>

		<!-- Retention tab -->
		{:else}
			<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<label class="space-y-1 text-sm">
					<span class="text-xs text-muted-foreground">Hit retention (days)</span>
					<Input type="number" min={1} max={3650} bind:value={form.hit_retention_days} />
					<span class="text-[11px] text-muted-foreground">How long to keep flagged records</span>
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-xs text-muted-foreground">Non-hit retention (days)</span>
					<Input type="number" min={1} max={3} bind:value={form.non_hit_retention_days} />
					<span class="text-[11px] text-muted-foreground">How long to keep passed records (max 3 days)</span>
				</label>
			</div>
		{/if}
	</div>

	<!-- Footer with save -->
	<div class="mt-6 flex justify-end gap-2 border-t border-border pt-4">
		<Button variant="outline" onclick={() => (open = false)}>{$_('common.cancel', { default: '取消' })}</Button>
		<Button disabled={saving} onclick={save}>
			<Save size={14} />{saving ? 'Saving...' : 'Save configuration'}
		</Button>
	</div>
</StandardDialog>
