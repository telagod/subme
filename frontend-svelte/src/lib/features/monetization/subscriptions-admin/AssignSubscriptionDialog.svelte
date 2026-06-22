<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Search, UserPlus, X, Calendar, Users, Zap } from '@lucide/svelte';
	import { assignSub } from '$lib/api/admin/subscriptions';
	import { listGroups, type AdminGroupLite } from '$lib/api/admin/plans';
	import { listUsers, type AdminUser } from '$lib/api/admin/users';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = { open: boolean; onAssigned?: () => void };
	let { open = $bindable(false), onAssigned }: Props = $props();

	let searchQuery = $state('');
	let searchResults = $state<AdminUser[]>([]);
	let searchLoading = $state(false);
	let showDropdown = $state(false);
	let selectedUser = $state<AdminUser | null>(null);

	let groups = $state<AdminGroupLite[]>([]);
	let groupsLoading = $state(false);
	let selectedGroupId = $state<number | null>(null);
	let validityDays = $state(30);
	let notes = $state('');
	let submitting = $state(false);
	let formError = $state('');

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const VALIDITY_PRESETS = [
		{ days: 7, label: '7 天' },
		{ days: 30, label: '30 天' },
		{ days: 90, label: '90 天' },
		{ days: 180, label: '半年' },
		{ days: 365, label: '1 年' },
		{ days: 0, label: '永久' }
	];

	const selectedGroup = $derived(groups.find(g => g.id === selectedGroupId));

	$effect(() => {
		if (open) {
			void loadGroups();
			resetForm();
		}
	});

	async function loadGroups() {
		if (groups.length > 0) return;
		groupsLoading = true;
		try { groups = await listGroups(); } catch { groups = []; }
		groupsLoading = false;
	}

	function onSearchInput(e: Event) {
		const q = (e.target as HTMLInputElement).value;
		searchQuery = q;
		selectedUser = null;
		if (debounceTimer) clearTimeout(debounceTimer);
		if (q.trim().length < 2) { searchResults = []; showDropdown = false; return; }
		debounceTimer = setTimeout(() => void doSearch(q.trim()), 300);
	}

	async function doSearch(q: string) {
		searchLoading = true;
		showDropdown = true;
		try {
			const res = await listUsers(1, 8, { search: q });
			searchResults = res.items;
		} catch { searchResults = []; }
		searchLoading = false;
	}

	function selectUser(u: AdminUser) {
		selectedUser = u;
		searchQuery = u.email;
		showDropdown = false;
		searchResults = [];
	}

	function clearUser() {
		selectedUser = null;
		searchQuery = '';
		searchResults = [];
	}

	function resetForm() {
		searchQuery = ''; selectedUser = null; searchResults = [];
		selectedGroupId = null; validityDays = 30; notes = ''; formError = '';
		submitting = false; showDropdown = false;
	}

	async function handleSubmit() {
		formError = '';
		if (!selectedUser) { formError = '请搜索并选择一个用户'; return; }
		if (!selectedGroupId) { formError = '请选择分组方案'; return; }
		submitting = true;
		try {
			await assignSub({
				user_id: selectedUser.id,
				group_id: selectedGroupId,
				validity_days: validityDays > 0 ? validityDays : undefined,
				notes: notes.trim() || undefined
			});
			showSuccess($_('admin.subscriptions.assignSuccess', { default: '订阅已成功分配给 {email}', values: { email: selectedUser.email } }));
			onAssigned?.();
			open = false;
			setTimeout(resetForm, 200);
		} catch (err) {
			formError = (err as Error)?.message ?? '未知错误';
			showError(formError);
		} finally { submitting = false; }
	}
</script>

<StandardDialog bind:open width="lg" title={$_('admin.subscriptions.assignTitle', { default: '分配订阅' })} data-testid="assign-sub-dialog">
	<form onsubmit={(e) => { e.preventDefault(); void handleSubmit(); }} data-testid="assign-sub-form" class="mt-2 space-y-5">

		<!-- Step 1: User search -->
		<div class="space-y-2">
			<label class="flex items-center gap-1.5 text-sm font-medium">
				<Users size={14} class="text-muted-foreground" />
				{$_('admin.subscriptions.assignUserLabel', { default: '选择用户' })}
			</label>

			{#if selectedUser}
				<div class="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
					<div class="flex items-center gap-3">
						<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
							{(selectedUser.email?.[0] ?? 'U').toUpperCase()}
						</div>
						<div>
							<p class="text-sm font-medium">{selectedUser.email}</p>
							<p class="text-xs text-muted-foreground">
								ID: {selectedUser.id}
								{selectedUser.username ? ` · @${selectedUser.username}` : ''}
								· <Badge class="text-[10px]">{selectedUser.role}</Badge>
								· 余额 ${(selectedUser.balance ?? 0).toFixed(2)}
							</p>
						</div>
					</div>
					<Button size="icon" variant="ghost" class="h-7 w-7" onclick={clearUser}><X size={14} /></Button>
				</div>
			{:else}
				<div class="relative">
					<div class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						<Search size={14} />
					</div>
					<Input
						class="pl-9"
						placeholder={$_('admin.subscriptions.assignSearchPlaceholder', { default: '输入邮箱、用户名或 ID 搜索...' })}
						value={searchQuery}
						oninput={onSearchInput}
						onfocus={() => { if (searchResults.length) showDropdown = true; }}
						onblur={() => setTimeout(() => (showDropdown = false), 200)}
						data-testid="assign-user-search"
						disabled={submitting}
					/>
					{#if showDropdown}
						<div class="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
							{#if searchLoading}
								<div class="px-4 py-3 text-sm text-muted-foreground">搜索中...</div>
							{:else if searchResults.length === 0}
								<div class="px-4 py-3 text-sm text-muted-foreground">未找到匹配用户</div>
							{:else}
								{#each searchResults as u (u.id)}
									<button
										type="button"
										class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
										onmousedown={() => selectUser(u)}
									>
										<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
											{(u.email?.[0] ?? 'U').toUpperCase()}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{u.email}</p>
											<p class="text-xs text-muted-foreground">
												#{u.id}{u.username ? ` · @${u.username}` : ''} · {u.role}
											</p>
										</div>
										<span class="shrink-0 text-xs font-mono text-muted-foreground">${(u.balance ?? 0).toFixed(2)}</span>
									</button>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Step 2: Group/plan picker as cards -->
		<div class="space-y-2">
			<label class="flex items-center gap-1.5 text-sm font-medium">
				<Zap size={14} class="text-muted-foreground" />
				{$_('admin.subscriptions.assignGroupLabel', { default: '选择方案' })}
			</label>
			{#if groupsLoading}
				<div class="grid grid-cols-2 gap-2">
					{#each Array(4) as _, i (i)}
						<div class="h-16 animate-pulse rounded-lg border bg-muted"></div>
					{/each}
				</div>
			{:else if groups.length === 0}
				<div class="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">暂无可用分组</div>
			{:else}
				<div class="grid grid-cols-2 gap-2 lg:grid-cols-3" data-testid="assign-group-grid">
					{#each groups as g (g.id)}
						<button
							type="button"
							class="rounded-lg border px-3 py-2.5 text-left transition-all {selectedGroupId === g.id
								? 'border-primary bg-primary/5 ring-1 ring-primary/30'
								: 'border-border hover:border-primary/40 hover:bg-muted/30'}"
							onclick={() => (selectedGroupId = g.id)}
							data-testid="assign-group-{g.id}"
						>
							<p class="text-sm font-medium">{g.name}</p>
							<div class="mt-1 flex flex-wrap gap-1.5">
								<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">{g.platform}</span>
								{#if g.rate_multiplier && g.rate_multiplier !== 1}
									<span class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">×{g.rate_multiplier}</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Step 3: Validity -->
		<div class="space-y-2">
			<label class="flex items-center gap-1.5 text-sm font-medium">
				<Calendar size={14} class="text-muted-foreground" />
				{$_('admin.subscriptions.assignValidityLabel', { default: '有效期' })}
			</label>
			<div class="flex flex-wrap gap-1.5">
				{#each VALIDITY_PRESETS as preset (preset.days)}
					<button
						type="button"
						class="rounded-md border px-3 py-1.5 text-xs font-medium transition-all {validityDays === preset.days
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}"
						onclick={() => (validityDays = preset.days)}
					>
						{preset.label}
					</button>
				{/each}
				<Input
					type="number" min="1" max="36500" class="ml-2 h-8 w-20 text-xs"
					placeholder="自定义" bind:value={validityDays} disabled={submitting}
					data-testid="assign-validity"
				/>
				<span class="self-center text-xs text-muted-foreground">天</span>
			</div>
		</div>

		<!-- Notes -->
		<div class="space-y-1.5">
			<label class="text-sm font-medium">{$_('admin.subscriptions.assignNotesLabel', { default: '备注（可选）' })}</label>
			<Textarea class="min-h-14 text-sm" placeholder="分配原因..." bind:value={notes} disabled={submitting} data-testid="assign-notes" />
		</div>

		{#if formError}
			<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="assign-error">{formError}</Alert>
		{/if}

		<!-- Summary + submit -->
		<div class="flex items-center justify-between border-t border-border pt-4">
			<div class="text-xs text-muted-foreground">
				{#if selectedUser && selectedGroup}
					{selectedUser.email} → <span class="font-medium text-foreground">{selectedGroup.name}</span>
					· {validityDays > 0 ? `${validityDays} 天` : '永久'}
				{:else}
					请完成上方选择
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => { open = false; setTimeout(resetForm, 200); }} disabled={submitting} data-testid="assign-cancel-btn">取消</Button>
				<Button type="submit" disabled={submitting || !selectedUser || !selectedGroupId} data-testid="assign-submit-btn">
					{submitting ? '分配中...' : '确认分配'}
				</Button>
			</div>
		</div>
	</form>
</StandardDialog>
