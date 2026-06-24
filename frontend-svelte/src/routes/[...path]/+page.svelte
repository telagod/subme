<script lang="ts">
	import { goto } from '$app/navigation';
	import { AlertTriangle, ArrowLeft, Home } from '@lucide/svelte';
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) {
			history.back();
			return;
		}
		void goto('/dashboard');
	}

	function goDashboard() {
		void goto('/dashboard');
	}
</script>

<svelte:head>
	<title>{$_('errors.pageNotFound', { default: '页面未找到' })} · sub2api</title>
</svelte:head>

<section
	class="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground"
	data-testid="not-found-page"
>
	<div class="relative z-10 w-full max-w-md text-center">
		<div class="mb-8">
			<div class="relative inline-block">
				<span class="text-[9rem] font-bold leading-none text-muted-foreground/15 sm:text-[12rem]">
					404
				</span>
				<div class="absolute inset-0 flex items-center justify-center">
					<div
						class="flex h-24 w-24 items-center justify-center rounded-lg border border-border bg-secondary"
					>
						<AlertTriangle class="h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
					</div>
				</div>
			</div>
		</div>

		<div class="mb-8">
			<h1 class="mb-3 text-2xl font-bold text-foreground">
				{$_('errors.pageNotFound', { default: '页面未找到' })}
			</h1>
			<p class="text-muted-foreground">
				{$_('errors.pageNotFoundDescription', {
					default: "The page you are looking for doesn't exist or has been moved."
				})}
			</p>
		</div>

		<div class="flex flex-col justify-center gap-3 sm:flex-row">
			<Button
				variant="outline"
				onclick={goBack}
				data-testid="not-found-back"
			>
				<ArrowLeft class="h-4 w-4" />
				{$_('common.back', { default: '返回' })}
			</Button>
			<Button
				onclick={goDashboard}
				data-testid="not-found-dashboard"
			>
				<Home class="h-4 w-4" />
				{$_('common.dashboard', { default: '控制面板' })}
			</Button>
		</div>
	</div>
</section>
