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
					default: '邮箱缺失 — 请重新注册以获取新的验证链接。'
				})
			);
			return;
		}
		resending = true;
		try {
			await authApi.resendVerificationEmail(email);
			showSuccess($_('auth.verifyEmail.resendSuccess', { default: '验证邮件已发送。' }));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			showError(
				$_('auth.verifyEmail.errors.RESEND_FAILED', {
					default: '重新发送验证邮件失败。'
				}) + ` ${msg}`
			);
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head>
	<title>{$_('auth.verifyEmailSent.title', { default: '验证您的邮箱' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.verifyEmailSent.title', { default: '验证您的邮箱' })}
	subtitle={$_('auth.verifyEmailSent.subtitle', {
		default: '我们已向您的邮箱发送了验证链接。'
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
				default: '请查收收件箱和垃圾邮件。'
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
				? $_('auth.verifyEmail.resending', { default: '发送中...' })
				: $_('auth.verifyEmailSent.resend', { default: '重新发送验证邮件' })}
		</Button>
	</div>

	{#snippet footer()}
		<a class="text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: '返回登录' })}
		</a>
	{/snippet}
</AuthLayout>
