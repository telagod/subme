<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { CalendarClock, Plus } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		clearAccountRateLimit, createScheduledTestPlan, deleteScheduledTestPlan,
		getAccountModels, getAccountStats, getAccountUsage,
		listScheduledTestPlans, listScheduledTestResults,
		queryOpenAIQuota, recoverAccountState, resetAccountQuota,
		resetOpenAIQuota, syncAccountModels, testAccountStream,
		updateScheduledTestPlan,
		type Account, type AccountModel, type AccountStats, type AccountTestEvent,
		type AccountUsageInfo, type OpenAIQuotaResetResult, type OpenAIQuotaUsage,
		type ScheduledTestPlan, type ScheduledTestResult
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { statusTone } from '$lib/features/supply/supply';

	type Props = { open: boolean; account: Account | null; onRefresh: () => void; onClose: () => void };
	let { open = $bindable(false), account = null, onRefresh, onClose }: Props = $props();

	let busy = $state(false);
	let toolsLoading = $state(false);
	let toolsError = $state<string | null>(null);
	let stats = $state<AccountStats | null>(null);
	let usage = $state<AccountUsageInfo | null>(null);
	let models = $state<AccountModel[]>([]);
	let testModelId = $state('__manual__');
	let testMode = $state('default');
	let testPrompt = $state('');
	let testStatus = $state<'idle' | 'running' | 'success' | 'error'>('idle');
	let testLines = $state<Array<{ text: string; tone: string }>>([]);
	let testImages = $state<Array<{ url: string; mimeType?: string }>>([]);
	let testError = $state<string | null>(null);
	let plans = $state<ScheduledTestPlan[]>([]);
	let results = $state<Record<number, ScheduledTestResult[]>>({});
	let resultsLoading = $state<Set<number>>(new Set());
	let expandedPlanId = $state<number | null>(null);
	let editingPlanId = $state<number | null>(null);
	let newPlanOpen = $state(false);
	let newForm = $state({ model_id: '', cron_expression: '*/30 * * * *', max_results: '100', enabled: true, auto_recover: false });
	let editForm = $state({ model_id: '', cron_expression: '', max_results: '100', enabled: true, auto_recover: false });
	let quota = $state<OpenAIQuotaUsage | null>(null);
	let quotaResult = $state<OpenAIQuotaResetResult | null>(null);

	function metric(record: Record<string, unknown> | null, keys: string[]): string {
		if (!record) return '-';
		for (const k of keys) { const v = record[k]; if (v != null) { if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2); return String(v) || '-'; } }
		return '-';
	}
	function modelLabel(m: AccountModel): string { return typeof (m.display_name ?? m.name ?? m.model ?? m.id) === 'string' ? (m.display_name ?? m.name ?? m.model ?? m.id) as string : JSON.stringify(m); }
	function modelOptions(): { value: string; label: string }[] {
		const seen = new Set<string>(); return models.map(m => { const v = (m.id ?? m.model ?? m.name ?? m.display_name) as string; return v ? { value: v, label: modelLabel(m) } : null; }).filter((o): o is { value: string; label: string } => o != null && !seen.has(o.value) && (seen.add(o.value), true));
	}
	function isImage(id: string): boolean { const n = id.toLowerCase(); return n.startsWith('gpt-image-') || (n.startsWith('gemini-') && n.includes('-image')); }
	function isOpenAIOAuth(a: Account | null): boolean { return a?.platform === 'openai' && a?.type === 'oauth'; }
	function lineTone(t: string): string { if (t === 'success') return 'text-emerald-700 dark:text-emerald-300'; if (t === 'warning') return 'text-amber-700 dark:text-amber-300'; if (t === 'error') return 'text-destructive'; if (t === 'info') return 'text-sky-700 dark:text-sky-300'; return 'text-muted-foreground'; }
	function fmtTs(v: string | null | undefined): string { if (!v) return '-'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString(); }
	function planPayload(f: typeof newForm) { const mr = Number(f.max_results); return { model_id: f.model_id.trim(), cron_expression: f.cron_expression.trim(), enabled: f.enabled, auto_recover: f.auto_recover, max_results: Number.isFinite(mr) && mr > 0 ? mr : 100 }; }

	$effect(() => {
		if (open && account) void loadTools();
	});

	async function loadTools() {
		if (!account) return;
		toolsLoading = true; toolsError = null;
		try {
			const [s, u, m, p] = await Promise.all([getAccountStats(account.id, 30), getAccountUsage(account.id, { source: 'active' }), getAccountModels(account.id), listScheduledTestPlans(account.id)]);
			stats = s; usage = u; models = m; plans = p;
			if (!newForm.model_id) { const opts = modelOptions(); newForm.model_id = opts[0]?.value ?? ''; }
			if (testModelId === '__manual__') { const opts = modelOptions(); testModelId = opts[0]?.value ?? '__manual__'; }
		} catch (err) { toolsError = err instanceof Error ? err.message : String(err); }
		finally { toolsLoading = false; }
	}

	async function act(label: string, action: () => Promise<unknown>, refresh = true) {
		busy = true;
		try { const r = await action(); showSuccess(label); if (refresh) await loadTools(); onRefresh(); return r; } catch (err) { showError(err instanceof Error ? err.message : String(err)); return undefined; }
		finally { busy = false; }
	}

	async function runTest() {
		if (!account) return;
		const mid = testModelId === '__manual__' ? '' : testModelId.trim();
		testStatus = 'running'; testLines = []; testImages = []; testError = null; busy = true;
		testLines = [{ text: `Starting test for ${account.name || account.email || `#${account.id}`}`, tone: 'info' }];
		try {
			const resp = await testAccountStream(account.id, { model_id: mid || undefined, mode: testMode === 'compact' ? 'compact' : undefined, prompt: isImage(mid) ? testPrompt.trim() : undefined });
			const reader = resp.body?.getReader(); if (!reader) throw new Error('No response body');
			const dec = new TextDecoder(); let buf = '';
			while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() ?? '';
				for (const line of lines) { const t = line.trim(); if (!t.startsWith('data:')) continue; const raw = t.slice(5).trim(); if (!raw) continue; const evt = JSON.parse(raw) as AccountTestEvent;
					if (evt.type === 'test_start') testLines = [...testLines, { text: `Connected${evt.model ? ` using ${evt.model}` : ''}`, tone: 'success' }];
					else if (evt.type === 'content' && evt.text) testLines = [...testLines, { text: evt.text, tone: 'success' }];
					else if (evt.type === 'status' && evt.text) testLines = [...testLines, { text: evt.text, tone: 'info' }];
					else if (evt.type === 'image' && evt.image_url) { testImages = [...testImages, { url: evt.image_url, mimeType: evt.mime_type }]; testLines = [...testLines, { text: `Image received (${testImages.length})`, tone: 'info' }]; }
					else if (evt.type === 'test_complete') { testStatus = evt.success === false ? 'error' : 'success'; testLines = [...testLines, { text: evt.success === false ? (evt.error ?? 'Test failed') : 'Test completed', tone: evt.success === false ? 'error' : 'success' }]; if (evt.error) testError = evt.error; }
					else if (evt.type === 'error') { testStatus = 'error'; testError = evt.error ?? 'Test failed'; testLines = [...testLines, { text: testError, tone: 'error' }]; }
				}
			}
			if (testStatus === 'running') { testStatus = 'success'; testLines = [...testLines, { text: 'Stream ended', tone: 'success' }]; }
			showSuccess('Account test completed'); onRefresh();
		} catch (err) { testStatus = 'error'; testError = err instanceof Error ? err.message : String(err); testLines = [...testLines, { text: testError, tone: 'error' }]; showError(testError); }
		finally { busy = false; }
	}

	async function syncMod() {
		if (!account) return;
		const r = await act('Models synced', () => syncAccountModels(account!.id), false);
		if (r && typeof r === 'object' && 'models' in r && Array.isArray((r as { models?: unknown }).models)) models = ((r as { models: string[] }).models).map(m => ({ id: m, name: m }));
		else await loadTools();
	}

	async function queryQuota() { if (!account) return; busy = true; quotaResult = null; try { quota = await queryOpenAIQuota(account.id); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function resetQuotaAction() { if (!account || !quota) return; const c = Number(quota.rate_limit_reset_credits?.available_count ?? 0); if (c <= 0) { showError('No reset credits'); return; } busy = true; try { quotaResult = await resetOpenAIQuota(account.id); quota = await queryOpenAIQuota(account.id); showSuccess(`Reset ${quotaResult.windows_reset} windows`); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }

	async function createPlan() { if (!account) return; const p = planPayload(newForm); if (!p.model_id || !p.cron_expression) { showError('Model and cron required'); return; } busy = true; try { await createScheduledTestPlan({ ...p, account_id: account.id }); showSuccess('Plan created'); newPlanOpen = false; newForm = { model_id: modelOptions()[0]?.value ?? '', cron_expression: '*/30 * * * *', max_results: '100', enabled: true, auto_recover: false }; await loadTools(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	function startEdit(plan: ScheduledTestPlan) { editingPlanId = plan.id; editForm = { model_id: plan.model_id, cron_expression: plan.cron_expression, max_results: String(plan.max_results ?? 100), enabled: plan.enabled, auto_recover: plan.auto_recover }; }
	async function saveEdit(id: number) { const p = planPayload(editForm); if (!p.model_id || !p.cron_expression) { showError('Model and cron required'); return; } busy = true; try { const u = await updateScheduledTestPlan(id, p); plans = plans.map(x => x.id === id ? u : x); editingPlanId = null; showSuccess('Plan updated'); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function togglePlan(plan: ScheduledTestPlan, enabled: boolean) { busy = true; try { const u = await updateScheduledTestPlan(plan.id, { enabled }); plans = plans.map(x => x.id === plan.id ? u : x); showSuccess('Plan updated'); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function removePlan(plan: ScheduledTestPlan) { busy = true; try { await deleteScheduledTestPlan(plan.id); plans = plans.filter(x => x.id !== plan.id); const { [plan.id]: _, ...rest } = results; results = rest; if (expandedPlanId === plan.id) expandedPlanId = null; if (editingPlanId === plan.id) editingPlanId = null; showSuccess('Plan deleted'); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function toggleResults(plan: ScheduledTestPlan) { if (expandedPlanId === plan.id) { expandedPlanId = null; return; } expandedPlanId = plan.id; if (results[plan.id]) return; resultsLoading = new Set([...resultsLoading, plan.id]); try { results = { ...results, [plan.id]: await listScheduledTestResults(plan.id, 50) }; } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { const n = new Set(resultsLoading); n.delete(plan.id); resultsLoading = n; } }
</script>

<StandardDialog bind:open title={account ? `${account.name || account.email || `#${account.id}`} tools` : 'Account tools'} width="lg" data-testid="account-tools-dialog">
	<div class="mt-4 space-y-4">
		{#if toolsError}<Alert variant="destructive">{toolsError}</Alert>{/if}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<Card><p class="text-xs font-medium uppercase text-muted-foreground">Requests</p><p class="mt-2 text-xl font-semibold">{metric(stats, ['requests', 'total_requests', 'request_count'])}</p></Card>
			<Card><p class="text-xs font-medium uppercase text-muted-foreground">Tokens</p><p class="mt-2 text-xl font-semibold">{metric(stats, ['total_tokens', 'tokens', 'token_count'])}</p></Card>
			<Card><p class="text-xs font-medium uppercase text-muted-foreground">Cost</p><p class="mt-2 text-xl font-semibold">{metric(stats, ['actual_cost', 'total_cost', 'cost'])}</p></Card>
			<Card><p class="text-xs font-medium uppercase text-muted-foreground">Usage source</p><p class="mt-2 text-xl font-semibold">{metric(usage, ['source', 'status', 'state'])}</p></Card>
		</div>

		<Card class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<div><h2 class="text-sm font-semibold">Runtime actions</h2><p class="text-xs text-muted-foreground">Operational controls for upstream account health and quota state.</p></div>
				<Button variant="outline" size="sm" disabled={toolsLoading} onclick={loadTools}>Reload</Button>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" disabled={busy || !account} onclick={runTest}>Test</Button>
				<Button variant="outline" disabled={busy || !account} onclick={() => account && act('State recovered', () => recoverAccountState(account!.id))}>Recover state</Button>
				<Button variant="outline" disabled={busy || !account} onclick={() => account && act('Rate limit cleared', () => clearAccountRateLimit(account!.id))}>Clear rate limit</Button>
				<Button variant="outline" disabled={busy || !account} onclick={() => account && act('Quota reset', () => resetAccountQuota(account!.id))}>Reset quota</Button>
				<Button variant="outline" disabled={busy || !account} onclick={syncMod}>Sync models</Button>
			</div>
			<div class="grid gap-3 rounded-md border border-border p-3" data-testid="account-test-panel">
				<div class="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_160px_auto]">
					<label class="grid gap-1 text-sm">Test model<NativeSelect bind:value={testModelId} options={modelOptions().length ? modelOptions() : [{ value: '__manual__', label: 'Manual model' }]} disabled={busy || toolsLoading} data-testid="account-test-model" /></label>
					<label class="grid gap-1 text-sm">Mode<NativeSelect bind:value={testMode} options={[{ value: 'default', label: 'Default' }, { value: 'compact', label: 'Compact' }]} disabled={busy} data-testid="account-test-mode" /></label>
					<label class="grid gap-1 text-sm">Manual model<Input placeholder="model id" bind:value={testModelId} disabled={busy} data-testid="account-test-manual-model" /></label>
				</div>
				{#if isImage(testModelId)}<label class="grid gap-1 text-sm">Image prompt<Textarea rows={3} bind:value={testPrompt} placeholder="Describe the image test prompt" disabled={busy} data-testid="account-test-prompt" /></label>{/if}
				<div class="min-h-28 max-h-56 overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-xs" data-testid="account-test-output">
					{#if testLines.length === 0}<p class="text-muted-foreground">Ready to test account connectivity.</p>
					{:else}{#each testLines as line, i (`${i}-${line.text}`)}<p class={lineTone(line.tone)}>{line.text}</p>{/each}{/if}
				</div>
				{#if testImages.length > 0}<div class="grid gap-2 sm:grid-cols-2" data-testid="account-test-images">{#each testImages as img, i (`${img.url}-${i}`)}<a href={img.url} target="_blank" rel="noreferrer" class="overflow-hidden rounded-md border border-border bg-background"><img src={img.url} alt={`test-${i + 1}`} class="max-h-72 w-full object-contain" /><p class="border-t px-3 py-1.5 text-xs text-muted-foreground">{img.mimeType ?? 'image/*'}</p></a>{/each}</div>{/if}
				{#if testError}<Alert variant="destructive" data-testid="account-test-error">{testError}</Alert>{/if}
			</div>
			{#if isOpenAIOAuth(account)}
				<div class="grid gap-2 rounded-md border border-border p-3" data-testid="openai-quota-reset">
					<div class="flex items-center justify-between gap-3"><div><p class="text-sm font-medium">OpenAI reset credits</p><p class="text-xs text-muted-foreground">Query upstream reset credits before consuming one reset.</p></div><Badge variant="outline" data-testid="openai-quota-credit-count">{quota?.rate_limit_reset_credits?.available_count ?? '-'}</Badge></div>
					<div class="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy || !account} onclick={queryQuota}>Query OpenAI quota</Button><Button variant="outline" size="sm" disabled={busy || !quota || Number(quota.rate_limit_reset_credits?.available_count ?? 0) <= 0} onclick={resetQuotaAction}>Use reset credit</Button></div>
					{#if quota}<div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3"><p>Plan: <span class="text-foreground">{quota.plan_type ?? '-'}</span></p><p>Email: <span class="text-foreground">{quota.email ?? account?.email ?? '-'}</span></p><p>Fetched: <span class="text-foreground">{quota.fetched_at ? new Date(Number(quota.fetched_at) * 1000).toLocaleString() : '-'}</span></p></div>{/if}
					{#if quotaResult}<p class="rounded-md bg-muted p-2 text-sm" data-testid="openai-quota-reset-result">Reset {quotaResult.windows_reset} windows · {quotaResult.code}</p>{/if}
				</div>
			{/if}
		</Card>

		<Card class="space-y-3">
			<div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold">Models</h2><p class="text-xs text-muted-foreground">Supported upstream model list.</p></div><Badge variant="outline">{models.length}</Badge></div>
			<div class="max-h-56 overflow-auto rounded-md border border-border" data-testid="account-models-list">
				{#if toolsLoading}<p class="p-4 text-sm text-muted-foreground">Loading...</p>
				{:else if models.length === 0}<p class="p-4 text-sm text-muted-foreground">No models reported.</p>
				{:else}{#each models as m, i (`${modelLabel(m)}-${i}`)}<div class="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0"><p class="truncate font-medium">{modelLabel(m)}</p>{#if typeof m.type === 'string'}<Badge variant="outline">{m.type}</Badge>{/if}</div>{/each}{/if}
			</div>
		</Card>

		<Card class="space-y-3" data-testid="account-scheduled-tests">
			<div class="flex items-center justify-between gap-3"><div><h2 class="text-sm font-semibold">Scheduled tests</h2><p class="text-xs text-muted-foreground">Run recurring account connectivity tests.</p></div>
				<div class="flex items-center gap-2"><Badge variant="outline">{plans.length}</Badge><Button variant="outline" size="sm" disabled={busy || !account} onclick={() => { newPlanOpen = !newPlanOpen; }} data-testid="account-scheduled-add"><Plus size={15} />Add plan</Button></div>
			</div>
			{#if newPlanOpen}
				<div class="grid gap-3 rounded-md border border-border p-3" data-testid="account-scheduled-create-form">
					<div class="grid gap-3 sm:grid-cols-3"><label class="grid gap-1 text-sm">Model ID<Input bind:value={newForm.model_id} data-testid="account-scheduled-model" /></label><label class="grid gap-1 text-sm">Cron<Input bind:value={newForm.cron_expression} placeholder="*/30 * * * *" data-testid="account-scheduled-cron" /></label><label class="grid gap-1 text-sm">Max results<Input type="number" min="1" bind:value={newForm.max_results} data-testid="account-scheduled-max-results" /></label></div>
					<div class="flex flex-wrap items-center gap-4"><label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={newForm.enabled} data-testid="account-scheduled-enabled" />Enabled</label><label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={newForm.auto_recover} data-testid="account-scheduled-auto-recover" />Auto recover</label></div>
					<div class="flex justify-end gap-2"><Button variant="outline" size="sm" onclick={() => (newPlanOpen = false)}>Cancel</Button><Button size="sm" disabled={busy || !newForm.model_id.trim() || !newForm.cron_expression.trim()} onclick={createPlan}>Save plan</Button></div>
				</div>
			{/if}
			<div class="max-h-80 overflow-auto rounded-md border border-border" data-testid="account-scheduled-list">
				{#if toolsLoading}<p class="p-4 text-sm text-muted-foreground">Loading...</p>
				{:else if plans.length === 0}<p class="p-4 text-sm text-muted-foreground">No scheduled test plans.</p>
				{:else}{#each plans as plan}
					<div class="border-b p-3 last:border-b-0" data-testid="account-scheduled-row">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="min-w-0"><div class="flex items-center gap-2"><CalendarClock size={15} class="text-muted-foreground" /><p class="truncate text-sm font-medium">{plan.model_id}</p><Badge variant="outline" class={plan.enabled ? statusTone('active') : statusTone('inactive')}>{plan.enabled ? 'enabled' : 'disabled'}</Badge>{#if plan.auto_recover}<Badge variant="outline">auto recover</Badge>{/if}</div><p class="mt-1 truncate font-mono text-xs text-muted-foreground">{plan.cron_expression}</p><p class="mt-1 text-xs text-muted-foreground">last {fmtTs(plan.last_run_at)} · next {fmtTs(plan.next_run_at)}</p></div>
							<div class="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onclick={() => toggleResults(plan)}>{expandedPlanId === plan.id ? 'Hide results' : 'Results'}</Button><Button variant="outline" size="sm" disabled={busy} onclick={() => startEdit(plan)}>Edit</Button><Button variant="outline" size="sm" disabled={busy} onclick={() => togglePlan(plan, !plan.enabled)}>{plan.enabled ? 'Disable' : 'Enable'}</Button><Button variant="ghost" size="sm" class="text-destructive" disabled={busy} onclick={() => removePlan(plan)}>Delete</Button></div>
						</div>
						{#if editingPlanId === plan.id}
							<div class="mt-3 grid gap-3 rounded-md border border-border p-3" data-testid="account-scheduled-edit-form">
								<div class="grid gap-3 sm:grid-cols-3"><label class="grid gap-1 text-sm">Model ID<Input bind:value={editForm.model_id} data-testid="account-scheduled-edit-model" /></label><label class="grid gap-1 text-sm">Cron<Input bind:value={editForm.cron_expression} data-testid="account-scheduled-edit-cron" /></label><label class="grid gap-1 text-sm">Max results<Input type="number" min="1" bind:value={editForm.max_results} data-testid="account-scheduled-edit-max-results" /></label></div>
								<div class="flex flex-wrap items-center gap-4"><label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={editForm.enabled} data-testid="account-scheduled-edit-enabled" />Enabled</label><label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={editForm.auto_recover} data-testid="account-scheduled-edit-auto-recover" />Auto recover</label></div>
								<div class="flex justify-end gap-2"><Button variant="outline" size="sm" onclick={() => (editingPlanId = null)}>Cancel</Button><Button size="sm" disabled={busy || !editForm.model_id.trim() || !editForm.cron_expression.trim()} onclick={() => saveEdit(plan.id)}>Save edit</Button></div>
							</div>
						{/if}
						{#if expandedPlanId === plan.id}
							<div class="mt-3 rounded-md border border-border bg-muted/20 p-3" data-testid="account-scheduled-results">
								{#if resultsLoading.has(plan.id)}<p class="text-sm text-muted-foreground">Loading results...</p>
								{:else if !(results[plan.id]?.length)}<p class="text-sm text-muted-foreground">No results yet.</p>
								{:else}<div class="grid gap-2">{#each results[plan.id] as result}<div class="rounded-md border border-border bg-background p-2 text-xs" data-testid="account-scheduled-result"><div class="flex flex-wrap items-center justify-between gap-2"><div class="flex items-center gap-2"><Badge variant="outline" class={statusTone(result.status)}>{result.status}</Badge>{#if result.latency_ms > 0}<span class="text-muted-foreground">{result.latency_ms}ms</span>{/if}</div><span class="text-muted-foreground">{fmtTs(result.started_at)}</span></div>{#if result.error_message}<pre class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">{result.error_message}</pre>{:else if result.response_text}<pre class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2">{result.response_text}</pre>{/if}</div>{/each}</div>{/if}
							</div>
						{/if}
					</div>
				{/each}{/if}
			</div>
		</Card>
	</div>
	<div class="mt-5 flex justify-end"><Button variant="outline" onclick={() => { open = false; onClose(); }}>Close</Button></div>
</StandardDialog>
