<script lang="ts">
	/**
	 * UserDefaultsSection · default_subscriptions + default_platform_quotas（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/UserDefaultsSection.vue。
	 *
	 * 两块独立 list（顺次 emit）：
	 *   - default_subscriptions：Array<{group_id:number, validity_days:number}>
	 *   - default_platform_quotas：4 平台 × 3 窗口（daily/weekly/monthly）矩阵
	 *
	 * 与 Vue tree 差异：
	 *   - group_id 用 number input 替代 Vue 的 GroupBadge Select —— Svelte 仓库尚无
	 *     admin.groups API；后端契约同形，接入 API 后可零破换 select。
	 *   - 归一化策略（sanitizePlatformQuotasMap）内联实现 —— 非有限数/负数/空串 → null，
	 *     保留 0 = 显式禁用。
	 *
	 * Sentinel：本组件不渲染任何 select option，沿用 sentinel guard 自动 PASS。
	 */
	import { _ } from 'svelte-i18n';

	type FieldUpdate = { key: string; value: unknown };

	type PlatformType = 'anthropic' | 'openai' | 'gemini' | 'antigravity';
	const PLATFORMS: PlatformType[] = ['anthropic', 'openai', 'gemini', 'antigravity'];

	type QuotaCell = { daily: number | null; weekly: number | null; monthly: number | null };
	type QuotaMap = Record<PlatformType, QuotaCell>;

	type SubscriptionRow = { group_id: number; validity_days: number };

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { values, onFieldUpdate }: Props = $props();

	function cloneSubs(raw: unknown): SubscriptionRow[] {
		if (!Array.isArray(raw)) return [];
		return raw
			.map((it) => ({
				group_id: Number((it as SubscriptionRow)?.group_id ?? 0),
				validity_days: Number((it as SubscriptionRow)?.validity_days ?? 30)
			}))
			.filter((it) => Number.isFinite(it.group_id));
	}

	/** 归一化为全 4 平台 × 3 窗口；缺失填 null（与 Vue normalizePlatformQuotasMap 同语义）。 */
	function normalizeQuotas(raw: unknown): QuotaMap {
		const src = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Partial<
			Record<PlatformType, Partial<QuotaCell>>
		>;
		const result = {} as QuotaMap;
		for (const p of PLATFORMS) {
			const cell = src[p] ?? {};
			result[p] = {
				daily: typeof cell.daily === 'number' && Number.isFinite(cell.daily) ? cell.daily : null,
				weekly: typeof cell.weekly === 'number' && Number.isFinite(cell.weekly) ? cell.weekly : null,
				monthly:
					typeof cell.monthly === 'number' && Number.isFinite(cell.monthly) ? cell.monthly : null
			};
		}
		return result;
	}

	/** 提交前 sanitization —— 非有限数 / 负数 → null，保留 0。 */
	function sanitizeQuotas(map: QuotaMap): QuotaMap {
		const clean = (v: unknown): number | null =>
			typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
		const result = {} as QuotaMap;
		for (const p of PLATFORMS) {
			const cell = map[p];
			result[p] = { daily: clean(cell.daily), weekly: clean(cell.weekly), monthly: clean(cell.monthly) };
		}
		return result;
	}

	function sanitizeSubs(rows: SubscriptionRow[]): SubscriptionRow[] {
		return rows
			.filter((r) => r.group_id > 0 && r.validity_days > 0)
			.map((r) => ({
				group_id: Math.floor(r.group_id),
				validity_days: Math.min(36500, Math.max(1, Math.floor(r.validity_days)))
			}));
	}

	let subs = $state<SubscriptionRow[]>([]);
	let quotas = $state<QuotaMap>(normalizeQuotas(undefined));
	let _initSubs = false;
	let _initQuotas = false;

	$effect(() => {
		const incoming = cloneSubs(values['default_subscriptions']);
		if (!_initSubs) {
			subs = incoming;
			_initSubs = true;
			return;
		}
		if (JSON.stringify(incoming) !== JSON.stringify(subs)) subs = incoming;
	});
	$effect(() => {
		const incoming = normalizeQuotas(values['default_platform_quotas']);
		if (!_initQuotas) {
			quotas = incoming;
			_initQuotas = true;
			return;
		}
		if (JSON.stringify(incoming) !== JSON.stringify(quotas)) quotas = incoming;
	});

	function emitSubs() {
		onFieldUpdate?.({ key: 'default_subscriptions', value: sanitizeSubs(subs) });
	}
	function emitQuotas() {
		onFieldUpdate?.({ key: 'default_platform_quotas', value: sanitizeQuotas(quotas) });
	}

	function addSubscription() {
		subs = [...subs, { group_id: 0, validity_days: 30 }];
		// 不 emit —— group_id=0 会被 sanitize 过滤掉；待管理员填上有效 id 再触发。
	}
	function removeSubscription(i: number) {
		subs = subs.filter((_, idx) => idx !== i);
		emitSubs();
	}
	function patchSubGroupId(i: number, raw: string) {
		const n = raw === '' ? 0 : Number(raw);
		subs = subs.map((s, idx) => (idx === i ? { ...s, group_id: Number.isFinite(n) ? n : 0 } : s));
		emitSubs();
	}
	function patchSubValidity(i: number, raw: string) {
		const n = raw === '' ? 0 : Number(raw);
		subs = subs.map((s, idx) =>
			idx === i ? { ...s, validity_days: Number.isFinite(n) ? n : 0 } : s
		);
		emitSubs();
	}

	function patchQuota(p: PlatformType, window: keyof QuotaCell, raw: string) {
		const n = raw === '' ? null : Number(raw);
		quotas = {
			...quotas,
			[p]: { ...quotas[p], [window]: Number.isFinite(n as number) ? (n as number) : null }
		};
		emitQuotas();
	}
</script>

<div class="flex flex-col gap-6" data-special="user-defaults">
	<!-- Block 1 · default_subscriptions -->
	<div class="flex flex-col gap-3">
		<div class="flex items-start justify-between gap-3">
			<div>
				<span class="block text-sm font-semibold text-foreground">
					{$_('admin.settings.defaults.defaultSubscriptions')}
				</span>
				<p class="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
					{$_('admin.settings.defaults.defaultSubscriptionsHint')}
				</p>
			</div>
			<button
				type="button"
				data-testid="default-subscription-add"
				class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent"
				onclick={addSubscription}
			>
				+ {$_('admin.settings.defaults.addDefaultSubscription')}
			</button>
		</div>

		{#if subs.length === 0}
			<div
				class="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground"
				data-testid="default-subscription-empty"
			>
				{$_('admin.settings.defaults.defaultSubscriptionsEmpty')}
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each subs as row, i (i)}
					<div
						data-testid="default-subscription-row"
						class="grid gap-2.5 rounded-md border border-border px-3 py-2.5 [grid-template-columns:1fr_160px_auto] max-[640px]:[grid-template-columns:1fr]"
					>
						<label class="flex flex-col">
							<span class="mb-1 block text-[11px] font-medium text-muted-foreground">
								{$_('admin.settings.defaults.subscriptionGroup')}
							</span>
							<input
								type="number"
								min="1"
								class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								value={row.group_id === 0 ? '' : String(row.group_id)}
								placeholder="ID"
								oninput={(e) =>
									patchSubGroupId(i, (e.target as HTMLInputElement).value)}
							/>
						</label>
						<label class="flex flex-col">
							<span class="mb-1 block text-[11px] font-medium text-muted-foreground">
								{$_('admin.settings.defaults.subscriptionValidityDays')}
							</span>
							<input
								type="number"
								min="1"
								max="36500"
								class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								value={String(row.validity_days)}
								oninput={(e) => patchSubValidity(i, (e.target as HTMLInputElement).value)}
							/>
						</label>
						<div class="flex items-end">
							<button
								type="button"
								data-testid="default-subscription-remove"
								class="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-3 text-xs text-destructive hover:bg-destructive/10"
								onclick={() => removeSubscription(i)}
							>
								{$_('common.delete')}
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Block 2 · default_platform_quotas matrix -->
	<div class="flex flex-col gap-3 border-t border-border pt-5">
		<div class="flex flex-col gap-0.5">
			<span class="block text-sm font-semibold text-foreground">
				{$_('admin.settings.defaults.defaultPlatformQuotas')}
			</span>
			<p class="m-0 text-xs leading-relaxed text-muted-foreground">
				{$_('admin.settings.defaults.defaultPlatformQuotasHint')}
			</p>
			<p class="m-0 mt-1 text-[11px] text-amber-500">
				{$_('admin.settings.defaults.platformQuotaNotice')}
			</p>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-xs" data-testid="default-platform-quotas">
				<thead>
					<tr>
						<th
							class="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							{$_('admin.settings.platformQuota.platform')}
						</th>
						<th
							class="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							{$_('admin.settings.platformQuota.daily')}
						</th>
						<th
							class="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							{$_('admin.settings.platformQuota.weekly')}
						</th>
						<th
							class="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							{$_('admin.settings.platformQuota.monthly')}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each PLATFORMS as p (p)}
						<tr class="align-top" data-platform={p}>
							<td class="py-1 pr-3 align-middle">
								<span class="font-mono text-[12px] text-foreground opacity-85">{p}</span>
							</td>
							<td class="py-1 pr-3">
								<input
									type="number"
									step="0.01"
									min="0"
									data-testid={`quota-${p}-daily`}
									class="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs"
									value={quotas[p].daily === null ? '' : String(quotas[p].daily)}
									placeholder={$_('admin.settings.platformQuota.placeholder')}
									oninput={(e) => patchQuota(p, 'daily', (e.target as HTMLInputElement).value)}
								/>
							</td>
							<td class="py-1 pr-3">
								<input
									type="number"
									step="0.01"
									min="0"
									data-testid={`quota-${p}-weekly`}
									class="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs"
									value={quotas[p].weekly === null ? '' : String(quotas[p].weekly)}
									placeholder={$_('admin.settings.platformQuota.placeholder')}
									oninput={(e) => patchQuota(p, 'weekly', (e.target as HTMLInputElement).value)}
								/>
							</td>
							<td class="py-1 pr-3">
								<input
									type="number"
									step="0.01"
									min="0"
									data-testid={`quota-${p}-monthly`}
									class="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs"
									value={quotas[p].monthly === null ? '' : String(quotas[p].monthly)}
									placeholder={$_('admin.settings.platformQuota.placeholder')}
									oninput={(e) => patchQuota(p, 'monthly', (e.target as HTMLInputElement).value)}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
