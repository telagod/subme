<script lang="ts">
	/**
	 * /auth/login · M6 minimal login form
	 *
	 * 设计：
	 *   - sveltekit-superforms SPA 模式 + zod schema：客户端校验 + 提交。
	 *     SPA: true 关键 —— 本仓库纯 SPA（adapter-static fallback），没有 +page.server.ts。
	 *   - 提交流程：
	 *       1. superValidate 通过 → 调 auth.login()
	 *       2. 成功 → goto(query.next || '/dashboard')
	 *       3. TOTP_REQUIRED → 切显 totp 字段（同表单提交即可，schema 允许可选）
	 *       4. 其他错误 → showError(toast) + 表单红色错误条
	 *   - 视觉：参考 Vue LoginView 中心卡片，~360px 宽，Zinc 中性，亮色默认。
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { z } from 'zod';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { _ } from 'svelte-i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import OAuthProvidersSection from '$lib/features/auth/OAuthProvidersSection.svelte';

	// ── schema ─────────────────────────────────────────────────────────
	const schema = z.object({
		email: z.string().min(1, 'auth.errors.EMAIL_REQUIRED').email('auth.errors.EMAIL_INVALID'),
		password: z.string().min(6, 'auth.errors.PASSWORD_TOO_SHORT'),
		totp: z.string().optional()
	});

	type LoginForm = z.infer<typeof schema>;

	// defaults() 需要带 jsonSchema 的 server-adapter（zod4），validators 走 zod4Client。
	const initial = defaults<LoginForm>(zod4(schema));

	const { form, errors, enhance, submitting } = superForm<LoginForm>(initial, {
		SPA: true,
		validators: zod4Client(schema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel(); // SPA：禁用默认 server-action 提交。
			if (!validated.valid) return;

			try {
				await auth.login({
					email: validated.data.email,
					password: validated.data.password,
					totp: validated.data.totp || undefined
				});
				const next = page.url.searchParams.get('next') || '/dashboard';
				await goto(next, { replaceState: true });
			} catch (err) {
				const e = err as Error & { code?: string };
				if (e.code === 'TOTP_REQUIRED') {
					needsTotp = true;
					showError($_('auth.errors.TOTP_REQUIRED', { default: 'TOTP required' }));
					return;
				}
				const msg = (e?.message ?? '').toLowerCase();
				if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('credentials')) {
					formError = $_('auth.errors.INVALID_CREDENTIALS', { default: 'Invalid credentials' });
				} else if (msg.includes('network') || msg.includes('failed to fetch')) {
					formError = $_('auth.errors.NETWORK_ERROR', { default: 'Network error' });
				} else {
					formError = $_('auth.errors.UNKNOWN', { default: 'Unknown error' });
				}
				showError(formError);
			}
		}
	});

	let needsTotp = $state(false);
	let formError = $state<string>('');

	function tr(key: string | undefined, fallback: string): string {
		if (!key) return '';
		// zod 错误已经是 i18n key 形式（auth.errors.*）；翻译失败时回落 fallback。
		return $_(key, { default: fallback });
	}
</script>

<svelte:head>
	<title>{$_('auth.login.title', { default: 'Sign in' })} · sub2api</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<div class="w-full max-w-[360px] space-y-6">
		<header class="space-y-2 text-center">
			<div class="mx-auto h-10 w-10 rounded-md bg-foreground/90"></div>
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('auth.login.title', { default: 'Sign in' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('auth.login.subtitle', { default: 'Welcome back. Sign in to continue.' })}
			</p>
		</header>

		<form method="POST" use:enhance class="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
			<!-- email -->
			<div class="space-y-1.5">
				<label for="email" class="text-sm font-medium text-foreground">
					{$_('auth.login.emailLabel', { default: 'Email' })}
				</label>
				<Input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					placeholder={$_('auth.login.emailPlaceholder', { default: 'you@example.com' })}
					bind:value={$form.email}
					aria-invalid={$errors.email ? 'true' : undefined}
				/>
				{#if $errors.email && $errors.email[0]}
					<p class="text-xs text-destructive" data-testid="error-email">
						{tr($errors.email[0], 'Email error')}
					</p>
				{/if}
			</div>

			<!-- password -->
			<div class="space-y-1.5">
				<label for="password" class="text-sm font-medium text-foreground">
					{$_('auth.login.passwordLabel', { default: 'Password' })}
				</label>
				<Input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					placeholder={$_('auth.login.passwordPlaceholder', { default: 'Your password' })}
					bind:value={$form.password}
					aria-invalid={$errors.password ? 'true' : undefined}
				/>
				{#if $errors.password && $errors.password[0]}
					<p class="text-xs text-destructive" data-testid="error-password">
						{tr($errors.password[0], 'Password error')}
					</p>
				{/if}
			</div>

			<!-- TOTP（仅在 2FA challenge 后显示） -->
			{#if needsTotp}
				<div class="space-y-1.5">
					<label for="totp" class="text-sm font-medium text-foreground">
						{$_('auth.login.totpLabel', { default: 'Two-factor code' })}
					</label>
					<Input
						id="totp"
						name="totp"
						type="text"
						inputmode="numeric"
						maxlength={6}
						autocomplete="one-time-code"
						placeholder={$_('auth.login.totpPlaceholder', { default: '6-digit code' })}
						bind:value={$form.totp}
						class="tracking-widest"
					/>
				</div>
			{/if}

			<!-- 表单级错误 -->
			{#if formError}
				<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="error-form">
					{formError}
				</Alert>
			{/if}

			<Button
				type="submit"
				disabled={$submitting}
				class="w-full"
			>
				{$submitting
					? $_('auth.login.submitting', { default: 'Signing in...' })
					: $_('auth.login.submit', { default: 'Sign in' })}
			</Button>

			<OAuthProvidersSection disabled={$submitting} />

			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<a class="hover:text-foreground hover:underline" href="/auth/forgot">
					{$_('auth.login.forgotPassword', { default: 'Forgot password?' })}
				</a>
				<span>
					{$_('auth.login.noAccount', { default: "Don't have an account?" })}
					<a class="ml-1 text-foreground underline-offset-4 hover:underline" href="/auth/register">
						{$_('auth.login.registerLink', { default: 'Create one' })}
					</a>
				</span>
			</div>
		</form>
	</div>
</main>
