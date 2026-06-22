<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { updateBasicInfo } from '$lib/api/user/profile';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	interface Props {
		email: string;
		avatarUrl: string | undefined;
		username: string;
		language: string;
		timezone: string;
		onUsernameChange: (v: string) => void;
		onLanguageChange: (v: string) => void;
		onTimezoneChange: (v: string) => void;
	}

	let {
		email,
		avatarUrl,
		username = $bindable(),
		language = $bindable(),
		timezone = $bindable(),
		onUsernameChange,
		onLanguageChange,
		onTimezoneChange
	}: Props = $props();

	let savingBasic = $state(false);

	async function handleSaveBasic() {
		if (savingBasic) return;
		savingBasic = true;
		try {
			await updateBasicInfo({ username, language, timezone });
			showSuccess(
				$_('user.profile.updateSuccess', { default: '个人资料更新成功' })
			);
		} catch (err) {
			const e = err as Error;
			showError(
				e?.message ??
					$_('user.profile.updateFailed', { default: '更新个人资料失败' })
			);
		} finally {
			savingBasic = false;
		}
	}
</script>

<section
	class="rounded-lg border border-border bg-card p-6 shadow-sm"
	data-testid="panel-basic"
	role="tabpanel"
>
	<header class="mb-5 space-y-1">
		<h2 class="text-base font-semibold text-foreground">
			{$_('user.profile.basicsTitle', { default: '基本信息' })}
		</h2>
		<p class="text-sm text-muted-foreground">
			{$_('user.profile.basicsDescription', {
				default: '更新您的用户名、语言和时区。'
			})}
		</p>
	</header>

	<div class="grid gap-4 md:grid-cols-2">
		<!-- email read-only -->
		<div class="space-y-1.5">
			<label for="pf-email" class="text-sm font-medium text-foreground">
				{$_('user.profile.email', { default: '邮箱' })}
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
				{$_('user.profile.avatar', { default: '头像' })}
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
					<span>{$_('user.profile.avatarEmpty', { default: '未设置头像' })}</span>
				{/if}
			</div>
		</div>

		<!-- username editable -->
		<div class="space-y-1.5">
			<label for="pf-username" class="text-sm font-medium text-foreground">
				{$_('user.profile.username', { default: '用户名' })}
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
				{$_('user.profile.language', { default: '语言' })}
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
				{$_('user.profile.timezone', { default: '时区' })}
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
				? $_('user.profile.updating', { default: '更新中…' })
				: $_('user.profile.updateProfile', { default: '更新个人资料' })}
		</Button>
	</div>
</section>
