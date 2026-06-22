<script lang="ts">
	/**
	 * /auth/callback · generic OAuth fallback
	 *
	 * Covers the Vue generic callback behaviors that do not belong to
	 * /auth/callback/[provider]:
	 *   - legacy fragment token finalization
	 *   - /auth/oauth/callback pending GitHub/Google email OAuth resume
	 *   - manual code/state/full URL display for CLI-style OAuth handoff
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { Copy } from '@lucide/svelte';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import { authApi, type EmailOAuthProvider, type OAuthTokenResponse } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showInfo, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import {
		buildProviderCallbackUrl,
		clearAllAffiliateReferralCodes,
		clearPendingEmailOAuthProvider,
		hasOAuthTokenResponse,
		loadOAuthAffiliateCode,
		oauthAffiliatePayload,
		parseFragmentParams,
		readPendingEmailOAuthProvider,
		readTokenResponse,
		sanitizeRedirectPath
	} from '$lib/features/auth/email-oauth';

	type Phase = 'idle' | 'processing' | 'registration' | 'invalid' | 'completed';

	let phase = $state<Phase>('idle');
	let registrationEmail = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let invitationCode = $state('');
	let registrationError = $state('');
	let invitationRequired = $state(false);
	let pendingProvider = $state<EmailOAuthProvider>('github');
	let redirectTo = $state('/dashboard');
	let submitting = $state(false);
	let fullUrl = $state('');

	const code = $derived(page.url.searchParams.get('code') ?? '');
	const oauthState = $derived(page.url.searchParams.get('state') ?? '');
	const providerName = $derived(pendingProvider === 'google' ? 'Google' : 'GitHub');
	const canSubmitRegistration = $derived(
		registrationEmail.trim() !== '' &&
			password.length >= 6 &&
			password === confirmPassword &&
			(!invitationRequired || invitationCode.trim() !== '')
	);
	const isOAuthAlias = $derived(page.url.pathname === '/auth/oauth/callback');

	function callbackErrorMessage(): string {
		return (
			page.url.searchParams.get('error_description') ||
			page.url.searchParams.get('error') ||
			''
		);
	}

	async function finalizeTokenResponse(
		tokenResponse: OAuthTokenResponse,
		redirect: string
	): Promise<void> {
		const token = tokenResponse.access_token?.trim();
		if (!token) {
			throw new Error($_('auth.callback.errors.MALFORMED', { default: '登录响应格式异常。' }));
		}

		if (tokenResponse.user) {
			auth.setSession(token, tokenResponse.user);
		} else {
			auth.setToken(token);
			await auth.refreshUser();
			if (!auth.user) {
				throw new Error($_('auth.callback.errors.MALFORMED', { default: '登录响应格式异常。' }));
			}
		}

		clearPendingEmailOAuthProvider();
		clearAllAffiliateReferralCodes();
		showSuccess($_('auth.loginSuccess', { default: '登录成功。' }));
		phase = 'completed';
		await goto(sanitizeRedirectPath(redirect), { replaceState: true });
	}

	function redirectProviderCallbackToBackend(provider: EmailOAuthProvider): void {
		if (typeof window === 'undefined') return;
		const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';
		window.location.href = buildProviderCallbackUrl(provider, page.url, apiBase);
	}

	async function resumePendingEmailOAuth(): Promise<void> {
		phase = 'processing';
		try {
			const completion = await authApi.exchangePendingOAuthCompletion();
			const completionRedirect = completion.redirect || '/dashboard';
			if (hasOAuthTokenResponse(completion)) {
				await finalizeTokenResponse(completion, completionRedirect);
				return;
			}

			const provider = String(completion.provider || '').toLowerCase();
			if (provider === 'github' || provider === 'google') {
				pendingProvider = provider;
			}
			redirectTo = sanitizeRedirectPath(completionRedirect);

			if (
				completion.error === 'invitation_required' ||
				completion.error === 'registration_completion_required'
			) {
				invitationRequired =
					completion.error === 'invitation_required' ||
					completion.invitation_required === true;
				registrationEmail = String(completion.resolved_email || completion.email || '').trim();
				phase = 'registration';
				return;
			}

			showError(
				completion.error ||
					$_('auth.loginFailed', { default: '登录失败，请重试。' })
			);
			phase = 'invalid';
		} catch (err) {
			const message =
				(err as Error)?.message ||
				$_('auth.loginFailed', { default: '登录失败，请重试。' });
			showError(message);
			phase = 'invalid';
		}
	}

	async function submitRegistration(): Promise<void> {
		registrationError = '';
		if (!registrationEmail.trim()) {
			registrationError = $_('auth.errors.EMAIL_REQUIRED', { default: '邮箱必填。' });
			return;
		}
		if (password.length < 6) {
			registrationError = $_('auth.errors.PASSWORD_TOO_SHORT', {
				default: '密码至少 6 个字符。'
			});
			return;
		}
		if (password !== confirmPassword) {
			registrationError = $_('auth.register.errors.PASSWORD_MISMATCH', {
				default: '密码不匹配。'
			});
			return;
		}
		const trimmedInvitation = invitationCode.trim();
		if (invitationRequired && !trimmedInvitation) {
			registrationError = $_('auth.invitationCodeRequired', {
				default: '邀请码必填。'
			});
			return;
		}

		submitting = true;
		try {
			const payload = {
				password,
				...oauthAffiliatePayload(loadOAuthAffiliateCode())
			};
			const completion = await authApi.completeEmailOAuthRegistration(pendingProvider, {
				...payload,
				...(invitationRequired ? { invitation_code: trimmedInvitation } : {})
			});
			await finalizeTokenResponse(completion, redirectTo);
		} catch (err) {
			registrationError =
				(err as Error)?.message ||
				$_('auth.callback.errors.PROVIDER_ERROR', {
					values: { provider: providerName },
					default: `${providerName} sign-in failed. Please try again.`
				});
		} finally {
			submitting = false;
		}
	}

	async function copy(value: string): Promise<void> {
		if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(value);
		showInfo($_('common.copied', { default: '已复制。' }));
	}

	onMount(async () => {
		fullUrl = typeof window !== 'undefined' ? window.location.href : '';

		const queryError = callbackErrorMessage();
		if (queryError) {
			showError(queryError);
		}

		const params = parseFragmentParams(typeof window !== 'undefined' ? window.location.hash : '');
		const fragmentError = params.get('error') || '';
		if (fragmentError) {
			showError(
				params.get('error_description') || params.get('error_message') || fragmentError
			);
			phase = 'invalid';
			return;
		}

		const tokenResponse = readTokenResponse(params);
		if (tokenResponse) {
			phase = 'processing';
			try {
				await finalizeTokenResponse(tokenResponse, params.get('redirect') || '/dashboard');
			} catch (err) {
				showError(
					(err as Error)?.message ||
						$_('auth.loginFailed', { default: '登录失败，请重试。' })
				);
				phase = 'invalid';
			}
			return;
		}

		const pendingEmailOAuthProvider = readPendingEmailOAuthProvider();
		if (isOAuthAlias && pendingEmailOAuthProvider && code && oauthState) {
			redirectProviderCallbackToBackend(pendingEmailOAuthProvider);
			return;
		}

		if (isOAuthAlias) {
			await resumePendingEmailOAuth();
			return;
		}

		phase = queryError ? 'invalid' : 'idle';
	});
</script>

<svelte:head>
	<title>{$_('auth.callback.title', { values: { provider: 'OAuth' }, default: 'OAuth 回调' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={phase === 'registration'
		? $_('auth.emailCompletion.title', { default: '完成登录' })
		: $_('auth.callback.title', {
				values: { provider: 'OAuth' },
				default: 'OAuth 回调'
			})}
	subtitle={phase === 'registration'
		? $_('auth.callback.processing', {
				values: { provider: providerName },
				default: `Completing ${providerName} sign-in, please wait...`
			})
		: $_('auth.callback.subtitle', { default: '完成登录中...' })}
>
	{#if phase === 'processing'}
		<div class="space-y-3 text-center" data-testid="oauth-callback-processing">
			<div
				class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
				aria-hidden="true"
			></div>
			<p class="text-sm text-muted-foreground">
				{$_('auth.callback.processing', {
					values: { provider: 'OAuth' },
					default: '完成登录中，请稍候...'
				})}
			</p>
		</div>
	{:else if phase === 'registration'}
		<form
			class="space-y-4"
			data-testid="oauth-registration-form"
			onsubmit={(e) => {
				e.preventDefault();
				void submitRegistration();
			}}
		>
			<div class="space-y-1.5">
				<label for="oauth-registration-email" class="text-sm font-medium text-foreground">
					{$_('auth.emailLabel', { default: '邮箱' })}
				</label>
				<Input
					id="oauth-registration-email"
					type="email"
					value={registrationEmail}
					readonly
					disabled
					data-testid="oauth-registration-email"
					class="bg-muted text-muted-foreground"
				/>
			</div>

			<div class="space-y-1.5">
				<label for="oauth-registration-password" class="text-sm font-medium text-foreground">
					{$_('auth.register.passwordLabel', { default: '密码' })}
				</label>
				<Input
					id="oauth-registration-password"
					type="password"
					autocomplete="new-password"
					bind:value={password}
					disabled={submitting}
					data-testid="oauth-registration-password"
				/>
			</div>

			<div class="space-y-1.5">
				<label for="oauth-registration-confirm" class="text-sm font-medium text-foreground">
					{$_('auth.register.confirmPasswordLabel', { default: '确认密码' })}
				</label>
				<Input
					id="oauth-registration-confirm"
					type="password"
					autocomplete="new-password"
					bind:value={confirmPassword}
					disabled={submitting}
					data-testid="oauth-registration-confirm"
				/>
			</div>

			{#if invitationRequired}
				<div class="space-y-1.5">
					<label for="oauth-registration-invitation" class="text-sm font-medium text-foreground">
						{$_('auth.invitationCodeLabel', { default: '邀请码' })}
					</label>
					<Input
						id="oauth-registration-invitation"
						type="text"
						bind:value={invitationCode}
						disabled={submitting}
						data-testid="oauth-registration-invitation"
					/>
				</div>
			{/if}

			{#if registrationError}
				<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="oauth-registration-error">
					{registrationError}
				</Alert>
			{/if}

			<Button
				type="submit"
				disabled={submitting || !canSubmitRegistration}
				data-testid="oauth-registration-submit"
				class="w-full"
			>
				{submitting
					? $_('auth.callback.totpSubmitting', { default: '验证中...' })
					: $_('auth.emailCompletion.submit', { default: '完成登录' })}
			</Button>
		</form>
	{:else if phase === 'invalid'}
		<div class="space-y-4 text-center" data-testid="oauth-callback-invalid">
			<p class="text-sm text-muted-foreground">
				{$_('auth.callback.errors.UNKNOWN', {
					default: '登录失败，请重试。'
				})}
			</p>
			<Button href="/auth/login">
				{$_('auth.backToLogin', { default: '返回登录' })}
			</Button>
		</div>
	{:else if phase === 'completed'}
		<div class="space-y-3 text-center" data-testid="oauth-callback-completed">
			<p class="text-sm text-muted-foreground">
				{$_('auth.callback.completed', { default: '跳转中...' })}
			</p>
		</div>
	{:else}
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
	{/if}
</AuthLayout>
