<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import ModelWhitelistSelector from './ModelWhitelistSelector.svelte';
	import QuotaLimitEditor from './QuotaLimitEditor.svelte';
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
	const typeOpts: Record<string, { value: string; label: string }[]> = {
		openai: [{ value: 'api_key', label: 'API Key' }, { value: 'oauth', label: 'OAuth' }],
		claude: [{ value: 'api_key', label: 'API Key' }, { value: 'oauth', label: 'OAuth' }, { value: 'setup-token', label: 'Setup token' }],
		gemini: [{ value: 'api_key', label: 'API Key' }, { value: 'oauth', label: 'OAuth' }, { value: 'service_account', label: 'Service Account' }],
		antigravity: [{ value: 'oauth', label: 'OAuth' }],
		sora: [{ value: 'api_key', label: 'API Key' }, { value: 'oauth', label: 'OAuth' }],
		codex: [{ value: 'api_key', label: 'API Key' }, { value: 'oauth', label: 'OAuth' }]
	};
	const defaultTypeOpts = [{ value: 'api_key', label: 'API Key' }, { value: 'oauth', label: 'OAuth' }, { value: 'setup-token', label: 'Setup token' }, { value: 'bedrock', label: 'AWS Bedrock' }];

	// Core fields
	let name = $state('');
	let notes = $state('');
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

	// Platform-specific credential fields
	let apiKey = $state('');
	let baseUrl = $state('');
	let organizationId = $state('');
	let projectId = $state('');
	let tierId = $state('');
	let interceptWarmup = $state(false);
	let webSearchMode = $state('default');

	// Model whitelist
	let modelWhitelist = $state<string[]>([]);

	// Quota limits
	let totalLimit = $state<number | null>(null);
	let dailyLimit = $state<number | null>(null);
	let weeklyLimit = $state<number | null>(null);
	let dailyResetMode = $state<string | null>(null);
	let dailyResetHour = $state<number | null>(null);
	let weeklyResetMode = $state<string | null>(null);
	let weeklyResetDay = $state<number | null>(null);
	let weeklyResetHour = $state<number | null>(null);
	let resetTimezone = $state<string | null>(null);

	// Raw credentials mode (default: raw for backward compat; toggle to structured)
	let showRawCredentials = $state(true);
	let credentialsJson = $state('{}');

	let saving = $state(false);
	let error = $state<string | null>(null);

	const currentTypeOpts = $derived(typeOpts[platform] ?? defaultTypeOpts);
	const isApiKey = $derived(type === 'api_key' || type === 'apikey');
	const isOAuth = $derived(type === 'oauth' || type === 'setup-token');
	const showApiKeyField = $derived(isApiKey);
	const showBaseUrl = $derived(isApiKey && (platform === 'openai' || platform === 'claude'));
	const showOrgId = $derived(platform === 'openai' && isApiKey);
	const showProjectId = $derived(platform === 'gemini');
	const showTierId = $derived(platform === 'gemini');
	const showInterceptWarmup = $derived(platform === 'claude');
	const showWebSearch = $derived(platform === 'openai');
	const webSearchOpts = [
		{ value: 'default', label: 'Default' },
		{ value: 'enabled', label: 'Enabled' },
		{ value: 'disabled', label: 'Disabled' }
	];

	$effect(() => {
		if (!open) return;
		if (account) {
			const cred = account.credentials && typeof account.credentials === 'object'
				? { ...(account.credentials as Record<string, unknown>) } : {};
			name = account.name ?? '';
			notes = typeof (account as Record<string, unknown>).notes === 'string' ? (account as Record<string, unknown>).notes as string : '';
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
			poolMode = cred.pool_mode === true;
			apiKey = typeof cred.api_key === 'string' ? cred.api_key : '';
			baseUrl = typeof cred.base_url === 'string' ? cred.base_url : '';
			organizationId = typeof cred.organization_id === 'string' ? cred.organization_id : '';
			projectId = typeof cred.project_id === 'string' ? cred.project_id : '';
			tierId = typeof cred.tier_id === 'string' ? cred.tier_id : '';
			interceptWarmup = cred.intercept_warmup_requests === true;
			webSearchMode = typeof cred.web_search_mode === 'string' ? cred.web_search_mode : 'default';
			// Model whitelist from model_mapping
			const mm = (account as Record<string, unknown>).model_mapping;
			if (mm && typeof mm === 'object' && !Array.isArray(mm)) {
				modelWhitelist = Object.keys(mm as Record<string, string>);
			} else { modelWhitelist = []; }
			// Quota limits
			const a = account as Record<string, unknown>;
			totalLimit = typeof a.quota_total_limit === 'number' ? a.quota_total_limit : null;
			dailyLimit = typeof a.quota_daily_limit === 'number' ? a.quota_daily_limit : null;
			weeklyLimit = typeof a.quota_weekly_limit === 'number' ? a.quota_weekly_limit : null;
			dailyResetMode = typeof a.quota_daily_reset_mode === 'string' ? a.quota_daily_reset_mode : null;
			dailyResetHour = typeof a.quota_daily_reset_hour === 'number' ? a.quota_daily_reset_hour : null;
			weeklyResetMode = typeof a.quota_weekly_reset_mode === 'string' ? a.quota_weekly_reset_mode : null;
			weeklyResetDay = typeof a.quota_weekly_reset_day === 'number' ? a.quota_weekly_reset_day : null;
			weeklyResetHour = typeof a.quota_weekly_reset_hour === 'number' ? a.quota_weekly_reset_hour : null;
			resetTimezone = typeof a.quota_reset_timezone === 'string' ? a.quota_reset_timezone : null;
			credentialsJson = JSON.stringify(cred, null, 2);
			showRawCredentials = false;
		} else {
			name = ''; notes = ''; email = ''; platform = defaultPlatform || 'openai'; type = 'api_key'; status = 'active';
			priority = ''; weight = ''; concurrency = ''; rateMultiplier = '';
			groupIds = ''; proxyId = ''; schedulable = true; privacyMode = false; poolMode = false;
			apiKey = ''; baseUrl = ''; organizationId = ''; projectId = ''; tierId = '';
			interceptWarmup = false; webSearchMode = 'default';
			modelWhitelist = [];
			totalLimit = null; dailyLimit = null; weeklyLimit = null;
			dailyResetMode = null; dailyResetHour = null; weeklyResetMode = null;
			weeklyResetDay = null; weeklyResetHour = null; resetTimezone = null;
			credentialsJson = '{}'; showRawCredentials = true;
		}
		error = null;
	});

	function parseNum(v: string | number | null | undefined): number | undefined {
		if (v == null) return undefined;
		const t = String(v).trim();
		if (!t) return undefined;
		const n = Number(t);
		if (!Number.isFinite(n)) throw new Error('invalid number');
		return n;
	}
	function parseIds(v: string | number | null | undefined): number[] {
		if (v == null) return [];
		const t = String(v).trim();
		if (!t) return [];
		return t.split(/[,\s]+/).filter(Boolean).map(p => {
			const n = Number(p);
			if (!Number.isInteger(n) || n <= 0) throw new Error('invalid ID');
			return n;
		});
	}

	async function save() {
		saving = true; error = null;
		try {
			let cred: Record<string, unknown>;
			if (showRawCredentials) {
				cred = credentialsJson.trim() ? JSON.parse(credentialsJson.trim()) : {};
			} else {
				// Build credentials from structured fields
				cred = {};
				if (apiKey.trim()) cred.api_key = apiKey.trim();
				if (baseUrl.trim()) cred.base_url = baseUrl.trim();
				if (organizationId.trim()) cred.organization_id = organizationId.trim();
				if (projectId.trim()) cred.project_id = projectId.trim();
				if (tierId.trim()) cred.tier_id = tierId.trim();
				if (interceptWarmup) cred.intercept_warmup_requests = true;
				if (webSearchMode !== 'default') cred.web_search_mode = webSearchMode;
				// Merge with existing credentials for OAuth fields we don't edit here
				if (account?.credentials) {
					const existing = { ...(account.credentials as Record<string, unknown>) };
					for (const [k, v] of Object.entries(existing)) {
						if (!(k in cred) && k !== 'pool_mode') cred[k] = v;
					}
				}
			}
			cred.pool_mode = poolMode;

			const payload: SaveAccountPayload = {
				name: String(name ?? '').trim(),
				platform,
				type: String(type ?? '').trim(),
				status,
				schedulable,
				privacy_mode: privacyMode,
				credentials: cred,
				group_ids: parseIds(groupIds)
			};

			if (notes.trim()) (payload as Record<string, unknown>).notes = notes.trim();
			if (String(email ?? '').trim()) payload.email = String(email ?? '').trim();
			const pid = parseNum(proxyId); if (pid !== undefined) payload.proxy_id = pid;
			else if (account?.proxy_id) payload.proxy_id = null;
			const pr = parseNum(priority); if (pr !== undefined) payload.priority = pr;
			const w = parseNum(weight); if (w !== undefined) payload.weight = w;
			const c = parseNum(concurrency); if (c !== undefined) payload.concurrency = c;
			const rm = parseNum(rateMultiplier); if (rm !== undefined) payload.rate_multiplier = rm;

			// Model whitelist as model_mapping
			if (modelWhitelist.length > 0) {
				const mapping: Record<string, string> = {};
				for (const m of modelWhitelist) { if (m.trim() && !m.includes('*')) mapping[m.trim()] = m.trim(); }
				if (Object.keys(mapping).length > 0) (payload as Record<string, unknown>).model_mapping = mapping;
			} else if (account) {
				(payload as Record<string, unknown>).model_mapping = null;
			}

			// Quota limits
			if (totalLimit != null) (payload as Record<string, unknown>).quota_total_limit = totalLimit;
			if (dailyLimit != null) (payload as Record<string, unknown>).quota_daily_limit = dailyLimit;
			if (weeklyLimit != null) (payload as Record<string, unknown>).quota_weekly_limit = weeklyLimit;
			if (dailyResetMode) (payload as Record<string, unknown>).quota_daily_reset_mode = dailyResetMode;
			if (dailyResetHour != null) (payload as Record<string, unknown>).quota_daily_reset_hour = dailyResetHour;
			if (weeklyResetMode) (payload as Record<string, unknown>).quota_weekly_reset_mode = weeklyResetMode;
			if (weeklyResetDay != null) (payload as Record<string, unknown>).quota_weekly_reset_day = weeklyResetDay;
			if (weeklyResetHour != null) (payload as Record<string, unknown>).quota_weekly_reset_hour = weeklyResetHour;
			if (resetTimezone) (payload as Record<string, unknown>).quota_reset_timezone = resetTimezone;

			if (account) await updateAccount(account.id, payload);
			else await createAccount(payload);
			showSuccess(account ? 'Account updated' : 'Account created');
			open = false; onSaved();
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { saving = false; }
	}
</script>

<StandardDialog bind:open title={account ? $_('admin.accounts.editTitle', { default: 'Edit account' }) : $_('admin.accounts.newTitle', { default: 'New account' })} width="lg" data-testid="account-dialog">
	<div class="mt-4 grid gap-4">
		{#if error}<Alert variant="destructive" data-testid="account-form-error">{error}</Alert>{/if}

		<!-- Basic info -->
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm"><span class="font-medium">Name</span><Input bind:value={name} data-testid="account-form-name" /></label>
			<label class="grid gap-1 text-sm"><span class="font-medium">Email</span><Input type="email" bind:value={email} data-testid="account-form-email" /></label>
		</div>
		<label class="grid gap-1 text-sm"><span class="font-medium">Notes</span><Textarea rows={2} bind:value={notes} placeholder="Optional notes about this account" data-testid="account-form-notes" /></label>

		<!-- Platform selection (segmented) -->
		<div>
			<p class="mb-1.5 text-sm font-medium">Platform</p>
			<div class="flex rounded-md bg-muted p-1" data-testid="account-form-platform">
				{#each PLATFORMS as p (p)}
					<button type="button"
						class="flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-all {platform === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => { platform = p; type = (typeOpts[p] ?? defaultTypeOpts)[0]?.value ?? 'api_key'; }}>
						{p}
					</button>
				{/each}
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
			<label class="grid gap-1 text-sm"><span class="font-medium">Type</span><NativeSelect bind:value={type} options={currentTypeOpts} data-testid="account-form-type" /></label>
			<label class="grid gap-1 text-sm"><span class="font-medium">Status</span><NativeSelect bind:value={status} options={statusOpts} data-testid="account-form-status" /></label>
			<label class="grid gap-1 text-sm"><span class="font-medium">Proxy ID</span><Input type="number" bind:value={proxyId} data-testid="account-form-proxy" /></label>
		</div>

		<!-- Platform-specific credential fields -->
		{#if !showRawCredentials}
			<Card class="space-y-3 p-3">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium">Credentials</p>
					<Button variant="ghost" size="sm" onclick={() => (showRawCredentials = true)} class="text-xs text-muted-foreground">Switch to raw JSON</Button>
				</div>

				{#if showApiKeyField}
					<label class="grid gap-1 text-sm"><span class="font-medium">API Key</span><Input type="password" bind:value={apiKey} placeholder="sk-..." data-testid="account-form-api-key" /></label>
				{/if}

				{#if showBaseUrl}
					<label class="grid gap-1 text-sm">
						<span class="font-medium">Base URL</span>
						<Input bind:value={baseUrl} placeholder={platform === 'openai' ? 'https://api.openai.com' : 'https://api.anthropic.com'} data-testid="account-form-base-url" />
						<span class="text-xs text-muted-foreground">Custom API endpoint. Leave empty for default.</span>
					</label>
				{/if}

				{#if showOrgId}
					<label class="grid gap-1 text-sm"><span class="font-medium">Organization ID</span><Input bind:value={organizationId} placeholder="org-..." data-testid="account-form-org-id" /></label>
				{/if}

				{#if showProjectId}
					<label class="grid gap-1 text-sm"><span class="font-medium">Project ID</span><Input bind:value={projectId} data-testid="account-form-project-id" /></label>
				{/if}

				{#if showTierId}
					<label class="grid gap-1 text-sm"><span class="font-medium">Tier ID</span><Input bind:value={tierId} data-testid="account-form-tier-id" /></label>
				{/if}

				{#if showInterceptWarmup}
					<label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={interceptWarmup} data-testid="account-form-intercept-warmup" />Intercept warmup requests</label>
				{/if}

				{#if showWebSearch}
					<label class="grid gap-1 text-sm"><span class="font-medium">Web search mode</span><NativeSelect bind:value={webSearchMode} options={webSearchOpts} data-testid="account-form-web-search" /></label>
				{/if}

				{#if isOAuth}
					<p class="text-xs text-muted-foreground">OAuth credentials are managed via the ReAuth flow. Use raw JSON to edit manually.</p>
				{/if}
			</Card>
		{:else}
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium">Credentials JSON</p>
					<Button variant="ghost" size="sm" onclick={() => (showRawCredentials = false)} class="text-xs text-muted-foreground">Switch to structured</Button>
				</div>
				<Textarea rows={8} bind:value={credentialsJson} data-testid="account-form-credentials" />
			</div>
		{/if}

		<!-- Scheduling parameters -->
		<div class="grid gap-3 sm:grid-cols-4">
			<label class="grid gap-1 text-sm"><span class="font-medium">Priority</span><Input type="number" bind:value={priority} data-testid="account-form-priority" /></label>
			<label class="grid gap-1 text-sm"><span class="font-medium">Weight</span><Input type="number" bind:value={weight} data-testid="account-form-weight" /></label>
			<label class="grid gap-1 text-sm"><span class="font-medium">Concurrency</span><Input type="number" bind:value={concurrency} data-testid="account-form-concurrency" /></label>
			<label class="grid gap-1 text-sm"><span class="font-medium">Rate multiplier</span><Input type="number" step="0.1" bind:value={rateMultiplier} data-testid="account-form-rate" /></label>
		</div>

		<label class="grid gap-1 text-sm"><span class="font-medium">Group IDs</span><Input placeholder="7, 9" bind:value={groupIds} data-testid="account-form-groups" /></label>

		<div class="flex flex-wrap gap-4 text-sm">
			<label class="flex items-center gap-2"><Checkbox bind:checked={schedulable} data-testid="account-form-schedulable" />Schedulable</label>
			<label class="flex items-center gap-2"><Checkbox bind:checked={privacyMode} data-testid="account-form-privacy" />Privacy mode</label>
			<label class="flex items-center gap-2"><Checkbox bind:checked={poolMode} data-testid="account-form-pool" />Pool mode</label>
		</div>

		<!-- Model whitelist -->
		<Card class="space-y-3 p-3">
			<p class="text-sm font-medium">Model restriction</p>
			<ModelWhitelistSelector
				bind:selected={modelWhitelist}
				platform={platform}
				accountId={account?.id}
				onUpdate={(m) => { modelWhitelist = m; }}
			/>
		</Card>

		<!-- Quota limits -->
		<QuotaLimitEditor
			bind:totalLimit bind:dailyLimit bind:weeklyLimit
			bind:dailyResetMode bind:dailyResetHour
			bind:weeklyResetMode bind:weeklyResetDay bind:weeklyResetHour
			bind:resetTimezone
			onUpdate={() => {}}
		/>
	</div>
	<div class="mt-5 flex justify-end gap-2">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>Cancel</Button>
		<Button disabled={saving || !String(name ?? '').trim() || !String(type ?? '').trim()} onclick={save} data-testid="account-form-save">{saving ? 'Saving...' : 'Save'}</Button>
	</div>
</StandardDialog>
