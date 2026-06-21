<script lang="ts">
	/**
	 * /auth/verify-email-sent · 注册后的等待面板
	 *
	 * 设计：
	 *   - 从 ?email= 取 email 显示；缺失时 fallback 提示。
	 *   - Resend 按钮 → POST /auth/send-verify-code。
	 *   - 静态页，不强制 superforms（仅一个 button）。
	 */
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import { authApi } from '$lib/api/auth';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	const email = $derived(page.url.searchParams.get('email') ?? '');

	let resending = $state(false);

	async function resend(): Promise<void> {
		if (!email) {
			showError(
				$_('auth.verifyEmail.errors.NEED_EMAIL', {
					default: 'Email missing — please register again to receive a new verification link.'
				})
			);
			return;
		}
		resending = true;
		try {
			await authApi.resendVerificationEmail(email);
			showSuccess($_('auth.verifyEmail.resendSuccess', { default: 'Verification email sent.' }));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			showError(
				$_('auth.verifyEmail.errors.RESEND_FAILED', {
					default: 'Failed to resend verification email.'
				}) + ` ${msg}`
			);
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head>
	<title>{$_('auth.verifyEmailSent.title', { default: 'Verify your email' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.verifyEmailSent.title', { default: 'Verify your email' })}
	subtitle={$_('auth.verifyEmailSent.subtitle', {
		default: 'We sent a verification link to your email.'
	})}
>
	<div class="space-y-3 text-center" data-testid="verify-email-sent">
		<div class="mx-auto h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-600">
			<span class="block pt-1 text-base">✓</span>
		</div>
		<p class="text-sm text-foreground">
			{#if email}
				{$_('auth.verifyEmailSent.body', {
					default: "We've sent a verification link to {email}.",
					values: { email }
				})}
			{:else}
				{$_('auth.verifyEmailSent.bodyNoEmail', {
					default: "We've sent a verification link to your email."
				})}
			{/if}
		</p>
		<p class="text-xs text-muted-foreground">
			{$_('auth.verifyEmailSent.checkSpam', {
				default: 'Please check your inbox and spam folder.'
			})}
		</p>

		<Button
			type="button"
			variant="outline"
			disabled={resending}
			onclick={resend}
			data-testid="resend-button"
			class="w-full"
		>
			{resending
				? $_('auth.verifyEmail.resending', { default: 'Sending...' })
				: $_('auth.verifyEmailSent.resend', { default: 'Resend verification email' })}
		</Button>
	</div>

	{#snippet footer()}
		<a class="text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: 'Back to sign in' })}
		</a>
	{/snippet}
</AuthLayout>
