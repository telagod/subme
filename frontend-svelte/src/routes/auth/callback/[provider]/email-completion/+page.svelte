<script lang="ts">
	/**
	 * /auth/callback/[provider]/email-completion · 钉钉补邮箱二段流程
	 *
	 * 设计：
	 *   - 仅钉钉 (DingTalk) 路由生效 —— provider !== 'dingtalk' 直接踢回 /auth/login。
	 *     Vue tree 也是只有 DingTalkEmailCompletionView 走这一路。
	 *   - 上下文从 sessionStorage 取（来源：callback page 持久化的 partial_auth_token）。
	 *     缺失时认为是直接访问，回踢登录。
	 *   - 三步骤同页：填邮箱 → 发验证码 → 输验证码 + 提交完成。
	 *   - 完成后 setSession + goto /dashboard。
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import { authApi } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	type Stage = 'loading' | 'collect' | 'verify' | 'submitting' | 'done' | 'invalid';

	let stage = $state<Stage>('loading');
	let email = $state<string>('');
	let code = $state<string>('');
	let partialAuthToken = $state<string>('');
	let providerEmailHint = $state<string>('');
	let sendingCode = $state(false);
	let formError = $state<string>('');

	const provider = $derived(page.params.provider ?? '');

	function loadContext(): void {
		if (typeof window === 'undefined') {
			stage = 'invalid';
			return;
		}
		try {
			const raw = window.sessionStorage.getItem('auth.dingtalk.emailCompletion');
			if (!raw) {
				stage = 'invalid';
				return;
			}
			const ctx = JSON.parse(raw) as {
				partial_auth_token?: string;
				provider_email_hint?: string;
				at?: number;
			};
			if (!ctx?.partial_auth_token) {
				stage = 'invalid';
				return;
			}
			partialAuthToken = ctx.partial_auth_token;
			providerEmailHint = ctx.provider_email_hint ?? '';
			if (providerEmailHint) email = providerEmailHint;
			stage = 'collect';
		} catch {
			stage = 'invalid';
		}
	}

	function isValidEmail(v: string): boolean {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
	}

	async function sendCode(): Promise<void> {
		formError = '';
		if (!isValidEmail(email)) {
			formError = $_('auth.errors.EMAIL_INVALID', { default: '请输入有效的邮箱。' });
			return;
		}
		sendingCode = true;
		try {
			await authApi.sendDingtalkEmailCode(email, partialAuthToken);
			showSuccess(
				$_('auth.emailCompletion.codeSent', { default: '验证码已发送。' })
			);
			stage = 'verify';
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			formError = $_('auth.emailCompletion.errors.SEND_FAILED', {
				default: '发送验证码失败。'
			});
			showError(`${formError} ${msg}`.trim());
		} finally {
			sendingCode = false;
		}
	}

	async function submit(): Promise<void> {
		formError = '';
		if (!/^\d{6}$/.test(code)) {
			formError = $_('auth.emailCompletion.errors.CODE_FORMAT', {
				default: '输入 6 位验证码。'
			});
			return;
		}
		stage = 'submitting';
		try {
			const resp = await authApi.dingtalkEmailCompletion({
				email,
				code,
				partial_auth_token: partialAuthToken
			});
			if (!resp?.access_token || !resp?.user) {
				formError = $_('auth.emailCompletion.errors.MALFORMED', {
					default: '登录响应格式异常。'
				});
				stage = 'verify';
				return;
			}
			auth.setSession(resp.access_token, resp.user);
			// 清掉 partial token —— 一次性凭证用完即弃。
			if (typeof window !== 'undefined') {
				try {
					window.sessionStorage.removeItem('auth.dingtalk.emailCompletion');
				} catch {
					/* ignore */
				}
			}
			stage = 'done';
			await goto('/dashboard', { replaceState: true });
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			formError = $_('auth.emailCompletion.errors.SUBMIT_FAILED', {
				default: '完成登录失败。'
			});
			showError(`${formError} ${msg}`.trim());
			stage = 'verify';
		}
	}

	onMount(() => {
		if (provider !== 'dingtalk') {
			showError(
				$_('auth.callback.errors.UNSUPPORTED_EMAIL_COMPLETION', {
					default: '此提供商不支持邮箱补全。'
				})
			);
			setTimeout(() => {
				void goto('/auth/login', { replaceState: true });
			}, 0);
			return;
		}
		loadContext();
	});
</script>

<svelte:head>
	<title>{$_('auth.emailCompletion.title', { default: '完成登录' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.emailCompletion.title', { default: '完成登录' })}
	subtitle={$_('auth.emailCompletion.subtitle', {
		default: '确认您的邮箱以完成钉钉登录。'
	})}
>
	{#if stage === 'loading'}
		<div class="text-center text-sm text-muted-foreground" data-testid="completion-loading">
			{$_('auth.emailCompletion.loading', { default: '加载中...' })}
		</div>
	{:else if stage === 'invalid'}
		<div class="space-y-3 text-center" data-testid="completion-invalid">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.emailCompletion.invalidTitle', { default: '会话已过期' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.emailCompletion.invalidHint', {
					default: '请重新开始钉钉登录。'
				})}
			</p>
			<a
				href="/auth/login"
				class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
			>
				{$_('auth.backToLogin', { default: '返回登录' })}
			</a>
		</div>
	{:else if stage === 'collect'}
		<form
			class="space-y-4"
			data-testid="completion-collect-form"
			onsubmit={(e) => {
				e.preventDefault();
				void sendCode();
			}}
		>
			<div class="space-y-1.5">
				<label for="completion-email" class="text-sm font-medium text-foreground">
					{$_('auth.emailLabel', { default: '邮箱' })}
				</label>
				<Input
					id="completion-email"
					name="email"
					type="email"
					autocomplete="email"
					placeholder={$_('auth.emailPlaceholder', { default: 'you@example.com' })}
					bind:value={email}
					data-testid="completion-email"
				/>
			</div>
			{#if formError}
				<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="completion-error">
					{formError}
				</Alert>
			{/if}
			<Button
				type="submit"
				disabled={sendingCode}
				data-testid="completion-send-code"
				class="w-full"
			>
				{sendingCode
					? $_('auth.emailCompletion.sending', { default: '发送中...' })
					: $_('auth.emailCompletion.sendCode', { default: '发送验证码' })}
			</Button>
		</form>
	{:else if stage === 'verify' || stage === 'submitting'}
		<form
			class="space-y-4"
			data-testid="completion-verify-form"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div class="space-y-1.5">
				<label for="completion-code" class="text-sm font-medium text-foreground">
					{$_('auth.emailCompletion.codeLabel', { default: '验证码' })}
				</label>
				<Input
					id="completion-code"
					name="code"
					type="text"
					inputmode="numeric"
					maxlength={6}
					autocomplete="one-time-code"
					placeholder={$_('auth.emailCompletion.codePlaceholder', { default: '6-digit code' })}
					bind:value={code}
					data-testid="completion-code"
					class="tracking-widest"
				/>
				<p class="text-xs text-muted-foreground">
					{$_('auth.emailCompletion.codeHintEmail', {
						values: { email },
						default: `Code sent to ${email}.`
					})}
				</p>
			</div>
			{#if formError}
				<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="completion-error">
					{formError}
				</Alert>
			{/if}
			<Button
				type="submit"
				disabled={stage === 'submitting'}
				data-testid="completion-submit"
				class="w-full"
			>
				{stage === 'submitting'
					? $_('auth.emailCompletion.submitting', { default: '验证中...' })
					: $_('auth.emailCompletion.submit', { default: '完成登录' })}
			</Button>
		</form>
	{:else}
		<div class="text-center text-sm text-muted-foreground" data-testid="completion-done">
			{$_('auth.emailCompletion.done', { default: '登录成功，跳转中...' })}
		</div>
	{/if}

	{#snippet footer()}
		<a class="text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: '返回登录' })}
		</a>
	{/snippet}
</AuthLayout>
