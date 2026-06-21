<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import { createProxy, updateProxy, type Proxy, type SaveProxyPayload } from '$lib/api/admin/proxies';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { PROTOCOL_OPTIONS, expiryUnixSeconds, optionalPositiveInteger } from './proxy-helpers';
	import { ALL } from '$lib/features/supply/supply';

	interface Props {
		open: boolean;
		editing: Proxy | null;
		protocolFilter: string;
		onClose: () => void;
		onSaved: () => void;
	}

	let { open = $bindable(), editing, protocolFilter, onClose, onSaved }: Props = $props();

	const formProtocolOptions = $derived(PROTOCOL_OPTIONS.map((value) => ({ value, label: value })));
	const formStatusOptions = [
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' }
	];
	const fallbackModeOptions = [
		{ value: 'none', label: 'No fallback' },
		{ value: 'proxy', label: 'Backup proxy' },
		{ value: 'direct', label: 'Direct connection' }
	];

	let saving = $state(false);
	let form = $state<SaveProxyPayload>({
		name: '',
		protocol: 'socks5',
		host: '',
		port: 1080,
		username: '',
		password: '',
		status: 'active',
		fallback_mode: 'none',
		backup_proxy_id: null,
		expiry_warn_days: null
	});
	let formExpiresAt = $state('');
	let formProtocol = $state('socks5');
	let formStatus = $state('active');
	let formFallbackMode = $state('none');
	let lastOpenState = $state(false);

	$effect.pre(() => {
		const nowOpen = open;
		if (nowOpen && !lastOpenState) {
			if (editing) {
				form = {
					name: editing.name,
					protocol: editing.protocol,
					host: editing.host,
					port: editing.port,
					username: editing.username ?? '',
					password: '',
					status: editing.status,
					expires_at: null,
					fallback_mode: editing.fallback_mode ?? 'none',
					backup_proxy_id: editing.backup_proxy_id ?? null,
					expiry_warn_days: editing.expiry_warn_days ?? null
				};
				formProtocol = form.protocol ?? 'socks5';
				formStatus = form.status ?? 'active';
				formFallbackMode = form.fallback_mode ?? 'none';
				formExpiresAt = editing.expires_at ? editing.expires_at.slice(0, 10) : '';
			} else {
				form = {
					name: '',
					protocol: protocolFilter === ALL ? 'socks5' : protocolFilter,
					host: '',
					port: protocolFilter === 'http' || protocolFilter === 'https' ? 8080 : 1080,
					username: '',
					password: '',
					status: 'active',
					fallback_mode: 'none',
					backup_proxy_id: null,
					expiry_warn_days: null
				};
				formProtocol = form.protocol ?? 'socks5';
				formStatus = form.status ?? 'active';
				formFallbackMode = form.fallback_mode ?? 'none';
				formExpiresAt = '';
			}
		}
		lastOpenState = nowOpen;
	});

	function buildProxyPayload(): SaveProxyPayload {
		const fallbackMode = formFallbackMode === 'proxy' || formFallbackMode === 'direct' ? formFallbackMode : 'none';
		return {
			...form,
			protocol: formProtocol,
			status: formStatus,
			port: Number(form.port),
			expires_at: expiryUnixSeconds(formExpiresAt),
			fallback_mode: fallbackMode,
			backup_proxy_id: fallbackMode === 'proxy' ? optionalPositiveInteger(form.backup_proxy_id) : null,
			expiry_warn_days: optionalPositiveInteger(form.expiry_warn_days)
		};
	}

	async function saveProxy() {
		if (!form.name.trim() || !form.host.trim()) return;
		saving = true;
		try {
			const payload = buildProxyPayload();
			if (!payload.password) delete payload.password;
			if (editing) await updateProxy(editing.id, payload);
			else await createProxy(payload);
			showSuccess(editing ? 'Proxy updated' : 'Proxy created');
			open = false;
			onClose();
			onSaved();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}
</script>

<StandardDialog bind:open title={editing ? 'Edit proxy' : 'New proxy'} data-testid="proxy-dialog">
	<div class="mt-4 grid gap-3">
		<label class="grid gap-1 text-sm">Name<Input bind:value={form.name} /></label>
		<div class="grid gap-3 sm:grid-cols-[130px_1fr_110px]">
			<label class="grid gap-1 text-sm">Protocol<NativeSelect bind:value={formProtocol} options={formProtocolOptions} onchange={() => (form.protocol = formProtocol)} /></label>
			<label class="grid gap-1 text-sm">Host<Input bind:value={form.host} /></label>
			<label class="grid gap-1 text-sm">Port<Input type="number" bind:value={form.port} /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">Username<Input bind:value={form.username} /></label>
			<label class="grid gap-1 text-sm">Password<Input type="password" bind:value={form.password} placeholder={editing ? 'Leave blank to keep existing' : ''} /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="grid gap-1 text-sm">Status<NativeSelect bind:value={formStatus} options={formStatusOptions} onchange={() => (form.status = formStatus)} /></label>
			<label class="grid gap-1 text-sm">Expires<Input type="date" bind:value={formExpiresAt} /></label>
			<label class="grid gap-1 text-sm">Warn days<Input type="number" min="1" step="1" bind:value={form.expiry_warn_days} data-testid="proxy-form-warn-days" /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">
				Fallback mode
				<NativeSelect bind:value={formFallbackMode} options={fallbackModeOptions} data-testid="proxy-form-fallback-mode" />
			</label>
			<label class="grid gap-1 text-sm">
				Backup proxy ID
				<Input
					type="number"
					min="1"
					step="1"
					bind:value={form.backup_proxy_id}
					disabled={formFallbackMode !== 'proxy'}
					data-testid="proxy-form-backup-proxy"
				/>
			</label>
		</div>
	</div>
	<div class="mt-5 flex justify-end gap-2">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>Cancel</Button>
		<Button disabled={saving || !form.name.trim() || !form.host.trim()} onclick={saveProxy}>Save</Button>
	</div>
</StandardDialog>
