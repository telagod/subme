<script lang="ts">
	/**
	 * AdvancedRequestConfig — headers key-value editor + body override mode + JSON editor.
	 *
	 * Ported from Vue MonitorAdvancedRequestConfig.vue.
	 * Svelte 5 runes, no stores. Parent binds via $bindable props.
	 */
	import { _ } from 'svelte-i18n';
	import { Plus, X } from '@lucide/svelte';
	import type { APIMode, BodyOverrideMode, Provider } from '$lib/api/admin/channelMonitor';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

	type Props = {
		provider: Provider;
		apiMode: APIMode;
		extraHeaders: Record<string, string>;
		bodyOverrideMode: BodyOverrideMode;
		bodyOverride: Record<string, unknown> | null;
		onHeadersChange?: (headers: Record<string, string>) => void;
		onBodyModeChange?: (mode: BodyOverrideMode) => void;
		onBodyChange?: (body: Record<string, unknown> | null) => void;
	};

	let {
		provider,
		apiMode,
		extraHeaders,
		bodyOverrideMode,
		bodyOverride,
		onHeadersChange,
		onBodyModeChange,
		onBodyChange
	}: Props = $props();

	// ── Header rows ──────────────────────────────────────────────────
	interface HeaderRow {
		name: string;
		value: string;
	}

	function toRows(h: Record<string, string>): HeaderRow[] {
		const entries = Object.entries(h || {});
		if (entries.length === 0) return [{ name: '', value: '' }];
		return entries.map(([name, value]) => ({ name, value }));
	}

	function toMap(rows: HeaderRow[]): Record<string, string> {
		const out: Record<string, string> = {};
		for (const row of rows) {
			const name = row.name.trim();
			if (name === '') continue;
			out[name] = row.value;
		}
		return out;
	}

	let headerRows = $state<HeaderRow[]>([{ name: '', value: '' }]);
	let headersError = $state('');

	// Derive a JSON snapshot of incoming headers so the effect properly tracks the prop
	const extraHeadersSnapshot = $derived(JSON.stringify(extraHeaders));

	// Sync from parent when extraHeaders changes externally
	$effect(() => {
		const incoming = JSON.parse(extraHeadersSnapshot) as Record<string, string>;
		const current = toMap(headerRows);
		const ik = Object.keys(incoming || {});
		const ck = Object.keys(current);
		if (ik.length !== ck.length || ik.some((k) => incoming[k] !== current[k])) {
			headerRows = toRows(incoming);
		}
	});

	function commitHeaders() {
		for (const row of headerRows) {
			const name = row.name.trim();
			if (name === '') continue;
			if (name.includes(':') || /\s/.test(name)) {
				headersError = $_('admin.channelMonitor.advanced.headerNameInvalid', {
					default: `Invalid header name: ${name}`,
					values: { name }
				});
				return;
			}
		}
		headersError = '';
		onHeadersChange?.(toMap(headerRows));
	}

	function addRow() {
		headerRows = [...headerRows, { name: '', value: '' }];
	}

	function removeRow(index: number) {
		headerRows = headerRows.filter((_, i) => i !== index);
		if (headerRows.length === 0) {
			headerRows = [{ name: '', value: '' }];
		}
		commitHeaders();
	}

	// ── Body override ────────────────────────────────────────────────
	function serializeBody(body: Record<string, unknown> | null): string {
		if (!body || Object.keys(body).length === 0) return '';
		return JSON.stringify(body, null, 2);
	}

	let bodyText = $state('');
	let bodyError = $state('');

	// Derive a JSON snapshot of incoming body so the effect properly tracks the prop
	const bodyOverrideSnapshot = $derived(JSON.stringify(bodyOverride));

	$effect(() => {
		// Access the derived to establish tracking
		const incoming = JSON.parse(bodyOverrideSnapshot || 'null') as Record<string, unknown> | null;
		bodyText = serializeBody(incoming);
		bodyError = '';
	});

	function commitBody() {
		if (bodyOverrideMode === 'off') return;
		const trimmed = bodyText.trim();
		if (trimmed === '') {
			onBodyChange?.(null);
			bodyError = '';
			return;
		}
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				bodyError = $_('admin.channelMonitor.advanced.bodyJsonObjectError', {
					default: 'Body must be a JSON object'
				});
				return;
			}
			onBodyChange?.(parsed as Record<string, unknown>);
			bodyError = '';
		} catch (e) {
			bodyError =
				$_('admin.channelMonitor.advanced.bodyJsonError', { default: 'Invalid JSON' }) +
				': ' +
				(e instanceof Error ? e.message : String(e));
		}
	}

	function formatBody() {
		const trimmed = bodyText.trim();
		if (trimmed === '') return;
		try {
			const parsed = JSON.parse(trimmed);
			bodyText = JSON.stringify(parsed, null, 2);
			bodyError = '';
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				onBodyChange?.(parsed as Record<string, unknown>);
			}
		} catch (e) {
			bodyError =
				$_('admin.channelMonitor.advanced.bodyJsonError', { default: 'Invalid JSON' }) +
				': ' +
				(e instanceof Error ? e.message : String(e));
		}
	}

	function updateBodyMode(mode: BodyOverrideMode) {
		onBodyModeChange?.(mode);
		if (mode === 'off') {
			onBodyChange?.(null);
		}
	}

	const bodyModes: { value: BodyOverrideMode; labelKey: string; defaultLabel: string }[] = [
		{ value: 'off', labelKey: 'admin.channelMonitor.advanced.bodyModeOff', defaultLabel: 'Off' },
		{ value: 'merge', labelKey: 'admin.channelMonitor.advanced.bodyModeMerge', defaultLabel: 'Merge' },
		{ value: 'replace', labelKey: 'admin.channelMonitor.advanced.bodyModeReplace', defaultLabel: 'Replace' }
	];

	const bodyModeHint = $derived(
		bodyOverrideMode === 'merge'
			? $_('admin.channelMonitor.advanced.bodyModeHintMerge', {
					default: 'Shallow-merge your overrides onto the default body. model/messages fields are protected.'
				})
			: bodyOverrideMode === 'replace'
				? $_('admin.channelMonitor.advanced.bodyModeHintReplace', {
						default: 'Use your JSON as the full request body. Challenge verification is skipped.'
					})
				: $_('admin.channelMonitor.advanced.bodyModeHintOff', {
						default: 'Use the default adapter body for this provider.'
					})
	);

	const bodyPlaceholder = $derived(() => {
		if (provider === 'openai' && apiMode === 'responses') {
			if (bodyOverrideMode === 'merge') return '{\n  "max_output_tokens": 20\n}';
			return '{\n  "model": "gpt-4o-mini",\n  "instructions": "You are a health check endpoint. Reply briefly.",\n  "input": "Reply with exactly: ok",\n  "max_output_tokens": 20,\n  "stream": false\n}';
		}
		if (provider === 'openai') {
			if (bodyOverrideMode === 'merge') return '{\n  "max_tokens": 20\n}';
			return '{\n  "model": "gpt-4o-mini",\n  "messages": [{"role":"user","content":"Reply with exactly: ok"}],\n  "max_tokens": 20,\n  "stream": false\n}';
		}
		if (bodyOverrideMode === 'merge') return '{\n  "system": "You are a health check endpoint..."\n}';
		return '{\n  "model": "claude-x",\n  "messages": [{"role":"user","content":"hi"}],\n  "max_tokens": 10\n}';
	});
</script>

<div class="space-y-4" data-testid="advanced-request-config">
	<!-- Headers key-value rows -->
	<div>
		<p class="mb-1.5 text-sm font-medium text-foreground">
			{$_('admin.channelMonitor.advanced.headers', { default: 'Extra headers' })}
		</p>
		<div class="space-y-1.5">
			{#each headerRows as row, i (i)}
				<div class="flex items-center gap-2">
					<Input
						bind:value={row.name}
						spellcheck="false"
						placeholder={$_('admin.channelMonitor.advanced.headerNamePlaceholder', { default: 'Header name' })}
						class="w-52 flex-none font-mono text-xs"
						onblur={commitHeaders}
					/>
					<Input
						bind:value={row.value}
						spellcheck="false"
						placeholder={$_('admin.channelMonitor.advanced.headerValuePlaceholder', { default: 'Value' })}
						class="flex-1 font-mono text-xs"
						onblur={commitHeaders}
					/>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7 flex-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						onclick={() => removeRow(i)}
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			{/each}
			<Button
				variant="outline"
				class="h-auto gap-1 border-dashed px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
				onclick={addRow}
			>
				<Plus class="h-3.5 w-3.5" />
				{$_('admin.channelMonitor.advanced.headerAddRow', { default: 'Add header' })}
			</Button>
		</div>
		{#if headersError}
			<p class="mt-1 text-xs text-destructive">{headersError}</p>
		{:else}
			<p class="mt-1 text-xs text-muted-foreground">
				{$_('admin.channelMonitor.advanced.headersHint', {
					default: 'Custom HTTP headers merged into the health-check request. Hop-by-hop headers are filtered.'
				})}
			</p>
		{/if}
	</div>

	<!-- Body override mode -->
	<div>
		<p class="mb-1.5 text-sm font-medium text-foreground">
			{$_('admin.channelMonitor.advanced.bodyMode', { default: 'Body override mode' })}
		</p>
		<div class="grid grid-cols-3 gap-3">
			{#each bodyModes as opt (opt.value)}
				<Button
					variant="outline"
					class="h-auto w-full rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors {bodyOverrideMode === opt.value
						? 'border-primary bg-primary/15 text-primary'
						: 'border-border bg-card text-muted-foreground hover:border-primary'}"
					onclick={() => updateBodyMode(opt.value)}
				>
					{$_(opt.labelKey, { default: opt.defaultLabel })}
				</Button>
			{/each}
		</div>
		<p class="mt-1 text-xs text-muted-foreground">{bodyModeHint}</p>
	</div>

	<!-- Body JSON editor -->
	{#if bodyOverrideMode !== 'off'}
		<div>
			<div class="mb-1 flex items-center justify-between">
				<p class="text-sm font-medium text-foreground">
					{$_('admin.channelMonitor.advanced.bodyJson', { default: 'Body JSON' })}
				</p>
				<Button
					variant="ghost"
					class="h-auto p-0 text-xs"
					disabled={!bodyText.trim()}
					onclick={formatBody}
				>
					{$_('admin.channelMonitor.advanced.bodyJsonFormat', { default: 'Format' })}
				</Button>
			</div>
			<Textarea
				bind:value={bodyText}
				rows={10}
				placeholder={bodyPlaceholder()}
				class="font-mono text-xs"
				style="white-space: pre; overflow-wrap: normal; overflow-x: auto;"
				spellcheck="false"
				onblur={commitBody}
			/>
			{#if bodyError}
				<p class="mt-1 text-xs text-destructive">{bodyError}</p>
			{:else}
				<p class="mt-1 text-xs text-muted-foreground">
					{$_('admin.channelMonitor.advanced.bodyJsonHint', {
						default: 'JSON object for the request body. Used according to the body override mode.'
					})}
				</p>
			{/if}
		</div>
	{/if}
</div>
