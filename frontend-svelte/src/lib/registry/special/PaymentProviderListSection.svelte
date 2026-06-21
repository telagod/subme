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
	 *     支持 create/edit/toggle/delete；复杂 provider credentials 与 limits 走 JSON 直通，
	 *     避免丢失后端未建模字段。
	 *   - payment_enabled=false 时不调用 listProviders 也不渲染 badge—— 只显示 disabledHint。
	 *
	 * 与 Vue tree 的差异：
	 *   - Vue dialog 会按 provider_key 展开专用 credential 字段；Svelte 先以 JSON 表单保留
	 *     完整配置直通，后续可继续细化 provider-specific fields。
	 *   - 红线确认：本组件仅调用 /api/admin/payment/providers，与 billing GetModelPricing
	 *     和 channel pricing 端点完全无交集。
	 *
	 * SectionRenderer 统一签名（{values, dirtyKeys, onFieldUpdate}）——
	 *   onFieldUpdate 仅用于 badge 切换；dirtyKeys 不消费。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { ChevronDown, ChevronUp } from '@lucide/svelte';
	import { adminPaymentApi, type ProviderInstance } from '$lib/api/admin/payment';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

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

	const PROVIDER_KEY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
		{ value: 'sub2apipay', label: 'sub2apipay' },
		{ value: 'easypay', label: 'EasyPay' },
		{ value: 'epay', label: 'epay' },
		{ value: 'stripe', label: 'Stripe' },
		{ value: 'alipay', label: 'Alipay' },
		{ value: 'wxpay', label: 'WeChat Pay' },
		{ value: 'airwallex', label: 'Airwallex' }
	];

	const PROVIDER_DEFAULT_TYPES: Record<string, string[]> = {
		easypay: ['alipay', 'wxpay'],
		epay: ['alipay', 'wxpay'],
		alipay: ['alipay'],
		wechat: ['wxpay'],
		wxpay: ['wxpay'],
		stripe: ['card', 'alipay', 'wxpay', 'link'],
		airwallex: ['airwallex'],
		sub2apipay: ['sub2apipay']
	};

	const PAYMENT_MODE_OPTIONS = [
		{ value: '__none__', label: 'Default' },
		{ value: 'qrcode', label: 'QR code' },
		{ value: 'popup', label: 'Popup' },
		{ value: 'redirect', label: 'Redirect' }
	];
	const LIMITS_PLACEHOLDER = '{"alipay":{"singleMin":1,"singleMax":500,"dailyLimit":5000}}';

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
	let dialogOpen = $state(false);
	let editingProvider = $state<ProviderInstance | null>(null);
	let deleteDialogOpen = $state(false);
	let deleteProviderTarget = $state<ProviderInstance | null>(null);
	let form = $state({
		provider_key: 'stripe',
		name: '',
		supported_types: '',
		enabled: true,
		payment_mode: '__none__',
		refund_enabled: false,
		allow_user_refund: false,
		sort_order: '0',
		config_json: '{}',
		limits_json: ''
	});
	let formError = $state<string | null>(null);
	const formSaving = $derived(
		busyId === -1 || (editingProvider !== null && busyId === editingProvider.id)
	);

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

	async function reorderProvider(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= providers.length) return;
		const current = providers[index];
		const adjacent = providers[target];
		busyId = current.id;
		try {
			await Promise.all([
				adminPaymentApi.updateProvider(current.id, { sort_order: target }),
				adminPaymentApi.updateProvider(adjacent.id, { sort_order: index })
			]);
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			busyId = null;
		}
	}

	function defaultSupportedTypes(providerKey: string): string[] {
		return PROVIDER_DEFAULT_TYPES[providerKey] ?? [providerKey];
	}

	function normalizeProviderKey(providerKey: string): string {
		if (!providerKey) {
			const fallback = enabledTypes[0] ?? 'stripe';
			return fallback === 'wechat' ? 'wxpay' : fallback;
		}
		return providerKey === 'wechat' ? 'wxpay' : providerKey;
	}

	function resetForm(provider?: ProviderInstance) {
		editingProvider = provider ?? null;
		formError = null;
		if (provider) {
			form = {
				provider_key: normalizeProviderKey(provider.provider_key),
				name: provider.name ?? '',
				supported_types: (provider.supported_types ?? []).join(','),
				enabled: !!provider.enabled,
				payment_mode: provider.payment_mode || '__none__',
				refund_enabled: !!provider.refund_enabled,
				allow_user_refund: !!provider.allow_user_refund,
				sort_order: String(Number(provider.sort_order ?? 0)),
				config_json: JSON.stringify(provider.config ?? {}, null, 2),
				limits_json: provider.limits || ''
			};
			return;
		}
		const firstKey = normalizeProviderKey(enabledTypes[0] ?? 'stripe');
		form = {
			provider_key: firstKey,
			name: '',
			supported_types: defaultSupportedTypes(firstKey).join(','),
			enabled: true,
			payment_mode: firstKey === 'easypay' ? 'qrcode' : '__none__',
			refund_enabled: false,
			allow_user_refund: false,
			sort_order: String(providers.length),
			config_json: '{}',
			limits_json: ''
		};
	}

	function openCreate() {
		resetForm();
		dialogOpen = true;
	}

	function openEdit(provider: ProviderInstance) {
		resetForm(provider);
		dialogOpen = true;
	}

	function onProviderKeyChange(e: Event) {
		const key = normalizeProviderKey((e.target as HTMLSelectElement).value);
		form.provider_key = key;
		form.supported_types = defaultSupportedTypes(key).join(',');
		if (key === 'easypay') form.payment_mode = 'qrcode';
		else if (!['alipay', 'easypay'].includes(key)) form.payment_mode = '__none__';
	}

	function parseCsv(raw: string): string[] {
		return raw
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function parseConfig(): Record<string, string> | null {
		const raw = form.config_json.trim();
		if (!raw) return {};
		try {
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
			const result: Record<string, string> = {};
			for (const [key, value] of Object.entries(parsed)) {
				if (value == null) continue;
				result[key] = typeof value === 'string' ? value : JSON.stringify(value);
			}
			return result;
		} catch {
			return null;
		}
	}

	function validateLimits(raw: string): string | null {
		const trimmed = raw.trim();
		if (!trimmed) return '';
		try {
			JSON.parse(trimmed);
			return trimmed;
		} catch {
			return null;
		}
	}

	async function saveProvider() {
		formError = null;
		if (!form.name.trim()) {
			formError = $_('admin.settings.payment.validationNameRequired');
			return;
		}
		const config = parseConfig();
		if (!config) {
			formError = $_('admin.settings.payment.invalidConfigJson');
			return;
		}
		const limits = validateLimits(form.limits_json);
		if (limits == null) {
			formError = $_('admin.settings.payment.invalidLimitsJson');
			return;
		}
		const payload: Partial<ProviderInstance> = {
			provider_key: form.provider_key,
			name: form.name.trim(),
			supported_types: parseCsv(form.supported_types),
			enabled: form.enabled,
			payment_mode: form.payment_mode === '__none__' ? '' : form.payment_mode,
			refund_enabled: form.refund_enabled,
			allow_user_refund: form.refund_enabled ? form.allow_user_refund : false,
			sort_order: Number.isFinite(Number(form.sort_order)) ? Number(form.sort_order) : 0,
			config,
			limits
		};
		busyId = editingProvider?.id ?? -1;
		try {
			if (editingProvider) await adminPaymentApi.updateProvider(editingProvider.id, payload);
			else await adminPaymentApi.createProvider(payload);
			showSuccess($_('common.saved'));
			dialogOpen = false;
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			busyId = null;
		}
	}

	function askDelete(p: ProviderInstance) {
		deleteProviderTarget = p;
		deleteDialogOpen = true;
	}

	async function confirmDeleteProvider() {
		const provider = deleteProviderTarget;
		if (!provider) return;
		busyId = provider.id;
		try {
			await adminPaymentApi.deleteProvider(provider.id);
			deleteDialogOpen = false;
			deleteProviderTarget = null;
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
					<Button
						variant="outline"
						size="sm"
						data-testid={`payment-provider-badge-${pt.value}`}
						data-checked={on}
						onclick={() => toggleType(pt.value)}
						class="h-8 px-3 text-sm {on
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground hover:bg-muted'}"
					>
						{pt.label}
					</Button>
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
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						data-testid="payment-provider-refresh"
						disabled={loading}
						onclick={load}
					>
						{loading ? $_('common.loading') : $_('common.refresh')}
					</Button>
					<Button
						variant="outline"
						size="sm"
						data-testid="payment-provider-create"
						disabled={loading}
						onclick={openCreate}
					>
						{$_('admin.settings.payment.createProvider')}
					</Button>
				</div>
			</div>

			<div class="overflow-hidden rounded-md border border-border">
				<table class="w-full border-collapse text-sm">
					<thead class="bg-muted/40">
						<tr class="border-b border-border text-left text-xs font-medium text-muted-foreground">
							<th class="px-3 py-2">{$_('admin.settings.payment.providerName')}</th>
							<th class="px-3 py-2">{$_('admin.settings.payment.providerKey')}</th>
							<th class="px-3 py-2">{$_('admin.settings.payment.supportedTypes')}</th>
							<th class="px-3 py-2">{$_('admin.settings.payment.enabled')}</th>
							<th class="px-3 py-2">{$_('admin.settings.payment.sortOrder')}</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							<tr>
								<td
									colspan="6"
									data-testid="payment-provider-loading"
									class="px-3 py-6 text-center text-xs text-muted-foreground"
								>
									{$_('common.loading')}
								</td>
							</tr>
						{:else if providers.length === 0}
							<tr>
								<td
									colspan="6"
									data-testid="payment-provider-empty"
									class="px-3 py-6 text-center text-xs text-muted-foreground"
								>
									{$_('admin.settings.payment.noProviders')}
								</td>
							</tr>
						{:else}
							{#each providers as p, i (p.id)}
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
										<Button
											variant="ghost"
											size="icon"
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
										</Button>
									</td>
									<td class="px-3 py-2 font-mono text-xs text-muted-foreground">
										{p.sort_order ?? 0}
									</td>
									<td class="px-3 py-2">
										<div class="flex items-center justify-end gap-2">
											<Button
												variant="ghost"
												size="icon"
												aria-label={$_('admin.settings.customMenu.moveUp')}
												title={$_('admin.settings.customMenu.moveUp')}
												data-testid={`payment-provider-move-up-${p.id}`}
												class="h-7 w-7"
												disabled={busyId === p.id || i === 0}
												onclick={() => reorderProvider(i, -1)}
											>
												<ChevronUp class="h-3.5 w-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												aria-label={$_('admin.settings.customMenu.moveDown')}
												title={$_('admin.settings.customMenu.moveDown')}
												data-testid={`payment-provider-move-down-${p.id}`}
												class="h-7 w-7"
												disabled={busyId === p.id || i === providers.length - 1}
												onclick={() => reorderProvider(i, 1)}
											>
												<ChevronDown class="h-3.5 w-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="sm"
												data-testid={`payment-provider-edit-${p.id}`}
												class="h-auto px-0 py-0 text-xs text-primary hover:bg-transparent hover:underline"
												disabled={busyId === p.id}
												onclick={() => openEdit(p)}
											>
												{$_('admin.settings.payment.editProvider')}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												data-testid={`payment-provider-delete-${p.id}`}
												class="h-auto px-0 py-0 text-xs text-destructive hover:bg-transparent hover:underline"
												disabled={busyId === p.id}
												onclick={() => askDelete(p)}
											>
												{$_('common.delete')}
											</Button>
										</div>
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

<StandardDialog
	bind:open={dialogOpen}
	width="lg"
	title={editingProvider
		? $_('admin.settings.payment.editProvider')
		: $_('admin.settings.payment.createProvider')}
	data-testid="payment-provider-dialog"
>
	<div class="mt-4 flex flex-col gap-4">
		{#if formError}
			<div
				class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				data-testid="payment-provider-form-error"
			>
				{formError}
			</div>
		{/if}

		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">
				<span class="font-medium">{$_('admin.settings.payment.providerName')}</span>
				<Input
					class="h-9"
					data-testid="payment-provider-form-name"
					bind:value={form.name}
				/>
			</label>
			<label class="grid gap-1 text-sm">
				<span class="font-medium">{$_('admin.settings.payment.providerKey')}</span>
				<NativeSelect
					class="h-9"
					data-testid="payment-provider-form-key"
					value={form.provider_key}
					disabled={!!editingProvider}
					onchange={onProviderKeyChange}
				>
					{#each PROVIDER_KEY_OPTIONS as pt (pt.value)}
						<option value={pt.value}>{pt.label}</option>
					{/each}
				</NativeSelect>
			</label>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">
				<span class="font-medium">{$_('admin.settings.payment.supportedTypes')}</span>
				<Input
					class="h-9 font-mono"
					data-testid="payment-provider-form-supported-types"
					bind:value={form.supported_types}
					placeholder={$_('admin.settings.payment.supportedTypesHint')}
				/>
			</label>
			<label class="grid gap-1 text-sm">
				<span class="font-medium">{$_('admin.settings.payment.paymentMode')}</span>
				<NativeSelect
					class="h-9"
					data-testid="payment-provider-form-mode"
					bind:value={form.payment_mode}
				>
					{#each PAYMENT_MODE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</NativeSelect>
			</label>
		</div>

		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				size="sm"
				data-testid="payment-provider-form-enabled"
				data-checked={form.enabled}
				onclick={() => (form.enabled = !form.enabled)}
				class={form.enabled ? 'border-primary bg-primary/10 text-primary' : ''}
			>
				{$_('admin.settings.payment.enabled')}
			</Button>
			<Button
				variant="outline"
				size="sm"
				data-testid="payment-provider-form-refund"
				data-checked={form.refund_enabled}
				onclick={() => {
					form.refund_enabled = !form.refund_enabled;
					if (!form.refund_enabled) form.allow_user_refund = false;
				}}
				class={form.refund_enabled ? 'border-primary bg-primary/10 text-primary' : ''}
			>
				{$_('admin.settings.payment.refundEnabled')}
			</Button>
			<Button
				variant="outline"
				size="sm"
				data-testid="payment-provider-form-user-refund"
				disabled={!form.refund_enabled}
				data-checked={form.allow_user_refund}
				onclick={() => (form.allow_user_refund = !form.allow_user_refund)}
				class={form.allow_user_refund ? 'border-primary bg-primary/10 text-primary' : ''}
			>
				{$_('admin.settings.payment.allowUserRefund')}
			</Button>
		</div>

		<label class="grid gap-1 text-sm">
			<span class="font-medium">{$_('admin.settings.payment.sortOrder')}</span>
			<Input
				type="number"
				class="h-9 w-36"
				data-testid="payment-provider-form-sort"
				bind:value={form.sort_order}
			/>
		</label>

		<label class="grid gap-1 text-sm">
			<span class="font-medium">{$_('admin.settings.payment.providerConfig')}</span>
			<Textarea
				rows={6}
				class="font-mono text-xs"
				data-testid="payment-provider-form-config"
				bind:value={form.config_json}
			/>
		</label>

		<label class="grid gap-1 text-sm">
			<span class="font-medium">{$_('admin.settings.payment.limitsTitle')}</span>
			<Textarea
				rows={4}
				class="font-mono text-xs"
				data-testid="payment-provider-form-limits"
				bind:value={form.limits_json}
				placeholder={LIMITS_PLACEHOLDER}
			/>
		</label>

		<div class="flex justify-end gap-2 border-t border-border pt-4">
			<Button variant="outline" onclick={() => (dialogOpen = false)}>
				{$_('common.cancel')}
			</Button>
			<Button
				variant="outline"
				data-testid="payment-provider-form-save"
				disabled={formSaving}
				onclick={saveProvider}
			>
				{formSaving ? $_('common.saving') : $_('common.save')}
			</Button>
		</div>
	</div>
	</StandardDialog>

	<ConfirmDialog
		bind:open={deleteDialogOpen}
		title={$_('common.delete')}
		description={$_('admin.settings.payment.deleteProviderConfirm')}
		confirmLabel={busyId === deleteProviderTarget?.id ? $_('common.loading') : $_('common.delete')}
		loading={busyId === deleteProviderTarget?.id}
		onConfirm={confirmDeleteProvider}
		data-testid="payment-provider-delete-dialog"
		confirmTestId="payment-provider-delete-confirm"
	/>
