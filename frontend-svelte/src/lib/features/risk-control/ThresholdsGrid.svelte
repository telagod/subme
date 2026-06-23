<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { RefreshCw } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import {
		RISK_THRESHOLD_DEFAULTS,
		RISK_THRESHOLD_CATEGORIES,
		formatThresholdPercent
	} from './risk-control';

	type Props = {
		thresholds: Record<string, number>;
	};

	let { thresholds = $bindable() }: Props = $props();

	function resetAll() {
		thresholds = { ...RISK_THRESHOLD_DEFAULTS };
	}

	function isModified(category: string): boolean {
		const defaultVal = RISK_THRESHOLD_DEFAULTS[category];
		const currentVal = thresholds[category] ?? defaultVal;
		return Math.abs(currentVal - defaultVal) > 0.05;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-3">
		<div>
			<h3 class="text-sm font-semibold text-foreground">Per-Category Thresholds</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				Set moderation sensitivity per category. Values are percentages (0-100%). Lower = more sensitive.
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={resetAll}>
			<RefreshCw size={14} />{$_('admin.risk.resetDefaults', { default: 'Reset defaults' })}
		</Button>
	</div>

	<div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
		{#each RISK_THRESHOLD_CATEGORIES as category}
			{@const defaultVal = RISK_THRESHOLD_DEFAULTS[category]}
			{@const currentVal = thresholds[category] ?? defaultVal}
			<div class="flex items-center gap-3 rounded-md border px-3 py-2 {isModified(category) ? 'border-primary' : ''}">
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<span class="truncate text-xs font-medium text-foreground">{category}</span>
						<Badge variant="outline" class="shrink-0 px-1.5 py-0 text-[10px] font-mono {isModified(category) ? 'border-primary text-primary' : ''}">
							{formatThresholdPercent(currentVal)}
						</Badge>
					</div>
					<span class="text-[10px] text-muted-foreground">default: {formatThresholdPercent(defaultVal)}</span>
				</div>
				<Input
					type="number"
					min={0}
					max={100}
					step={0.1}
					class="w-20 text-right font-mono text-xs"
					bind:value={thresholds[category]}
				/>
			</div>
		{/each}
	</div>
</div>
