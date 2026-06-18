<script lang="ts">
	/**
	 * 顶层布局：全局 CSS + CommandPalette 全局挂载点。
	 *
	 * CommandPalette 在此挂载一次：⌘K / Ctrl+K 在任意路由都可用，无需各 layout 自行接线。
	 */
	import '../app.css';
	import '$lib/i18n';
	import CommandPalette from '$lib/shell/CommandPalette.svelte';

	let { children } = $props();
</script>

{@render children()}

<CommandPalette />
