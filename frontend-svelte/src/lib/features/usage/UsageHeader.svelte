<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Download, RotateCw } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';

	interface Props {
		exporting: boolean;
		onRefresh: () => void;
		onExport: () => void;
	}

	let { exporting, onRefresh, onExport }: Props = $props();
</script>

<header class="flex flex-wrap items-start justify-between gap-4">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight text-foreground">
			{$_('user.usage.pageTitle', { default: '用量' })}
		</h1>
		<p class="text-sm text-muted-foreground">
			{$_('user.usage.pageSubtitle', {
				default: '查看 API 用量、费用并下载 CSV 报告。'
			})}
		</p>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<Button
			type="button"
			variant="outline"
			size="icon"
			aria-label={$_('user.usage.refresh', { default: '刷新' })}
			data-testid="usage-refresh-btn"
			onclick={onRefresh}
			class="h-9 w-9 text-muted-foreground hover:text-foreground"
		>
			<RotateCw class="h-4 w-4" />
		</Button>
		<Button
			type="button"
			data-testid="usage-export-btn"
			onclick={onExport}
			disabled={exporting}
			class="h-9"
		>
			<Download class="h-4 w-4" />
			{exporting
				? $_('user.usage.exporting', { default: '导出中…' })
				: $_('user.usage.exportCsv', { default: '导出 CSV' })}
		</Button>
	</div>
</header>
