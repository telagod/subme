<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import {
		applyOAuthCredentials, cookieAuth, exchangeCode, exchangeOpenAICode,
		exchangeSetupTokenCode, generateAuthUrl, generateOpenAIAuthUrl,
		generateSetupTokenUrl, refreshOpenAIToken, setupTokenCookieAuth,
		type Account
	} from '$lib/api/admin/accounts';
	import * as antigravityOAuthApi from '$lib/api/admin/antigravity';
	import * as geminiOAuthApi from '$lib/api/admin/gemini';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = { open: boolean; account: Account | null; onApplied: () => void; onClose: () => void };
	let { open = $bindable(false), account = null, onApplied, onClose }: Props = $props();

	const oauthModeOptions = [{ value: 'oauth', label: 'OAuth' }, { value: 'setup-token', label: 'Setup token' }];
	const geminiOAuthTypeOptions = [{ value: 'code_assist', label: 'Code Assist' }, { value: 'google_one', label: 'Google One' }, { value: 'ai_studio', label: 'AI Studio' }];

	let mode = $state<'oauth' | 'setup-token'>('oauth');
	let geminiType = $state<'code_assist' | 'google_one' | 'ai_studio'>('code_assist');
	let proxyId = $state('');
	let redirectUri = $state('');
	let projectId = $state('');
	let tierId = $state('');
	let sessionId = $state('');
	let stateVal = $state('');
	let code = $state('');
	let cookieKey = $state('');
	let refreshToken = $state('');
	let authResult = $state<Record<string, unknown> | null>(null);
	let exchangeResult = $state<Record<string, unknown> | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);

	$effect(() => {
		if (!open || !account) return;
		mode = account.type === 'setup-token' ? 'setup-token' : 'oauth';
		const cred = account.credentials && typeof account.credentials === 'object' ? { ...(account.credentials as Record<string, unknown>) } : {};
		proxyId = account.proxy_id != null ? String(account.proxy_id) : (account.proxy?.id != null ? String(account.proxy.id) : '');
		redirectUri = ''; sessionId = ''; stateVal = ''; code = ''; cookieKey = '';
		authResult = null; exchangeResult = null; error = null;
		if (account.platform === 'gemini') {
			const ot = cred.oauth_type; geminiType = ot === 'google_one' || ot === 'ai_studio' ? ot : 'code_assist';
			projectId = typeof cred.project_id === 'string' ? cred.project_id : ''; tierId = typeof cred.tier_id === 'string' ? cred.tier_id : '';
		} else { projectId = ''; tierId = ''; }
		refreshToken = (account.platform === 'openai' || account.platform === 'antigravity') && typeof cred.refresh_token === 'string' ? cred.refresh_token : '';
	});

	function fmt(v: Record<string, unknown> | null): string { return v ? JSON.stringify(v, null, 2) : ''; }
	function parseProxy(): number | undefined { const t = proxyId.trim(); if (!t) return undefined; const n = Number(t); return Number.isInteger(n) && n > 0 ? n : undefined; }
	function proxyPayload(): Record<string, unknown> { const p: Record<string, unknown> = {}; const pid = parseProxy(); if (pid) p.proxy_id = pid; if (redirectUri.trim()) p.redirect_uri = redirectUri.trim(); return p; }
	function extractState(result: Record<string, unknown>): string {
		if (typeof result.state === 'string' && result.state.trim()) return result.state.trim();
		const url = result.auth_url ?? result.url; if (typeof url !== 'string') return '';
		try { return new URL(url).searchParams.get('state') ?? ''; } catch { return ''; }
	}
	function platformLabel(a: Account): string { return `${a.platform}${a.platform === 'gemini' ? ` (${geminiType})` : ''}`; }
	function cleanRecord(r: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && v !== '')); }

	function extractCredentials(tokenInfo: Record<string, unknown>): Record<string, unknown> {
		if (!account) return {};
		if (account.platform === 'openai') {
			const keys = ['access_token', 'expires_at', 'refresh_token', 'id_token', 'email', 'chatgpt_account_id', 'chatgpt_user_id', 'organization_id', 'plan_type', 'client_id'];
			return cleanRecord(Object.fromEntries(keys.filter(k => tokenInfo[k] != null).map(k => [k, tokenInfo[k]])));
		}
		if (account.platform === 'gemini') {
			const ea = tokenInfo.expires_at; return { access_token: tokenInfo.access_token, refresh_token: tokenInfo.refresh_token, token_type: tokenInfo.token_type,
				expires_at: typeof ea === 'number' && Number.isFinite(ea) ? String(Math.floor(ea)) : ea, scope: tokenInfo.scope, project_id: tokenInfo.project_id, oauth_type: tokenInfo.oauth_type ?? geminiType, tier_id: tokenInfo.tier_id ?? (tierId.trim() || undefined) };
		}
		if (account.platform === 'antigravity') {
			const ea = tokenInfo.expires_at; return { access_token: tokenInfo.access_token, refresh_token: tokenInfo.refresh_token, token_type: tokenInfo.token_type,
				expires_at: typeof ea === 'number' && Number.isFinite(ea) ? String(Math.floor(ea)) : ea, project_id: tokenInfo.project_id, email: tokenInfo.email };
		}
		return tokenInfo;
	}

	async function generateUrl() {
		if (!account) return; busy = true; error = null;
		try {
			const payload = proxyPayload();
			if (account.platform === 'openai') authResult = await generateOpenAIAuthUrl(payload);
			else if (account.platform === 'gemini') { if (geminiType) payload.oauth_type = geminiType; if (projectId.trim()) payload.project_id = projectId.trim(); if (tierId.trim()) payload.tier_id = tierId.trim(); authResult = await geminiOAuthApi.generateAuthUrl(payload); }
			else if (account.platform === 'antigravity') authResult = await antigravityOAuthApi.generateAuthUrl(payload);
			else authResult = mode === 'setup-token' ? await generateSetupTokenUrl(payload) : await generateAuthUrl(payload);
			if (typeof authResult.session_id === 'string') sessionId = authResult.session_id;
			const s = extractState(authResult); if (s) stateVal = s;
			showSuccess('ReAuth URL generated');
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { busy = false; }
	}

	async function exchangeCodeAction() {
		if (!account || !code.trim()) return; busy = true; error = null;
		try {
			const payload: Record<string, unknown> = { code: code.trim() };
			if (sessionId.trim()) payload.session_id = sessionId.trim();
			if (stateVal.trim()) payload.state = stateVal.trim();
			const pp = proxyPayload(); Object.assign(payload, pp);
			if (account.platform === 'openai') exchangeResult = await exchangeOpenAICode(payload);
			else if (account.platform === 'gemini') { if (geminiType) payload.oauth_type = geminiType; exchangeResult = await geminiOAuthApi.exchangeCode(payload); }
			else if (account.platform === 'antigravity') exchangeResult = await antigravityOAuthApi.exchangeCode(payload);
			else exchangeResult = mode === 'setup-token' ? await exchangeSetupTokenCode(payload) : await exchangeCode(payload);
			showSuccess('Code exchanged');
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { busy = false; }
	}

	async function runCookieAuth() {
		if (!account || !cookieKey.trim()) return; busy = true; error = null;
		try {
			const payload: Record<string, unknown> = { cookie_key: cookieKey.trim(), ...proxyPayload() };
			exchangeResult = mode === 'setup-token' ? await setupTokenCookieAuth(payload) : await cookieAuth(payload);
			showSuccess('Cookie auth completed');
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { busy = false; }
	}

	async function refreshTokenAction() {
		if (!account || !refreshToken.trim()) return; busy = true; error = null;
		try {
			const payload: Record<string, unknown> = { refresh_token: refreshToken.trim(), ...proxyPayload() };
			exchangeResult = await refreshOpenAIToken(payload);
			showSuccess('Token refreshed');
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { busy = false; }
	}

	async function applyResult() {
		if (!account || !exchangeResult) return; busy = true; error = null;
		try {
			const cred = extractCredentials(exchangeResult);
			const extra = exchangeResult.extra && typeof exchangeResult.extra === 'object' && !Array.isArray(exchangeResult.extra) ? exchangeResult.extra as Record<string, unknown> : undefined;
			await applyOAuthCredentials(account.id, { type: mode, credentials: cleanRecord(cred), extra: extra ? cleanRecord(extra) : undefined });
			showSuccess('Credentials applied'); open = false; onApplied();
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { busy = false; }
	}
</script>

<StandardDialog bind:open title={$_('admin.accountsQuench.reauthTitle', { default: 'Re-authorize account' })} width="lg" data-testid="account-reauth-dialog">
	{#if account}
		<div class="mt-4 grid gap-4">
			<Card class="space-y-1">
				<p class="text-sm font-semibold">{account.name || account.email || `#${account.id}`}</p>
				<p class="text-xs text-muted-foreground">{platformLabel(account)} · {account.type}</p>
			</Card>
			{#if error}<Alert variant="destructive" data-testid="account-reauth-error">{error}</Alert>{/if}
			<div class="grid gap-3 sm:grid-cols-3">
				{#if account.platform === 'gemini'}
					<label class="grid gap-1 text-sm">OAuth type<NativeSelect bind:value={geminiType} options={geminiOAuthTypeOptions} data-testid="account-reauth-gemini-type" /></label>
				{:else if account.platform !== 'openai' && account.platform !== 'antigravity'}
					<label class="grid gap-1 text-sm">Mode<NativeSelect bind:value={mode} options={oauthModeOptions} data-testid="account-reauth-mode" /></label>
				{/if}
				<label class="grid gap-1 text-sm">Proxy ID<Input type="number" bind:value={proxyId} data-testid="account-reauth-proxy-id" /></label>
				<label class="grid gap-1 text-sm">Redirect URI<Input bind:value={redirectUri} data-testid="account-reauth-redirect-uri" /></label>
			</div>
			{#if account.platform === 'gemini' && geminiType === 'code_assist'}
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="grid gap-1 text-sm">Project ID<Input bind:value={projectId} data-testid="account-reauth-project-id" /></label>
					<label class="grid gap-1 text-sm">Tier ID<Input bind:value={tierId} data-testid="account-reauth-tier-id" /></label>
				</div>
			{/if}
			<div class="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onclick={generateUrl}>Generate auth URL</Button></div>
			{#if authResult}<pre class="max-h-40 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs" data-testid="account-reauth-auth-result">{fmt(authResult)}</pre>{/if}
			<div class="grid gap-3 sm:grid-cols-3">
				<label class="grid gap-1 text-sm">Session ID<Input bind:value={sessionId} data-testid="account-reauth-session-id" /></label>
				<label class="grid gap-1 text-sm">State<Input bind:value={stateVal} data-testid="account-reauth-state" /></label>
				<label class="grid gap-1 text-sm">Code<Input bind:value={code} data-testid="account-reauth-code" /></label>
			</div>
			<div class="flex justify-end"><Button variant="outline" disabled={busy || !code.trim()} onclick={exchangeCodeAction}>Exchange code</Button></div>
			{#if account.platform !== 'openai' && account.platform !== 'gemini' && account.platform !== 'antigravity'}
				<div class="grid gap-3 sm:grid-cols-[1fr_auto]">
					<label class="grid gap-1 text-sm">Cookie session key<Input bind:value={cookieKey} data-testid="account-reauth-cookie-key" /></label>
					<div class="flex items-end"><Button variant="outline" disabled={busy || !cookieKey.trim()} onclick={runCookieAuth}>Cookie auth</Button></div>
				</div>
			{/if}
			{#if account.platform === 'openai' || account.platform === 'antigravity'}
				<div class="grid gap-3 sm:grid-cols-[1fr_auto]">
					<label class="grid gap-1 text-sm">Refresh token<Input bind:value={refreshToken} data-testid="account-reauth-refresh-token" /></label>
					<div class="flex items-end"><Button variant="outline" disabled={busy || !refreshToken.trim()} onclick={refreshTokenAction}>Refresh token</Button></div>
				</div>
			{/if}
			{#if exchangeResult}<pre class="max-h-44 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs" data-testid="account-reauth-exchange-result">{fmt(exchangeResult)}</pre>{/if}
		</div>
		<div class="mt-5 flex justify-end gap-2">
			<Button variant="outline" disabled={busy} onclick={() => { open = false; onClose(); }}>Cancel</Button>
			<Button disabled={busy || !exchangeResult} onclick={applyResult}>Apply credentials</Button>
		</div>
	{/if}
</StandardDialog>
