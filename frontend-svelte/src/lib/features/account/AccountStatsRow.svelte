<script lang="ts">
	import Badge from '$lib/ui/Badge.svelte';

	type WindowStats = {
		requests?: number;
		tokens?: number;
		cost?: number;
		utilization?: number;
		resets_at?: string | null;
	};
	type Props = {
		label: string;
		stats: WindowStats | null;
		color?: 'indigo' | 'emerald' | 'purple' | 'amber';
	};
	let { label, stats, color = 'indigo' }: Props = $props();

	const util = $derived(stats?.utilization ?? 0);
	const barWidth = $derived(`${Math.min(100, Math.max(0, util))}%`);

	const labelClass = $derived({
		indigo: 'bg-indigo-500/10 text-indigo-600',
		emerald: 'bg-emerald-500/10 text-emerald-600',
		purple: 'bg-purple-500/10 text-purple-600',
		amber: 'bg-amber-500/10 text-amber-600'
	}[color]);

	const barClass = $derived(util >= 100 ? 'bg-red-500' : {
		indigo: 'bg-indigo-500', emerald: 'bg-emerald-500',
		purple: 'bg-purple-500', amber: 'bg-amber-500'
	}[color]);

	const percentClass = $derived(
		util >= 100 ? 'text-red-400' :
		util >= 80 ? 'text-amber-400' :
		util >= 50 ? 'text-foreground' : 'text-muted-foreground'
	);

	function compact(n: number | undefined): string {
		if (n == null || n === 0) return '0';
		if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
		if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
		if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
		return String(Math.round(n));
	}

	function resetTime(v: string | null | undefined): string {
		if (!v) return '';
		const diff = new Date(v).getTime() - Date.now();
		if (diff <= 0) return util > 0 ? 'pending' : 'now';
		const h = Math.floor(diff / 3600000);
		const m = Math.floor((diff % 3600000) / 60000);
		if (h >= 24) return `${Math.floor(h / 24)}d${h % 24}h`;
		if (h > 0) return `${h}h${m}m`;
		return `${m}m`;
	}
</script>

{#if stats}
	<div class="flex items-center gap-1 flex-wrap" data-testid="account-stats-row">
		<span class="w-6 shrink-0 rounded px-0.5 text-center text-[9px] font-semibold leading-tight {labelClass}">{label}</span>
		<div class="w-10 shrink-0 h-1.5 rounded-full bg-muted/60 overflow-hidden">
			<div class="h-full rounded-full transition-all {barClass}" style="width:{barWidth}"></div>
		</div>
		<span class="text-[11px] font-mono font-semibold tabular-nums leading-tight {percentClass}">
			{Math.round(util) > 999 ? '>999%' : `${Math.round(util)}%`}
		</span>
		{#if stats.resets_at}<span class="text-[10px] text-muted-foreground/70 tabular-nums">{resetTime(stats.resets_at)}</span>{/if}
		{#if (stats.requests ?? 0) > 0 || (stats.tokens ?? 0) > 0}
			<span class="text-[9px] text-muted-foreground/50 tabular-nums">
				{compact(stats.requests)}r·{compact(stats.tokens)}·${(stats.cost ?? 0).toFixed(2)}
			</span>
		{/if}
	</div>
{:else}
	<span class="text-xs text-muted-foreground">-</span>
{/if}
