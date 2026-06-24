<script lang="ts">
	/**
	 * AuthLayout · 共享空壳，承接 LoginView / Register / Forgot / Reset / VerifyEmail 等
	 *
	 * 设计：
	 *   - 中心栅格 + 360px max-width 卡片容器；与 M6 LoginView 视觉契约对齐。
	 *   - title / subtitle 通过 props 传入 i18n 已解析的字符串（不在此处翻译）。
	 *   - children snippet（Svelte 5 风格）放表单 / 信息卡；footer 可选 snippet 放
	 *     "Already have an account?" 一类的辅助链接。
	 *   - 不引入 toast / a11y 行为 —— 那些归 page 自治。
	 */
	import type { Snippet } from 'svelte';

	let {
		title = '',
		subtitle = '',
		children,
		footer
	}: {
		title?: string;
		subtitle?: string;
		children?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<div class="w-full max-w-[360px] space-y-6">
		<header class="space-y-2 text-center">
			<div class="mx-auto h-10 w-10 rounded-md bg-foreground/90"></div>
			{#if title}
				<h1 class="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
			{/if}
			{#if subtitle}
				<p class="text-sm text-muted-foreground">{subtitle}</p>
			{/if}
		</header>

		<div class="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
			{@render children?.()}
		</div>

		{#if footer}
			<div class="text-center text-xs text-muted-foreground">
				{@render footer()}
			</div>
		{/if}
	</div>
</main>
