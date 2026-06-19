<script lang="ts">
	/**
	 * OrdersFilterBar · /(admin)/orders/list filter strip（M12）
	 *
	 * 受控组件：所有筛选项以 $bindable props 暴露给父页。
	 *   - 日期 from / to
	 *   - status（'__all__' 哨兵 + 12 个 OrderStatus 枚举）
	 *   - provider（'__all__' 哨兵 + 动态 options）
	 *   - user search（keyword）
	 *   - plan（'__all__' 哨兵 + 动态 options）
	 *
	 * 红线（sentinel 契约 · POC 3 Select 哨兵铁律）：
	 *   - 所有 Select 一律 '__all__' 哨兵，禁 value=""；
	 *   - 父页传 statusOptions / providerOptions / planOptions 时，调用方
	 *     必须自带哨兵作为第一项（与 subscriptions page 的契约一致）。
	 *   - 哨兵 ↔ 业务值转换在父页 `loadOrders` 内完成；本组件不发请求。
	 *
	 * 设计：
	 *   - 不发 API 请求。变化通过 bindable 与 onChange 回调反馈给父。
	 *   - 父页约定：filter 任意维度变化 → 回到 page=1 → 重拉。
	 */
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';

	type Option = { value: string; label: string };

	type Props = {
		status: string;
		provider: string;
		plan: string;
		keyword: string;
		startDate: string;
		endDate: string;
		statusOptions: Option[];
		providerOptions: Option[];
		planOptions: Option[];
		onChange?: () => void;
		onSubmit?: () => void;
	};

	let {
		status = $bindable('__all__'),
		provider = $bindable('__all__'),
		plan = $bindable('__all__'),
		keyword = $bindable(''),
		startDate = $bindable(''),
		endDate = $bindable(''),
		statusOptions,
		providerOptions,
		planOptions,
		onChange,
		onSubmit
	}: Props = $props();

	function dispatchChange() {
		onChange?.();
	}

	function handleKeywordKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			onSubmit?.();
		}
	}
</script>

<div
	class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
	data-testid="admin-orders-filters"
>
	<div class="relative">
		<Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
		<input
			type="search"
			class="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			placeholder={$_('admin.orders.searchPlaceholder', {
				default: 'Search out_trade_no / user email / ID…'
			})}
			bind:value={keyword}
			onkeydown={handleKeywordKey}
			data-testid="admin-orders-search"
		/>
	</div>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-orders-status-filter">
		{$_('common.status', { default: 'Status' })}
	</label>
	<select
		id="admin-orders-status-filter"
		class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
		bind:value={status}
		onchange={dispatchChange}
		data-testid="admin-orders-status-filter"
	>
		{#each statusOptions as o (o.value)}
			<option value={o.value}>{o.label}</option>
		{/each}
	</select>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-orders-provider-filter">
		{$_('admin.orders.providerLabel', { default: 'Provider' })}
	</label>
	<select
		id="admin-orders-provider-filter"
		class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
		bind:value={provider}
		onchange={dispatchChange}
		data-testid="admin-orders-provider-filter"
	>
		{#each providerOptions as o (o.value)}
			<option value={o.value}>{o.label}</option>
		{/each}
	</select>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-orders-plan-filter">
		{$_('admin.orders.planLabel', { default: 'Plan' })}
	</label>
	<select
		id="admin-orders-plan-filter"
		class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
		bind:value={plan}
		onchange={dispatchChange}
		data-testid="admin-orders-plan-filter"
	>
		{#each planOptions as o (o.value)}
			<option value={o.value}>{o.label}</option>
		{/each}
	</select>

	<label class="ml-1 text-xs text-muted-foreground" for="admin-orders-start-date">
		{$_('admin.orders.startDate', { default: 'From' })}
	</label>
	<input
		id="admin-orders-start-date"
		type="date"
		class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
		bind:value={startDate}
		onchange={dispatchChange}
		data-testid="admin-orders-start-date"
	/>
	<label class="ml-1 text-xs text-muted-foreground" for="admin-orders-end-date">
		{$_('admin.orders.endDate', { default: 'To' })}
	</label>
	<input
		id="admin-orders-end-date"
		type="date"
		class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
		bind:value={endDate}
		onchange={dispatchChange}
		data-testid="admin-orders-end-date"
	/>
</div>
