<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ChevronDown, ChevronUp, Search, X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import { ALL } from '$lib/features/supply/supply';

	type Props = {
		search: string;
		platform: string;
		type: string;
		status: string;
		group: string;
		privacy: string;
		schedulable: string;
		hasProxy: string;
		onApply: () => void;
	};
	let {
		search = $bindable(''),
		platform = $bindable(ALL),
		type = $bindable(ALL),
		status = $bindable(ALL),
		group = $bindable(''),
		privacy = $bindable(ALL),
		schedulable = $bindable(ALL),
		hasProxy = $bindable(ALL),
		onApply
	}: Props = $props();

	let showAdvanced = $state(false);

	const PLATFORMS = ['claude', 'openai', 'gemini', 'sora', 'codex', 'antigravity'];
	const STATUS_OPTIONS = ['active', 'inactive', 'error', 'rate_limited', 'temp_unschedulable', 'unschedulable'];

	const platformOptions = $derived([
		{ value: ALL, label: $_('admin.accounts.allPlatforms', { default: '全部平台' }) },
		...PLATFORMS.map(v => ({ value: v, label: v }))
	]);
	const typeOptions = [
		{ value: ALL, label: $_('admin.accounts.allTypes', { default: '全部类型' }) },
		{ value: 'api_key', label: 'API Key' },
		{ value: 'apikey', label: 'apikey' },
		{ value: 'oauth', label: 'OAuth' },
		{ value: 'setup-token', label: 'Setup Token' },
		{ value: 'bedrock', label: 'AWS Bedrock' }
	];
	const statusOptions = $derived([
		{ value: ALL, label: $_('admin.accounts.allStatuses', { default: '全部状态' }) },
		...STATUS_OPTIONS.map(v => ({ value: v, label: v }))
	]);
	const privacyOptions = [
		{ value: ALL, label: $_('admin.accounts.anyPrivacy', { default: '全部隐私模式' }) },
		{ value: '__unset__', label: $_('admin.accounts.privacyUnset', { default: '未设置' }) },
		{ value: 'training_off', label: $_('admin.accounts.privacyOff', { default: '已关闭训练' }) },
		{ value: 'training_set_cf_blocked', label: 'CF Blocked' },
		{ value: 'training_set_failed', label: $_('admin.accounts.privacyFailed', { default: '设置失败' }) }
	];
	const boolOpts = [
		{ value: ALL, label: $_('admin.accounts.any', { default: '不限' }) },
		{ value: 'true', label: $_('common.yes', { default: '是' }) },
		{ value: 'false', label: $_('common.no', { default: '否' }) }
	];

	const activeFilterCount = $derived(
		[search.trim(), platform !== ALL, type !== ALL, status !== ALL, group.trim(), privacy !== ALL, schedulable !== ALL, hasProxy !== ALL]
			.filter(Boolean).length
	);

	function clearAll() {
		search = ''; platform = ALL; type = ALL; status = ALL;
		group = ''; privacy = ALL; schedulable = ALL; hasProxy = ALL;
		onApply();
	}
</script>

<div class="space-y-2" data-testid="account-filter-bar">
	<!-- Primary row: search + main filters -->
	<div class="flex flex-wrap items-center gap-2">
		<label class="relative min-w-[200px] flex-1 sm:max-w-xs">
			<Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={14} />
			<Input class="h-9 pl-8 text-sm" placeholder={$_('admin.accounts.searchPlaceholder', { default: '搜索账号名 / email...' })} bind:value={search} onkeydown={(e) => e.key === 'Enter' && onApply()} data-testid="accounts-search" />
		</label>
		<NativeSelect class="h-9 w-auto min-w-[120px] text-sm" bind:value={platform} options={platformOptions} onchange={onApply} data-testid="accounts-platform-filter" />
		<NativeSelect class="h-9 w-auto min-w-[120px] text-sm" bind:value={type} options={typeOptions} onchange={onApply} data-testid="accounts-type-filter" />
		<NativeSelect class="h-9 w-auto min-w-[120px] text-sm" bind:value={status} options={statusOptions} onchange={onApply} data-testid="accounts-status-filter" />
		<Button variant="outline" size="sm" class="h-9 gap-1" onclick={() => (showAdvanced = !showAdvanced)}>
			{#if showAdvanced}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
			{$_('admin.accounts.advanced', { default: '高级' })}
			{#if activeFilterCount > 4}<span class="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilterCount - 4}</span>{/if}
		</Button>
		<Button size="sm" class="h-9" onclick={onApply}>{$_('common.apply', { default: '筛选' })}</Button>
		{#if activeFilterCount > 0}
			<Button variant="ghost" size="sm" class="h-9 text-muted-foreground" onclick={clearAll}>
				<X size={14} /> {$_('common.clearAll', { default: '清除' })}
			</Button>
		{/if}
	</div>

	<!-- Advanced filters (collapsed by default) -->
	{#if showAdvanced}
		<div class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
			<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
				{$_('admin.accounts.groupLabel', { default: '分组 ID' })}
				<Input class="h-8 w-24 text-xs" placeholder="e.g. 7" bind:value={group} onkeydown={(e) => e.key === 'Enter' && onApply()} data-testid="accounts-group-filter" />
			</label>
			<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
				{$_('admin.accounts.privacyLabel', { default: '隐私模式' })}
				<NativeSelect class="h-8 text-xs" bind:value={privacy} options={privacyOptions} onchange={onApply} data-testid="accounts-privacy-filter" />
			</label>
			<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
				{$_('admin.accounts.schedulableLabel', { default: '可调度' })}
				<NativeSelect class="h-8 text-xs" bind:value={schedulable} options={boolOpts} onchange={onApply} data-testid="accounts-schedulable-filter" />
			</label>
			<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
				{$_('admin.accounts.hasProxyLabel', { default: '有代理' })}
				<NativeSelect class="h-8 text-xs" bind:value={hasProxy} options={boolOpts} onchange={onApply} data-testid="accounts-has-proxy-filter" />
			</label>
		</div>
	{/if}
</div>
