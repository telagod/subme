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
				default: '邮箱缺失 — 请重新注册以获取新的验证链接。'
			});
			showError(resendError);
			return;
		}
		resending = true;
		resendError = '';
		try {
			await authApi.resendVerificationEmail(emailHint);
			showSuccess($_('auth.verifyEmail.resendSuccess', { default: '验证邮件已发送。' }));
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			resendError = $_('auth.verifyEmail.errors.RESEND_FAILED', {
				default: '重新发送验证邮件失败。'
			});
			showError(`${resendError} ${msg}`.trim());
		} finally {
			resending = false;
		}
	}
</script>

<svelte:head>
	<title>{$_('auth.verifyEmail.title', { default: '验证邮箱' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.verifyEmail.title', { default: '验证邮箱' })}
	subtitle={$_('auth.verifyEmail.subtitle', { default: '正在确认您的邮箱地址...' })}
>
	{#if phase === 'pending'}
		<div class="space-y-2 text-center text-sm text-muted-foreground" data-testid="verify-pending">
			<p>{$_('auth.verifyEmail.pending', { default: '正在验证您的邮箱...' })}</p>
		</div>
	{:else if phase === 'verified'}
		<div class="space-y-3 text-center" data-testid="verify-success">
			<div class="mx-auto h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-600">
				<span class="block pt-1 text-base">✓</span>
			</div>
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.successTitle', { default: '邮箱已验证' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.successHint', {
					default: '您的邮箱已验证，现在可以登录。'
				})}
			</p>
			<a
				href="/auth/login"
				class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				data-testid="verify-success-signin"
			>
				{$_('auth.verifyEmail.signIn', { default: '登录' })}
			</a>
		</div>
	{:else if phase === 'already_verified'}
		<div class="space-y-3 text-center" data-testid="verify-already">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.alreadyTitle', { default: '已验证' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.alreadyHint', {
					default: '该邮箱已验证，请直接登录。'
				})}
			</p>
			<a
				href="/auth/login"
				class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				data-testid="verify-already-signin"
			>
				{$_('auth.verifyEmail.signIn', { default: '登录' })}
			</a>
		</div>
	{:else if phase === 'expired'}
		<div class="space-y-3 text-center" data-testid="verify-expired">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.expiredTitle', { default: '链接已过期' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.expiredHint', {
					default: '此验证链接已过期，您可以请求新的。'
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
					? $_('auth.verifyEmail.resending', { default: '发送中...' })
					: $_('auth.verifyEmail.resend', { default: '重新发送验证' })}
			</Button>
		</div>
	{:else}
		<div class="space-y-3 text-center" data-testid="verify-invalid">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.verifyEmail.invalidTitle', { default: '链接无效' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.verifyEmail.invalidHint', {
					default: '此验证链接无效，请重新注册或联系客服。'
				})}
			</p>
			<a
				href="/auth/register"
				class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				data-testid="verify-invalid-register"
			>
				{$_('auth.verifyEmail.registerAgain', { default: '返回注册' })}
			</a>
		</div>
	{/if}

	{#snippet footer()}
		<a class="text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: '返回登录' })}
		</a>
	{/snippet}
</AuthLayout>
