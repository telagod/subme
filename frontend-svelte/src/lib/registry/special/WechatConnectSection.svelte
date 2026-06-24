<script lang="ts">
	/**
	 * WechatConnectSection · 微信 OAuth (Open / MP / Mobile / Legacy) special section（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/WechatConnectSection.vue。
	 *
	 * 三个子开关（open / mp / mobile）并行，各自展开 app_id + secret；mode 选择决定
	 * 哪一组生效；legacy app_id/app_secret 走 passthrough 保兼容。
	 *
	 * 该 special 全字段都跟随 wechat_connect_enabled。
	 */
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

	const onlyEnabled = (v: Record<string, unknown>) => !!v['wechat_connect_enabled'];
	const openEnabled = (v: Record<string, unknown>) =>
		!!v['wechat_connect_enabled'] && !!v['wechat_connect_open_enabled'];
	const mpEnabled = (v: Record<string, unknown>) =>
		!!v['wechat_connect_enabled'] && !!v['wechat_connect_mp_enabled'];
	const mobileEnabled = (v: Record<string, unknown>) =>
		!!v['wechat_connect_enabled'] && !!v['wechat_connect_mobile_enabled'];

	const fields: Field[] = [
		{
			key: 'wechat_connect_enabled',
			type: 'switch',
			labelKey: 'admin.settings.wechatConnect.title'
		},
		{
			key: 'wechat_connect_mode',
			type: 'select',
			labelKey: 'admin.settings.wechatConnect.title',
			options: [
				{ value: 'open', labelKey: 'admin.settings.wechatConnect.title' },
				{ value: 'mp', labelKey: 'admin.settings.wechatConnect.title' },
				{ value: 'mobile', labelKey: 'admin.settings.wechatConnect.title' },
				{ value: 'legacy', labelKey: 'admin.settings.wechatConnect.title' }
			],
			showWhen: onlyEnabled
		},
		{ key: 'wechat_connect_open_enabled', type: 'switch', labelKey: 'admin.settings.wechatConnect.title', showWhen: onlyEnabled },
		{ key: 'wechat_connect_open_app_id', type: 'text', labelKey: 'admin.settings.wechatConnect.title', showWhen: openEnabled },
		{
			key: 'wechat_connect_open_app_secret',
			type: 'password',
			labelKey: 'admin.settings.wechatConnect.title',
			sensitive: true,
			showWhen: openEnabled
		},
		{ key: 'wechat_connect_mp_enabled', type: 'switch', labelKey: 'admin.settings.wechatConnect.title', showWhen: onlyEnabled },
		{ key: 'wechat_connect_mp_app_id', type: 'text', labelKey: 'admin.settings.wechatConnect.title', showWhen: mpEnabled },
		{
			key: 'wechat_connect_mp_app_secret',
			type: 'password',
			labelKey: 'admin.settings.wechatConnect.title',
			sensitive: true,
			showWhen: mpEnabled
		},
		{ key: 'wechat_connect_mobile_enabled', type: 'switch', labelKey: 'admin.settings.wechatConnect.title', showWhen: onlyEnabled },
		{ key: 'wechat_connect_mobile_app_id', type: 'text', labelKey: 'admin.settings.wechatConnect.title', showWhen: mobileEnabled },
		{
			key: 'wechat_connect_mobile_app_secret',
			type: 'password',
			labelKey: 'admin.settings.wechatConnect.title',
			sensitive: true,
			showWhen: mobileEnabled
		},
		{ key: 'wechat_connect_scopes', type: 'text', labelKey: 'admin.settings.wechatConnect.title', showWhen: onlyEnabled },
		{ key: 'wechat_connect_redirect_url', type: 'text', labelKey: 'admin.settings.wechatConnect.title', showWhen: onlyEnabled },
		{ key: 'wechat_connect_frontend_redirect_url', type: 'text', labelKey: 'admin.settings.wechatConnect.title', showWhen: onlyEnabled },
		// legacy 兼容字段
		{ key: 'wechat_connect_app_id', type: 'text', labelKey: 'admin.settings.wechatConnect.title', showWhen: onlyEnabled },
		{
			key: 'wechat_connect_app_secret',
			type: 'password',
			labelKey: 'admin.settings.wechatConnect.title',
			sensitive: true,
			showWhen: onlyEnabled
		}
	];
</script>

<div class="flex flex-col gap-4" data-special="wechat-connect">
	<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
		{#each fields as field (field.key)}
			<FieldRenderer
				{field}
				value={values[field.key]}
				dirty={dirtyKeys.has(field.key)}
				formValues={values}
				onUpdate={(v) => bubble(field.key, v)}
			/>
		{/each}
	</div>
</div>
