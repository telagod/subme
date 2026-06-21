<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		AlertTriangle,
		Database,
		KeyRound,
		RefreshCw,
		Save,
		Shield,
		Trash2
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import RiskLogsPanel from '$lib/features/risk-control/RiskLogsPanel.svelte';
	import {
		clearFlaggedHashes,
		deleteFlaggedHash,
		getRiskConfig,
		getRiskStatus,
		testRiskApiKeys,
		updateRiskConfig,
		type ContentModerationAPIKeyStatus,
		type ContentModerationConfig,
		type ContentModerationRuntimeStatus,
		type ContentModerationTestAuditResult,
		type KeywordBlockingMode,
		type ModerationMode
	} from '$lib/api/admin/riskControl';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		DEFAULT_CONFIG,
		PAGE_SIZE,
		RESULT_ALL,
		apiKeyHealthSummary,
		auditResultSummary,
		cloneConfig,
		formatNumber,
		isValidHash,
		parseLines,
		statusTone,
		summarizeRisk
	} from '$lib/features/risk-control/risk-control';

	const MODE_OPTIONS: ModerationMode[] = ['pre_block', 'observe', 'off'];
	const KEYWORD_MODES: KeywordBlockingMode[] = ['keyword_and_api', 'keyword_only', 'api_only'];
	const RESULT_OPTIONS = ['hit', 'blocked', 'pass', 'error'];
	const modeOptions = MODE_OPTIONS.map((value) => ({ value, label: value }));
	const keywordModeOptions = KEYWORD_MODES.map((value) => ({ value, label: value }));
	const resultOptions = [
		{ value: RESULT_ALL, label: 'All results' },
		...RESULT_OPTIONS.map((value) => ({ value, label: value }))
	];
	const apiKeysModeOptions = [
		{ value: 'append', label: 'Append' },
		{ value: 'replace', label: 'Replace' }
	];

	let config = $state<ContentModerationConfig>(cloneConfig(DEFAULT_CONFIG));
	let status = $state<ContentModerationRuntimeStatus | null>(null);
	let loading = $state(false);
	let saving = $state(false);
	let testingKeys = $state(false);
	let hashLoading = $state(false);
	let clearHashesDialogOpen = $state(false);
	let loadError = $state<string | null>(null);
	let logsRefreshToken = $state(0);
	let apiKeysText = $state('');
	let apiKeysMode = $state<'append' | 'replace'>('append');
	let moderationPrompt = $state('');
	let testStatuses = $state<ContentModerationAPIKeyStatus[]>([]);
	let auditResult = $state<ContentModerationTestAuditResult | null>(null);
	let blockedKeywordsText = $state('');
	let modelFilterText = $state('');
	let thresholdsText = $state('');
	let hashInput = $state('');
	const summary = $derived(summarizeRisk(config, status, 0));
	const apiKeyRows = $derived(testStatuses.length ? testStatuses : (status?.api_key_statuses ?? config.api_key_statuses ?? []));
	const queueUsage = $derived(Math.min(100, Math.max(0, Number(status?.queue_usage_percent ?? 0))));

	async function loadAll() {
		loading = true;
		loadError = null;
		try {
			const [cfg, runtime] = await Promise.all([getRiskConfig(), getRiskStatus()]);
			applyConfig(cfg);
			status = runtime;
			} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function applyConfig(next: ContentModerationConfig) {
		config = cloneConfig(next);
		apiKeysText = '';
		apiKeysMode = 'append';
		blockedKeywordsText = config.blocked_keywords.join('\n');
		modelFilterText = config.model_filter.models.join('\n');
		thresholdsText = JSON.stringify(config.thresholds ?? {}, null, 2);
	}

	async function refreshStatus() {
		try {
			status = await getRiskStatus();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	async function saveConfig() {
		saving = true;
		try {
			let thresholds: Record<string, number> | undefined = undefined;
			if (thresholdsText.trim()) {
				thresholds = JSON.parse(thresholdsText) as Record<string, number>;
			}
			const keys = parseLines(apiKeysText);
			const updated = await updateRiskConfig({
				enabled: config.enabled,
				mode: config.mode,
				base_url: config.base_url,
				model: config.model,
				timeout_ms: Number(config.timeout_ms) || 3000,
				retry_count: Number(config.retry_count) || 0,
				sample_rate: Number(config.sample_rate) || 0,
				all_groups: config.all_groups,
				group_ids: config.group_ids,
				record_non_hits: config.record_non_hits,
				worker_count: Number(config.worker_count) || 4,
				queue_size: Number(config.queue_size) || 32768,
				block_status: Number(config.block_status) || 403,
				block_message: config.block_message,
				email_on_hit: config.email_on_hit,
				auto_ban_enabled: config.auto_ban_enabled,
				ban_threshold: Number(config.ban_threshold) || 10,
				violation_window_hours: Number(config.violation_window_hours) || 720,
				hit_retention_days: Number(config.hit_retention_days) || 180,
				non_hit_retention_days: Number(config.non_hit_retention_days) || 3,
				pre_hash_check_enabled: config.pre_hash_check_enabled,
				blocked_keywords: parseLines(blockedKeywordsText),
				keyword_blocking_mode: config.keyword_blocking_mode,
				model_filter: { type: config.model_filter.type, models: parseLines(modelFilterText) },
				thresholds,
				api_keys: keys.length ? keys : undefined,
				api_keys_mode: keys.length ? apiKeysMode : undefined
			});
			applyConfig(updated);
			showSuccess('Risk-control configuration saved');
			await refreshStatus(); logsRefreshToken++;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function testKeys(useInputKeys: boolean) {
		const keys = useInputKeys ? parseLines(apiKeysText) : [];
		if (useInputKeys && keys.length === 0) {
			showError('Enter API keys to test');
			return;
		}
		testingKeys = true;
		try {
			const result = await testRiskApiKeys({
				api_keys: keys,
				base_url: config.base_url,
				model: config.model,
				timeout_ms: Number(config.timeout_ms) || 3000,
				prompt: moderationPrompt
			});
			testStatuses = result.items;
			auditResult = result.audit_result ?? null;
			showSuccess(`Tested ${result.items.length} API keys`);
			await refreshStatus();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			testingKeys = false;
		}
	}

	async function deleteHash() {
		if (!isValidHash(hashInput)) {
			showError('Enter a 64-character hash');
			return;
		}
		hashLoading = true;
		try {
			const result = await deleteFlaggedHash(hashInput.trim());
			hashInput = '';
			showSuccess(result.deleted ? 'Flagged hash deleted' : 'Flagged hash not found');
			await refreshStatus();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			hashLoading = false;
		}
	}

	function openClearHashesDialog() {
		clearHashesDialogOpen = true;
	}

	async function confirmClearHashes() {
		hashLoading = true;
		try {
			const result = await clearFlaggedHashes();
			clearHashesDialogOpen = false;
			showSuccess(`Cleared ${result.deleted} flagged hashes`);
			await refreshStatus();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			hashLoading = false;
		}
	}

	onMount(() => {
		void loadAll();
	});
</script>

<svelte:head>
	<title>{$_('admin.riskControl.title', { default: 'Risk Control' })}</title>
</svelte:head>

<section class="space-y-4 px-5 py-5" data-testid="admin-risk-control-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('admin.riskControl.title', { default: 'Risk Control' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('admin.riskControl.description', { default: 'Configure moderation, inspect runtime queues, and handle blocked users.' })}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="outline" onclick={loadAll} disabled={loading}>
				<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />Refresh
			</Button>
			<Button onclick={saveConfig} disabled={saving}>
				<Save size={15} />Save
			</Button>
		</div>
	</header>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
						<p class="mt-1 text-2xl font-semibold">{item.value}</p>
						<p class="text-xs text-muted-foreground">{item.meta}</p>
					</div>
					{#if item.label === 'Status'}
						<Shield class="h-5 w-5 text-muted-foreground" />
					{:else if item.label === 'API keys'}
						<KeyRound class="h-5 w-5 text-muted-foreground" />
					{:else if item.label === 'Queue'}
						<Database class="h-5 w-5 text-muted-foreground" />
					{:else}
						<AlertTriangle class="h-5 w-5 text-muted-foreground" />
					{/if}
				</div>
			</Card>
		{/each}
	</section>

	<section class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
		<Card class="p-3">
			<div class="grid gap-3 lg:grid-cols-3">
				<label class="flex min-h-16 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm"><Checkbox bind:checked={config.enabled} /><span><span class="block text-xs text-muted-foreground">Enabled</span><span class="font-medium">{config.enabled ? 'Enabled' : 'Disabled'}</span></span></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Mode</span><NativeSelect bind:value={config.mode} options={modeOptions} /></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Keyword mode</span><NativeSelect bind:value={config.keyword_blocking_mode} options={keywordModeOptions} /></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Base URL</span><Input bind:value={config.base_url} /></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Model</span><Input bind:value={config.model} /></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Timeout ms</span><Input type="number" min="100" bind:value={config.timeout_ms} /></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Workers</span><Input type="number" min="1" bind:value={config.worker_count} /></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Queue size</span><Input type="number" min="1" bind:value={config.queue_size} /></label>
				<label class="space-y-1 text-sm"><span class="text-xs text-muted-foreground">Sample rate</span><Input type="number" min="0" max="100" bind:value={config.sample_rate} /></label>
			</div>
			<div class="mt-3 grid gap-3 lg:grid-cols-2">
				<label class="space-y-1 text-sm">
					<span class="text-xs text-muted-foreground">Blocked keywords</span>
					<Textarea class="min-h-28 font-mono text-xs" bind:value={blockedKeywordsText} />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-xs text-muted-foreground">Thresholds JSON</span>
					<Textarea class="min-h-28 font-mono text-xs" bind:value={thresholdsText} />
				</label>
			</div>
		</Card>

		<Card class="p-3">
			<h2 class="text-sm font-semibold">Runtime</h2>
			<div class="mt-3 space-y-3">
				<div>
					<div class="flex justify-between text-xs text-muted-foreground"><span>Queue usage</span><span>{Math.round(queueUsage * 10) / 10}%</span></div>
					<div class="mt-1 h-2 overflow-hidden rounded bg-muted">
						<div class="h-full bg-primary" style={`width:${queueUsage}%`}></div>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="rounded-md border bg-background p-2"><p class="text-xs text-muted-foreground">Processed</p><p class="text-lg font-semibold">{formatNumber(status?.processed)}</p></div>
					<div class="rounded-md border bg-background p-2"><p class="text-xs text-muted-foreground">Errors</p><p class="text-lg font-semibold">{formatNumber(status?.errors)}</p></div>
					<div class="rounded-md border bg-background p-2"><p class="text-xs text-muted-foreground">Blocked</p><p class="text-lg font-semibold">{formatNumber(status?.pre_block_blocked)}</p></div>
					<div class="rounded-md border bg-background p-2"><p class="text-xs text-muted-foreground">Latency</p><p class="text-lg font-semibold">{formatNumber(status?.pre_block_avg_latency_ms)} ms</p></div>
				</div>
			</div>
		</Card>
	</section>

	<section class="grid gap-3 xl:grid-cols-2">
		<Card class="p-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold">API key test</h2>
				<span class="text-xs text-muted-foreground">{apiKeyHealthSummary(apiKeyRows)}</span>
			</div>
			<div class="mt-3 space-y-3">
				<div class="grid gap-2 md:grid-cols-[1fr_120px]">
					<Textarea class="font-mono text-xs" placeholder="Optional keys to test, one per line" bind:value={apiKeysText} />
					<NativeSelect bind:value={apiKeysMode} options={apiKeysModeOptions} />
				</div>
				<Textarea placeholder="Optional moderation test prompt" bind:value={moderationPrompt} />
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" disabled={testingKeys} onclick={() => testKeys(false)}>Test stored keys</Button>
					<Button variant="outline" disabled={testingKeys} onclick={() => testKeys(true)}>Test input keys</Button>
				</div>
				<p class="text-sm text-muted-foreground">{auditResultSummary(auditResult)}</p>
				<div class="space-y-2">
					{#each apiKeyRows.slice(0, 5) as row}
						<div class="flex items-center justify-between rounded-md border bg-background px-2 py-2 text-sm">
							<span class="font-mono text-xs">{row.masked || `#${row.index}`}</span>
							<Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge>
						</div>
					{/each}
				</div>
			</div>
		</Card>

		<Card class="p-3"><h2 class="text-sm font-semibold">Flagged hash controls</h2>
			<div class="mt-3 space-y-3">
				<div class="flex gap-2"><Input class="min-w-0 flex-1 font-mono text-xs" placeholder="64-char input hash" bind:value={hashInput} /><Button variant="outline" disabled={hashLoading || !isValidHash(hashInput)} onclick={deleteHash}><Trash2 size={14} />Delete</Button></div>
				<Button variant="outline" class="border-destructive/30 text-destructive" disabled={hashLoading} onclick={openClearHashesDialog}><AlertTriangle size={14} />Clear all</Button>
				<p class="text-sm text-muted-foreground">Flagged hashes: {formatNumber(status?.flagged_hash_count)}</p>
			</div></Card>
	</section>

	<RiskLogsPanel refreshToken={logsRefreshToken} />

	<StandardDialog bind:open={clearHashesDialogOpen} title="Clear flagged hashes" width="sm" data-testid="risk-clear-hashes-dialog">
		<div class="mt-4 space-y-4">
			<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Clear all flagged hashes? This cannot be undone.</p>
			<div class="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onclick={() => (clearHashesDialogOpen = false)}>Cancel</Button><Button variant="outline" class="border-destructive/30 text-destructive" disabled={hashLoading} onclick={confirmClearHashes} data-testid="risk-clear-hashes-confirm">{hashLoading ? 'Clearing...' : 'Clear'}</Button></div>
		</div>
	</StandardDialog>
</section>
