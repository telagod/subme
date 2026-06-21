<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Plus, Trash2 } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import { createChannel, updateChannel, type Channel, type ChannelModelPricing, type SaveChannelPayload } from '$lib/api/admin/channels';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { mTokToPerToken, perTokenToMTok } from '$lib/utils/pricing';

	type Props = { open: boolean; channel: Channel | null; onSaved: () => void; onClose: () => void };
	let { open = $bindable(false), channel = null, onSaved, onClose }: Props = $props();

	const billingModes = [{ value: 'token', label: 'token' }, { value: 'per_request', label: 'per_request' }, { value: 'image', label: 'image' }];
	const sourceOpts = [{ value: 'channel_mapped', label: 'Channel mapped' }, { value: 'requested', label: 'Requested model' }, { value: 'upstream', label: 'Upstream model' }];
	const statusOpts = [{ value: 'active', label: 'active' }, { value: 'disabled', label: 'disabled' }, { value: 'inactive', label: 'inactive' }];

	type IvForm = { minTokens: string; maxTokens: string; tierLabel: string; inputPrice: string; outputPrice: string; cacheWritePrice: string; cacheReadPrice: string; perRequestPrice: string };
	type PeForm = { platform: string; modelsText: string; billingMode: string; inputPrice: string; outputPrice: string; cacheWritePrice: string; cacheReadPrice: string; imageOutputPrice: string; perRequestPrice: string; intervals: IvForm[] };

	let name = $state(''); let desc = $state(''); let status = $state('active'); let source = $state('channel_mapped');
	let restrict = $state(false); let applyStats = $state(false); let groupIds = $state(''); let mappingJson = $state('{}');
	let pricing = $state<PeForm[]>([]); let saving = $state(false); let error = $state<string | null>(null);

	function pt(v: number | null | undefined): string { return v == null ? '' : String(v); }
	function emptyIv(): IvForm { return { minTokens: '0', maxTokens: '', tierLabel: '', inputPrice: '', outputPrice: '', cacheWritePrice: '', cacheReadPrice: '', perRequestPrice: '' }; }
	function emptyPe(): PeForm { return { platform: 'openai', modelsText: '', billingMode: 'token', inputPrice: '', outputPrice: '', cacheWritePrice: '', cacheReadPrice: '', imageOutputPrice: '', perRequestPrice: '', intervals: [] }; }

	$effect(() => {
		if (!open) return;
		if (channel) {
			name = channel.name; desc = channel.description ?? ''; status = channel.status || 'active'; source = channel.billing_model_source || 'channel_mapped';
			restrict = channel.restrict_models === true; applyStats = channel.apply_pricing_to_account_stats === true;
			groupIds = channel.group_ids?.join(', ') ?? ''; mappingJson = JSON.stringify(channel.model_mapping ?? {}, null, 2);
			pricing = (channel.model_pricing ?? []).map(p => ({
				platform: p.platform, modelsText: p.models?.join(', ') ?? '', billingMode: p.billing_mode || 'token',
				inputPrice: pt(perTokenToMTok(p.input_price)), outputPrice: pt(perTokenToMTok(p.output_price)),
				cacheWritePrice: pt(perTokenToMTok(p.cache_write_price)), cacheReadPrice: pt(perTokenToMTok(p.cache_read_price)),
				imageOutputPrice: pt(perTokenToMTok(p.image_output_price)), perRequestPrice: pt(p.per_request_price),
				intervals: (p.intervals ?? []).map(iv => ({
					minTokens: String(iv.min_tokens ?? 0), maxTokens: iv.max_tokens == null ? '' : String(iv.max_tokens),
					tierLabel: iv.tier_label ?? '', inputPrice: pt(perTokenToMTok(iv.input_price)), outputPrice: pt(perTokenToMTok(iv.output_price)),
					cacheWritePrice: pt(perTokenToMTok(iv.cache_write_price)), cacheReadPrice: pt(perTokenToMTok(iv.cache_read_price)), perRequestPrice: pt(iv.per_request_price)
				}))
			}));
		} else {
			name = ''; desc = ''; status = 'active'; source = 'channel_mapped'; restrict = false; applyStats = false; groupIds = ''; mappingJson = '{}'; pricing = [];
		}
		error = null;
	});

	function parseIds(v: string): number[] { return v.trim().split(/[,\s]+/).filter(Boolean).map(s => { const n = Number(s); if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid group ID: ' + s); return n; }); }
	function parseModels(v: string): string[] { return v.split(/[,\n]+/).map(s => s.trim()).filter(Boolean); }
	function parsePrice(v: string | number | null | undefined, label: string): number | null { if (v == null) return null; const t = String(v).trim(); if (!t) return null; const n = Number(t); if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be ≥ 0`); return n; }
	function parseMapping(v: string): Record<string, Record<string, string>> { const t = v.trim(); if (!t || t === '{}') return {}; const p = JSON.parse(t); if (!p || typeof p !== 'object') throw new Error('Model mapping must be a JSON object'); return p; }

	function buildEntry(e: PeForm, i: number): ChannelModelPricing {
		const label = `Row ${i + 1}`;
		return {
			platform: e.platform.trim() || 'openai', models: parseModels(e.modelsText), billing_mode: e.billingMode || 'token',
			input_price: mTokToPerToken(parsePrice(e.inputPrice, `${label} input`)), output_price: mTokToPerToken(parsePrice(e.outputPrice, `${label} output`)),
			cache_write_price: mTokToPerToken(parsePrice(e.cacheWritePrice, `${label} cache write`)), cache_read_price: mTokToPerToken(parsePrice(e.cacheReadPrice, `${label} cache read`)),
			image_output_price: mTokToPerToken(parsePrice(e.imageOutputPrice, `${label} image`)), per_request_price: parsePrice(e.perRequestPrice, `${label} per request`),
			intervals: e.intervals.map((iv, j) => ({
				min_tokens: Number(iv.minTokens) || 0, max_tokens: String(iv.maxTokens ?? '').trim() ? Number(iv.maxTokens) : null, tier_label: String(iv.tierLabel ?? '').trim() || '', sort_order: j,
				input_price: mTokToPerToken(parsePrice(iv.inputPrice, `${label} iv${j + 1} input`)), output_price: mTokToPerToken(parsePrice(iv.outputPrice, `${label} iv${j + 1} output`)),
				cache_write_price: mTokToPerToken(parsePrice(iv.cacheWritePrice, `${label} iv${j + 1} cw`)), cache_read_price: mTokToPerToken(parsePrice(iv.cacheReadPrice, `${label} iv${j + 1} cr`)),
				per_request_price: parsePrice(iv.perRequestPrice, `${label} iv${j + 1} pr`) as number | null
			}))
		};
	}

	async function save() {
		saving = true; error = null;
		try {
			if (!name.trim()) throw new Error('Name required');
			const payload: SaveChannelPayload = {
				name: name.trim(), description: desc.trim(), status, billing_model_source: source,
				restrict_models: restrict, apply_pricing_to_account_stats: applyStats,
				group_ids: parseIds(groupIds), model_pricing: pricing.map(buildEntry), model_mapping: parseMapping(mappingJson)
			};
			if (channel) await updateChannel(channel.id, payload); else await createChannel(payload);
			showSuccess(channel ? 'Channel updated' : 'Channel created'); open = false; onSaved();
		} catch (err) { error = err instanceof Error ? err.message : String(err); showError(error); }
		finally { saving = false; }
	}
</script>

<StandardDialog bind:open title={channel ? $_('admin.channels.editTitle', { default: 'Edit channel' }) : $_('admin.channels.newTitle', { default: 'New channel' })} width="lg" data-testid="channel-dialog">
	<div class="mt-4 grid gap-4">
		{#if error}<Alert variant="destructive">{error}</Alert>{/if}
		<div class="grid gap-3 sm:grid-cols-2"><label class="grid gap-1 text-sm">Name<Input bind:value={name} data-testid="channel-form-name" /></label><label class="grid gap-1 text-sm">Description<Input bind:value={desc} data-testid="channel-form-description" /></label></div>
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="grid gap-1 text-sm">Status<NativeSelect bind:value={status} options={statusOpts} data-testid="channel-form-status" /></label>
			<label class="grid gap-1 text-sm">Billing source<NativeSelect bind:value={source} options={sourceOpts} data-testid="channel-form-billing-source" /></label>
			<label class="grid gap-1 text-sm">Group IDs<Input placeholder="1, 2" bind:value={groupIds} data-testid="channel-form-groups" /></label>
		</div>
		<div class="flex flex-wrap gap-4 text-sm">
			<label class="flex items-center gap-2"><Checkbox bind:checked={restrict} data-testid="channel-form-restrict-models" />Restrict models</label>
			<label class="flex items-center gap-2"><Checkbox bind:checked={applyStats} data-testid="channel-form-account-stats" />Apply pricing to account stats</label>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between"><h3 class="text-sm font-semibold">Model pricing ($/MTok)</h3><Button variant="outline" size="sm" onclick={() => { pricing = [...pricing, emptyPe()]; }} data-testid="channel-add-pricing"><Plus size={14} />Add row</Button></div>
			{#each pricing as entry, i}
				<Card class="space-y-2 p-3">
					<div class="flex items-start justify-between gap-2">
						<div class="grid flex-1 gap-2 sm:grid-cols-[120px_1fr_120px]">
							<Input placeholder="platform" bind:value={entry.platform} data-testid={`channel-pricing-platform-${i}`} />
							<Textarea rows={1} placeholder="model1, model2" bind:value={entry.modelsText} data-testid={`channel-pricing-models-${i}`} />
							<NativeSelect bind:value={entry.billingMode} options={billingModes.some(o => o.value === entry.billingMode) ? billingModes : [...billingModes, { value: entry.billingMode, label: entry.billingMode }]} data-testid={`channel-pricing-billing-${i}`} />
						</div>
						<Button variant="ghost" size="sm" class="text-destructive" onclick={() => { pricing = pricing.filter((_, j) => j !== i); }}><Trash2 size={14} /></Button>
					</div>
					<div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
						<label class="grid gap-0.5 text-xs">Input<Input type="number" step="any" bind:value={entry.inputPrice} data-testid={`channel-pricing-input-${i}`} /></label>
						<label class="grid gap-0.5 text-xs">Output<Input type="number" step="any" bind:value={entry.outputPrice} data-testid={`channel-pricing-output-${i}`} /></label>
						<label class="grid gap-0.5 text-xs">Cache write<Input type="number" step="any" bind:value={entry.cacheWritePrice} data-testid={`channel-pricing-cache-write-${i}`} /></label>
						<label class="grid gap-0.5 text-xs">Cache read<Input type="number" step="any" bind:value={entry.cacheReadPrice} data-testid={`channel-pricing-cache-read-${i}`} /></label>
						<label class="grid gap-0.5 text-xs">Image output<Input type="number" step="any" bind:value={entry.imageOutputPrice} data-testid={`channel-pricing-image-output-${i}`} /></label>
						<label class="grid gap-0.5 text-xs">Per request<Input type="number" step="any" bind:value={entry.perRequestPrice} data-testid={`channel-pricing-request-${i}`} /></label>
					</div>
					<div class="space-y-1">
						<Button variant="outline" size="sm" onclick={() => { entry.intervals = [...entry.intervals, emptyIv()]; pricing = pricing; }} data-testid={`channel-pricing-add-interval-${i}`}>+ Interval</Button>
						{#each entry.intervals as iv, j}
							<div class="grid gap-2 rounded border border-border p-2 sm:grid-cols-4 lg:grid-cols-8">
								<label class="grid gap-0.5 text-xs">Max tokens<Input type="number" bind:value={iv.maxTokens} data-testid={`channel-pricing-interval-max-${i}-${j}`} /></label>
								<label class="grid gap-0.5 text-xs">Label<Input bind:value={iv.tierLabel} data-testid={`channel-pricing-interval-label-${i}-${j}`} /></label>
								<label class="grid gap-0.5 text-xs">Input<Input type="number" step="any" bind:value={iv.inputPrice} data-testid={`channel-pricing-interval-input-${i}-${j}`} /></label>
								<label class="grid gap-0.5 text-xs">Output<Input type="number" step="any" bind:value={iv.outputPrice} data-testid={`channel-pricing-interval-output-${i}-${j}`} /></label>
								<label class="grid gap-0.5 text-xs">CW<Input type="number" step="any" bind:value={iv.cacheWritePrice} data-testid={`channel-pricing-interval-cache-write-${i}-${j}`} /></label>
								<label class="grid gap-0.5 text-xs">CR<Input type="number" step="any" bind:value={iv.cacheReadPrice} data-testid={`channel-pricing-interval-cache-read-${i}-${j}`} /></label>
								<label class="grid gap-0.5 text-xs">PR<Input type="number" step="any" bind:value={iv.perRequestPrice} data-testid={`channel-pricing-interval-request-${i}-${j}`} /></label>
								<div class="flex items-end"><Button variant="ghost" size="sm" class="text-destructive" onclick={() => { entry.intervals = entry.intervals.filter((_, k) => k !== j); pricing = pricing; }}><Trash2 size={12} /></Button></div>
							</div>
						{/each}
					</div>
				</Card>
			{/each}
		</div>

		<label class="grid gap-1 text-sm">Model mapping JSON<Textarea rows={4} bind:value={mappingJson} data-testid="channel-form-mapping" /></label>
	</div>
	<div class="mt-5 flex justify-end gap-2">
		<Button variant="outline" onclick={() => { open = false; onClose(); }}>Cancel</Button>
		<Button disabled={saving || !name.trim()} onclick={save}>{saving ? 'Saving...' : 'Save'}</Button>
	</div>
</StandardDialog>
