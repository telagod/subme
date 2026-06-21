<script lang="ts">
	/**
	 * AuthSourceDefaultsSection · 第三方注册默认值矩阵（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/AuthSourceDefaultsSection.vue。
	 *
	 * 包含两块：
	 *   1. force_email_on_third_party_signup 顶部 toggle —— flat boolean。
	 *   2. 7 个 auth source × {balance, concurrency, grant_on_signup, grant_on_first_bind,
	 *      subscriptions[], platform_quotas{4×3}}，展开发出 7 × 6 = 42 个 flat key。
	 *
	 * 与 Vue tree 差异：
	 *   - sources i18n：email/linuxdo/oidc/wechat 在 i18n 里有 sources.* 节点；
	 *     github/google/dingtalk 是 inline localText —— 这里 fall back 到 hard-coded
	 *     英文标签即可（Svelte 未通用 localText helper，且 dingtalk 没有 sources 节点）。
	 *   - subscriptions group_id 仍为 number input（无 groups API）。
	 *
	 * Sentinel：不渲染 select。
 */
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type AuthSource = 'email' | 'linuxdo' | 'oidc' | 'wechat' | 'github' | 'google' | 'dingtalk';
	const SOURCES: AuthSource[] = ['email', 'linuxdo', 'oidc', 'wechat', 'github', 'google', 'dingtalk'];

	type PlatformType = 'anthropic' | 'openai' | 'gemini' | 'antigravity';
	const PLATFORMS: PlatformType[] = ['anthropic', 'openai', 'gemini', 'antigravity'];

	type SubscriptionRow = { group_id: number; validity_days: number };
	type QuotaCell = { daily: number | null; weekly: number | null; monthly: number | null };
	type QuotaMap = Record<PlatformType, QuotaCell>;

	type SourceState = {
		balance: number;
		concurrency: number;
		grant_on_signup: boolean;
		grant_on_first_bind: boolean;
		subscriptions: SubscriptionRow[];
		platform_quotas: QuotaMap;
	};

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { values, onFieldUpdate }: Props = $props();

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

	function sanitizeQuotas(map: QuotaMap): QuotaMap {
		const clean = (v: unknown): number | null =>
			typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
		const result = {} as QuotaMap;
		for (const p of PLATFORMS) {
			const cell = map[p];
			result[p] = {
				daily: clean(cell.daily),
				weekly: clean(cell.weekly),
				monthly: clean(cell.monthly)
			};
		}
		return result;
	}

	function cloneSubs(raw: unknown): SubscriptionRow[] {
		if (!Array.isArray(raw)) return [];
		return raw
			.map((it) => ({
				group_id: Number((it as SubscriptionRow)?.group_id ?? 0),
				validity_days: Number((it as SubscriptionRow)?.validity_days ?? 30)
			}))
			.filter((it) => Number.isFinite(it.group_id));
	}

	function sanitizeSubs(rows: SubscriptionRow[]): SubscriptionRow[] {
		return rows
			.filter((r) => r.group_id > 0 && r.validity_days > 0)
			.map((r) => ({
				group_id: Math.floor(r.group_id),
				validity_days: Math.min(36500, Math.max(1, Math.floor(r.validity_days)))
			}));
	}

	function buildSourceState(s: Record<string, unknown>, src: AuthSource): SourceState {
		const prefix = `auth_source_default_${src}_`;
		return {
			balance: Number(s[`${prefix}balance`] ?? 0),
			concurrency: Math.max(1, Number(s[`${prefix}concurrency`] ?? 5)),
			grant_on_signup: s[`${prefix}grant_on_signup`] === true,
			grant_on_first_bind: s[`${prefix}grant_on_first_bind`] === true,
			subscriptions: cloneSubs(s[`${prefix}subscriptions`]),
			platform_quotas: normalizeQuotas(s[`${prefix}platform_quotas`])
		};
	}

	function buildAllState(s: Record<string, unknown>): Record<AuthSource, SourceState> {
		const map = {} as Record<AuthSource, SourceState>;
		for (const src of SOURCES) map[src] = buildSourceState(s, src);
		return map;
	}

	let forceEmail = $state(false);
	let sourceState = $state<Record<AuthSource, SourceState>>(buildAllState({}));
	let _init = false;

	$effect(() => {
		const incomingForce = values['force_email_on_third_party_signup'] === true;
		const incomingState = buildAllState(values);
		if (!_init) {
			forceEmail = incomingForce;
			sourceState = incomingState;
			_init = true;
			return;
		}
		if (incomingForce !== forceEmail) forceEmail = incomingForce;
		if (JSON.stringify(incomingState) !== JSON.stringify(sourceState)) sourceState = incomingState;
	});

	function emitForceEmail() {
		onFieldUpdate?.({ key: 'force_email_on_third_party_signup', value: forceEmail });
	}

	/**
	 * 单源 emit —— 一次 patch 6 个 flat key。
	 * 与 Vue tree appendAuthSourceDefaultsToUpdateRequest 同形。
	 */
	function emitSource(src: AuthSource) {
		const prefix = `auth_source_default_${src}_`;
		const s = sourceState[src];
		onFieldUpdate?.({ key: `${prefix}balance`, value: Number(s.balance) || 0 });
		onFieldUpdate?.({
			key: `${prefix}concurrency`,
			value: Math.max(1, Math.floor(Number(s.concurrency) || 5))
		});
		onFieldUpdate?.({ key: `${prefix}grant_on_signup`, value: s.grant_on_signup });
		onFieldUpdate?.({ key: `${prefix}grant_on_first_bind`, value: s.grant_on_first_bind });
		onFieldUpdate?.({ key: `${prefix}subscriptions`, value: sanitizeSubs(s.subscriptions) });
		onFieldUpdate?.({ key: `${prefix}platform_quotas`, value: sanitizeQuotas(s.platform_quotas) });
	}

	function toggleForceEmail() {
		forceEmail = !forceEmail;
		emitForceEmail();
	}

	function toggleGrantOnSignup(src: AuthSource) {
		sourceState = {
			...sourceState,
			[src]: { ...sourceState[src], grant_on_signup: !sourceState[src].grant_on_signup }
		};
		emitSource(src);
	}

	function toggleGrantOnFirstBind(src: AuthSource) {
		sourceState = {
			...sourceState,
			[src]: { ...sourceState[src], grant_on_first_bind: !sourceState[src].grant_on_first_bind }
		};
		emitSource(src);
	}

	function patchNumber(src: AuthSource, key: 'balance' | 'concurrency', raw: string) {
		const n = raw === '' ? 0 : Number(raw);
		sourceState = {
			...sourceState,
			[src]: { ...sourceState[src], [key]: Number.isFinite(n) ? n : 0 }
		};
		emitSource(src);
	}

	function addSubscription(src: AuthSource) {
		sourceState = {
			...sourceState,
			[src]: {
				...sourceState[src],
				subscriptions: [...sourceState[src].subscriptions, { group_id: 0, validity_days: 30 }]
			}
		};
		// 不 emit —— group_id=0 会被 sanitize 剔出；待管理员填上有效 id 再 emit。
	}

	function removeSubscription(src: AuthSource, i: number) {
		sourceState = {
			...sourceState,
			[src]: {
				...sourceState[src],
				subscriptions: sourceState[src].subscriptions.filter((_, idx) => idx !== i)
			}
		};
		emitSource(src);
	}

	function patchSubGroupId(src: AuthSource, i: number, raw: string) {
		const n = raw === '' ? 0 : Number(raw);
		sourceState = {
			...sourceState,
			[src]: {
				...sourceState[src],
				subscriptions: sourceState[src].subscriptions.map((s, idx) =>
					idx === i ? { ...s, group_id: Number.isFinite(n) ? n : 0 } : s
				)
			}
		};
		emitSource(src);
	}

	function patchSubValidity(src: AuthSource, i: number, raw: string) {
		const n = raw === '' ? 0 : Number(raw);
		sourceState = {
			...sourceState,
			[src]: {
				...sourceState[src],
				subscriptions: sourceState[src].subscriptions.map((s, idx) =>
					idx === i ? { ...s, validity_days: Number.isFinite(n) ? n : 0 } : s
				)
			}
		};
		emitSource(src);
	}

	function patchQuota(src: AuthSource, p: PlatformType, window: keyof QuotaCell, raw: string) {
		const n = raw === '' ? null : Number(raw);
		sourceState = {
			...sourceState,
			[src]: {
				...sourceState[src],
				platform_quotas: {
					...sourceState[src].platform_quotas,
					[p]: {
						...sourceState[src].platform_quotas[p],
						[window]: Number.isFinite(n as number) ? (n as number) : null
					}
				}
			}
		};
		emitSource(src);
	}

	/**
	 * 标题/描述源：
	 *   - email/linuxdo/oidc/wechat → i18n sources.<src>.{title,description}
	 *   - github/google/dingtalk → 硬编码英文（Vue tree 用 locale 切换，
	 *     Svelte 仓库 i18n 暂未铺这三条，后续补齐即可，不影响渲染）。
	 */
	function sourceTitle(src: AuthSource): string {
		switch (src) {
			case 'email':
			case 'linuxdo':
			case 'oidc':
			case 'wechat': {
				const k = `admin.settings.authSourceDefaults.sources.${src}.title`;
				const v = $_(k);
				return v === k ? src : v;
			}
			case 'github':
				return 'GitHub';
			case 'google':
				return 'Google';
			case 'dingtalk':
				return 'DingTalk';
		}
	}

	function sourceDescription(src: AuthSource): string {
		switch (src) {
			case 'email':
			case 'linuxdo':
			case 'oidc':
			case 'wechat': {
				const k = `admin.settings.authSourceDefaults.sources.${src}.description`;
				const v = $_(k);
				return v === k ? '' : v;
			}
			case 'github':
				return 'Applied on first signup or first bind through a verified GitHub email.';
			case 'google':
				return 'Applied on first signup or first bind through a verified Google email.';
			case 'dingtalk':
				return 'Applied on first signup or first bind through DingTalk.';
		}
	}
</script>

<div class="flex flex-col gap-4" data-special="auth-source-defaults">
	<!-- Force email on third-party signup -->
	<div
		class="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5"
		data-testid="force-email-row"
	>
		<div>
			<span class="block text-sm font-medium text-foreground">
				{$_('admin.settings.authSourceDefaults.requireEmailLabel')}
			</span>
			<p class="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
				{$_('admin.settings.authSourceDefaults.requireEmailHint')}
			</p>
		</div>
		<Button
			variant="ghost"
			size="icon"
			role="switch"
			aria-checked={forceEmail}
			aria-label={$_('admin.settings.authSourceDefaults.requireEmailLabel')}
			data-testid="force-email-toggle"
			data-field-key="force_email_on_third_party_signup"
			class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {forceEmail
				? 'bg-primary'
				: 'bg-muted'}"
			onclick={toggleForceEmail}
		>
			<span
				class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {forceEmail
				? 'translate-x-4'
				: 'translate-x-0.5'}"
			></span>
		</Button>
	</div>

	<!-- Per-source cards -->
	{#each SOURCES as src (src)}
		<div
			class="flex flex-col rounded-md border border-border px-4 py-3.5"
			data-testid="auth-source-card"
			data-source={src}
		>
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-semibold text-foreground">{sourceTitle(src)}</div>
					{#if sourceDescription(src)}
						<p class="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
							{sourceDescription(src)}
						</p>
					{/if}
				</div>
				<Button
					variant="ghost"
					size="icon"
					role="switch"
					aria-checked={sourceState[src].grant_on_signup}
					aria-label={sourceTitle(src)}
					data-testid={`auth-source-${src}-enabled`}
					class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {sourceState[
						src
					].grant_on_signup
						? 'bg-primary'
						: 'bg-muted'}"
					onclick={() => toggleGrantOnSignup(src)}
				>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {sourceState[
							src
						].grant_on_signup
							? 'translate-x-4'
							: 'translate-x-0.5'}"
					></span>
				</Button>
			</div>

			{#if sourceState[src].grant_on_signup}
				<div
					class="mt-3.5 flex flex-col gap-4 border-t border-border pt-3.5"
					data-testid={`auth-source-${src}-panel`}
				>
					<p class="m-0 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.authSourceDefaults.enabledHint')}
					</p>

					<!-- Balance + Concurrency -->
					<div class="grid grid-cols-2 gap-3 max-[540px]:grid-cols-1">
						<label class="flex flex-col">
							<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
								{$_('admin.settings.defaults.defaultBalance')}
							</span>
							<Input
								type="number"
								step="0.01"
								min="0"
								data-testid={`auth-source-${src}-balance`}
								class="h-9"
								value={String(sourceState[src].balance)}
								placeholder="0.00"
								oninput={(e) =>
									patchNumber(src, 'balance', (e.target as HTMLInputElement).value)}
							/>
						</label>
						<label class="flex flex-col">
							<span class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
								{$_('admin.settings.defaults.defaultConcurrency')}
							</span>
							<Input
								type="number"
								min="1"
								data-testid={`auth-source-${src}-concurrency`}
								class="h-9"
								value={String(sourceState[src].concurrency)}
								placeholder="5"
								oninput={(e) =>
									patchNumber(src, 'concurrency', (e.target as HTMLInputElement).value)}
							/>
						</label>
					</div>

					<!-- grant_on_first_bind -->
					<div
						class="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5"
						data-testid={`auth-source-${src}-first-bind-row`}
					>
						<div>
							<span class="block text-sm font-medium text-foreground">
								{$_('admin.settings.authSourceDefaults.grantOnFirstBindLabel')}
							</span>
							<p class="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
								{$_('admin.settings.authSourceDefaults.grantOnFirstBindHint')}
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon"
							role="switch"
							aria-checked={sourceState[src].grant_on_first_bind}
							aria-label={$_('admin.settings.authSourceDefaults.grantOnFirstBindLabel')}
							data-testid={`auth-source-${src}-first-bind`}
							class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {sourceState[
								src
							].grant_on_first_bind
								? 'bg-primary'
								: 'bg-muted'}"
							onclick={() => toggleGrantOnFirstBind(src)}
						>
							<span
								class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {sourceState[
									src
								].grant_on_first_bind
									? 'translate-x-4'
									: 'translate-x-0.5'}"
							></span>
						</Button>
					</div>

					<!-- Subscriptions -->
					<div class="flex flex-col gap-2.5">
						<div class="flex items-start justify-between gap-3">
							<div>
								<span class="block text-sm font-semibold text-foreground">
									{$_('admin.settings.authSourceDefaults.defaultSubscriptionsLabel')}
								</span>
								<p class="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
									{$_('admin.settings.authSourceDefaults.defaultSubscriptionsHint')}
								</p>
							</div>
							<Button
								variant="outline"
								data-testid={`auth-source-${src}-sub-add`}
								class="h-9 shrink-0 text-xs"
								onclick={() => addSubscription(src)}
							>
								+ {$_('admin.settings.defaults.addDefaultSubscription')}
							</Button>
						</div>

						{#if sourceState[src].subscriptions.length === 0}
							<div
								class="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground"
								data-testid={`auth-source-${src}-sub-empty`}
							>
								{$_('admin.settings.authSourceDefaults.noSourceSubscriptions')}
							</div>
						{:else}
							<div class="flex flex-col gap-2">
								{#each sourceState[src].subscriptions as row, i (i)}
									<div
										data-testid={`auth-source-${src}-sub-row`}
										class="grid gap-2.5 rounded-md border border-border px-3 py-2.5 [grid-template-columns:1fr_160px_auto] max-[640px]:[grid-template-columns:1fr]"
									>
										<label class="flex flex-col">
											<span
												class="mb-1 block text-[11px] font-medium text-muted-foreground"
											>
												{$_('admin.settings.defaults.subscriptionGroup')}
											</span>
											<Input
												type="number"
												min="1"
												class="h-9"
												value={row.group_id === 0 ? '' : String(row.group_id)}
												placeholder="ID"
												oninput={(e) =>
													patchSubGroupId(
														src,
														i,
														(e.target as HTMLInputElement).value
													)}
											/>
										</label>
										<label class="flex flex-col">
											<span
												class="mb-1 block text-[11px] font-medium text-muted-foreground"
											>
												{$_('admin.settings.defaults.subscriptionValidityDays')}
											</span>
											<Input
												type="number"
												min="1"
												max="36500"
												class="h-9"
												value={String(row.validity_days)}
												oninput={(e) =>
													patchSubValidity(
														src,
														i,
														(e.target as HTMLInputElement).value
													)}
											/>
										</label>
										<div class="flex items-end">
											<Button
												variant="outline"
												class="h-9 w-full text-xs text-destructive hover:bg-destructive/10"
												onclick={() => removeSubscription(src, i)}
											>
												{$_('common.delete')}
											</Button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Platform quotas matrix -->
					<div class="flex flex-col gap-2.5">
						<div class="flex flex-col gap-0.5">
							<span class="block text-sm font-semibold text-foreground">
								{$_('admin.settings.authSourceDefaults.platformQuotasOverride')}
							</span>
							<p class="m-0 text-xs leading-relaxed text-muted-foreground">
								{$_('admin.settings.authSourceDefaults.platformQuotasOverrideHint')}
							</p>
						</div>
						<div class="overflow-x-auto">
							<table class="w-full border-collapse text-xs">
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
												<span class="font-mono text-[12px] text-foreground opacity-85"
													>{p}</span
												>
											</td>
											<td class="py-1 pr-3">
												<Input
													type="number"
													step="0.01"
													min="0"
													data-testid={`auth-source-${src}-quota-${p}-daily`}
													class="h-8 w-28 px-2 text-xs"
													value={sourceState[src].platform_quotas[p].daily === null
														? ''
														: String(sourceState[src].platform_quotas[p].daily)}
													placeholder={$_('admin.settings.platformQuota.placeholder')}
													oninput={(e) =>
														patchQuota(
															src,
															p,
															'daily',
															(e.target as HTMLInputElement).value
														)}
												/>
											</td>
											<td class="py-1 pr-3">
												<Input
													type="number"
													step="0.01"
													min="0"
													data-testid={`auth-source-${src}-quota-${p}-weekly`}
													class="h-8 w-28 px-2 text-xs"
													value={sourceState[src].platform_quotas[p].weekly === null
														? ''
														: String(sourceState[src].platform_quotas[p].weekly)}
													placeholder={$_('admin.settings.platformQuota.placeholder')}
													oninput={(e) =>
														patchQuota(
															src,
															p,
															'weekly',
															(e.target as HTMLInputElement).value
														)}
												/>
											</td>
											<td class="py-1 pr-3">
												<Input
													type="number"
													step="0.01"
													min="0"
													data-testid={`auth-source-${src}-quota-${p}-monthly`}
													class="h-8 w-28 px-2 text-xs"
													value={sourceState[src].platform_quotas[p].monthly === null
														? ''
														: String(sourceState[src].platform_quotas[p].monthly)}
													placeholder={$_('admin.settings.platformQuota.placeholder')}
													oninput={(e) =>
														patchQuota(
															src,
															p,
															'monthly',
															(e.target as HTMLInputElement).value
														)}
												/>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/each}
</div>
