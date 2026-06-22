<script lang="ts">
	import { _ } from 'svelte-i18n';
	import ChangePasswordForm from '$lib/features/profile/ChangePasswordForm.svelte';
	import TotpEnrollDialog from '$lib/features/profile/TotpEnrollDialog.svelte';
	import DisableTotpDialog from '$lib/features/profile/DisableTotpDialog.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';

	interface Props {
		totpEnabled: boolean;
	}

	let { totpEnabled }: Props = $props();

	let totpEnrollOpen = $state(false);
	let totpDisableOpen = $state(false);

	function handleTotpEnabled() {
		// User store refresh will update derived state
	}
	function handleTotpDisabled() {
		// User store refresh will update derived state
	}
</script>

<div class="space-y-6" data-testid="panel-security" role="tabpanel">
	<ChangePasswordForm />

	<section
		class="rounded-lg border border-border bg-card p-6 shadow-sm"
		data-testid="totp-card"
	>
		<header class="mb-5 flex items-start justify-between gap-3">
			<div class="space-y-1">
				<h2 class="text-base font-semibold text-foreground">
					{$_('user.security.totp.title', {
						default: '双因素认证 (2FA)'
					})}
				</h2>
				<p class="text-sm text-muted-foreground">
					{$_('user.security.totp.description', {
						default: '使用身份验证器应用增强账户安全。'
					})}
				</p>
			</div>
			<Badge
				variant="outline"
				class={`${
					totpEnabled
						? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
						: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
				}`}
				data-testid="totp-status"
			>
				{totpEnabled
					? $_('user.security.totp.enabled', { default: '已启用' })
					: $_('user.security.totp.notEnabled', { default: '未启用' })}
			</Badge>
		</header>

		<div class="flex items-center justify-end gap-2">
			{#if totpEnabled}
				<Button
					type="button"
					variant="outline"
					data-testid="totp-disable-btn"
					onclick={() => (totpDisableOpen = true)}
					class="text-destructive hover:bg-destructive/10"
				>
					{$_('user.security.totp.disable', { default: '禁用双因素认证' })}
				</Button>
			{:else}
				<Button
					type="button"
					data-testid="totp-enable-btn"
					onclick={() => (totpEnrollOpen = true)}
				>
					{$_('user.security.totp.enable', { default: '启用双因素认证' })}
				</Button>
			{/if}
		</div>
	</section>
</div>

<TotpEnrollDialog bind:open={totpEnrollOpen} onEnabled={handleTotpEnabled} />
<DisableTotpDialog bind:open={totpDisableOpen} onDisabled={handleTotpDisabled} />
