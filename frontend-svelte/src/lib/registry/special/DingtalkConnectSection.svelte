<script lang="ts">
	/**
	 * DingtalkConnectSection · 钉钉企业 OAuth special section（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/DingtalkConnectSection.vue。
	 *
	 * 字段集合：18 个 key（含 *_configured 镜像由后端写入，前端只读）。
	 *
	 * 复合层级（showWhen 串联）：
	 *   enabled
	 *     → client_id / client_secret / redirect_url
	 *     → corp_restriction_policy (radio: none | internal_only)
	 *        当 internal_only：
	 *          → internal_corp_id / bypass_registration
	 *          → sync_display_name / _attr_key / _attr_name
	 *          → sync_corp_email   / _attr_key / _attr_name
	 *          → sync_dept         / _attr_key / _attr_name
	 *
	 * 该 special 使用 FieldRenderer 复用引擎，仅在外壳上挂 corp policy radio + 标题分组。
	 */
	import { _ } from 'svelte-i18n';
	import FieldRenderer from '../FieldRenderer.svelte';
	import type { Field } from '../types';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { values, dirtyKeys, onFieldUpdate }: Props = $props();

	function bubble(key: string, value: unknown) {
		onFieldUpdate?.({ key, value });
	}

	const baseFields: Field[] = [
		{
			key: 'dingtalk_connect_enabled',
			type: 'switch',
			labelKey: 'admin.settings.dingtalk.enable',
			descriptionKey: 'admin.settings.dingtalk.enableHint'
		},
		{
			key: 'dingtalk_connect_client_id',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.clientId',
			descriptionKey: 'admin.settings.dingtalk.clientIdHint',
			showWhen: (v) => !!v['dingtalk_connect_enabled']
		},
		{
			key: 'dingtalk_connect_client_secret',
			type: 'password',
			labelKey: 'admin.settings.dingtalk.clientSecret',
			descriptionKey: 'admin.settings.dingtalk.clientSecretHint',
			sensitive: true,
			showWhen: (v) => !!v['dingtalk_connect_enabled']
		},
		{
			key: 'dingtalk_connect_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.redirectUrl',
			descriptionKey: 'admin.settings.dingtalk.redirectUrlHint',
			showWhen: (v) => !!v['dingtalk_connect_enabled']
		}
	];

	const policy = $derived(String(values['dingtalk_connect_corp_restriction_policy'] ?? 'none'));
	const enabled = $derived(!!values['dingtalk_connect_enabled']);

	function onPolicy(v: 'none' | 'internal_only') {
		bubble('dingtalk_connect_corp_restriction_policy', v);
	}

	const internalFields: Field[] = [
		{
			key: 'dingtalk_connect_internal_corp_id',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.clientId',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] && v['dingtalk_connect_corp_restriction_policy'] === 'internal_only'
		},
		{
			key: 'dingtalk_connect_bypass_registration',
			type: 'switch',
			labelKey: 'admin.settings.dingtalk.bypassRegistration',
			descriptionKey: 'admin.settings.dingtalk.bypassRegistrationHint',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] && v['dingtalk_connect_corp_restriction_policy'] === 'internal_only'
		},
		{
			key: 'dingtalk_connect_sync_display_name',
			type: 'switch',
			labelKey: 'admin.settings.dingtalk.syncDisplayName',
			descriptionKey: 'admin.settings.dingtalk.syncDisplayNameHint',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] && v['dingtalk_connect_corp_restriction_policy'] === 'internal_only'
		},
		{
			key: 'dingtalk_connect_sync_display_name_attr_key',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.syncDisplayNameTarget',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] &&
				v['dingtalk_connect_corp_restriction_policy'] === 'internal_only' &&
				!!v['dingtalk_connect_sync_display_name']
		},
		{
			key: 'dingtalk_connect_sync_display_name_attr_name',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.syncAttrDisplayName',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] &&
				v['dingtalk_connect_corp_restriction_policy'] === 'internal_only' &&
				!!v['dingtalk_connect_sync_display_name']
		},
		{
			key: 'dingtalk_connect_sync_corp_email',
			type: 'switch',
			labelKey: 'admin.settings.dingtalk.syncCorpEmail',
			descriptionKey: 'admin.settings.dingtalk.syncCorpEmailHint',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] && v['dingtalk_connect_corp_restriction_policy'] === 'internal_only'
		},
		{
			key: 'dingtalk_connect_sync_corp_email_attr_key',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.syncCorpEmailTarget',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] &&
				v['dingtalk_connect_corp_restriction_policy'] === 'internal_only' &&
				!!v['dingtalk_connect_sync_corp_email']
		},
		{
			key: 'dingtalk_connect_sync_corp_email_attr_name',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.syncAttrDisplayName',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] &&
				v['dingtalk_connect_corp_restriction_policy'] === 'internal_only' &&
				!!v['dingtalk_connect_sync_corp_email']
		},
		{
			key: 'dingtalk_connect_sync_dept',
			type: 'switch',
			labelKey: 'admin.settings.dingtalk.syncDept',
			descriptionKey: 'admin.settings.dingtalk.syncDeptHint',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] && v['dingtalk_connect_corp_restriction_policy'] === 'internal_only'
		},
		{
			key: 'dingtalk_connect_sync_dept_attr_key',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.syncDeptTarget',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] &&
				v['dingtalk_connect_corp_restriction_policy'] === 'internal_only' &&
				!!v['dingtalk_connect_sync_dept']
		},
		{
			key: 'dingtalk_connect_sync_dept_attr_name',
			type: 'text',
			labelKey: 'admin.settings.dingtalk.syncAttrDisplayName',
			showWhen: (v) =>
				!!v['dingtalk_connect_enabled'] &&
				v['dingtalk_connect_corp_restriction_policy'] === 'internal_only' &&
				!!v['dingtalk_connect_sync_dept']
		}
	];
</script>

<div class="flex flex-col gap-4" data-special="dingtalk-connect">
	<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
		{#each baseFields as field (field.key)}
			<FieldRenderer
				{field}
				value={values[field.key]}
				dirty={dirtyKeys.has(field.key)}
				formValues={values}
				onUpdate={(v) => bubble(field.key, v)}
			/>
		{/each}
	</div>

	{#if enabled}
		<div class="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
			<span class="text-sm font-medium text-foreground">
				{$_('admin.settings.dingtalk.corpPolicy.label')}
			</span>
			<p class="text-xs text-muted-foreground">{$_('admin.settings.dingtalk.corpPolicy.hint')}</p>
			<label class="flex items-center gap-2 text-sm">
				<input
					type="radio"
					name="dingtalk_corp_policy"
					value="none"
					checked={policy === 'none'}
					onchange={() => onPolicy('none')}
				/>
				{$_('admin.settings.dingtalk.corpPolicy.none')}
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input
					type="radio"
					name="dingtalk_corp_policy"
					value="internal_only"
					checked={policy === 'internal_only'}
					onchange={() => onPolicy('internal_only')}
				/>
				{$_('admin.settings.dingtalk.corpPolicy.internalOnly')}
			</label>
		</div>

		<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
			{#each internalFields as field (field.key)}
				<FieldRenderer
					{field}
					value={values[field.key]}
					dirty={dirtyKeys.has(field.key)}
					formValues={values}
					onUpdate={(v) => bubble(field.key, v)}
				/>
			{/each}
		</div>
	{/if}
</div>
