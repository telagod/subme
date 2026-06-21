<script lang="ts">
	/**
	 * PlanEditDialog · StandardDialog with tabbed form（M22）
	 *
	 * 与 Vue PlanEditDialog.vue 同语义 + svelte 5 runes：
	 *   - Tabs: Basic Info / Pricing / Quotas / Features
	 *   - Basic Info: name + description (textarea) + platform (group → platform) +
	 *     visibility (public=for_sale, internal=for_sale=false + sort_order, draft=for_sale=false)
	 *   - Pricing: price + original_price + validity_days + validity_unit
	 *     + rate_multiplier (read-only mirror from group) + balance_recharge_multiplier (read-only)
	 *   - Quotas: daily/weekly/monthly_limit_usd (read-only mirror from group; group is the
	 *     source of truth — plan-level quota override is NOT a backend field)
	 *   - Features: bullet list editor (add / remove / reorder)
	 *
	 * 红线（reshadcn-migration / sentinel）：
	 *   - 所有 Select 用真实业务值；group select 用 group.id（number→string），validity_unit
	 *     用 'days'|'weeks'|'months'。NO empty-string value.
	 *   - NO QUENCH 皮肤 —— Zinc 中性 + 强调色（border-primary / bg-primary）。
	 *
	 * 提交：
	 *   - plan === null   → adminPlansApi.createPlan
	 *   - plan !== null   → adminPlansApi.updatePlan(plan.id, …)
	 */
	import { _ } from 'svelte-i18n';
	import { X, Plus, Trash2, ChevronUp, ChevronDown } from '@lucide/svelte';
	import {
		createPlan,
		updatePlan,
		type AdminPlan,
		type AdminGroupLite,
		type CreatePlanPayload,
		type ValidityUnit
	} from '$lib/api/admin/plans';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

	const GROUP_NONE = '__none__';

	type Props = {
		open: boolean;
		plan: AdminPlan | null;
		groups: AdminGroupLite[];
		onSaved?: () => void;
	};

	let { open = $bindable(false), plan, groups, onSaved }: Props = $props();

	type TabKey = 'basic' | 'pricing' | 'quotas' | 'features';
	let activeTab = $state<TabKey>('basic');

	// ── Form state ─────────────────────────────────────────────────────────
	let name = $state('');
	let description = $state('');
	let groupIdStr = $state(GROUP_NONE);
	let price = $state<number>(0);
	let originalPrice = $state<number>(0);
	let validityDays = $state<number>(30);
	let validityUnit = $state<ValidityUnit>('days');
	let sortOrder = $state<number>(0);
	let forSale = $state<boolean>(true);
	let features = $state<string[]>([]);
	let newFeatureText = $state('');

	let saving = $state(false);

	// Stable empty-form snapshot so resetForm doesn't repeat magic literals.
	function resetForm(seed: AdminPlan | null) {
		if (seed) {
			name = seed.name;
			description = seed.description ?? '';
			groupIdStr = String(seed.group_id);
			price = seed.price ?? 0;
			originalPrice = seed.original_price ?? 0;
			validityDays = seed.validity_days ?? 30;
			validityUnit = (seed.validity_unit as ValidityUnit) || 'days';
			sortOrder = seed.sort_order ?? 0;
			forSale = seed.for_sale;
			features = [...(seed.features ?? [])];
		} else {
			name = '';
			description = '';
			groupIdStr = GROUP_NONE;
			price = 0;
			originalPrice = 0;
			validityDays = 30;
			validityUnit = 'days';
			sortOrder = 0;
			forSale = true;
			features = [];
		}
		newFeatureText = '';
		activeTab = 'basic';
	}

	// Re-seed form whenever the dialog flips open.
	let lastOpen = $state(false);
	$effect(() => {
		if (open && !lastOpen) {
			resetForm(plan);
		}
		lastOpen = open;
	});

	const selectedGroup = $derived.by<AdminGroupLite | null>(() => {
		if (groupIdStr === GROUP_NONE) return null;
		const id = Number(groupIdStr);
		return groups.find((g) => g.id === id) ?? null;
	});

	// Only `subscription` typed groups can back a plan (Vue contract: PlanEditDialog line 115).
	// If a group is missing subscription_type, accept it (legacy data tolerance).
	const eligibleGroups = $derived.by<AdminGroupLite[]>(() =>
		groups.filter((g) => !g.subscription_type || g.subscription_type === 'subscription')
	);

	function addFeature() {
		const v = newFeatureText.trim();
		if (!v) return;
		features = [...features, v];
		newFeatureText = '';
	}

	function removeFeature(idx: number) {
		features = features.filter((_, i) => i !== idx);
	}

	function moveFeature(idx: number, delta: number) {
		const next = [...features];
		const target = idx + delta;
		if (target < 0 || target >= next.length) return;
		[next[idx], next[target]] = [next[target], next[idx]];
		features = next;
	}

	function fmtLimit(v: number | null | undefined): string {
		if (v == null) return $_('admin.plansCatalog.unlimited', { default: 'Unlimited' });
		return `$${v}`;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (saving) return;

		// Validation — mirror Vue tree.
		if (!name.trim()) {
			showError($_('payment.admin.planName', { default: 'Plan name required' }));
			return;
		}
		if (groupIdStr === GROUP_NONE) {
			showError($_('payment.admin.groupRequired', { default: 'Please select a group' }));
			return;
		}
		if (!price || price <= 0) {
			showError(
				$_('payment.admin.priceRequired', { default: 'Price must be greater than 0' })
			);
			return;
		}
		if (!validityDays || validityDays < 1) {
			showError(
				$_('payment.admin.validityDaysRequired', {
					default: 'Validity days must be greater than 0'
				})
			);
			return;
		}

		const payload: CreatePlanPayload = {
			name: name.trim(),
			group_id: Number(groupIdStr),
			description: description.trim(),
			price,
			original_price: originalPrice || 0,
			validity_days: validityDays,
			validity_unit: validityUnit,
			sort_order: sortOrder,
			for_sale: forSale,
			features: features.filter((f) => f.trim().length > 0)
		};

		saving = true;
		try {
			if (plan) {
				await updatePlan(plan.id, payload);
			} else {
				await createPlan(payload);
			}
			showSuccess($_('common.saved', { default: 'Saved successfully' }));
			onSaved?.();
			open = false;
		} catch (err) {
			const e = err as Error;
			showError(e?.message ?? $_('common.error', { default: 'Error' }));
		} finally {
			saving = false;
		}
	}

	function handleClose() {
		if (saving) return;
		open = false;
	}

	const TABS: Array<{ key: TabKey; labelKey: string; fallback: string }> = [
		{ key: 'basic', labelKey: 'admin.plansCatalog.tabBasic', fallback: 'Basic Info' },
		{ key: 'pricing', labelKey: 'admin.plansCatalog.tabPricing', fallback: 'Pricing' },
		{ key: 'quotas', labelKey: 'admin.plansCatalog.tabQuotas', fallback: 'Quotas' },
		{ key: 'features', labelKey: 'admin.plansCatalog.tabFeatures', fallback: 'Features' }
	];
</script>

<StandardDialog
	bind:open
	width="lg"
	showHeader={false}
	title={plan
		? $_('payment.admin.editPlan', { default: 'Edit Plan' })
		: $_('payment.admin.createPlan', { default: 'Create Plan' })}
	description={$_('admin.plansCatalog.dialogDesc', {
		default: 'Configure plan metadata, pricing and entitlements'
	})}
	data-testid="plan-edit-dialog"
	class="flex max-h-[90vh] flex-col p-0"
>
			<header class="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
				<div class="min-w-0">
					<h2 class="text-base font-semibold text-foreground">
						{plan
							? $_('payment.admin.editPlan', { default: 'Edit Plan' })
							: $_('payment.admin.createPlan', { default: 'Create Plan' })}
					</h2>
					<p class="text-xs text-muted-foreground">
						{$_('admin.plansCatalog.dialogDesc', {
							default: 'Configure plan metadata, pricing and entitlements'
						})}
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
					onclick={handleClose}
					aria-label={$_('common.close', { default: 'Close' })}
					data-testid="plan-edit-close"
				>
					<X class="h-4 w-4" />
				</Button>
			</header>

			<!-- Tabs -->
			<nav
				class="flex shrink-0 gap-1 border-b border-border bg-muted/30 px-3 py-1.5"
				data-testid="plan-edit-tabs"
				aria-label="form tabs"
			>
				{#each TABS as t (t.key)}
					<Button
						variant={activeTab === t.key ? 'outline' : 'ghost'}
						size="sm"
						class="h-7 px-2.5 {activeTab === t.key ? 'bg-card text-foreground' : 'text-muted-foreground'}"
						onclick={() => (activeTab = t.key)}
						data-testid="plan-edit-tab"
						data-tab-key={t.key}
						data-tab-active={activeTab === t.key ? 'true' : 'false'}
					>
						{$_(t.labelKey, { default: t.fallback })}
					</Button>
				{/each}
			</nav>

			<form
				id="plan-edit-form"
				class="flex-1 space-y-4 overflow-y-auto px-5 py-4"
				onsubmit={handleSubmit}
				data-testid="plan-edit-form"
			>
				<!-- Basic Info -->
				{#if activeTab === 'basic'}
					<div class="space-y-3" data-testid="plan-edit-panel-basic">
						<div>
							<label
								for="plan-name"
								class="mb-1 block text-xs font-medium text-foreground"
							>
								{$_('payment.admin.planName', { default: 'Plan Name' })}
								<span class="text-destructive">*</span>
							</label>
							<Input
								id="plan-name"
								type="text"
								required
								class="h-9 px-2.5"
								bind:value={name}
								data-testid="plan-edit-name"
							/>
						</div>

						<div>
							<label
								for="plan-group"
								class="mb-1 block text-xs font-medium text-foreground"
							>
								{$_('payment.admin.group', { default: 'Group' })}
								<span class="text-destructive">*</span>
							</label>
							<!-- Group Select uses a non-empty sentinel for the unset state. -->
							<NativeSelect
								id="plan-group"
								class="h-9 w-full px-2.5"
								bind:value={groupIdStr}
								data-testid="plan-edit-group"
							>
								<option value={GROUP_NONE} disabled hidden>
									{$_('payment.admin.selectGroup', { default: 'Select a group' })}
								</option>
								{#each eligibleGroups as g (g.id)}
									<option value={String(g.id)}>
										{g.name} — {g.platform} ({g.rate_multiplier}x)
									</option>
								{/each}
							</NativeSelect>
						</div>

						<div>
							<label
								for="plan-description"
								class="mb-1 block text-xs font-medium text-foreground"
							>
								{$_('payment.admin.planDescription', { default: 'Plan Description' })}
							</label>
							<Textarea
								id="plan-description"
								rows={3}
								class="px-2.5 py-1.5"
								bind:value={description}
								data-testid="plan-edit-description"
							/>
						</div>

						<div class="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2.5">
							<label class="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
								<Checkbox
									bind:checked={forSale}
									data-testid="plan-edit-for-sale"
								/>
								<span>{$_('payment.admin.forSale', { default: 'For Sale' })}</span>
							</label>
							<span class="text-xs text-muted-foreground">
								{forSale
									? $_('admin.plansCatalog.onSale', { default: 'On Sale' })
									: $_('admin.plansCatalog.offSale', { default: 'Archived' })}
							</span>
						</div>

						<div>
							<label
								for="plan-sort-order"
								class="mb-1 block text-xs font-medium text-foreground"
							>
								{$_('payment.admin.sortOrder', { default: 'Sort Order' })}
							</label>
							<Input
								id="plan-sort-order"
								type="number"
								min="0"
								class="h-9 w-32 px-2.5"
								bind:value={sortOrder}
								data-testid="plan-edit-sort-order"
							/>
						</div>
					</div>
				{/if}

				<!-- Pricing -->
				{#if activeTab === 'pricing'}
					<div class="space-y-3" data-testid="plan-edit-panel-pricing">
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label
									for="plan-price"
									class="mb-1 block text-xs font-medium text-foreground"
								>
									{$_('payment.admin.price', { default: 'Price' })}
									<span class="text-destructive">*</span>
								</label>
								<Input
									id="plan-price"
									type="number"
									step="0.01"
									min="0.01"
									required
									class="h-9 px-2.5"
									bind:value={price}
									data-testid="plan-edit-price"
								/>
							</div>
							<div>
								<label
									for="plan-original-price"
									class="mb-1 block text-xs font-medium text-foreground"
								>
									{$_('payment.admin.originalPrice', { default: 'Original Price' })}
								</label>
								<Input
									id="plan-original-price"
									type="number"
									step="0.01"
									min="0"
									class="h-9 px-2.5"
									bind:value={originalPrice}
									data-testid="plan-edit-original-price"
								/>
							</div>
						</div>

						<div class="grid grid-cols-2 gap-3">
							<div>
								<label
									for="plan-validity-days"
									class="mb-1 block text-xs font-medium text-foreground"
								>
									{$_('payment.admin.validityDays', { default: 'Validity (days)' })}
									<span class="text-destructive">*</span>
								</label>
								<Input
									id="plan-validity-days"
									type="number"
									min="1"
									required
									class="h-9 px-2.5"
									bind:value={validityDays}
									data-testid="plan-edit-validity-days"
								/>
							</div>
							<div>
								<label
									for="plan-validity-unit"
									class="mb-1 block text-xs font-medium text-foreground"
								>
									{$_('payment.admin.validityUnit', { default: 'Validity Unit' })}
								</label>
								<NativeSelect
									id="plan-validity-unit"
									class="h-9 w-full px-2.5"
									bind:value={validityUnit}
									data-testid="plan-edit-validity-unit"
								>
									<option value="days">
										{$_('admin.plansCatalog.unitDays', { default: 'Days' })}
									</option>
									<option value="weeks">
										{$_('admin.plansCatalog.unitWeeks', { default: 'Weeks' })}
									</option>
									<option value="months">
										{$_('admin.plansCatalog.unitMonths', { default: 'Months' })}
									</option>
								</NativeSelect>
							</div>
						</div>

						{#if selectedGroup}
							<div
								class="rounded-md border border-border bg-muted/40 p-3 text-xs"
								data-testid="plan-edit-rate-mirror"
							>
								<div class="mb-1 font-medium text-foreground">
									{$_('payment.admin.groupInfo', { default: 'Group Info' })}
								</div>
								<div class="grid grid-cols-2 gap-1.5 text-muted-foreground">
									<div>
										<span>{$_('payment.admin.rateMultiplierLabel', { default: 'Rate' })}:</span>
										<span class="ml-1 tabular-nums text-foreground">
											{selectedGroup.rate_multiplier}x
										</span>
									</div>
									<div>
										<span>{$_('payment.admin.platform', { default: 'Platform' })}:</span>
										<span class="ml-1 text-foreground">{selectedGroup.platform}</span>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Quotas -->
				{#if activeTab === 'quotas'}
					<div class="space-y-3" data-testid="plan-edit-panel-quotas">
						{#if selectedGroup}
							<div class="rounded-md border border-border bg-muted/30 p-3">
								<div class="mb-2 text-xs font-medium text-foreground">
									{$_('admin.plansCatalog.quotasFromGroup', {
										default: 'Quotas are inherited from the selected group'
									})}
								</div>
								<div class="grid grid-cols-3 gap-3 text-xs">
									<div>
										<div class="text-muted-foreground">
											{$_('payment.admin.dailyLimit', { default: 'Daily Limit' })}
										</div>
										<div class="tabular-nums text-foreground" data-testid="plan-quota-daily">
											{fmtLimit(selectedGroup.daily_limit_usd)}
										</div>
									</div>
									<div>
										<div class="text-muted-foreground">
											{$_('payment.admin.weeklyLimit', { default: 'Weekly Limit' })}
										</div>
										<div class="tabular-nums text-foreground" data-testid="plan-quota-weekly">
											{fmtLimit(selectedGroup.weekly_limit_usd)}
										</div>
									</div>
									<div>
										<div class="text-muted-foreground">
											{$_('payment.admin.monthlyLimit', { default: 'Monthly Limit' })}
										</div>
										<div class="tabular-nums text-foreground" data-testid="plan-quota-monthly">
											{fmtLimit(selectedGroup.monthly_limit_usd)}
										</div>
									</div>
								</div>
							</div>
						{:else}
							<p
								class="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground"
								data-testid="plan-quota-empty"
							>
								{$_('admin.plansCatalog.quotasNeedGroup', {
									default: 'Select a group on the Basic Info tab to view inherited quotas'
								})}
							</p>
						{/if}
					</div>
				{/if}

				<!-- Features -->
				{#if activeTab === 'features'}
					<div class="space-y-3" data-testid="plan-edit-panel-features">
						<div class="flex items-end gap-2">
							<div class="flex-1">
								<label
									for="plan-new-feature"
									class="mb-1 block text-xs font-medium text-foreground"
								>
									{$_('payment.admin.features', { default: 'Features' })}
								</label>
								<Input
									id="plan-new-feature"
									type="text"
									placeholder={$_('payment.admin.featuresPlaceholder', {
										default: 'Enter plan features...'
									})}
									class="h-9 px-2.5"
									bind:value={newFeatureText}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											addFeature();
										}
									}}
									data-testid="plan-edit-new-feature"
								/>
							</div>
							<Button
								variant="outline"
								size="sm"
								class="h-9 px-2.5"
								onclick={addFeature}
								data-testid="plan-edit-add-feature"
							>
								<Plus class="h-3 w-3" />
								{$_('common.create', { default: 'Add' })}
							</Button>
						</div>

						<ul class="m-0 space-y-1 p-0 list-none" data-testid="plan-edit-features-list">
							{#each features as f, i (i)}
								<li
									class="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs"
									data-testid="plan-edit-feature-row"
								>
									<span
										aria-hidden="true"
										class="h-1 w-1 shrink-0 rounded-full bg-foreground/50"
									></span>
									<span class="flex-1 truncate text-foreground">{f}</span>
									<Button
										variant="ghost"
										size="icon"
										class="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground"
										disabled={i === 0}
										onclick={() => moveFeature(i, -1)}
										aria-label={$_('admin.plansCatalog.moveUp', { default: 'Move Up' })}
									>
										<ChevronUp class="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="h-6 w-6 text-muted-foreground hover:bg-muted hover:text-foreground"
										disabled={i === features.length - 1}
										onclick={() => moveFeature(i, 1)}
										aria-label={$_('admin.plansCatalog.moveDown', { default: 'Move Down' })}
									>
										<ChevronDown class="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										onclick={() => removeFeature(i)}
										aria-label={$_('common.delete', { default: 'Delete' })}
										data-testid="plan-edit-remove-feature"
									>
										<Trash2 class="h-3 w-3" />
									</Button>
								</li>
							{/each}
						</ul>

						{#if features.length === 0}
							<p class="text-xs text-muted-foreground" data-testid="plan-edit-features-empty">
								{$_('payment.admin.featuresHint', { default: 'One feature per line' })}
							</p>
						{/if}
					</div>
				{/if}
			</form>

			<footer class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
				<Button
					variant="outline"
					class="h-9"
					disabled={saving}
					onclick={handleClose}
					data-testid="plan-edit-cancel"
				>
					{$_('common.cancel', { default: 'Cancel' })}
				</Button>
				<Button
					type="submit"
					form="plan-edit-form"
					class="h-9"
					disabled={saving}
					data-testid="plan-edit-submit"
				>
					{saving
						? $_('common.submitting', { default: 'Submitting...' })
						: $_('common.save', { default: 'Save' })}
				</Button>
			</footer>
		</StandardDialog>
