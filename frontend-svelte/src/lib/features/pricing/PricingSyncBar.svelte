<script lang="ts">
	/**
	 * PricingSyncBar — Filter bar + provider pill tabs for the pricing desk.
	 *
	 * Owns: search input, sort select, provider filter select, only-overridden
	 * checkbox, provider pill tabs, and the visible count display.
	 * State is held here but bindable so the page can feed it to derived computations.
	 */
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import { ALL_SENTINEL } from '$lib/utils/pricing';

	type SortKey =
		| 'alpha-asc'
		| 'input-asc'
		| 'input-desc'
		| 'output-asc'
		| 'output-desc'
		| 'context-desc';

	interface ProviderTab {
		key: string;
		label: string;
		count: number;
	}

	type Props = {
		searchInput: string;
		sortKey: SortKey;
		activeProvider: string;
		onlyOverridden: boolean;
		providerTabs: ProviderTab[];
		filteredCount: number;
		totalCount: number;
	};

	let {
		searchInput = $bindable(''),
		sortKey = $bindable('alpha-asc' as SortKey),
		activeProvider = $bindable(ALL_SENTINEL),
		onlyOverridden = $bindable(false),
		providerTabs,
		filteredCount,
		totalCount
	}: Props = $props();
</script>

<!-- Filter bar -->
<Card
	class="flex flex-wrap items-center gap-2 p-2"
	data-testid="pricing-filters"
>
	<div class="relative">
		<Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
		<Input
			type="search"
			class="h-8 w-56 pl-7 pr-2"
			placeholder={$_('admin.pricingList.search.placeholder', {
				default: '按模型 ID 或名称搜索…'
			})}
			bind:value={searchInput}
			data-testid="pricing-search"
		/>
	</div>

	<label class="ml-1 text-xs text-muted-foreground" for="pricing-sort">
		{$_('admin.pricingList.sort.label', { default: '排序' })}
	</label>
	<!--
		Sort NativeSelect — uses enum values directly. Memory `reshadcn-migration`:
		NO value="" allowed; every option has a real business value.
	-->
	<NativeSelect
		id="pricing-sort"
		class="h-8"
		bind:value={sortKey}
		data-testid="pricing-sort"
	>
		<option value="alpha-asc">
			{$_('admin.pricingList.sort.alphaAsc', { default: '模型 A-Z' })}
		</option>
		<option value="input-asc">
			{$_('admin.pricingList.sort.inputAsc', { default: '输入价格升序' })}
		</option>
		<option value="input-desc">
			{$_('admin.pricingList.sort.inputDesc', { default: '输入价格降序' })}
		</option>
		<option value="output-asc">
			{$_('admin.pricingList.sort.outputAsc', { default: '输出价格升序' })}
		</option>
		<option value="output-desc">
			{$_('admin.pricingList.sort.outputDesc', { default: '输出价格降序' })}
		</option>
		<option value="context-desc">
			{$_('admin.pricingList.sort.contextDesc', { default: '上下文窗口描述' })}
		</option>
	</NativeSelect>

	<!--
		Provider filter NativeSelect — kept for accessibility / test contract.
		Sentinel: ALL_SENTINEL '__all__'. Pill tabs below are the primary UI;
		this select exists for screen reader / keyboard fallback.
	-->
	<label class="ml-2 text-xs text-muted-foreground" for="pricing-provider-filter">
		{$_('admin.pricingList.provider.label', { default: '供应商' })}
	</label>
	<NativeSelect
		id="pricing-provider-filter"
		class="h-8"
		bind:value={activeProvider}
		data-testid="pricing-provider-filter"
	>
		<option value={ALL_SENTINEL}>
			{$_('admin.pricingList.provider.allOption', { default: '全部供应商' })}
		</option>
	{#each providerTabs.slice(1) as t (t.key)}
		<option value={t.key}>{t.label}</option>
	{/each}
	</NativeSelect>

	<!-- only-overridden switch -->
	<label class="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
		<Checkbox
			class="h-3.5 w-3.5"
			bind:checked={onlyOverridden}
			data-testid="pricing-only-overridden"
		/>
		{$_('admin.pricingList.onlyOverridden', { default: '仅覆盖项' })}
	</label>

	<div class="ml-auto text-xs text-muted-foreground tabular-nums">
		{filteredCount} / {totalCount}
	</div>
</Card>

<!-- Provider pill tabs -->
<div class="flex flex-wrap gap-1.5" data-testid="pricing-provider-tabs">
	{#each providerTabs as t (t.key)}
		<Button
			variant={activeProvider === t.key ? 'default' : 'secondary'}
			size="sm"
			class="h-[26px] rounded-full px-2.5 text-[11.5px] leading-none"
			onclick={() => (activeProvider = t.key)}
			data-testid="pricing-provider-pill"
			data-pill-key={t.key}
		>
			<span>{t.label}</span>
			<span class="ml-1 tabular-nums opacity-75">{t.count}</span>
		</Button>
	{/each}
</div>
