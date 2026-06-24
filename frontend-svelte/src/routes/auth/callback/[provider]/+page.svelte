<script lang="ts">
	/**
	 * /auth/callback/[provider] · M8 unified OAuth callback
	 *
	 * 设计契约（来自 analyze）：
	 *   - Vue tree 7 个独立 view 折叠成单路由 + dispatch table；provider 从 $page.params 取。
	 *   - URL 携带的字段：
	 *       ?code & ?state            正常回调主路径
	 *       ?oauth_error / ?error     provider 端拒绝（access_denied 等）
	 *       ?mode (wechat 才用)       open / mp
	 *   - 三态分支：
	 *       auth (intent=login) → setSession + goto(?next || /dashboard)
	 *       auth (intent=bind)  → showSuccess(providerConnected) + goto /profile?tab=connections
	 *       totp                → 切到 inline 6-digit TOTP 表单（POST /auth/2fa/login）
	 *       emailCompletion     → goto /auth/callback/dingtalk/email-completion（仅钉钉）
	 *   - 错误层：
	 *       URL ?oauth_error → toast + goto /auth/login
	 *       未知 provider     → toast + goto /auth/login
	 *       API 抛 Error     → toast + goto /auth/login
	 *
	 * SSR：全局 +layout.ts 已 ssr=false，本路由继承。
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import {
		dispatchCallback,
		classifyOAuthErrorParam,
		PROVIDER_CONFIG,
		UnknownProviderError,
		type CallbackResult
	} from '$lib/features/auth/callbacks';
	import { apiClient } from '$lib/api/client';
	import { isTotpChallenge, type AuthResponse } from '$lib/api/auth';

	type Phase = 'processing' | 'totp' | 'completed';

	let phase = $state<Phase>('processing');
	let formError = $state<string>('');
	let totpCode = $state<string>('');
	let totpSubmitting = $state(false);
	let tempToken = $state<string>('');

	const provider = $derived(page.params.provider ?? '');
	const cfg = $derived(PROVIDER_CONFIG[provider]);
	const displayName = $derived(
		cfg?.displayName ??
			$_(`auth.callback.providerNames.${provider}`, { default: provider || 'OAuth' })
	);

	function redirectToLoginWith(messageKey: string, fallback: string): void {
		const msg = $_(messageKey, { default: fallback });
		showError(msg);
		// 用 setTimeout 让 toast 先 push 进 queue 再跳，避免 unmount 吞掉。
		setTimeout(() => {
			void goto('/auth/login', { replaceState: true });
		}, 0);
	}

	/**
	 * auth-shape 收尾：
	 *   - login intent → setSession + goto next。
	 *   - bind intent  → 不动 session，跳 profile.connections。
	 */
	async function finalizeAuth(result: Extract<CallbackResult, { kind: 'auth' }>): Promise<void> {
		const { intent, response } = result;
		if (intent === 'bind') {
			showSuccess(
				$_('auth.callback.providerConnected', {
					values: { provider: displayName },
					default: `${displayName} connected.`
				})
			);
			phase = 'completed';
			await goto('/profile?tab=connections', { replaceState: true });
			return;
		}
		// login 分支：response 应携带 access_token + user
		if (!response?.access_token || !response?.user) {
			redirectToLoginWith('auth.callback.errors.MALFORMED', 'Sign-in response was malformed.');
			return;
		}
		auth.setSession(response.access_token, response.user);
		const next = page.url.searchParams.get('next') || '/dashboard';
		phase = 'completed';
		await goto(next, { replaceState: true });
	}

	/**
	 * 钉钉中间态：把 partial_auth_token 经 sessionStorage 接力到 email-completion 页面。
	 * 用 sessionStorage 而非 URL —— 避免 token 进浏览器历史。
	 */
	function persistEmailCompletionContext(
		partialAuthToken: string,
		providerEmailHint: string | undefined
	): void {
		if (typeof window === 'undefined') return;
		try {
			window.sessionStorage.setItem(
				'auth.dingtalk.emailCompletion',
				JSON.stringify({
					partial_auth_token: partialAuthToken,
					provider_email_hint: providerEmailHint ?? '',
					at: Date.now()
				})
			);
		} catch {
			// quota / storage 关闭：用户后续页面读不到也只是 fallback 重新走登录。
		}
	}

	async function handleResult(result: CallbackResult): Promise<void> {
		if (result.kind === 'auth') {
			await finalizeAuth(result);
			return;
		}
		if (result.kind === 'totp') {
			tempToken = result.response.temp_token;
			phase = 'totp';
			return;
		}
		// emailCompletion: 仅钉钉走这条路
		if (provider !== 'dingtalk') {
			redirectToLoginWith(
				'auth.callback.errors.UNSUPPORTED_EMAIL_COMPLETION',
				'Email completion is not supported for this provider.'
			);
			return;
		}
		persistEmailCompletionContext(
			result.response.partial_auth_token,
			result.response.provider_email_hint
		);
		phase = 'completed';
		await goto('/auth/callback/dingtalk/email-completion', { replaceState: true });
	}

	async function runCallback(): Promise<void> {
		const url = page.url;
		const oauthError = url.searchParams.get('oauth_error') ?? url.searchParams.get('error');
		if (oauthError) {
			const key = classifyOAuthErrorParam(oauthError);
			redirectToLoginWith(key, 'OAuth sign-in failed.');
			return;
		}
		if (!PROVIDER_CONFIG[provider]) {
			redirectToLoginWith(
				'auth.callback.errors.UNKNOWN_PROVIDER',
				'Unknown OAuth provider.'
			);
			return;
		}
		const code = url.searchParams.get('code') ?? '';
		const state = url.searchParams.get('state') ?? '';
		const modeParam = url.searchParams.get('mode');
		const mode = modeParam === 'mp' || modeParam === 'open' ? modeParam : undefined;
		if (!code || !state) {
			redirectToLoginWith(
				'auth.callback.errors.MISSING_PARAMS',
				'Missing code or state parameter.'
			);
			return;
		}
		try {
			const result = await dispatchCallback(provider, { code, state, mode });
			await handleResult(result);
		} catch (err) {
			if (err instanceof UnknownProviderError) {
				redirectToLoginWith(
					'auth.callback.errors.UNKNOWN_PROVIDER',
					'Unknown OAuth provider.'
				);
				return;
			}
			const msg = (err as Error)?.message ?? '';
			formError = $_('auth.callback.errors.PROVIDER_ERROR', {
				values: { provider: displayName },
				default: `${displayName} sign-in failed.`
			});
			showError(`${formError} ${msg}`.trim());
			setTimeout(() => {
				void goto('/auth/login', { replaceState: true });
			}, 0);
		}
	}

	async function submitTotp(): Promise<void> {
		if (!/^\d{6}$/.test(totpCode)) {
			formError = $_('auth.callback.errors.TOTP_FORMAT', {
				default: 'Enter a 6-digit code.'
			});
			return;
		}
		if (!tempToken) {
			redirectToLoginWith(
				'auth.callback.errors.TOTP_SESSION_LOST',
				'2FA session expired.'
			);
			return;
		}
		totpSubmitting = true;
		formError = '';
		try {
			const resp = await apiClient.post<AuthResponse>('/api/v1/auth/2fa/login', {
				temp_token: tempToken,
				totp: totpCode
			});
			// 后端在 2FA 失败时也可能复返 challenge —— 防御性处理。
			if (isTotpChallenge(resp as unknown as Parameters<typeof isTotpChallenge>[0])) {
				formError = $_('auth.callback.errors.TOTP_INVALID', {
					default: 'Invalid two-factor code.'
				});
				return;
			}
			if (!resp?.access_token || !resp?.user) {
				redirectToLoginWith(
					'auth.callback.errors.MALFORMED',
					'Sign-in response was malformed.'
				);
				return;
			}
			auth.setSession(resp.access_token, resp.user);
			const next = page.url.searchParams.get('next') || '/dashboard';
			phase = 'completed';
			await goto(next, { replaceState: true });
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			formError = $_('auth.callback.errors.TOTP_INVALID', {
				default: 'Invalid two-factor code.'
			});
			if (msg) formError = `${formError} ${msg}`.trim();
		} finally {
			totpSubmitting = false;
		}
	}

	onMount(() => {
		void runCallback();
	});
</script>

<svelte:head>
	<title>{$_('auth.callback.title', {
		values: { provider: displayName },
		default: `Signing you in with ${displayName}`
	})} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.callback.title', {
		values: { provider: displayName },
		default: `Signing you in with ${displayName}`
	})}
	subtitle={phase === 'totp'
		? $_('auth.callback.totpSubtitle', { default: 'Enter your 6-digit verification code.' })
		: $_('auth.callback.subtitle', { default: 'Completing sign-in...' })}
>
	{#if phase === 'processing'}
		<div
			class="space-y-3 text-center"
			data-testid="callback-processing"
			data-provider={provider}
		>
			<div
				class="mx-auto h-8 w-8 animate-pulse rounded-full"
				style:background-color={cfg?.brandColor ?? 'transparent'}
				aria-hidden="true"
			></div>
			<p class="text-sm text-muted-foreground">
				{$_('auth.callback.processing', {
					values: { provider: displayName },
					default: `Completing ${displayName} sign-in, please wait...`
				})}
			</p>
		</div>
	{:else if phase === 'totp'}
		<form
			class="space-y-4"
			data-testid="callback-totp-form"
			onsubmit={(e) => {
				e.preventDefault();
				void submitTotp();
			}}
		>
			<div class="space-y-1.5">
				<label for="callback-totp" class="text-sm font-medium text-foreground">
					{$_('auth.callback.totpLabel', { default: 'Two-factor code' })}
				</label>
				<Input
					id="callback-totp"
					name="totp"
					type="text"
					inputmode="numeric"
					maxlength={6}
					autocomplete="one-time-code"
					placeholder={$_('auth.callback.totpPlaceholder', { default: '6-digit code' })}
					bind:value={totpCode}
					data-testid="callback-totp-input"
					class="tracking-widest"
				/>
			</div>
			{#if formError}
				<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="callback-error">
					{formError}
				</Alert>
			{/if}
			<Button
				type="submit"
				disabled={totpSubmitting}
				data-testid="callback-totp-submit"
				class="w-full"
			>
				{totpSubmitting
					? $_('auth.callback.totpSubmitting', { default: 'Verifying...' })
					: $_('auth.callback.totpSubmit', { default: 'Verify and continue' })}
			</Button>
		</form>
	{:else}
		<div class="space-y-3 text-center" data-testid="callback-completed">
			<p class="text-sm text-muted-foreground">
				{$_('auth.callback.completed', { default: 'Redirecting...' })}
			</p>
		</div>
	{/if}

	{#snippet footer()}
		<a class="text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: 'Back to login' })}
		</a>
	{/snippet}
</AuthLayout>
