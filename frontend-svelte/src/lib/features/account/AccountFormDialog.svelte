<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import { createAccount, updateAccount, type Account, type SaveAccountPayload } from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { accountIsSchedulable } from '$lib/features/supply/supply';

	type Props = {
		open: boolean;
		account: Account | null;
		defaultPlatform?: string;
		onSaved: () => void;
		onClose: () => void;
	};
	let { open = $bindable(false), account = null, defaultPlatform = 'openai', onSaved, onClose }: Props = $props();

	const PLATFORMS = ['claude', 'openai', 'gemini', 'sora', 'codex', 'antigravity'];
	const platformOpts = PLATFORMS.map(v => ({ value: v, label: v }));
	const statusOpts = [
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' },
		{ value: 'error', label: 'error' },
		{ value: 'rate_limited', label: 'rate_limited' }
	];

	let name = $state('');
	let email = $state('');
	let platform = $state('openai');
	let type = $state('api_key');
	let status = $state('active');
	let priority = $state('');
	let weight = $state('');
	let concurrency = $state('');
	let rateMultiplier = $state('');
	let groupIds = $state('');
	let proxyId = $state('');
	let schedulable = $state(true);
	let privacyMode = $state(false);
	let poolMode = $state(false);
	let credentialsJson = $state('{}');
	let saving = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		if (account) {
			const cred = account.credentials && typeof account.credentials === 'object'
				? { ...(account.credentials as Record<string, unknown>) } : {};
			name = account.name ?? '';
			email = account.email ?? '';
			platform = account.platform;
			type = account.type;
			status = account.status;
			priority = account.priority == null ? '' : String(account.priority);
			weight = account.weight == null ? '' : String(account.weight);
			concurrency = account.concurrency == null ? '' : String(account.concurrency);
			rateMultiplier = account.rate_multiplier == null ? '' : String(account.rate_multiplier);
			groupIds = account.group_ids?.length ? account.group_ids.join(', ')
				: (account.groups?.map(g => g.id).join(', ') ?? '');
			proxyId = account.proxy_id == null ? (account.proxy?.id == null ? '' : String(account.proxy.id)) : String(account.proxy_id);
			schedulable = accountIsSchedulable(account);
			privacyMode = account.privacy_mode === true;
			poolMode = (cred as Record<string, unknown>).pool_mode === true;
			credentialsJson = JSON.stringify(cred, null, 2);
		} else {
			name = ''; email = ''; platform = defaultPlatform || 'openai'; type = 'api_key'; status = 'active';
			priority = ''; weight = ''; concurrency = ''; rateMultiplier = '';
			groupIds = ''; proxyId = ''; schedulable = true; privacyMode = false; poolMode = false;
			credentialsJson = '{}';
		}
		error = null;
	});

	function parseNum(v: string | number | null | undefined): number | undefined { if (v == null) return undefined; const t = String(v).trim(); if (!t) return undefined; const n = Number(t); if (!Number.isFinite(n)) throw new Error('invalid number'); return n; }
	function parseIds(v: string | number | null | undefined): number[] { if (v == null) return []; const t = String(v).trim(); if (!t) return []; return t.split(/[,\s]+/).filter(Boolean).map(p => { const n = Number(p); if (!Number.isInteger(n) || n <= 0) throw new Error('invalid ID'); return n; }); }

	async function save() {
		saving = true; error = null;
		try {
			const credStr = String(credentialsJson ?? '');
			const cred = credStr.trim() ? JSON.parse(credStr.trim()) : {};
			cred.pool_mode = poolMode;
			const payload: SaveAccountPayload = {
				name: String(name ?? '').trim(), platform, type: String(type ?? '').trim(), status,
				schedulable, privacy_mode: privacyMode, credentials: cred,
				group_ids: parseIds(groupIds)
			};
			if (String(email ?? '').trim()) payload.email = String(email ?? '').trim();
			const pid = parseNum(proxyId); if (pid !== undefined) payload.proxy_id = pid;
			else if (account?.proxy_id) payload.proxy_id = null;
			const pr = parseNum(priority); if (pr !== undefined) payload.priority = pr;
			const w = parseNum(weight); if (w !== undefined) payload.weight = w;
			const c = parseNum(concurrency); if (c !== undefined) payload.concurrency = c;
			const rm = parseNum(rateMultiplier); if (rm !== undefined) payload.rate_multiplier = rm;
			if (account) await updateAccount(account.id, payload);
			else await createAccount(payload);
			showSuccess(account ? 'Account updated' : 'Account created');
			open = false; onSaved();
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { saving = false; }
	}
</script>

<StandardDialog bind:open title={account ? $_('admin.accountsQuench.editTitle', { default: 'Edit account' }) : $_('admin.accountsQuench.newTitle', { default: 'New account' })} width="lg" data-testid="account-dialog">
	<div class="mt-4 grid gap-4">
		{#if error}<Alert variant="destructive" data-testid="account-form-error">{error}</Alert>{/if}
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">Name<Input bind:value={name} data-testid="account-form-name" /></label>
			<label class="grid gap-1 text-sm">Email<Input type="email" bind:value={email} data-testid="account-form-email" /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
			<label class="grid gap-1 text-sm">Platform<NativeSelect bind:value={platform} options={platformOpts} data-testid="account-form-platform" /></label>
			<label class="grid gap-1 text-sm">Type<Input bind:value={type} data-testid="account-form-type" /></label>
			<label class="grid gap-1 text-sm">Status<NativeSelect bind:value={status} options={statusOpts} data-testid="account-form-status" /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-4">
			<label class="grid gap-1 text-sm">Priority<Input type="number" bind:value={priority} data-testid="account-form-priority" /></label>
			<label class="grid gap-1 text-sm">Weight<Input type="number" bind:value={weight} data-testid="account-form-weight" /></label>
			<label class="grid gap-1 text-sm">Concurrency<Input type="number" bind:value={concurrency} data-testid="account-form-concurrency" /></label>
			<label class="grid gap-1 text-sm">Rate multiplier<Input type="number" step="0.1" bind:value={rateMultiplier} data-testid="account-form-rate" /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">Group IDs<Input placeholder="7, 9" bind:value={groupIds} data-testid="account-form-groups" /></label>
			<label class="grid gap-1 text-sm">Proxy ID<Input type="number" bind:value={proxyId} data-testid="account-form-proxy" /></label>
		</div>
		<div class="flex flex-wrap gap-4 text-sm">
			<label class="flex items-center gap-2"><Checkbox bind:checked={schedulable} data-testid="account-form-schedulable" />Schedulable</label>
			<label class="flex items-center gap-2"><Checkbox bind:checked={privacyMode} data-testid="account-form-privacy" />Privacy mode</label>
			<label class="flex items-center gap-2"><Checkbox bind:checked={poolMode} data-testid="account-form-pool" />Pool mode</label>
		</div>
		<label class="grid gap-1 text-sm">Credentials JSON<Textarea rows={8} bind:value={credentialsJson} data-testid="account-form-credentials" /></label>
	</div>
	<div class="mt-5 flex justify-end gap-2">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>Cancel</Button>
		<Button disabled={saving || !String(name ?? '').trim() || !String(type ?? '').trim()} onclick={save}>{saving ? 'Saving...' : 'Save'}</Button>
	</div>
</StandardDialog>
