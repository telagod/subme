<script lang="ts">
	/**
	 * AffiliateCustomUsersSection · 邀请返利 per-user override CRUD（M10c · features tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/AffiliateCustomUsersSection.vue。
	 *
	 * 行为契约（与 Vue tree 严格同步）：
	 *   - 与 flat-form 解耦 —— 独立 fetch lifecycle，不向父级 emit field updates。
	 *     保留 onFieldUpdate 入参以匹配 SectionRenderer 统一签名。
	 *   - affiliate_enabled=false 时仅显示 disabledHint（避免误操作 + 节省一次 fetch）。
	 *   - debounce 搜索 300ms；翻页绑定 page 状态。
	 *   - Add / Edit 共用模态：add 模式带 user picker（异步 lookupUsers），
	 *     edit 模式锁定 user。
	 *   - 批量设置比例：选择 ≥1 行 → 出现 batch 按钮 → 模态 → submit。
	 *   - 重置：用 StandardDialog 确认，与其他危险操作保持一致。
	 *
	 * 不消费 props.values 的 'affiliate_enabled' 是个 effect 入口：父级 form 翻
	 * affiliate_enabled false→true 时自动触发 load()。
 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { X } from '@lucide/svelte';
	import { adminAffiliatesApi, type AffiliateAdminEntry, type SimpleUser } from '$lib/api/admin/affiliates';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values?: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		/** 保留签名以匹配 SectionRenderer 统一契约；本组件不向父级 emit。 */
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values = {}, dirtyKeys: _d, onFieldUpdate: _f }: Props = $props();

	// ── affiliate_enabled gate ─────────────────────────────────────────────
	const affiliateEnabled = $derived(values['affiliate_enabled'] === true);

	// ── List state ─────────────────────────────────────────────────────────
	let loading = $state(false);
	let entries = $state<AffiliateAdminEntry[]>([]);
	let total = $state(0);
	let page = $state(1);
	const pageSize = 20;
	let search = $state('');
	let selected = $state<number[]>([]);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	// ── Add/Edit modal ─────────────────────────────────────────────────────
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let modalSaving = $state(false);
	let modalUserQuery = $state('');
	let modalUserResults = $state<SimpleUser[]>([]);
	let modalSelectedUser = $state<SimpleUser | null>(null);
	let modalEditingEntry = $state<AffiliateAdminEntry | null>(null);
	let modalCode = $state('');
	let modalRate = $state('');
	let modalUserSearchTimer: ReturnType<typeof setTimeout> | null = null;

	// ── Batch modal ────────────────────────────────────────────────────────
	let batchOpen = $state(false);
	let batchSaving = $state(false);
	let batchRate = $state('');
	let resetDialogOpen = $state(false);
	let resetTarget = $state<AffiliateAdminEntry | null>(null);

	// ── Helpers ────────────────────────────────────────────────────────────
	/** 解析返利比例输入：null=空、undefined=非法（已 toast）、number=合法。 */
	function parseRebateRate(raw: string): number | null | undefined {
		const s = raw.trim();
		if (s === '') return null;
		const v = Number(s);
		if (!Number.isFinite(v) || v < 0 || v > 100) {
			showError($_('admin.settings.features.affiliate.modal.errorBadRate'));
			return undefined;
		}
		return v;
	}


	// ── Load ───────────────────────────────────────────────────────────────
	async function load() {
		loading = true;
		try {
			const res = await adminAffiliatesApi.listUsers({
				page,
				page_size: pageSize,
				search
			});
			entries = res.items ?? [];
			total = res.total ?? 0;
			// 把不再可见的勾选丢掉
			const visible = new Set(entries.map((e) => e.user_id));
			selected = selected.filter((id) => visible.has(id));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (affiliateEnabled) load();
	});

	// affiliate_enabled false → true 时自动加载（mirror Vue 端 watch）。
	let _prevEnabled = false;
	$effect(() => {
		if (affiliateEnabled && !_prevEnabled) {
			_prevEnabled = true;
			load();
		} else if (!affiliateEnabled) {
			_prevEnabled = false;
		}
	});

	// ── Search / pagination / selection ────────────────────────────────────
	function onSearchInput() {
		if (searchTimer != null) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			page = 1;
			load();
		}, 300);
	}

	function changePage(p: number) {
		if (p < 1 || p > totalPages) return;
		page = p;
		load();
	}

	function toggleSelectAll(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		selected = checked ? entries.map((it) => it.user_id) : [];
	}

	function toggleSelect(userId: number) {
		if (selected.includes(userId)) {
			selected = selected.filter((id) => id !== userId);
		} else {
			selected = [...selected, userId];
		}
	}

	// ── Add / edit modal ───────────────────────────────────────────────────
	function openAddModal() {
		modalOpen = true;
		modalMode = 'add';
		modalSaving = false;
		modalUserQuery = '';
		modalUserResults = [];
		modalSelectedUser = null;
		modalEditingEntry = null;
		modalCode = '';
		modalRate = '';
	}

	function openEditModal(entry: AffiliateAdminEntry) {
		modalOpen = true;
		modalMode = 'edit';
		modalSaving = false;
		modalUserQuery = '';
		modalUserResults = [];
		modalSelectedUser = null;
		modalEditingEntry = entry;
		modalCode = entry.aff_code_custom ? entry.aff_code : '';
		modalRate =
			entry.aff_rebate_rate_percent != null ? String(entry.aff_rebate_rate_percent) : '';
	}

	function closeModal() {
		modalOpen = false;
		if (modalUserSearchTimer != null) {
			clearTimeout(modalUserSearchTimer);
			modalUserSearchTimer = null;
		}
	}

	function onUserSearchInput() {
		const q = modalUserQuery.trim();
		if (!q) {
			modalUserResults = [];
			return;
		}
		if (modalUserSearchTimer != null) clearTimeout(modalUserSearchTimer);
		modalUserSearchTimer = setTimeout(async () => {
			try {
				modalUserResults = await adminAffiliatesApi.lookupUsers(q);
			} catch (err) {
				showError(err instanceof Error ? err.message : $_('common.error'));
			}
		}, 300);
	}

	function selectUser(u: SimpleUser) {
		modalSelectedUser = u;
		modalUserQuery = '';
		modalUserResults = [];
	}

	function clearSelectedUser() {
		modalSelectedUser = null;
	}

	const modalCanSubmit = $derived.by(() => {
		if (modalMode === 'add') {
			if (!modalSelectedUser) return false;
		} else if (!modalEditingEntry) {
			return false;
		}
		const codeFilled = modalCode.trim() !== '';
		const rateFilled = modalRate.trim() !== '';
		if (codeFilled || rateFilled) return true;
		return modalMode === 'edit' && modalEditingEntry?.aff_rebate_rate_percent != null;
	});

	async function submitModal() {
		if (!modalCanSubmit) {
			showError($_('admin.settings.features.affiliate.modal.errorEmpty'));
			return;
		}
		const userId = modalMode === 'add' ? modalSelectedUser!.id : modalEditingEntry!.user_id;
		const payload: Parameters<typeof adminAffiliatesApi.updateUserSettings>[1] = {};

		const codeRaw = modalCode.trim();
		if (codeRaw) payload.aff_code = codeRaw.toUpperCase();

		const rateInput = parseRebateRate(modalRate);
		if (rateInput === undefined) return;
		if (rateInput === null) {
			if (modalMode === 'edit' && modalEditingEntry?.aff_rebate_rate_percent != null) {
				payload.clear_rebate_rate = true;
			}
		} else {
			payload.aff_rebate_rate_percent = rateInput;
		}

		modalSaving = true;
		try {
			await adminAffiliatesApi.updateUserSettings(userId, payload);
			showSuccess($_('common.saved'));
			closeModal();
			page = 1;
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			modalSaving = false;
		}
	}

	// ── Batch modal ────────────────────────────────────────────────────────
	function openBatchModal() {
		if (selected.length === 0) return;
		batchOpen = true;
		batchRate = '';
	}

	async function submitBatchModal() {
		const rateInput = parseRebateRate(batchRate);
		if (rateInput === undefined) return;
		const userIDs = [...selected];
		const payload: Parameters<typeof adminAffiliatesApi.batchSetRate>[0] =
			rateInput === null
				? { user_ids: userIDs, clear: true }
				: { user_ids: userIDs, aff_rebate_rate_percent: rateInput };
		batchSaving = true;
		try {
			await adminAffiliatesApi.batchSetRate(payload);
			showSuccess($_('common.saved'));
			batchOpen = false;
			selected = [];
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			batchSaving = false;
		}
	}

	// ── Reset (delete) ─────────────────────────────────────────────────────
	function askReset(entry: AffiliateAdminEntry) {
		resetTarget = entry;
		resetDialogOpen = true;
	}

	async function confirmReset() {
		const entry = resetTarget;
		if (!entry) return;
		try {
			await adminAffiliatesApi.clearUserSettings(entry.user_id);
			resetDialogOpen = false;
			resetTarget = null;
			showSuccess($_('common.saved'));
			await load();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		}
	}
</script>

<div class="flex flex-col gap-3" data-special="affiliate-custom-users">
	{#if !affiliateEnabled}
		<div
			data-testid="affiliate-custom-users-disabled"
			class="rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted-foreground"
		>
			{$_('admin.settings.features.affiliate.customUsers.disabledHint')}
		</div>
	{:else}
		<!-- toolbar -->
		<div class="flex flex-wrap items-center gap-2">
			<Input
				type="text"
				data-testid="affiliate-custom-users-search"
				class="h-9 min-w-[160px] flex-1"
				placeholder={$_('admin.settings.features.affiliate.customUsers.searchPlaceholder')}
				bind:value={search}
				oninput={onSearchInput}
			/>
			{#if selected.length > 0}
				<Button
					variant="outline"
					class="h-9"
					data-testid="affiliate-custom-users-batch"
					onclick={openBatchModal}
				>
					{$_('admin.settings.features.affiliate.customUsers.batchButton', {
						values: { count: selected.length }
					})}
				</Button>
			{/if}
			<Button
				class="h-9"
				data-testid="affiliate-custom-users-add"
				onclick={openAddModal}
			>
				+ {$_('admin.settings.features.affiliate.customUsers.addButton')}
			</Button>
		</div>

		<!-- table -->
		<div class="overflow-hidden rounded-md border border-border">
			<table class="w-full border-collapse text-sm">
				<thead class="bg-muted/40">
					<tr class="border-b border-border text-left text-xs font-medium text-muted-foreground">
						<th class="w-9 px-3 py-2">
							<Checkbox
								data-testid="affiliate-custom-users-select-all"
								class="cursor-pointer accent-primary"
								checked={entries.length > 0 && selected.length === entries.length}
								onchange={toggleSelectAll}
							/>
						</th>
						<th class="px-3 py-2">{$_('admin.settings.features.affiliate.customUsers.col.email')}</th>
						<th class="px-3 py-2">{$_('admin.settings.features.affiliate.customUsers.col.username')}</th>
						<th class="px-3 py-2">{$_('admin.settings.features.affiliate.customUsers.col.code')}</th>
						<th class="px-3 py-2">{$_('admin.settings.features.affiliate.customUsers.col.rate')}</th>
						<th class="px-3 py-2">{$_('admin.settings.features.affiliate.customUsers.col.actions')}</th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr>
							<td
								colspan="6"
								data-testid="affiliate-custom-users-loading"
								class="px-3 py-6 text-center text-xs text-muted-foreground"
							>
								{$_('common.loading')}
							</td>
						</tr>
					{:else if entries.length === 0}
						<tr>
							<td
								colspan="6"
								data-testid="affiliate-custom-users-empty"
								class="px-3 py-6 text-center text-xs text-muted-foreground"
							>
								{$_('admin.settings.features.affiliate.customUsers.empty')}
							</td>
						</tr>
					{:else}
						{#each entries as entry (entry.user_id)}
							<tr class="border-b border-border last:border-b-0" data-testid="affiliate-custom-users-row">
								<td class="w-9 px-3 py-2">
									<Checkbox
										class="cursor-pointer accent-primary"
										checked={selected.includes(entry.user_id)}
										onchange={() => toggleSelect(entry.user_id)}
									/>
								</td>
								<td class="px-3 py-2 text-foreground">{entry.email}</td>
								<td class="px-3 py-2 text-muted-foreground">{entry.username}</td>
								<td class="px-3 py-2 font-mono text-xs">
									{entry.aff_code}
									{#if entry.aff_code_custom}
										<span
											class="ml-1 inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
										>
											{$_('admin.settings.features.affiliate.customUsers.customBadge')}
										</span>
									{/if}
								</td>
								<td class="px-3 py-2">
									{#if entry.aff_rebate_rate_percent != null}
										<span>{entry.aff_rebate_rate_percent}%</span>
									{:else}
										<span class="text-muted-foreground"
											>{$_('admin.settings.features.affiliate.customUsers.useGlobal')}</span
										>
									{/if}
								</td>
								<td class="px-3 py-2">
									<div class="flex items-center gap-2.5">
										<Button
											variant="ghost"
											size="sm"
											class="h-auto px-0 py-0 text-xs text-primary hover:bg-transparent hover:underline"
											onclick={() => openEditModal(entry)}
										>
											{$_('common.edit')}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											class="h-auto px-0 py-0 text-xs text-destructive hover:bg-transparent hover:underline"
											onclick={() => askReset(entry)}
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

		<!-- pagination -->
		{#if total > pageSize}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="text-xs text-muted-foreground">
					{$_('admin.settings.features.affiliate.customUsers.totalLabel', {
						values: { total }
					})}
				</span>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onclick={() => changePage(page - 1)}
					>
						{$_('pagination.previous')}
					</Button>
					<span class="min-w-[48px] text-center text-xs text-muted-foreground">
						{page} / {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages}
						onclick={() => changePage(page + 1)}
					>
						{$_('pagination.next')}
					</Button>
				</div>
			</div>
		{/if}

		<!-- add/edit modal -->
		<StandardDialog
			bind:open={modalOpen}
			width="sm"
			title={modalMode === 'add'
				? $_('admin.settings.features.affiliate.modal.addTitle')
				: $_('admin.settings.features.affiliate.modal.editTitle')}
			data-testid="affiliate-custom-users-modal"
		>
			<div class="mt-4 flex flex-col gap-4">
					<div class="flex flex-col gap-3.5">
						<!-- user picker (add mode) -->
						{#if modalMode === 'add'}
							<div class="flex flex-col gap-1.5">
								<span class="text-xs font-medium text-foreground">
									{$_('admin.settings.features.affiliate.modal.userLabel')}
								</span>
								{#if modalSelectedUser}
									<div
										class="flex items-center justify-between rounded-md border border-input bg-accent px-3 py-2"
										data-testid="affiliate-custom-users-modal-selected"
									>
										<div class="flex items-baseline gap-1">
											<span class="text-sm font-medium text-foreground">{modalSelectedUser.email}</span>
											<span class="text-xs text-muted-foreground">({modalSelectedUser.username})</span>
										</div>
										<Button
											variant="ghost"
											size="icon"
											aria-label={$_('admin.settings.features.affiliate.modal.changeUser')}
											class="h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
											onclick={clearSelectedUser}
										>
											<X class="h-3 w-3" />
										</Button>
									</div>
								{:else}
									<Input
										type="text"
										class="h-9"
										placeholder={$_('admin.settings.features.affiliate.modal.userPlaceholder')}
										bind:value={modalUserQuery}
										oninput={onUserSearchInput}
									/>
									{#if modalUserResults.length > 0}
										<div class="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover">
											{#each modalUserResults as u (u.id)}
												<Button
													variant="ghost"
													size="sm"
													class="block h-auto w-full justify-start px-3 py-2 text-left text-sm text-foreground"
													onclick={() => selectUser(u)}
												>
													{u.email}
													<span class="text-xs text-muted-foreground">({u.username})</span>
												</Button>
											{/each}
										</div>
									{/if}
								{/if}
							</div>
						{:else}
							<label class="flex flex-col gap-1.5">
								<span class="text-xs font-medium text-foreground">
									{$_('admin.settings.features.affiliate.modal.userLabel')}
								</span>
								<Input
									type="text"
									class="h-9 bg-muted text-muted-foreground"
									value={modalEditingEntry?.email ?? ''}
									disabled
								/>
							</label>
						{/if}

						<!-- invite code -->
						<label class="flex flex-col gap-1.5">
							<span class="text-xs font-medium text-foreground">
								{$_('admin.settings.features.affiliate.modal.codeLabel')}
							</span>
							<Input
								type="text"
								class="h-9 font-mono"
								placeholder={$_('admin.settings.features.affiliate.modal.codePlaceholder')}
								maxlength={32}
								bind:value={modalCode}
							/>
							<p class="m-0 text-[11px] leading-normal text-muted-foreground">
								{$_('admin.settings.features.affiliate.modal.codeHint')}
							</p>
						</label>

						<!-- rate -->
						<label class="flex flex-col gap-1.5">
							<span class="text-xs font-medium text-foreground">
								{$_('admin.settings.features.affiliate.modal.rateLabel')}
							</span>
							<div class="relative">
								<Input
									type="number"
									step="0.01"
									min="0"
									max="100"
									class="h-9 pr-8"
									placeholder={$_('admin.settings.features.affiliate.modal.ratePlaceholder')}
									bind:value={modalRate}
								/>
								<span
									class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
									>%</span
								>
							</div>
							<p class="m-0 text-[11px] leading-normal text-muted-foreground">
								{$_('admin.settings.features.affiliate.modal.rateHint')}
							</p>
						</label>
					</div>

					<div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
						{#if !modalCanSubmit}
							<p class="m-0 text-[11.5px] text-destructive">
								{$_('admin.settings.features.affiliate.modal.errorEmpty')}
							</p>
						{:else}
							<span></span>
						{/if}
						<div class="flex gap-2">
							<Button
								variant="outline"
								class="h-9"
								onclick={closeModal}
							>
								{$_('common.cancel')}
							</Button>
							<Button
								class="h-9"
								data-testid="affiliate-custom-users-modal-save"
								disabled={modalSaving || !modalCanSubmit}
								onclick={submitModal}
							>
								{modalSaving ? $_('common.saving') : $_('common.save')}
							</Button>
						</div>
					</div>
			</div>
		</StandardDialog>

		<!-- batch rate modal -->
		<StandardDialog
			bind:open={batchOpen}
			width="sm"
			title={$_('admin.settings.features.affiliate.batchModal.title', {
				values: { count: selected.length }
			})}
			data-testid="affiliate-custom-users-batch-modal"
		>
			<div class="mt-4 flex flex-col gap-4">
					<p class="m-0 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.features.affiliate.batchModal.hint')}
					</p>
					<div class="relative">
						<Input
							type="number"
							step="0.01"
							min="0"
							max="100"
							class="h-9 pr-8"
							placeholder={$_('admin.settings.features.affiliate.batchModal.placeholder')}
							bind:value={batchRate}
						/>
						<span
							class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span
						>
					</div>
					<p class="m-0 text-[11px] leading-normal text-muted-foreground">
						{$_('admin.settings.features.affiliate.batchModal.clearHint')}
					</p>
					<div class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
						<Button
							variant="outline"
							class="h-9"
							onclick={() => (batchOpen = false)}
						>
							{$_('common.cancel')}
						</Button>
						<Button
							class="h-9"
							data-testid="affiliate-custom-users-batch-save"
							disabled={batchSaving}
							onclick={submitBatchModal}
						>
							{batchSaving ? $_('common.saving') : $_('common.save')}
						</Button>
					</div>
			</div>
		</StandardDialog>

		<StandardDialog
			bind:open={resetDialogOpen}
			width="sm"
			title={$_('common.delete')}
			data-testid="affiliate-custom-users-reset-dialog"
		>
			<div class="mt-4 space-y-4">
				<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{$_('admin.settings.features.affiliate.customUsers.resetMessage', {
						values: {
							email: resetTarget?.email || (resetTarget ? `#${resetTarget.user_id}` : '')
						}
					})}
				</p>
				<div class="flex justify-end gap-2 border-t border-border pt-4">
					<Button variant="outline" onclick={() => (resetDialogOpen = false)}>
						{$_('common.cancel')}
					</Button>
					<Button
						variant="outline"
						class="border-destructive/30 text-destructive hover:bg-destructive/10"
						onclick={confirmReset}
						data-testid="affiliate-custom-users-reset-confirm"
					>
						{$_('common.delete')}
					</Button>
				</div>
			</div>
		</StandardDialog>
	{/if}
</div>
