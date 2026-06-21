<script lang="ts">
	/**
	 * /(user)/profile · 个人资料 / 安全 / 第三方绑定 / 危险区
	 *
	 * Tabs：basic / security / connections / danger
	 *
	 * 设计：
	 *   - tab 切换通过本地 $state，不走 URL hash（保持与 keys / usage 一致）。
	 *   - basic 表单：username / language / timezone 可改；email + avatar 只读展示。
	 *   - security：lazy 子组件 ChangePasswordForm + TotpEnrollDialog + DisableTotpDialog。
	 *   - connections：OAuthBindingsList 投喂 enabled providers + bindings。
	 *   - danger：删除账户表单，需输入完整 email + password 才能解锁提交按钮。
	 *
	 * RED LINE：
	 *   - 所有 Select 强制 sentinel value（语言 / 时区下拉用非空字符串）。
	 *   - 不顶层 import 'qrcode'（落在 TotpEnrollDialog 内部）。
	 *   - 失败 / 成功 一律 toast。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { User as UserIcon, ShieldCheck, Link2, AlertOctagon } from '@lucide/svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		updateBasicInfo,
		deleteAccount,
		type OAuthProvider
	} from '$lib/api/user/profile';
	import ChangePasswordForm from '$lib/features/profile/ChangePasswordForm.svelte';
	import TotpEnrollDialog from '$lib/features/profile/TotpEnrollDialog.svelte';
	import DisableTotpDialog from '$lib/features/profile/DisableTotpDialog.svelte';
	import OAuthBindingsList, {
		type BindingState
	} from '$lib/features/profile/OAuthBindingsList.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	type Tab = 'basic' | 'security' | 'connections' | 'danger';
	let activeTab = $state<Tab>('basic');

	// ── basic 表单 state ─────────────────────────────────────────────────────
	let username = $state('');
	let language = $state('zh');
	let timezone = $state('Asia/Shanghai');
	let savingBasic = $state(false);

	// avatar / email 走 auth.user 派生展示
	const currentUser = $derived(auth.user);
	const email = $derived(currentUser?.email ?? '');
	const avatarUrl = $derived<string | undefined>(
		typeof currentUser?.avatar_url === 'string' ? (currentUser.avatar_url as string) : undefined
	);

	onMount(() => {
		// 用 auth.user 缓存 → 表单初值；后续真有 PUT /user 返回再 mirror 回 store。
		const u = auth.user;
		if (u) {
			username = (u.username as string) ?? '';
			if (typeof u.language === 'string') language = u.language as string;
			if (typeof u.timezone === 'string') timezone = u.timezone as string;
		}
	});

	async function handleSaveBasic() {
		if (savingBasic) return;
		savingBasic = true;
		try {
			await updateBasicInfo({ username, language, timezone });
			// 不强刷 user store，等后端响应后下次 hydrate 自然更新。
			showSuccess(
				$_('user.profile.updateSuccess', { default: 'Profile updated successfully' })
			);
		} catch (err) {
			const e = err as Error;
			showError(
				e?.message ??
					$_('user.profile.updateFailed', { default: 'Failed to update profile' })
			);
		} finally {
			savingBasic = false;
		}
	}

	// ── security: TOTP ───────────────────────────────────────────────────────
	let totpEnrollOpen = $state(false);
	let totpDisableOpen = $state(false);
	// 简化：用 auth.user.totp_enabled 派生；真实场景应拉 /totp/status。
	const totpEnabled = $derived<boolean>(Boolean(currentUser?.totp_enabled));

	function handleTotpEnabled() {
		// 上层 refresh user 之后会自动更新；这里只是关闭对话框语义。
	}
	function handleTotpDisabled() {
		// 同上。
	}

	// ── connections: OAuth providers ─────────────────────────────────────────
	// providers 实际由 publicSettings 过滤；POC 阶段全开。
	const enabledProviders: OAuthProvider[] = [
		'github',
		'google',
		'linuxdo',
		'dingtalk',
		'wechat',
		'oidc'
	];

	const bindings = $derived.by<Partial<Record<OAuthProvider, BindingState>>>(() => {
		const u = currentUser as Record<string, unknown> | null;
		const raw = (u?.auth_bindings ?? u?.identity_bindings ?? {}) as Record<
			string,
			{ bound?: boolean; display_name?: string; identity?: string }
		>;
		const out: Partial<Record<OAuthProvider, BindingState>> = {};
		for (const p of enabledProviders) {
			const b = raw[p];
			if (b) {
				out[p] = {
					bound: Boolean(b.bound),
					identity: b.display_name ?? b.identity
				};
			}
		}
		return out;
	});

	function handleBindingChanged() {
		// 父刷新 user → bindings 派生自然更新。
	}

	// ── danger: delete account ───────────────────────────────────────────────
	let confirmEmail = $state('');
	let deletePassword = $state('');
	let deletingAccount = $state(false);
	const canDelete = $derived(
		!!email && confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && deletePassword.length >= 1
	);

	async function handleDeleteAccount() {
		if (!canDelete || deletingAccount) return;
		deletingAccount = true;
		try {
			await deleteAccount({ email: confirmEmail.trim(), password: deletePassword });
			showSuccess(
				$_('user.danger.deleteSuccess', { default: 'Account deleted. Logging out…' })
			);
			await auth.logout();
		} catch (err) {
			const e = err as Error;
			showError(
				e?.message ?? $_('user.danger.deleteFailed', { default: 'Failed to delete account' })
			);
		} finally {
			deletingAccount = false;
		}
	}

	function isTabActive(t: Tab): boolean {
		return activeTab === t;
	}
	function tabClass(t: Tab): string {
		const base =
			'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition';
		return isTabActive(t)
			? `${base} bg-primary text-primary-foreground`
			: `${base} text-muted-foreground hover:bg-accent hover:text-foreground`;
	}
</script>

<svelte:head>
	<title>{$_('user.profile.title', { default: 'Profile' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="profile-page">
	<header class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight text-foreground">
			{$_('user.profile.title', { default: 'Profile Settings' })}
		</h1>
		<p class="text-sm text-muted-foreground">
			{$_('user.profile.description', {
				default: 'Manage your account, security, connections, and danger-zone actions.'
			})}
		</p>
	</header>

	<!-- Tab nav -->
	<div class="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1" role="tablist" data-testid="profile-tabs">
		<Button
			type="button"
			variant="ghost"
			role="tab"
			aria-selected={isTabActive('basic')}
			data-testid="tab-basic"
			class={tabClass('basic')}
			onclick={() => (activeTab = 'basic')}
		>
			<UserIcon class="h-4 w-4" />
			{$_('user.profile.tabBasic', { default: 'Basic Info' })}
		</Button>
		<Button
			type="button"
			variant="ghost"
			role="tab"
			aria-selected={isTabActive('security')}
			data-testid="tab-security"
			class={tabClass('security')}
			onclick={() => (activeTab = 'security')}
		>
			<ShieldCheck class="h-4 w-4" />
			{$_('user.profile.tabSecurity', { default: 'Security' })}
		</Button>
		<Button
			type="button"
			variant="ghost"
			role="tab"
			aria-selected={isTabActive('connections')}
			data-testid="tab-connections"
			class={tabClass('connections')}
			onclick={() => (activeTab = 'connections')}
		>
			<Link2 class="h-4 w-4" />
			{$_('user.profile.tabConnections', { default: 'Connections' })}
		</Button>
		<Button
			type="button"
			variant="ghost"
			role="tab"
			aria-selected={isTabActive('danger')}
			data-testid="tab-danger"
			class={tabClass('danger')}
			onclick={() => (activeTab = 'danger')}
		>
			<AlertOctagon class="h-4 w-4" />
			{$_('user.profile.tabDanger', { default: 'Danger Zone' })}
		</Button>
	</div>

	<!-- Tab panels -->
	{#if activeTab === 'basic'}
		<section
			class="rounded-lg border border-border bg-card p-6 shadow-sm"
			data-testid="panel-basic"
			role="tabpanel"
		>
			<header class="mb-5 space-y-1">
				<h2 class="text-base font-semibold text-foreground">
					{$_('user.profile.basicsTitle', { default: 'Basic information' })}
				</h2>
				<p class="text-sm text-muted-foreground">
					{$_('user.profile.basicsDescription', {
						default: 'Update your username, language, and timezone.'
					})}
				</p>
			</header>

			<div class="grid gap-4 md:grid-cols-2">
				<!-- email read-only -->
				<div class="space-y-1.5">
					<label for="pf-email" class="text-sm font-medium text-foreground">
						{$_('user.profile.email', { default: 'Email' })}
					</label>
					<Input
						id="pf-email"
						type="email"
						readonly
						data-testid="pf-email"
						value={email}
						class="cursor-not-allowed bg-muted/30 text-muted-foreground"
					/>
				</div>

				<!-- avatar read-only display -->
				<div class="space-y-1.5">
					<span class="text-sm font-medium text-foreground">
						{$_('user.profile.avatar', { default: 'Avatar' })}
					</span>
					<div
						class="flex h-10 items-center gap-3 rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
						data-testid="pf-avatar"
					>
						{#if avatarUrl}
							<img src={avatarUrl} alt="avatar" class="h-7 w-7 rounded-full object-cover" />
							<span class="truncate">{avatarUrl}</span>
						{:else}
							<div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
								{(username || email).slice(0, 1).toUpperCase()}
							</div>
							<span>{$_('user.profile.avatarEmpty', { default: 'No avatar set' })}</span>
						{/if}
					</div>
				</div>

				<!-- username editable -->
				<div class="space-y-1.5">
					<label for="pf-username" class="text-sm font-medium text-foreground">
						{$_('user.profile.username', { default: 'Username' })}
					</label>
					<Input
						id="pf-username"
						type="text"
						autocomplete="username"
						data-testid="pf-username"
						bind:value={username}
					/>
				</div>

				<!-- language select -->
				<div class="space-y-1.5">
					<label for="pf-language" class="text-sm font-medium text-foreground">
						{$_('user.profile.language', { default: 'Language' })}
					</label>
					<NativeSelect
						id="pf-language"
						data-testid="pf-language"
						bind:value={language}
					>
						<option value="zh">{$_('user.profile.languages.zh', { default: '简体中文' })}</option>
						<option value="en">{$_('user.profile.languages.en', { default: 'English' })}</option>
					</NativeSelect>
				</div>

				<!-- timezone select -->
				<div class="space-y-1.5 md:col-span-2">
					<label for="pf-timezone" class="text-sm font-medium text-foreground">
						{$_('user.profile.timezone', { default: 'Timezone' })}
					</label>
					<NativeSelect
						id="pf-timezone"
						data-testid="pf-timezone"
						bind:value={timezone}
					>
						<option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
						<option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
						<option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
						<option value="Europe/London">Europe/London (UTC+0)</option>
						<option value="Europe/Berlin">Europe/Berlin (UTC+1)</option>
						<option value="America/New_York">America/New_York (UTC-5)</option>
						<option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
						<option value="UTC">UTC</option>
					</NativeSelect>
				</div>
			</div>

			<div class="mt-6 flex items-center justify-end">
				<Button
					type="button"
					data-testid="pf-save-basic"
					disabled={savingBasic}
					onclick={handleSaveBasic}
				>
					{savingBasic
						? $_('user.profile.updating', { default: 'Updating…' })
						: $_('user.profile.updateProfile', { default: 'Update profile' })}
				</Button>
			</div>
		</section>
	{:else if activeTab === 'security'}
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
								default: 'Two-factor authentication (2FA)'
							})}
						</h2>
						<p class="text-sm text-muted-foreground">
							{$_('user.security.totp.description', {
								default: 'Enhance account security with an authenticator app.'
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
							? $_('user.security.totp.enabled', { default: 'Enabled' })
							: $_('user.security.totp.notEnabled', { default: 'Not enabled' })}
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
							{$_('user.security.totp.disable', { default: 'Disable 2FA' })}
						</Button>
					{:else}
						<Button
							type="button"
							data-testid="totp-enable-btn"
							onclick={() => (totpEnrollOpen = true)}
						>
							{$_('user.security.totp.enable', { default: 'Enable 2FA' })}
						</Button>
					{/if}
				</div>
			</section>
		</div>
	{:else if activeTab === 'connections'}
		<div role="tabpanel" data-testid="panel-connections">
			<OAuthBindingsList
				providers={enabledProviders}
				bindings={bindings}
				onChanged={handleBindingChanged}
			/>
		</div>
	{:else if activeTab === 'danger'}
		<section
			class="rounded-lg border border-destructive/40 bg-card p-6 shadow-sm"
			data-testid="panel-danger"
			role="tabpanel"
		>
			<header class="mb-5 flex items-start gap-3">
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
					<AlertOctagon class="h-5 w-5" />
				</div>
				<div class="space-y-1">
					<h2 class="text-base font-semibold text-destructive">
						{$_('user.danger.title', { default: 'Delete account' })}
					</h2>
					<p class="text-sm text-muted-foreground">
						{$_('user.danger.description', {
							default:
								'Permanently delete your account and all associated data. This action cannot be undone.'
						})}
					</p>
				</div>
			</header>

			<div class="space-y-4">
				<div class="space-y-1.5">
					<label for="dz-email" class="text-sm font-medium text-foreground">
						{$_('user.danger.confirmEmail', {
							default: 'Type your email to confirm ({email})',
							values: { email }
						})}
					</label>
					<Input
						id="dz-email"
						type="email"
						autocomplete="off"
						data-testid="dz-email"
						bind:value={confirmEmail}
						placeholder={email}
					/>
				</div>
				<div class="space-y-1.5">
					<label for="dz-password" class="text-sm font-medium text-foreground">
						{$_('user.danger.password', { default: 'Current password' })}
					</label>
					<Input
						id="dz-password"
						type="password"
						autocomplete="current-password"
						data-testid="dz-password"
						bind:value={deletePassword}
					/>
				</div>

				<div class="flex items-center justify-end pt-2">
					<Button
						type="button"
						variant="destructive"
						data-testid="dz-submit"
						disabled={!canDelete || deletingAccount}
						onclick={handleDeleteAccount}
					>
						{deletingAccount
							? $_('user.danger.deleting', { default: 'Deleting…' })
							: $_('user.danger.deleteButton', { default: 'Delete my account' })}
					</Button>
				</div>
			</div>
		</section>
	{/if}
</section>

<TotpEnrollDialog bind:open={totpEnrollOpen} onEnabled={handleTotpEnabled} />
<DisableTotpDialog bind:open={totpDisableOpen} onDisabled={handleTotpDisabled} />
