<script lang="ts">
	/**
	 * SmtpSection · 邮件 SMTP 设置 special section（POC 4）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/SmtpSection.vue。
	 * 字段集合按 analyze 给出的 7+1 表落地（7 表单字段 + 1 readonly hint 镜像）。
	 *
	 * 区别于普通 fields-grid：
	 *   - 底部多一个 Test Connection 按钮（out-of-band 调用 /api/admin/settings/test-smtp）。
	 *   - 测试请求 body 来自当前 form（含 dirty 未保存值）—— 与 Vue tree 同语义。
	 *
	 * Sensitive password handling:
	 *   - smtp_password 留空 + smtp_password_configured=true → FieldRenderer 显示
	 *     "*** configured ***" 占位符。
	 *   - 用户填值才会随 patch 提交；后端见空串 / undefined 即保留旧值。
	 */
	import { _ } from 'svelte-i18n';
	import FieldRenderer from '../FieldRenderer.svelte';
	import type { Field } from '../types';
	import { settingsApi, type TestSmtpRequest } from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { values, dirtyKeys, onFieldUpdate }: Props = $props();

	// 本地 field schema —— 与 registry 解耦，便于在不动 schema 的情况下增减 SMTP 子字段。
	const smtpFields: Field[] = [
		{
			key: 'smtp_host',
			type: 'text',
			labelKey: 'admin.settings.smtp.host',
			placeholder: 'smtp.gmail.com',
			required: true
		},
		{
			key: 'smtp_port',
			type: 'number',
			labelKey: 'admin.settings.smtp.port',
			placeholder: '587',
			min: 1,
			max: 65535,
			required: true
		},
		{
			key: 'smtp_username',
			type: 'text',
			labelKey: 'admin.settings.smtp.username'
		},
		{
			key: 'smtp_password',
			type: 'password',
			labelKey: 'admin.settings.smtp.password',
			descriptionKey: 'admin.settings.smtp.passwordHint',
			sensitive: true
		},
		{
			key: 'smtp_from_email',
			type: 'text',
			labelKey: 'admin.settings.smtp.fromEmail',
			required: true
		},
		{
			key: 'smtp_from_name',
			type: 'text',
			labelKey: 'admin.settings.smtp.fromName'
		},
		{
			key: 'smtp_use_tls',
			type: 'switch',
			labelKey: 'admin.settings.smtp.useTls',
			descriptionKey: 'admin.settings.smtp.useTlsHint'
		}
	];

	let testing = $state(false);

	function bubble(key: string, value: unknown) {
		onFieldUpdate?.({ key, value });
	}

	async function handleTestConnection() {
		testing = true;
		try {
			const body: TestSmtpRequest = {
				smtp_host: String(values.smtp_host ?? ''),
				smtp_port: Number(values.smtp_port ?? 587),
				smtp_username: String(values.smtp_username ?? ''),
				smtp_password: String(values.smtp_password ?? ''),
				smtp_use_tls: !!values.smtp_use_tls
			};
			const result = await settingsApi.testSmtpConnection(body);
			showSuccess(result.message || $_('admin.settings.smtpConnectionSuccess'));
		} catch (err) {
			const fallback = $_('admin.settings.failedToTestSmtp');
			showError(err instanceof Error ? err.message : fallback);
		} finally {
			testing = false;
		}
	}
</script>

<div class="flex flex-col gap-5" data-special="smtp">
	<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
		{#each smtpFields as field (field.key)}
			<FieldRenderer
				{field}
				value={values[field.key]}
				dirty={dirtyKeys.has(field.key)}
				formValues={values}
				onUpdate={(v) => bubble(field.key, v)}
			/>
		{/each}
	</div>

	<div class="flex items-center justify-start gap-3 border-t border-border pt-4">
		<Button
			variant="outline"
			class="h-9"
			data-testid="smtp-test-connection"
			onclick={handleTestConnection}
			disabled={testing}
		>
			{testing ? $_('admin.settings.smtp.testing') : $_('admin.settings.smtp.testConnection')}
		</Button>
	</div>
</div>
