<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import {
		batchSetGroupRateMultipliers,
		batchSetGroupRPMOverrides,
		clearGroupRateMultipliers,
		clearGroupRPMOverrides,
		getGroupCapacitySummary,
		getGroupUsageSummary,
		getModelsListCandidates,
		listGroupRateMultipliers,
		type AdminGroup,
		type GroupCapacitySummary,
		type GroupRateMultiplierEntry,
		type GroupUsageSummary
	} from '$lib/api/admin/groups';
	import { listUsers, type AdminUser } from '$lib/api/admin/users';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	interface Props {
		open: boolean;
		group: AdminGroup | null;
		onClose: () => void;
		onReload: () => void;
		onConfirm: (title: string, message: string, action: () => Promise<void>) => void;
	}

	let { open = $bindable(), group, onClose, onReload, onConfirm }: Props = $props();

	let controlsLoading = $state(false);
	let controlsSaving = $state(false);
	let controlsError = $state<string | null>(null);
	let rateEntries = $state<GroupRateMultiplierEntry[]>([]);
	let rpmEntries = $state<GroupRateMultiplierEntry[]>([]);
	let serverRateEntries = $state<GroupRateMultiplierEntry[]>([]);
	let serverRpmEntries = $state<GroupRateMultiplierEntry[]>([]);
	let usageSummary = $state<GroupUsageSummary[]>([]);
	let capacitySummary = $state<GroupCapacitySummary[]>([]);
	let modelCandidates = $state<string[]>([]);
	let groupUserSearch = $state('');
	let groupUserSearchResults = $state<AdminUser[]>([]);
	let groupUserSearchLoading = $state(false);
	let selectedGroupUser = $state<AdminUser | null>(null);
	let newRateUserId = $state('');
	let newRateMultiplier = $state('1');
	let rateBatchFactor = $state('');
	let newRpmUserId = $state('');
	let newRpmOverride = $state('60');

	const controlsGroupId = $derived(group?.id);
	const selectedUsage = $derived(
		controlsGroupId ? usageSummary.find((item) => Number(item.group_id) === controlsGroupId) : undefined
	);
	const selectedCapacity = $derived(
		controlsGroupId ? capacitySummary.find((item) => Number(item.group_id) === controlsGroupId) : undefined
	);
	const rateEntriesDirty = $derived(
		rateEntries.length !== serverRateEntries.length ||
			rateEntries.some((entry) => {
				const server = serverRateEntries.find((item) => item.user_id === entry.user_id);
				return !server || Number(server.rate_multiplier ?? 0) !== Number(entry.rate_multiplier ?? 0);
			})
	);
	const rpmEntriesDirty = $derived(
		rpmEntries.length !== serverRpmEntries.length ||
			rpmEntries.some((entry) => {
				const server = serverRpmEntries.find((item) => item.user_id === entry.user_id);
				return !server || Number(server.rpm_override ?? 0) !== Number(entry.rpm_override ?? 0);
			})
	);

	function formatCost(value: number | null | undefined) {
		return `$${Number(value ?? 0).toFixed(2)}`;
	}

	function capacityText(used: number | null | undefined, max: number | null | undefined) {
		return `${used ?? 0} / ${max && max > 0 ? max : '-'}`;
	}

	function userLabel(entry: GroupRateMultiplierEntry) {
		return entry.user_name || entry.user_email || `User #${entry.user_id}`;
	}

	function cloneGroupControlEntries(entries: GroupRateMultiplierEntry[]) {
		return entries.map((entry) => ({ ...entry }));
	}

	function selectedGroupUserLabel(user: AdminUser) {
		return user.username ? `${user.email} (${user.username})` : user.email;
	}

	function setSelectedGroupUser(user: AdminUser) {
		selectedGroupUser = user;
		groupUserSearch = selectedGroupUserLabel(user);
		groupUserSearchResults = [];
		newRateUserId = String(user.id);
		newRpmUserId = String(user.id);
	}

	async function searchGroupUsers() {
		const query = groupUserSearch.trim();
		if (!query) {
			groupUserSearchResults = [];
			selectedGroupUser = null;
			return;
		}
		groupUserSearchLoading = true;
		try {
			const resp = await listUsers(1, 10, { search: query });
			groupUserSearchResults = resp.items;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
			groupUserSearchResults = [];
		} finally {
			groupUserSearchLoading = false;
		}
	}

	function applyRateBatchFactor() {
		const factor = Number(rateBatchFactor);
		if (!Number.isFinite(factor) || factor <= 0) {
			showError('Enter a valid multiplier factor');
			return;
		}
		rateEntries = rateEntries.map((entry) => ({
			...entry,
			rate_multiplier: Number(((Number(entry.rate_multiplier ?? 1) || 1) * factor).toFixed(6))
		}));
		rateBatchFactor = '';
	}

	function resetRateEntriesToServer() {
		rateEntries = cloneGroupControlEntries(serverRateEntries);
		rateBatchFactor = '';
	}

	function resetRpmEntriesToServer() {
		rpmEntries = cloneGroupControlEntries(serverRpmEntries);
	}

	function setRateEntry(index: number, value: string) {
		const parsed = value === '' ? null : Number(value);
		rateEntries[index] = { ...rateEntries[index], rate_multiplier: parsed };
	}

	function setRpmEntry(index: number, value: string) {
		const parsed = value === '' ? null : Number(value);
		rpmEntries[index] = { ...rpmEntries[index], rpm_override: parsed };
	}

	export function openControls(targetGroup: AdminGroup) {
		newRateUserId = '';
		newRateMultiplier = '1';
		rateBatchFactor = '';
		newRpmUserId = '';
		newRpmOverride = '60';
		groupUserSearch = '';
		groupUserSearchResults = [];
		selectedGroupUser = null;
		serverRateEntries = [];
		serverRpmEntries = [];
		modelCandidates = [];
		open = true;
		void loadGroupControls(targetGroup);
	}

	async function loadGroupControls(targetGroup: AdminGroup) {
		controlsLoading = true;
		controlsError = null;
		try {
			const [entries, usage, capacity, candidates] = await Promise.all([
				listGroupRateMultipliers(targetGroup.id),
				getGroupUsageSummary(),
				getGroupCapacitySummary(),
				getModelsListCandidates(targetGroup.id, targetGroup.platform)
			]);
			serverRateEntries = entries.filter((entry) => entry.rate_multiplier != null).map((entry) => ({ ...entry }));
			serverRpmEntries = entries.filter((entry) => entry.rpm_override != null).map((entry) => ({ ...entry }));
			rateEntries = cloneGroupControlEntries(serverRateEntries);
			rpmEntries = cloneGroupControlEntries(serverRpmEntries);
			usageSummary = usage;
			capacitySummary = capacity;
			modelCandidates = candidates;
		} catch (err) {
			controlsError = err instanceof Error ? err.message : String(err);
		} finally {
			controlsLoading = false;
		}
	}

	function addRateEntry() {
		const userId = Number(selectedGroupUser?.id ?? newRateUserId);
		const rate = Number(newRateMultiplier);
		if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(rate) || rate <= 0) {
			showError('Enter a valid user ID and rate multiplier');
			return;
		}
		const existing = rateEntries.findIndex((entry) => entry.user_id === userId);
		const next = {
			user_id: userId,
			user_name: selectedGroupUser?.username ?? undefined,
			user_email: selectedGroupUser?.email ?? undefined,
			user_notes: selectedGroupUser?.notes ?? undefined,
			user_status: selectedGroupUser?.status ?? undefined,
			rate_multiplier: rate
		};
		if (existing >= 0) rateEntries[existing] = { ...rateEntries[existing], ...next };
		else rateEntries = [...rateEntries, next];
		newRateUserId = '';
		newRateMultiplier = '1';
		groupUserSearch = '';
		selectedGroupUser = null;
	}

	function addRpmEntry() {
		const userId = Number(selectedGroupUser?.id ?? newRpmUserId);
		const rpm = Number(newRpmOverride);
		if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(rpm) || rpm < 0) {
			showError('Enter a valid user ID and RPM override');
			return;
		}
		const existing = rpmEntries.findIndex((entry) => entry.user_id === userId);
		const next = {
			user_id: userId,
			user_name: selectedGroupUser?.username ?? undefined,
			user_email: selectedGroupUser?.email ?? undefined,
			user_notes: selectedGroupUser?.notes ?? undefined,
			user_status: selectedGroupUser?.status ?? undefined,
			rpm_override: rpm
		};
		if (existing >= 0) rpmEntries[existing] = { ...rpmEntries[existing], ...next };
		else rpmEntries = [...rpmEntries, next];
		newRpmUserId = '';
		newRpmOverride = '60';
		groupUserSearch = '';
		selectedGroupUser = null;
	}

	async function saveRateMultipliers() {
		if (!group) return;
		controlsSaving = true;
		try {
			await batchSetGroupRateMultipliers(
				group.id,
				rateEntries
					.filter((entry) => entry.rate_multiplier != null && Number(entry.rate_multiplier) > 0)
					.map((entry) => ({ user_id: entry.user_id, rate_multiplier: Number(entry.rate_multiplier) }))
			);
			serverRateEntries = cloneGroupControlEntries(rateEntries);
			showSuccess('Rate multipliers saved');
			onReload();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			controlsSaving = false;
		}
	}

	async function saveRpmOverrides() {
		if (!group) return;
		controlsSaving = true;
		try {
			await batchSetGroupRPMOverrides(
				group.id,
				rpmEntries
					.filter((entry) => entry.rpm_override != null && Number(entry.rpm_override) >= 0)
					.map((entry) => ({ user_id: entry.user_id, rpm_override: Number(entry.rpm_override) }))
			);
			serverRpmEntries = cloneGroupControlEntries(rpmEntries);
			showSuccess('RPM overrides saved');
			onReload();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			controlsSaving = false;
		}
	}

	function clearRates() {
		if (!group) return;
		const g = group;
		onConfirm('Clear rate multipliers', `Clear all rate multipliers for "${g.name}"?`, async () => {
			controlsSaving = true;
			try {
				await clearGroupRateMultipliers(g.id);
				rateEntries = [];
				serverRateEntries = [];
				showSuccess('Rate multipliers cleared');
				onReload();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				controlsSaving = false;
			}
		});
	}

	function clearRpm() {
		if (!group) return;
		const g = group;
		onConfirm('Clear RPM overrides', `Clear all RPM overrides for "${g.name}"?`, async () => {
			controlsSaving = true;
			try {
				await clearGroupRPMOverrides(g.id);
				rpmEntries = [];
				serverRpmEntries = [];
				showSuccess('RPM overrides cleared');
				onReload();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				controlsSaving = false;
			}
		});
	}
</script>

<StandardDialog bind:open title={group ? `${group.name} controls` : 'Group controls'} width="lg" data-testid="group-controls-dialog">
	<div class="mt-4 space-y-4">
		{#if controlsError}
			<Alert variant="destructive">{controlsError}</Alert>
		{/if}

		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">Today cost</p>
				<p class="mt-2 text-xl font-semibold">{formatCost(selectedUsage?.today_cost)}</p>
			</Card>
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">Total cost</p>
				<p class="mt-2 text-xl font-semibold">{formatCost(selectedUsage?.total_cost)}</p>
			</Card>
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">RPM capacity</p>
				<p class="mt-2 text-xl font-semibold">{capacityText(selectedCapacity?.rpm_used, selectedCapacity?.rpm_max)}</p>
			</Card>
		</div>

		<Card class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold">Model candidates</h2>
					<p class="text-xs text-muted-foreground">Read-only upstream model candidates for this group platform.</p>
				</div>
				<Badge variant="outline">{modelCandidates.length}</Badge>
			</div>
			<div class="max-h-36 overflow-auto rounded-md border border-border" data-testid="group-model-candidates">
				{#if controlsLoading}
					<p class="p-4 text-sm text-muted-foreground">Loading controls...</p>
				{:else if modelCandidates.length === 0}
					<p class="p-4 text-sm text-muted-foreground">No model candidates reported.</p>
				{:else}
					<div class="flex flex-wrap gap-2 p-3">
						{#each modelCandidates as model}
							<Badge variant="outline">{model}</Badge>
						{/each}
					</div>
				{/if}
			</div>
		</Card>

		<Card class="space-y-3">
			<div class="grid gap-2 rounded-md border border-border p-3">
				<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
					<label class="grid gap-1 text-sm">
						User search
						<Input
							placeholder="Search email or username"
							bind:value={groupUserSearch}
							oninput={() => {
								selectedGroupUser = null;
								newRateUserId = '';
								newRpmUserId = '';
							}}
							data-testid="group-user-search"
						/>
					</label>
					<div class="flex items-end">
						<Button variant="outline" disabled={groupUserSearchLoading || !groupUserSearch.trim()} onclick={searchGroupUsers} data-testid="group-user-search-run">
							{groupUserSearchLoading ? 'Searching...' : 'Search users'}
						</Button>
					</div>
				</div>
				{#if groupUserSearchResults.length > 0}
					<div class="grid max-h-36 gap-1 overflow-auto rounded-md border border-border p-1" data-testid="group-user-search-results">
						{#each groupUserSearchResults as user}
							<Button variant="ghost" size="sm" class="justify-start" onclick={() => setSelectedGroupUser(user)}>
								#{user.id} · {user.email}{user.username ? ` · ${user.username}` : ''}
							</Button>
						{/each}
					</div>
				{/if}
				{#if selectedGroupUser}
					<p class="text-xs text-muted-foreground" data-testid="group-selected-user">
						Selected #{selectedGroupUser.id} · {selectedGroupUser.email}
					</p>
				{/if}
			</div>

			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold">Rate multipliers</h2>
					<p class="text-xs text-muted-foreground">Per-user billing multiplier overrides for this group.</p>
				</div>
				<div class="flex flex-wrap justify-end gap-2">
					{#if rateEntriesDirty}
						<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading} onclick={resetRateEntriesToServer}>{$_('common.revert', { default: 'Revert' })}</Button>
					{/if}
					<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading || rateEntries.length === 0} onclick={clearRates}>{$_('common.clear', { default: 'Clear' })}</Button>
				</div>
			</div>
			<div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
				<Input placeholder="User ID" inputmode="numeric" bind:value={newRateUserId} data-testid="group-rate-user-id" />
				<Input placeholder="Rate multiplier" type="number" min="0.01" step="0.1" bind:value={newRateMultiplier} data-testid="group-rate-new-value" />
				<Button variant="outline" onclick={addRateEntry}>Add</Button>
			</div>
			{#if rateEntries.length > 0}
				<div class="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_auto]">
					<Input placeholder="Batch factor, e.g. 0.5" type="number" min="0.0001" step="0.1" bind:value={rateBatchFactor} data-testid="group-rate-batch-factor" />
					<Button variant="outline" disabled={!String(rateBatchFactor).trim()} onclick={applyRateBatchFactor}>{$_('admin.groups.applyFactor', { default: 'Apply factor' })}</Button>
				</div>
			{/if}
			<div class="max-h-48 overflow-auto rounded-md border border-border" data-testid="group-rate-list">
				{#if controlsLoading}
					<p class="p-4 text-sm text-muted-foreground">Loading controls...</p>
				{:else if rateEntries.length === 0}
					<p class="p-4 text-sm text-muted-foreground">No user rate multipliers.</p>
				{:else}
					{#each rateEntries as entry, index (entry.user_id)}
						<div class="grid grid-cols-[1fr_120px_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
							<div class="min-w-0">
								<p class="truncate font-medium">{userLabel(entry)}</p>
								<p class="text-xs text-muted-foreground">#{entry.user_id}</p>
							</div>
							<Input type="number" min="0.01" step="0.1" value={entry.rate_multiplier ?? ''} oninput={(event) => setRateEntry(index, event.currentTarget.value)} />
							<Button variant="ghost" size="sm" onclick={() => (rateEntries = rateEntries.filter((item) => item.user_id !== entry.user_id))}>{$_('common.remove', { default: 'Remove' })}</Button>
						</div>
					{/each}
				{/if}
			</div>
			<div class="flex justify-end">
				<Button disabled={controlsSaving || controlsLoading} onclick={saveRateMultipliers}>Save rates</Button>
			</div>
		</Card>

		<Card class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold">RPM overrides</h2>
					<p class="text-xs text-muted-foreground">Per-user RPM caps in this group; 0 means unlimited.</p>
				</div>
				<div class="flex flex-wrap justify-end gap-2">
					{#if rpmEntriesDirty}
						<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading} onclick={resetRpmEntriesToServer}>{$_('common.revert', { default: 'Revert' })}</Button>
					{/if}
					<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading || rpmEntries.length === 0} onclick={clearRpm}>{$_('common.clear', { default: 'Clear' })}</Button>
				</div>
			</div>
			<div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
				<Input placeholder="User ID" inputmode="numeric" bind:value={newRpmUserId} data-testid="group-rpm-user-id" />
				<Input placeholder="RPM override" type="number" min="0" step="1" bind:value={newRpmOverride} data-testid="group-rpm-new-value" />
				<Button variant="outline" onclick={addRpmEntry}>Add</Button>
			</div>
			<div class="max-h-48 overflow-auto rounded-md border border-border" data-testid="group-rpm-list">
				{#if controlsLoading}
					<p class="p-4 text-sm text-muted-foreground">Loading controls...</p>
				{:else if rpmEntries.length === 0}
					<p class="p-4 text-sm text-muted-foreground">No user RPM overrides.</p>
				{:else}
					{#each rpmEntries as entry, index (entry.user_id)}
						<div class="grid grid-cols-[1fr_120px_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
							<div class="min-w-0">
								<p class="truncate font-medium">{userLabel(entry)}</p>
								<p class="text-xs text-muted-foreground">#{entry.user_id}</p>
							</div>
							<Input type="number" min="0" step="1" value={entry.rpm_override ?? ''} oninput={(event) => setRpmEntry(index, event.currentTarget.value)} />
							<Button variant="ghost" size="sm" onclick={() => (rpmEntries = rpmEntries.filter((item) => item.user_id !== entry.user_id))}>{$_('common.remove', { default: 'Remove' })}</Button>
						</div>
					{/each}
				{/if}
			</div>
			<div class="flex justify-end">
				<Button disabled={controlsSaving || controlsLoading} onclick={saveRpmOverrides}>Save RPM</Button>
			</div>
		</Card>
	</div>
	<div class="mt-5 flex justify-end">
		<Button variant="outline" onclick={onClose}>{$_('common.close', { default: 'Close' })}</Button>
	</div>
</StandardDialog>
