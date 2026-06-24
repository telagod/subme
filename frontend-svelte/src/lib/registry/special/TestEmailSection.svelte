<script lang="ts">
	/**
	 * TestEmailSection · 测试邮件 special section（POC 4）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/TestEmailSection.vue。
	 *
	 * 设计：
	 *   - 仅有 recipient input + Send 按钮。
	 *   - body 来自 values（dirty 或 saved 都可）+ 当前 recipient 输入框。
	 *   - 不写回 form —— recipient 只是测试上下文，不属于 settings。
	 *   - zod 邮箱校验仅做 best-effort 前端拦截，最终以后端为准。
	 */
	import { _ } from 'svelte-i18n';
	import { z } from 'zod';
	import { settingsApi, type SendTestEmailRequest } from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		/** 不被 TestEmail 使用 —— 仅为统一 special 组件签名。 */
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { values }: Props = $props();

	let recipient = $state('');
	let sending = $state(false);

	const emailSchema = z.string().email();

	async function handleSend() {
		const parsed = emailSchema.safeParse(recipient);
		if (!parsed.success) {
			showError($_('admin.settings.testEmail.enterRecipientHint'));
			return;
		}
		sending = true;
		try {
			const body: SendTestEmailRequest = {
				email: recipient,
				smtp_host: String(values.smtp_host ?? ''),
				smtp_port: Number(values.smtp_port ?? 587),
				smtp_username: String(values.smtp_username ?? ''),
				smtp_password: String(values.smtp_password ?? ''),
				smtp_from_email: String(values.smtp_from_email ?? ''),
				smtp_from_name: String(values.smtp_from_name ?? ''),
				smtp_use_tls: !!values.smtp_use_tls
			};
			const result = await settingsApi.sendTestEmail(body);
			showSuccess(result.message || $_('admin.settings.testEmailSent'));
		} catch (err) {
			const fallback = $_('admin.settings.failedToSendTestEmail');
			showError(err instanceof Error ? err.message : fallback);
		} finally {
			sending = false;
		}
	}
</script>

<div class="flex flex-col gap-4" data-special="test-email">
	<label class="block text-sm font-medium text-foreground" for="test-email-recipient">
		{$_('admin.settings.testEmail.recipientEmail')}
	</label>
	<Input
		id="test-email-recipient"
		type="email"
		data-testid="test-email-recipient"
		class="h-9 max-w-md"
		placeholder="test@example.com"
		bind:value={recipient}
	/>

	<div class="flex items-center gap-3">
		<Button
			variant="outline"
			class="h-9"
			data-testid="test-email-send"
			onclick={handleSend}
			disabled={sending}
		>
			{sending ? $_('admin.settings.testEmail.sending') : $_('admin.settings.testEmail.sendTestEmail')}
		</Button>
	</div>
</div>
