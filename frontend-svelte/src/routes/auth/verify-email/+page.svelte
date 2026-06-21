<script lang="ts">
	/**
	 * /auth/verify-email · M7 邮箱验证落地页
	 *
	 * 设计：
	 *   - URL ?token=... → onMount 立即 POST /auth/verify-email；服务器返回 status：
	 *       verified         → success 卡片 + 'Sign in' 链接
	 *       already_verified → already 卡片 + 'Sign in' 链接
	 *       expired          → expired 卡片 + 'Resend verification' 按钮
	 *       invalid          → invalid 卡片 + 'Request new link' 链接
	 *   - 缺 token → 视为 invalid 卡片。
	 *   - resend 调 /auth/send-verify-code；需提供 email 才能发，否则提示需要先注册。
	 *   - 此页与 EmailVerifyView (Vue) 的 6-digit code 流程不同 —— 这里是 link/token mount-then-verify。
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import { authApi, type VerifyEmailResponse } from '$lib/api/auth';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';

	type Phase = 'pending' | 'verified' | 'already_verified' | 'expired' | 'invalid';

	let phase = $state<Phase>('pending');
	let resending = $state(false);
	let resendError = $state<string>('');

	const token = $derived(page.url.searchParams.get('token') ?? '');
	const emailHint = $derived(page.url.searchParams.get('email') ?? '');

	function classifyResponse(resp: VerifyEmailResponse | unknown): Phase {
		const r = resp as VerifyEmailResponse;
		if (!r || typeof r !== 'object') return 'verified';
		if (r.status === 'already_verified') return 'already_verified';
		if (r.status === 'expired') return 'expired';
		if (r.status === 'invalid') return 'invalid';
		// 默认 verified（包括 ok=true / status='verified' / 空 body）
		return 'verified';
	}

	function classifyError(err: unknown): Phase {
		if (!(err instanceof Error)) return 'invalid';
		const m = err.message.toLowerCase();
		if (m.includes('expired') || m.includes('410')) return 'expired';
		if (m.includes('already')) return 'already_verified';
		return 'invalid';
	}

	onMount(async () => {
		if (!token) {
			phase = 'invalid';
			return;
		}
		try {
			const resp = await authApi.verifyEmail(token);
			phase = classifyResponse(resp);
		} catch (err) {
			phase = classifyError(err);
		}
	});

	async function resend(): Promise<void> {
		if (!emailHint) {
			resendError = $_('auth.verifyEmail.errors.NEED_EMAIL', {
				default: 'Email missing — please register again to receive a new verification link.'
			});
			showError(resendError);
			return;
		}
		resending = true;
		resendError = '';
		try {
			await authApi.resendVerificationEmail(emailHint);
			showSuccess($_('auth.verifyEmail.resendSuccess', { default: 'Verification email sent.' }));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			resendError = $_('auth.verifyEmail.errors.RESEND_FAILED', {
				default: 'Failed to resend verification email.'
			});
			showError(`${resendError} ${msg}`.trim());
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head>
	<title>{$_('auth.verifyEmail.title', { default: 'Verify email' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.verifyEmail.title', { default: 'Verify email' })}
	subtitle={$_('auth.verifyEmail.subtitle', { default: 'Confirming your email address...' })}
>
	{#if phase === 'pending'}
		<div class="space-y-2 text-center text-sm text-muted-foreground" data-testid="verify-pending">
			<p>{$_('auth.verifyEmail.pending', { default: 'Verifying your email...' })}</p>
		</div>
	{:else if phase === 'verified'}
		<div class="space-y-3 text-center" data-testid="verify-success">
			<div class="mx-auto h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-600">
				<span class="block pt-1 text-base">✓</span>
			</div>
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.successTitle', { default: 'Email verified' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.successHint', {
					default: 'Your email has been verified. You can now sign in.'
				})}
			</p>
			<a
				href="/auth/login"
				class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				data-testid="verify-success-signin"
			>
				{$_('auth.verifyEmail.signIn', { default: 'Sign in' })}
			</a>
		</div>
	{:else if phase === 'already_verified'}
		<div class="space-y-3 text-center" data-testid="verify-already">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.alreadyTitle', { default: 'Already verified' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.alreadyHint', {
					default: 'This email is already verified — please sign in.'
				})}
			</p>
			<a
				href="/auth/login"
				class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				data-testid="verify-already-signin"
			>
				{$_('auth.verifyEmail.signIn', { default: 'Sign in' })}
			</a>
		</div>
	{:else if phase === 'expired'}
		<div class="space-y-3 text-center" data-testid="verify-expired">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.expiredTitle', { default: 'Link expired' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.expiredHint', {
					default: 'This verification link has expired. You can request a new one.'
				})}
			</p>
			{#if resendError}
				<Alert variant="destructive" class="px-3 py-2 text-xs">
					{resendError}
				</Alert>
			{/if}
			<Button
				type="button"
				disabled={resending}
				onclick={resend}
				data-testid="verify-resend"
				class="w-full"
			>
				{resending
					? $_('auth.verifyEmail.resending', { default: 'Sending...' })
					: $_('auth.verifyEmail.resend', { default: 'Resend verification' })}
			</Button>
		</div>
	{:else}
		<div class="space-y-3 text-center" data-testid="verify-invalid">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.invalidTitle', { default: 'Invalid link' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.invalidHint', {
					default: 'This verification link is invalid. Please register again or contact support.'
				})}
			</p>
			<a
				href="/auth/register"
				class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				data-testid="verify-invalid-register"
			>
				{$_('auth.verifyEmail.registerAgain', { default: 'Back to register' })}
			</a>
		</div>
	{/if}

	{#snippet footer()}
		<a class="text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: 'Back to sign in' })}
		</a>
	{/snippet}
</AuthLayout>
