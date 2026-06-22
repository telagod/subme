<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Inbox, RefreshCw, Search, Shield, Users } from '@lucide/svelte';
	import {
		getAvailableChannels,
		type UserAvailableChannel,
		type UserAvailableGroup,
		type UserSupportedModel
	} from '$lib/api/user/channels';
	import { getUserGroupRates } from '$lib/api/user/groups';
	import { showError } from '$lib/stores/toast.svelte';
	import {
		exclusiveGroups,
		filterAvailableChannels,
		groupRateLabel,
		modelPricingLabel,
		platformTone,
		publicGroups
	} from '$lib/features/available-channels/available-channels';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	let channels = $state<UserAvailableChannel[]>([]);
	let userGroupRates = $state<Record<number, number>>({});
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let searchQuery = $state('');

	const filteredChannels = $derived(filterAvailableChannels(channels, searchQuery));

	async function loadChannels() {
		loading = true;
		loadError = null;
		try {
			const [list, rates] = await Promise.all([
				getAvailableChannels(),
				getUserGroupRates().catch(() => ({} as Record<number, number>))
			]);
			channels = list;
			userGroupRates = rates;
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg !== 'unauthorized') {
				loadError = msg || 'Failed to load available channels';
				showError(loadError);
			}
			channels = [];
		} finally {
			loading = false;
		}
	}

	function groupBadgeClass(group: UserAvailableGroup): string {
		return group.is_exclusive
			? 'border-primary/30 bg-primary/10 text-primary'
			: 'border-border bg-background text-foreground';
	}

	function modelTitle(model: UserSupportedModel): string {
		const pricing = model.pricing;
		if (!pricing) return $_('availableChannels.noPricing', { default: '未配置定价' });
		if (pricing.intervals?.length) {
			return `${modelPricingLabel(model)} · ${pricing.intervals.length} tiers`;
		}
		return modelPricingLabel(model);
	}

	onMount(() => {
		void loadChannels();
	});
</script>

<svelte:head>
	<title>{$_('nav.availableChannels', { default: '可用渠道' })} · sub2api</title>
</svelte:head>

<section class="space-y-5" data-testid="available-channels-page">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('nav.availableChannels', { default: '可用渠道' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('availableChannels.description', { default: '查看您账户可用的渠道、分组、模型和可见定价。' })}
			</p>
		</div>
		<Button
			variant="outline"
			class="h-9 gap-2 text-muted-foreground"
			onclick={loadChannels}
			disabled={loading}
		>
			<RefreshCw class={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
			{$_('common.refresh', { default: '刷新' })}
		</Button>
	</header>

	<div class="rounded-lg border border-border bg-card p-3">
		<label class="relative block">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				class="h-10 pl-9"
				type="search"
				bind:value={searchQuery}
				data-testid="available-channels-search"
				placeholder={$_('availableChannels.searchPlaceholder', { default: '搜索渠道或模型...' })}
			/>
		</label>
	</div>

	{#if loadError}
		<Alert variant="destructive">
			{loadError}
		</Alert>
	{/if}

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<div class="grid min-w-[980px] grid-cols-[180px_220px_140px_minmax(260px,1fr)_minmax(280px,1.2fr)] border-b bg-muted/60 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
			<div>{$_('availableChannels.columns.name', { default: '渠道' })}</div>
			<div>{$_('availableChannels.columns.description', { default: '描述' })}</div>
			<div>{$_('availableChannels.columns.platform', { default: '平台' })}</div>
			<div>{$_('availableChannels.columns.groups', { default: '您可访问的分组' })}</div>
			<div>{$_('availableChannels.columns.supportedModels', { default: '已支持的模型' })}</div>
		</div>

		{#if loading}
			<div class="flex min-h-48 items-center justify-center" data-testid="available-channels-loading">
				<RefreshCw class="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		{:else if filteredChannels.length === 0}
			<div class="flex min-h-56 flex-col items-center justify-center text-center" data-testid="available-channels-empty">
				<Inbox class="mb-3 h-10 w-10 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">
					{$_('availableChannels.empty', { default: '暂无可用渠道' })}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				{#each filteredChannels as channel}
					<div class="min-w-[980px] border-b border-border last:border-b-0" data-testid="available-channel-row">
						{#each channel.platforms as section, secIdx}
							<div class="grid grid-cols-[180px_220px_140px_minmax(260px,1fr)_minmax(280px,1.2fr)] gap-0 border-border px-4 py-3 text-sm {secIdx > 0 ? 'border-t' : ''}">
								{#if secIdx === 0}
									<div class="row-span-full pr-4 font-medium text-foreground">{channel.name}</div>
									<div class="pr-4 text-xs text-muted-foreground">{channel.description || '-'}</div>
								{:else}
									<div></div>
									<div></div>
								{/if}
								<div>
									<span class={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase ${platformTone(section.platform)}`}>
										{section.platform}
									</span>
								</div>
								<div class="space-y-2">
									{#if exclusiveGroups(section).length}
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-primary">
												<Shield class="h-3 w-3" />
												{$_('availableChannels.exclusive', { default: '专属' })}
											</span>
											{#each exclusiveGroups(section) as group}
												<span class={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${groupBadgeClass(group)}`}>
													{group.name}
													<span class="font-mono text-[10px] text-muted-foreground">{groupRateLabel(group, userGroupRates)}</span>
												</span>
											{/each}
										</div>
									{/if}
									{#if publicGroups(section).length}
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
												<Users class="h-3 w-3" />
												{$_('availableChannels.public', { default: '公开' })}
											</span>
											{#each publicGroups(section) as group}
												<span class={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${groupBadgeClass(group)}`}>
													{group.name}
													<span class="font-mono text-[10px] text-muted-foreground">{groupRateLabel(group, userGroupRates)}</span>
												</span>
											{/each}
										</div>
									{/if}
									{#if section.groups.length === 0}
										<span class="text-xs text-muted-foreground">-</span>
									{/if}
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each section.supported_models as model}
										<span
											class={`inline-flex cursor-help items-center rounded-md border px-2 py-0.5 text-xs ${platformTone(model.platform || section.platform)}`}
											title={modelTitle(model)}
										>
											{model.name}
										</span>
									{/each}
									{#if section.supported_models.length === 0}
										<span class="text-xs text-muted-foreground">
											{$_('availableChannels.noModels', { default: '暂未配置模型' })}
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>
