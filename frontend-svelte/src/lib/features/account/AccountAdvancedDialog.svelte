<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		create as createPassthrough, deleteRule as deletePassthrough, list as listPassthrough, toggleEnabled as togglePassthrough,
		type ErrorPassthroughRule
	} from '$lib/api/admin/errorPassthrough';
	import {
		create as createTLSProfile, deleteProfile as deleteTLSProfile, list as listTLSProfiles,
		type TLSFingerprintProfile
	} from '$lib/api/admin/tlsFingerprintProfile';
	import {
		applyOAuthCredentials, checkMixedChannelRisk, cookieAuth, exchangeCode, exchangeSetupTokenCode,
		generateAuthUrl, generateSetupTokenUrl, getAntigravityDefaultModelMapping,
		importCodexSession, previewSyncFromCRS, previewSyncUpstreamModels, setupTokenCookieAuth, syncFromCRS
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = { open: boolean; onRefresh: () => void; onClose: () => void };
	let { open = $bindable(false), onRefresh, onClose }: Props = $props();

	let busy = $state(false);
	let rules = $state<ErrorPassthroughRule[]>([]);
	let profiles = $state<TLSFingerprintProfile[]>([]);
	let ruleJson = $state('{\n  "name": "upstream-429",\n  "enabled": true,\n  "match_pattern": "rate_limit",\n  "status_code": 429,\n  "priority": 10\n}');
	let profileJson = $state('{\n  "name": "chrome",\n  "description": "Browser-like TLS profile",\n  "enable_grease": true,\n  "alpn_protocols": ["h2", "http/1.1"]\n}');
	let crsBase = $state(''); let crsUser = $state(''); let crsPwd = $state(''); let crsSyncProxies = $state(true);
	let crsSelected = $state(''); let crsPreview = $state<Record<string, unknown> | null>(null); let crsResult = $state<Record<string, unknown> | null>(null);
	let codexContent = $state(''); let codexName = $state(''); let codexGroups = $state(''); let codexProxy = $state(''); let codexUpdate = $state(true); let codexResult = $state<Record<string, unknown> | null>(null);
	let oauthMode = $state<'oauth' | 'setup-token'>('oauth'); let oauthAcctId = $state(''); let oauthProxy = $state(''); let oauthRedirect = $state('');
	let oauthSession = $state(''); let oauthState = $state(''); let oauthCode = $state(''); let oauthCookie = $state(''); let oauthExtra = $state('{}');
	let oauthAuth = $state<Record<string, unknown> | null>(null); let oauthExchange = $state<Record<string, unknown> | null>(null);
	let riskJson = $state('{\n  "account_ids": []\n}'); let riskResult = $state<Record<string, unknown> | null>(null);
	let upstreamJson = $state('{\n  "platform": "openai",\n  "credentials": {}\n}'); let upstreamResult = $state<Record<string, unknown> | null>(null);
	let antigravityMap = $state<Record<string, unknown> | null>(null);
	const modeOpts = [{ value: 'oauth', label: 'OAuth' }, { value: 'setup-token', label: 'Setup token' }];

	function fmt(v: Record<string, unknown> | null): string { return v ? JSON.stringify(v, null, 2) : ''; }
	function parseIds(v: string): number[] { return v.trim().split(/[,\s]+/).filter(Boolean).map(Number).filter(n => Number.isInteger(n) && n > 0); }
	function parseProxy(): number | undefined { const t = oauthProxy.trim(); if (!t) return undefined; const n = Number(t); return Number.isInteger(n) && n > 0 ? n : undefined; }

	$effect(() => { if (open) void loadInfra(); });

	async function loadInfra() { try { const [r, p] = await Promise.all([listPassthrough(), listTLSProfiles()]); rules = r; profiles = p; } catch (err) { showError(err instanceof Error ? err.message : String(err)); } }
	async function run(label: string, fn: () => Promise<void>) { busy = true; try { await fn(); showSuccess(label); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }

	async function addRule() { await run('Rule created', async () => { await createPassthrough(JSON.parse(ruleJson)); await loadInfra(); }); }
	async function togRule(r: ErrorPassthroughRule) { await run('Rule updated', async () => { await togglePassthrough(r.id, !r.enabled); await loadInfra(); }); }
	async function delRule(r: ErrorPassthroughRule) { await run('Rule deleted', async () => { await deletePassthrough(r.id); await loadInfra(); }); }
	async function addProfile() { await run('Profile created', async () => { await createTLSProfile(JSON.parse(profileJson)); await loadInfra(); }); }
	async function delProfile(p: TLSFingerprintProfile) { await run('Profile deleted', async () => { await deleteTLSProfile(p.id); await loadInfra(); }); }

	function crsPayload() { if (!crsBase.trim() || !crsUser.trim() || !crsPwd) throw new Error('CRS fields required'); return { base_url: crsBase.trim(), username: crsUser.trim(), password: crsPwd }; }
	async function previewCRS() { await run('CRS preview loaded', async () => { crsPreview = await previewSyncFromCRS(crsPayload()); }); }
	async function syncCRS() { await run('CRS sync completed', async () => { const sel = crsSelected.trim().split(/[,\s]+/).filter(Boolean); crsResult = await syncFromCRS({ ...crsPayload(), sync_proxies: crsSyncProxies, selected_account_ids: sel.length ? sel : undefined }); onRefresh(); }); }
	async function importCodex() { if (!codexContent.trim()) return; await run('Codex imported', async () => { const p: Record<string, unknown> = { content: codexContent.trim(), update_existing: codexUpdate }; if (codexName.trim()) p.name = codexName.trim(); const gids = parseIds(codexGroups); if (gids.length) p.group_ids = gids; const pid = parseIds(codexProxy)[0]; if (pid) p.proxy_id = pid; codexResult = await importCodexSession(p); onRefresh(); }); }

	function oauthBase(): Record<string, unknown> { const p: Record<string, unknown> = {}; const pid = parseProxy(); if (pid) p.proxy_id = pid; if (oauthRedirect.trim()) p.redirect_uri = oauthRedirect.trim(); return p; }
	async function genOAuthUrl() { await run('OAuth URL generated', async () => { oauthAuth = oauthMode === 'setup-token' ? await generateSetupTokenUrl(oauthBase()) : await generateAuthUrl(oauthBase()); if (typeof oauthAuth.session_id === 'string') oauthSession = oauthAuth.session_id; try { const u = new URL((oauthAuth.auth_url ?? oauthAuth.url) as string); const s = u.searchParams.get('state'); if (s) oauthState = s; } catch {} }); }
	async function exchangeOAuthCode() { if (!oauthCode.trim()) return; await run('Code exchanged', async () => { const p: Record<string, unknown> = { code: oauthCode.trim(), ...oauthBase() }; if (oauthSession.trim()) p.session_id = oauthSession.trim(); if (oauthState.trim()) p.state = oauthState.trim(); oauthExchange = oauthMode === 'setup-token' ? await exchangeSetupTokenCode(p) : await exchangeCode(p); }); }
	async function oauthCookieAuth() { if (!oauthCookie.trim()) return; await run('Cookie auth done', async () => { oauthExchange = oauthMode === 'setup-token' ? await setupTokenCookieAuth({ code: oauthCookie.trim(), ...oauthBase() }) : await cookieAuth({ code: oauthCookie.trim(), ...oauthBase() }); }); }
	async function applyOAuth() { const aid = parseIds(oauthAcctId)[0]; if (!aid || !oauthExchange) return; await run('Credentials applied', async () => { let extra: Record<string, unknown> | undefined; try { const e = JSON.parse(oauthExtra); if (e && typeof e === 'object' && Object.keys(e).length) extra = e; } catch {} await applyOAuthCredentials(aid, { type: oauthMode, credentials: oauthExchange!, extra }); onRefresh(); }); }

	async function checkRisk() { await run('Risk checked', async () => { riskResult = await checkMixedChannelRisk(JSON.parse(riskJson)); }); }
	async function previewUpstream() { await run('Upstream preview done', async () => { upstreamResult = await previewSyncUpstreamModels(JSON.parse(upstreamJson)); }); }
	async function loadAntigravity() { await run('映射已加载', async () => { antigravityMap = await getAntigravityDefaultModelMapping(); }); }
</script>

<StandardDrawer side="right" width="lg" bind:open title={$_('admin.accountsQuench.advancedTitle', { default: 'Advanced account tools' })}  data-testid="account-advanced-dialog">
	<div class="mt-4 grid gap-4">
		<Card class="space-y-3"><h2 class="text-sm font-semibold">Error passthrough rules</h2>
			<Textarea rows={6} bind:value={ruleJson} data-testid="error-passthrough-json" /><div class="flex justify-end"><Button disabled={busy} onclick={addRule}>Create passthrough rule</Button></div>
			{#if rules.length === 0}<p class="text-sm text-muted-foreground">No rules.</p>
			{:else}<div data-testid="error-passthrough-list">{#each rules as r}<div class="flex items-center justify-between border-b px-2 py-1 text-sm last:border-b-0"><span class="truncate">{r.name}</span><div class="flex gap-1">
				<Badge variant="outline" class={r.enabled ? 'text-emerald-600' : 'text-muted-foreground'}>{r.enabled ? 'on' : 'off'}</Badge>
				<Button variant="ghost" size="sm" disabled={busy} onclick={() => togRule(r)}>{r.enabled ? 'Disable' : 'Enable'}</Button><Button variant="ghost" size="sm" class="text-destructive" disabled={busy} onclick={() => delRule(r)}>{$_('common.delete', { default: 'Delete' })}</Button></div></div>{/each}</div>{/if}
		</Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">TLS fingerprint profiles</h2>
			<Textarea rows={6} bind:value={profileJson} data-testid="tls-profile-json" /><div class="flex justify-end"><Button disabled={busy} onclick={addProfile}>Create TLS profile</Button></div>
			{#if profiles.length === 0}<p class="text-sm text-muted-foreground">No profiles.</p>
			{:else}<div data-testid="tls-profile-list">{#each profiles as p}<div class="flex items-center justify-between border-b px-2 py-1 text-sm last:border-b-0"><span class="truncate">{p.name}</span>
				<Button variant="ghost" size="sm" class="text-destructive" disabled={busy} onclick={() => delProfile(p)}>{$_('common.delete', { default: 'Delete' })}</Button></div>{/each}</div>{/if}
		</Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">CRS sync</h2>
			<div class="grid gap-3 sm:grid-cols-3"><label class="grid gap-1 text-sm">Base URL<Input bind:value={crsBase} data-testid="crs-base-url" /></label><label class="grid gap-1 text-sm">Username<Input bind:value={crsUser} data-testid="crs-username" /></label><label class="grid gap-1 text-sm">Password<Input type="password" bind:value={crsPwd} data-testid="crs-password" /></label></div>
			<div class="flex items-center gap-3"><label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={crsSyncProxies} />Sync proxies</label><Input placeholder="Selected account IDs" bind:value={crsSelected} data-testid="crs-selected-ids" /></div>
			<div class="flex justify-end gap-2"><Button variant="outline" disabled={busy} onclick={previewCRS}>Preview CRS</Button><Button disabled={busy} onclick={syncCRS}>Sync CRS</Button></div>
			{#if crsPreview}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs" data-testid="crs-preview-result">{fmt(crsPreview)}</pre>{/if}
			{#if crsResult}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{fmt(crsResult)}</pre>{/if}
		</Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">Codex session import</h2>
			<Textarea rows={4} bind:value={codexContent} placeholder="Paste Codex session content" data-testid="codex-session-content" />
			<div class="grid gap-3 sm:grid-cols-3"><label class="grid gap-1 text-sm">Name<Input bind:value={codexName} data-testid="codex-account-name" /></label><label class="grid gap-1 text-sm">Group IDs<Input bind:value={codexGroups} placeholder="7, 9" data-testid="codex-group-ids" /></label><label class="grid gap-1 text-sm">Proxy ID<Input bind:value={codexProxy} data-testid="codex-proxy-id" /></label></div>
			<div class="flex items-center gap-3"><label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={codexUpdate} />Update existing</label><Button disabled={busy} onclick={importCodex}>Import Codex sessions</Button></div>
			{#if codexResult}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs" data-testid="codex-import-result">{fmt(codexResult)}</pre>{/if}
		</Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">OAuth new account</h2>
			<div class="grid gap-3 sm:grid-cols-4"><NativeSelect bind:value={oauthMode} options={modeOpts} data-testid="oauth-mode" /><Input placeholder="Account ID" bind:value={oauthAcctId} data-testid="oauth-account-id" /><Input placeholder="Proxy ID" bind:value={oauthProxy} data-testid="oauth-proxy-id" /><Input placeholder="Redirect URI" bind:value={oauthRedirect} data-testid="oauth-redirect-uri" /></div>
			<div class="flex justify-end gap-2"><Button variant="outline" disabled={busy} onclick={genOAuthUrl}>Generate auth URL</Button></div>
			{#if oauthAuth}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{fmt(oauthAuth)}</pre>{/if}
			<div class="grid gap-3 sm:grid-cols-3"><Input placeholder="Session ID" bind:value={oauthSession} data-testid="oauth-session-id" /><Input placeholder="State" bind:value={oauthState} data-testid="oauth-state" /><Input placeholder="Code" bind:value={oauthCode} data-testid="oauth-code" /></div>
			<div class="flex justify-end gap-2"><Button variant="outline" disabled={busy || !oauthCode.trim()} onclick={exchangeOAuthCode}>Exchange code</Button></div>
			<div class="grid gap-3 sm:grid-cols-[1fr_auto]"><Input placeholder="Cookie key" bind:value={oauthCookie} data-testid="oauth-cookie-key" /><Button variant="outline" disabled={busy || !oauthCookie.trim()} onclick={oauthCookieAuth}>Cookie auth</Button></div>
			{#if oauthExchange}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs" data-testid="oauth-exchange-result">{fmt(oauthExchange)}</pre>{/if}
			<div class="grid gap-3 sm:grid-cols-[1fr_auto]"><Textarea rows={2} bind:value={oauthExtra} placeholder="Extra JSON" data-testid="oauth-extra-json" /><Button disabled={busy || !oauthExchange} onclick={applyOAuth}>Apply credentials</Button></div>
		</Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">Mixed channel risk</h2><Textarea rows={3} bind:value={riskJson} data-testid="mixed-risk-json" /><div class="flex justify-end"><Button disabled={busy} onclick={checkRisk}>Check mixed risk</Button></div>{#if riskResult}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs" data-testid="mixed-risk-result">{fmt(riskResult)}</pre>{/if}</Card>
		<Card class="space-y-3"><h2 class="text-sm font-semibold">Upstream models</h2><Textarea rows={3} bind:value={upstreamJson} data-testid="upstream-models-json" /><div class="flex justify-end gap-2"><Button variant="outline" disabled={busy} onclick={previewUpstream}>Preview upstream models</Button><Button variant="outline" disabled={busy} onclick={loadAntigravity}>Load Antigravity defaults</Button></div>{#if upstreamResult}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs" data-testid="upstream-models-result">{fmt(upstreamResult)}</pre>{/if}{#if antigravityMap}<pre class="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs" data-testid="antigravity-default-mapping">{fmt(antigravityMap)}</pre>{/if}</Card>
	</div>
	<div class="mt-5 flex justify-end"><Button variant="outline" onclick={() => { open = false; onClose(); }}>{$_('common.close', { default: 'Close' })}</Button></div>
</StandardDrawer>
