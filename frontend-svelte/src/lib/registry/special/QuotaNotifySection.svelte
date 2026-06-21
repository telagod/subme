<script lang="ts">
	/**
	 * QuotaNotifySection · 平台额度告警邮件白名单（M10e · email tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/QuotaNotifySection.vue。
	 *
	 * 契约：
	 *   - 与 flat-form 同流水线 —— 两 flat key 上抛父级：
	 *       account_quota_notify_enabled   (boolean)
	 *       account_quota_notify_emails    (Array<{email,disabled?}>)
	 *   - 父级 reset / 拉新快照时 $effect 检测差异并刷新本地副本。
	 *   - 之所以是 special：每条 entry 是 {email,disabled} 复合记录，FieldRenderer
	 *     的 9 类原子字段无法表达；用 special 把"每行 mini-toggle + email input"包成黑盒。
	 */
	import { _ } from 'svelte-i18n';
	import { X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type QuotaEmail = {
		email: string;
		disabled?: boolean;
	};

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values, dirtyKeys: _d, onFieldUpdate }: Props = $props();

	function cloneEmails(raw: unknown): QuotaEmail[] {
		if (!Array.isArray(raw)) return [];
		return raw.map((e) => ({
			email: String((e as QuotaEmail)?.email ?? ''),
			disabled: !!(e as QuotaEmail)?.disabled
		}));
	}

	let localEnabled = $state<boolean>(false);
	let localEmails = $state<QuotaEmail[]>([]);
	let _initialized = false;

	// 单向同步：父级 form 改了 → 拉回本地（初始化 + 重置都走这里）。
	$effect(() => {
		const incomingEnabled = !!values['account_quota_notify_enabled'];
		const incomingEmails = cloneEmails(values['account_quota_notify_emails']);
		if (!_initialized) {
			localEnabled = incomingEnabled;
			localEmails = incomingEmails;
			_initialized = true;
			return;
		}
		if (incomingEnabled !== localEnabled) {
			localEnabled = incomingEnabled;
		}
		if (JSON.stringify(incomingEmails) !== JSON.stringify(localEmails)) {
			localEmails = incomingEmails;
		}
	});

	function emitEmails() {
		onFieldUpdate?.({
			key: 'account_quota_notify_emails',
			value: localEmails.map((e) => ({ ...e }))
		});
	}

	function toggleEnabled() {
		localEnabled = !localEnabled;
		onFieldUpdate?.({ key: 'account_quota_notify_enabled', value: localEnabled });
	}

	function toggleEntryDisabled(index: number) {
		localEmails = localEmails.map((e, i) =>
			i === index ? { ...e, disabled: !e.disabled } : e
		);
		emitEmails();
	}

	function onEmailInput(index: number, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		localEmails = localEmails.map((entry, i) =>
			i === index ? { ...entry, email: raw } : entry
		);
		emitEmails();
	}

	function addEmail() {
		localEmails = [...localEmails, { email: '', disabled: false }];
		emitEmails();
	}

	function removeEmail(index: number) {
		localEmails = localEmails.filter((_, i) => i !== index);
		emitEmails();
	}
</script>

<div class="flex flex-col gap-4" data-special="quota-notify">
	<!-- master enable switch -->
	<div class="flex items-center justify-between gap-4">
		<label
			class="block text-sm font-medium text-foreground"
			for="quota-notify-enabled"
		>
			{$_('admin.settings.quotaNotify.enabled')}
		</label>
		<Button
			id="quota-notify-enabled"
			variant="ghost"
			size="icon"
			role="switch"
			aria-checked={localEnabled}
			aria-label={$_('admin.settings.quotaNotify.enabled')}
			data-testid="quota-notify-enabled"
			data-checked={localEnabled}
			onclick={toggleEnabled}
			class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {localEnabled
				? 'bg-primary'
				: 'bg-muted'}"
		>
			<span
				class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {localEnabled
					? 'translate-x-4'
					: 'translate-x-0.5'}"
			></span>
		</Button>
	</div>

	{#if localEnabled}
		<div class="flex flex-col gap-2 border-t border-border pt-4">
			{#each localEmails as entry, index (index)}
				<div
					data-testid="quota-notify-row"
					data-row-index={index}
					class="flex items-center gap-2"
				>
					<!-- per-row mini switch -->
					<Button
						variant="ghost"
						size="icon"
						role="switch"
						aria-checked={!entry.disabled}
						aria-label={$_('admin.settings.quotaNotify.enabled')}
						data-testid="quota-notify-row-enabled"
						data-checked={!entry.disabled}
						onclick={() => toggleEntryDisabled(index)}
						class="relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors {!entry.disabled
							? 'bg-primary'
							: 'bg-muted'}"
					>
						<span
							class="inline-block h-3 w-3 transform rounded-full bg-white transition-transform {!entry.disabled
								? 'translate-x-3.5'
								: 'translate-x-0.5'}"
						></span>
					</Button>
					<Input
						type="email"
						data-testid="quota-notify-email"
						placeholder={$_('admin.settings.quotaNotify.emailPlaceholder')}
						value={entry.email}
						oninput={(e) => onEmailInput(index, e)}
						class="h-9 flex-1"
					/>
					<Button
						variant="ghost"
						size="icon"
						data-testid="quota-notify-remove"
						aria-label={$_('common.delete')}
						onclick={() => removeEmail(index)}
						class="h-7 w-7 text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
					>
						<X class="h-3 w-3" />
					</Button>
				</div>
			{/each}

			<Button
				variant="outline"
				size="sm"
				data-testid="quota-notify-add"
				onclick={addEmail}
				class="w-fit"
			>
				+ {$_('admin.settings.quotaNotify.addEmail')}
			</Button>

			<p class="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
				{$_('admin.settings.quotaNotify.emailsHint')}
			</p>
		</div>
	{/if}
</div>
