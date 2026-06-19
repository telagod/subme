<script lang="ts">
	/**
	 * PaymentProviderListSection · payment_enabled_types 徽章切换 + 服务商实例列表（M12 payment）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/PaymentProviderListSection.vue。
	 *
	 * 行为契约（与 Vue tree 对齐）：
	 *   - payment_enabled_types badge：5 种供应商（sub2apipay/epay/stripe/alipay/wechat）
	 *     toggle 直接 emit('payment_enabled_types', next[]) 进 flat-form dirty 流水线，
	 *     由父级 +page.svelte 走 patchSettings 一并落库。
	 *   - 服务商实例列表：与 flat-form 解耦 —— 独立 onMount → adminPaymentApi.listProviders。
	 *     当前批次仅落地 read + enabled 切换 + delete（与 OverloadCooldown 同款最小可用
	 *     lifecycle）。完整 CRUD（含 provider dialog）后续批次再补。
	 *   - payment_enabled=false 时不调用 listProviders 也不渲染 badge—— 只显示 disabledHint。
	 *
	 * 与 Vue tree 的差异：
	 *   - Vue 端 PaymentProviderList + PaymentProviderDialog 是已有可复用组件树；
	 *     Svelte 仓库尚未端口，故 dialog/create/edit/reorder 退化为 backlog。本批次保留
	 *     read-only 列表 + enabled toggle + delete，覆盖 Vue 90% 高频操作面。
	 *   - 红线确认：本组件只读 /api/admin/payment/providers，与 billing GetModelPricing
	 *     完全无交集。
	 *
	 * SectionRenderer 统一签名（{values, dirtyKeys, onFieldUpdate}）——
	 *   onFieldUpdate 仅用于 badge 切换；dirtyKeys 不消费。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { adminPaymentApi, type ProviderInstance } from '$lib/api/admin/payment';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values?: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values = {}, dirtyKeys: _d, onFieldUpdate }: Props = $props();

	/** 与 Vue tree 严格同步的 5 种 provider type。 */
	const ALL_PAYMENT_TYPES: ReadonlyArray<{ value: string; label: string }> = [
		{ value: 'sub2apipay', label: 'sub2apipay' },
		{ value: 'epay', label: 'epay' },
		{ value: 'stripe', label: 'Stripe' },
		{ value: 'alipay', label: 'Alipay' },
		{ value: 'wechat', label: 'WeChat Pay' }
	];

	const paymentEnabled = $derived(values['payment_enabled'] === true);

	/** payment_enabled_types 可能是 string[] 或 'a,b,c' 字符串 —— 同 Vue parse 容忍。 */
	function parseEnabledTypes(raw: unknown): string[] {
		if (Array.isArray(raw)) return raw.filter((s) => typeof s === 'string');
		if (typeof raw === 'string' && raw)
			return raw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		return [];
	}

	const enabledTypes = $derived(parseEnabledTypes(values['payment_enabled_types']));

	function isEnabled(type: string): boolean {
		return enabledTypes.includes(type);
	}

	function toggleType(type: string) {
		const next = isEnabled(type)
			? enabledTypes.filter((t) => t !== type)
			: [...enabledTypes, type];
		onFieldUpdate?.({ key: 'payment_enabled_types', value: next });
	}

	// ── Provider instances（独立 lifecycle，不进 patchSettings） ─────────────
	let loading = $state(false);
	let providers = $state<ProviderInstance[]>([]);
	let busyId = $state<number | null>(null);

	async function load() {
		loading = true;
		try {
			providers = await adminPaymentApi.listProviders();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (paymentEnabled) void load();
	});

	// payment_enabled false → true 时自动加载（mirror Vue 端 watch）。
	let _prevEnabled = false;
	$effect(() => {
		if (paymentEnabled && !_prevEnabled) {
			_prevEnabled = true;
			void load();
		} else if (!paymentEnabled) {
			_prevEnabled = false;
		}
	});

	async function toggleProviderEnabled(p: ProviderInstance) {
		busyId = p.id;
		try {
			await adminPaymentApi.updateProvider(p.id, { enabled: !p.enabled });
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			busyId = null;
		}
	}

	async function askDelete(p: ProviderInstance) {
		const msg = $_('admin.settings.payment.deleteProviderConfirm');
		if (typeof window !== 'undefined' && !window.confirm(msg)) return;
		busyId = p.id;
		try {
			await adminPaymentApi.deleteProvider(p.id);
			showSuccess($_('common.deleted'));
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			busyId = null;
		}
	}
</script>

<div class="flex flex-col gap-4 p-1" data-special="payment-provider-list">
	{#if !paymentEnabled}
		<div
			data-testid="payment-provider-list-disabled"
			class="rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
		>
			{$_('admin.settings.payment.enabledHint')}
		</div>
	{:else}
		<!-- payment_enabled_types badge toggles -->
		<div class="flex flex-col gap-2">
			<span class="text-sm font-medium text-foreground">
				{$_('admin.settings.payment.enabledPaymentTypes')}
			</span>
			<div class="flex flex-wrap gap-2" data-testid="payment-provider-badges">
				{#each ALL_PAYMENT_TYPES as pt (pt.value)}
					{@const on = isEnabled(pt.value)}
					<button
						type="button"
						data-testid={`payment-provider-badge-${pt.value}`}
						data-checked={on}
						onclick={() => toggleType(pt.value)}
						class="inline-flex h-8 items-center justify-center rounded-md border px-3 text-sm transition-colors {on
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground hover:bg-muted'}"
					>
						{pt.label}
					</button>
				{/each}
			</div>
			<p class="m-0 text-xs leading-relaxed text-muted-foreground">
				{$_('admin.settings.payment.enabledPaymentTypesHint')}
			</p>
		</div>

		<!-- Provider instances list (read + toggle + delete) -->
		<div class="flex flex-col gap-2 border-t border-border pt-4">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-foreground">
					{$_('admin.settings.payment.providerManagement')}
				</span>
				<button
					type="button"
					data-testid="payment-provider-refresh"
					class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent disabled:opacity-50"
					disabled={loading}
					onclick={load}
				>
					{loading ? $_('common.loading') : $_('common.refresh')}
				</button>
			</div>

			<div class="overflow-hidden rounded-md border border-border">
				<table class="w-full border-collapse text-sm">
					<thead class="bg-muted/40">
						<tr class="border-b border-border text-left text-xs font-medium text-muted-foreground">
							<th class="px-3 py-2">{$_('admin.settings.payment.providerName')}</th>
							<th class="px-3 py-2">{$_('admin.settings.payment.providerKey')}</th>
							<th class="px-3 py-2">{$_('admin.settings.payment.supportedTypes')}</th>
							<th class="px-3 py-2">{$_('admin.settings.payment.enabled')}</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							<tr>
								<td
									colspan="5"
									data-testid="payment-provider-loading"
									class="px-3 py-6 text-center text-xs text-muted-foreground"
								>
									{$_('common.loading')}
								</td>
							</tr>
						{:else if providers.length === 0}
							<tr>
								<td
									colspan="5"
									data-testid="payment-provider-empty"
									class="px-3 py-6 text-center text-xs text-muted-foreground"
								>
									{$_('admin.settings.payment.noProviders')}
								</td>
							</tr>
						{:else}
							{#each providers as p (p.id)}
								<tr
									class="border-b border-border last:border-b-0"
									data-testid="payment-provider-row"
									data-provider-id={p.id}
								>
									<td class="px-3 py-2 text-foreground">{p.name}</td>
									<td class="px-3 py-2 font-mono text-xs text-muted-foreground">{p.provider_key}</td>
									<td class="px-3 py-2 text-xs text-muted-foreground">
										{(p.supported_types ?? []).join(', ') || '—'}
									</td>
									<td class="px-3 py-2">
										<button
											type="button"
											role="switch"
											aria-checked={p.enabled}
											aria-label={$_('admin.settings.payment.enabled')}
											data-testid={`payment-provider-toggle-${p.id}`}
											data-checked={p.enabled}
											disabled={busyId === p.id}
											onclick={() => toggleProviderEnabled(p)}
											class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 {p.enabled
												? 'bg-primary'
												: 'bg-muted'}"
										>
											<span
												class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {p.enabled
													? 'translate-x-4'
													: 'translate-x-0.5'}"
											></span>
										</button>
									</td>
									<td class="px-3 py-2">
										<button
											type="button"
											data-testid={`payment-provider-delete-${p.id}`}
											class="text-xs text-destructive hover:underline disabled:opacity-50"
											disabled={busyId === p.id}
											onclick={() => askDelete(p)}
										>
											{$_('common.delete')}
										</button>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
			<p class="m-0 text-xs leading-relaxed text-muted-foreground">
				{$_('admin.settings.payment.providerManagementDesc')}
			</p>
		</div>
	{/if}
</div>
