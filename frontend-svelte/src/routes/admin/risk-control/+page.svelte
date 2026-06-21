<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		AlertTriangle,
		Database,
		KeyRound,
		RefreshCw,
		Settings,
		Shield,
		Trash2,
		Users
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import RiskLogsPanel from '$lib/features/risk-control/RiskLogsPanel.svelte';
	import RuntimePanel from '$lib/features/risk-control/RuntimePanel.svelte';
	import RiskSettingsDialog from '$lib/features/risk-control/RiskSettingsDialog.svelte';
	import {
		getRiskConfig,
		getRiskStatus,
		testRiskApiKeys,
		deleteFlaggedHash,
		clearFlaggedHashes,
		type ContentModerationAPIKeyStatus,
		type ContentModerationConfig,
		type ContentModerationRuntimeStatus,
		type ContentModerationTestAuditResult
	} from '$lib/api/admin/riskControl';
	import { listAllGroups, type AdminGroup } from '$lib/api/admin/groups';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		DEFAULT_CONFIG,
		apiKeyHealthSummary,
		auditResultSummary,
		cloneConfig,
		formatNumber,
		isValidHash,
		modeLabel,
		modelFilterSummary,
		parseLines,
		runtimeEnabled,
		statusTone
	} from '$lib/features/risk-control/risk-control';

	let config = $state<ContentModerationConfig>(cloneConfig(DEFAULT_CONFIG));
	let status = $state<ContentModerationRuntimeStatus | null>(null);
	let groups = $state<AdminGroup[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let settingsOpen = $state(false);
	let testingKeys = $state(false);
	let hashLoading = $state(false);
	let clearHashesDialogOpen = $state(false);
	let logsRefreshToken = $state(0);

	// API key test state
	let apiKeysText = $state('');
	let moderationPrompt = $state('');
	let testStatuses = $state<ContentModerationAPIKeyStatus[]>([]);
	let auditResult = $state<ContentModerationTestAuditResult | null>(null);
	let hashInput = $state('');

	const apiKeyRows = $derived(
		testStatuses.length
			? testStatuses
			: (status?.api_key_statuses ?? config.api_key_statuses ?? [])
	);

	const summary = $derived([
		{
			label: $_('admin.riskControl.overview.status', { default: 'Status' }),
			value: config.enabled
				? $_('admin.riskControl.overview.enabled', { default: 'Enabled' })
				: $_('admin.riskControl.overview.disabled', { default: 'Disabled' }),
			meta: `${modeLabel(config.mode)} · ${runtimeEnabled(config, status) ? 'runtime on' : 'runtime off'}`,
			icon: Shield,
			tone: config.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
		},
		{
			label: $_('admin.riskControl.overview.apiKey', { default: 'API Keys' }),
			value: config.api_key_configured ? String(config.api_key_count || 1) : '0',
			meta: apiKeyHealthSummary(status?.api_key_statuses ?? config.api_key_statuses),
			icon: KeyRound,
			tone: ''
		},
		{
			label: $_('admin.riskControl.overview.groupScope', { default: 'Scope' }),
			value: config.all_groups
				? $_('admin.riskControl.allGroups', { default: 'All groups' })
				: `${config.group_ids.length} group(s)`,
			meta: modelFilterSummary(config.model_filter.type, config.model_filter.models.length),
			icon: Users,
			tone: ''
		},
		{
			label: $_('admin.riskControl.overview.logs', { default: 'Flagged' }),
			value: formatNumber(status?.flagged_hash_count),
			meta: `${formatNumber(status?.pre_block_blocked)} blocked`,
			icon: AlertTriangle,
			tone: ''
		}
	]);

	async function loadAll() {
		loading = true;
		loadError = null;
		try {
			const [cfg, runtime, groupList] = await Promise.all([
				getRiskConfig(),
				getRiskStatus(),
				listAllGroups()
			]);
			config = cloneConfig(cfg);
			status = runtime;
			groups = groupList;
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function handleConfigSaved(updated: ContentModerationConfig) {
		config = cloneConfig(updated);
		logsRefreshToken++;
	}

	async function testKeys(useInputKeys: boolean) {
		const keys = useInputKeys ? parseLines(apiKeysText) : [];
		if (useInputKeys && keys.length === 0) {
			showError($_('admin.riskControl.apiKeyTestNoInput', { default: 'Enter API keys to test' }));
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
			showSuccess(`Tested ${result.items.length} API key(s)`);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			testingKeys = false;
		}
	}

	async function deleteHash() {
		if (!isValidHash(hashInput)) {
			showError($_('admin.riskControl.hashInvalid', { default: 'Enter a 64-character hex hash' }));
			return;
		}
		hashLoading = true;
		try {
			const result = await deleteFlaggedHash(hashInput.trim());
			hashInput = '';
			showSuccess(result.deleted ? 'Flagged hash deleted' : 'Flagged hash not found');
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			hashLoading = false;
		}
	}

	async function confirmClearHashes() {
		hashLoading = true;
		try {
			const result = await clearFlaggedHashes();
			clearHashesDialogOpen = false;
			showSuccess(`Cleared ${result.deleted} flagged hashes`);
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
	<!-- Header -->
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
				<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />
				{$_('admin.riskControl.refreshStatus', { default: 'Refresh' })}
			</Button>
			<Button onclick={() => (settingsOpen = true)}>
				<Settings size={15} />
				{$_('admin.riskControl.openSettings', { default: 'Settings' })}
			</Button>
		</div>
	</header>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<!-- Overview cards -->
	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
						<p class="mt-1 text-2xl font-semibold {item.tone}">{item.value}</p>
						<p class="truncate text-xs text-muted-foreground">{item.meta}</p>
					</div>
					<item.icon class="h-5 w-5 shrink-0 text-muted-foreground" />
				</div>
			</Card>
		{/each}
	</section>

	<!-- Runtime panel (auto-refreshing) + API key test side by side -->
	<section class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
		<RuntimePanel bind:status mode={config.mode} enabled={config.enabled} />

		<div class="space-y-3">
			<!-- API key test card -->
			<Card class="p-3">
				<div class="flex items-center justify-between gap-3">
					<h2 class="text-sm font-semibold">
						{$_('admin.riskControl.apiKeyTest', { default: 'API Key Test' })}
					</h2>
					<span class="text-xs text-muted-foreground">{apiKeyHealthSummary(apiKeyRows)}</span>
				</div>
				<div class="mt-3 space-y-3">
					<Textarea
						class="font-mono text-xs"
						placeholder={$_('admin.riskControl.apiKeysPlaceholder', { default: 'Optional keys to test, one per line' })}
						bind:value={apiKeysText}
					/>
					<Textarea
						placeholder={$_('admin.riskControl.auditTestPromptPlaceholder', { default: 'Optional moderation test prompt' })}
						bind:value={moderationPrompt}
					/>
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" disabled={testingKeys} onclick={() => testKeys(false)}>
							{$_('admin.riskControl.testStoredApiKeys', { default: 'Test stored' })}
						</Button>
						<Button variant="outline" size="sm" disabled={testingKeys} onclick={() => testKeys(true)}>
							{$_('admin.riskControl.testInputApiKeys', { default: 'Test input' })}
						</Button>
					</div>
					<p class="text-xs text-muted-foreground">{auditResultSummary(auditResult)}</p>
					<div class="max-h-40 space-y-1.5 overflow-y-auto pr-1">
						{#each apiKeyRows.slice(0, 8) as row}
							<div class="flex items-center justify-between rounded-md border bg-background px-2 py-1.5 text-sm">
								<span class="truncate font-mono text-xs">{row.masked || `#${row.index}`}</span>
								<Badge variant="outline" class="shrink-0 text-[11px] {statusTone(row.status)}">{row.status}</Badge>
							</div>
						{/each}
					</div>
				</div>
			</Card>

			<!-- Flagged hash controls -->
			<Card class="p-3">
				<h2 class="text-sm font-semibold">
					{$_('admin.riskControl.flaggedHashControls', { default: 'Flagged Hash Controls' })}
				</h2>
				<div class="mt-3 space-y-3">
					<div class="flex gap-2">
						<Input
							class="min-w-0 flex-1 font-mono text-xs"
							placeholder={$_('admin.riskControl.flaggedHashPlaceholder', { default: '64-char input hash' })}
							bind:value={hashInput}
						/>
						<Button
							variant="outline"
							disabled={hashLoading || !isValidHash(hashInput)}
							onclick={deleteHash}
						>
							<Trash2 size={14} />
							{$_('admin.riskControl.deleteFlaggedHash', { default: 'Delete' })}
						</Button>
					</div>
					<Button
						variant="outline"
						class="border-destructive/30 text-destructive"
						disabled={hashLoading}
						onclick={() => (clearHashesDialogOpen = true)}
					>
						<AlertTriangle size={14} />
						{$_('admin.riskControl.clearFlaggedHashes', { default: 'Clear all' })}
					</Button>
					<p class="text-sm text-muted-foreground">
						{$_('admin.riskControl.flaggedHashCount', {
							default: '{count} flagged hashes',
							values: { count: formatNumber(status?.flagged_hash_count) }
						})}
					</p>
				</div>
			</Card>
		</div>
	</section>

	<!-- Logs panel -->
	<RiskLogsPanel refreshToken={logsRefreshToken} />

	<!-- Settings dialog (all 7 tabs) -->
	<RiskSettingsDialog bind:open={settingsOpen} {config} {groups} onsaved={handleConfigSaved} />

	<!-- Clear hashes confirmation -->
	<StandardDialog bind:open={clearHashesDialogOpen} title="Clear flagged hashes" width="sm" data-testid="risk-clear-hashes-dialog">
		<div class="mt-4 space-y-4">
			<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{$_('admin.riskControl.clearFlaggedHashesConfirm', { default: 'Clear all flagged hashes? This cannot be undone.' })}
			</p>
			<div class="flex justify-end gap-2 border-t border-border pt-4">
				<Button variant="outline" onclick={() => (clearHashesDialogOpen = false)}>
					{$_('common.cancel', { default: 'Cancel' })}
				</Button>
				<Button
					variant="outline"
					class="border-destructive/30 text-destructive"
					disabled={hashLoading}
					onclick={confirmClearHashes}
					data-testid="risk-clear-hashes-confirm"
				>
					{hashLoading
						? $_('common.processing', { default: 'Clearing...' })
						: $_('admin.riskControl.clearFlaggedHashes', { default: 'Clear' })}
				</Button>
			</div>
		</div>
	</StandardDialog>
</section>
