<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Copy } from '@lucide/svelte';
	import { showInfo } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	interface Props {
		code: string;
		oauthState: string;
		fullUrl: string;
	}

	let { code, oauthState, fullUrl }: Props = $props();

	async function copy(value: string): Promise<void> {
		if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(value);
		showInfo($_('common.copied', { default: '已复制。' }));
	}
</script>

<div class="space-y-4" data-testid="oauth-callback-manual">
	<div class="space-y-1.5">
		<label for="oauth-code" class="text-sm font-medium text-foreground">
			{$_('auth.oauth.code', { default: '代码' })}
		</label>
		<div class="flex min-w-0 gap-2">
			<Input
				id="oauth-code"
				value={code}
				readonly
				class="min-w-0 flex-1 font-mono text-xs"
			/>
			<Button
				type="button"
				variant="outline"
				size="icon"
				disabled={!code}
				aria-label={$_('common.copy', { default: '复制' })}
				onclick={() => void copy(code)}
				class="h-9 w-9 text-muted-foreground hover:text-foreground"
			>
				<Copy class="h-4 w-4" aria-hidden="true" />
			</Button>
		</div>
	</div>

	<div class="space-y-1.5">
		<label for="oauth-state" class="text-sm font-medium text-foreground">
			{$_('auth.oauth.state', { default: '状态' })}
		</label>
		<div class="flex min-w-0 gap-2">
			<Input
				id="oauth-state"
				value={oauthState}
				readonly
				class="min-w-0 flex-1 font-mono text-xs"
			/>
			<Button
				type="button"
				variant="outline"
				size="icon"
				disabled={!oauthState}
				aria-label={$_('common.copy', { default: '复制' })}
				onclick={() => void copy(oauthState)}
				class="h-9 w-9 text-muted-foreground hover:text-foreground"
			>
				<Copy class="h-4 w-4" aria-hidden="true" />
			</Button>
		</div>
	</div>

	<div class="space-y-1.5">
		<label for="oauth-full-url" class="text-sm font-medium text-foreground">
			{$_('auth.oauth.fullUrl', { default: '完整 URL' })}
		</label>
		<div class="flex min-w-0 gap-2">
			<Input
				id="oauth-full-url"
				value={fullUrl}
				readonly
				class="min-w-0 flex-1 font-mono text-xs"
			/>
			<Button
				type="button"
				variant="outline"
				size="icon"
				disabled={!fullUrl}
				aria-label={$_('common.copy', { default: '复制' })}
				onclick={() => void copy(fullUrl)}
				class="h-9 w-9 text-muted-foreground hover:text-foreground"
			>
				<Copy class="h-4 w-4" aria-hidden="true" />
			</Button>
		</div>
	</div>
</div>
