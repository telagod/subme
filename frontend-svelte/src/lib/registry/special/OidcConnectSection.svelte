<script lang="ts">
	/**
	 * OidcConnectSection · 通用 OIDC special section（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/OidcConnectSection.vue。
	 *
	 * 字段集合：23 个 key（+ *_configured 镜像由后端写入）。所有 OIDC 字段都
	 * showWhen 跟随 oidc_connect_enabled。
	 *
	 * 通过 FieldRenderer 引擎渲染：token_auth_method 为 select；
	 * use_pkce / validate_id_token / require_email_verified 三个 switch；
	 * clock_skew_seconds 为 number；其余 text/password。
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

	const guarded = (key: string): ((v: Record<string, unknown>) => boolean) => (v) =>
		!!v['oidc_connect_enabled'] || key === 'oidc_connect_enabled';

	const fields: Field[] = [
		{
			key: 'oidc_connect_enabled',
			type: 'switch',
			labelKey: 'admin.settings.oidc.enable',
			descriptionKey: 'admin.settings.oidc.enableHint'
		},
		{
			key: 'oidc_connect_provider_name',
			type: 'text',
			labelKey: 'admin.settings.oidc.providerName',
			showWhen: guarded('oidc_connect_provider_name')
		},
		{
			key: 'oidc_connect_client_id',
			type: 'text',
			labelKey: 'admin.settings.oidc.clientId',
			showWhen: guarded('oidc_connect_client_id')
		},
		{
			key: 'oidc_connect_client_secret',
			type: 'password',
			labelKey: 'admin.settings.oidc.clientSecret',
			descriptionKey: 'admin.settings.oidc.clientSecretHint',
			sensitive: true,
			showWhen: guarded('oidc_connect_client_secret')
		},
		{
			key: 'oidc_connect_issuer_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.issuerUrl',
			showWhen: guarded('oidc_connect_issuer_url')
		},
		{
			key: 'oidc_connect_discovery_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.discoveryUrl',
			showWhen: guarded('oidc_connect_discovery_url')
		},
		{
			key: 'oidc_connect_authorize_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.authorizeUrl',
			showWhen: guarded('oidc_connect_authorize_url')
		},
		{
			key: 'oidc_connect_token_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.tokenUrl',
			showWhen: guarded('oidc_connect_token_url')
		},
		{
			key: 'oidc_connect_userinfo_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.userinfoUrl',
			showWhen: guarded('oidc_connect_userinfo_url')
		},
		{
			key: 'oidc_connect_jwks_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.jwksUrl',
			showWhen: guarded('oidc_connect_jwks_url')
		},
		{
			key: 'oidc_connect_scopes',
			type: 'text',
			labelKey: 'admin.settings.oidc.scopes',
			descriptionKey: 'admin.settings.oidc.scopesHint',
			showWhen: guarded('oidc_connect_scopes')
		},
		{
			key: 'oidc_connect_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.redirectUrl',
			descriptionKey: 'admin.settings.oidc.redirectUrlHint',
			showWhen: guarded('oidc_connect_redirect_url')
		},
		{
			key: 'oidc_connect_frontend_redirect_url',
			type: 'text',
			labelKey: 'admin.settings.oidc.frontendRedirectUrl',
			descriptionKey: 'admin.settings.oidc.frontendRedirectUrlHint',
			showWhen: guarded('oidc_connect_frontend_redirect_url')
		},
		{
			key: 'oidc_connect_token_auth_method',
			type: 'select',
			labelKey: 'admin.settings.oidc.tokenAuthMethod',
			options: [
				{ value: 'client_secret_post', labelKey: 'admin.settings.oidc.tokenAuthMethod' },
				{ value: 'client_secret_basic', labelKey: 'admin.settings.oidc.tokenAuthMethod' },
				{ value: 'none', labelKey: 'admin.settings.oidc.tokenAuthMethod' }
			],
			showWhen: guarded('oidc_connect_token_auth_method')
		},
		{
			key: 'oidc_connect_use_pkce',
			type: 'switch',
			labelKey: 'admin.settings.oidc.usePkce',
			showWhen: guarded('oidc_connect_use_pkce')
		},
		{
			key: 'oidc_connect_validate_id_token',
			type: 'switch',
			labelKey: 'admin.settings.oidc.validateIdToken',
			showWhen: guarded('oidc_connect_validate_id_token')
		},
		{
			key: 'oidc_connect_allowed_signing_algs',
			type: 'text',
			labelKey: 'admin.settings.oidc.allowedSigningAlgs',
			showWhen: guarded('oidc_connect_allowed_signing_algs')
		},
		{
			key: 'oidc_connect_clock_skew_seconds',
			type: 'number',
			labelKey: 'admin.settings.oidc.clockSkewSeconds',
			min: 0,
			max: 600,
			showWhen: guarded('oidc_connect_clock_skew_seconds')
		},
		{
			key: 'oidc_connect_require_email_verified',
			type: 'switch',
			labelKey: 'admin.settings.oidc.requireEmailVerified',
			showWhen: guarded('oidc_connect_require_email_verified')
		},
		{
			key: 'oidc_connect_userinfo_email_path',
			type: 'text',
			labelKey: 'admin.settings.oidc.userinfoEmailPath',
			showWhen: guarded('oidc_connect_userinfo_email_path')
		},
		{
			key: 'oidc_connect_userinfo_id_path',
			type: 'text',
			labelKey: 'admin.settings.oidc.userinfoIdPath',
			showWhen: guarded('oidc_connect_userinfo_id_path')
		},
		{
			key: 'oidc_connect_userinfo_username_path',
			type: 'text',
			labelKey: 'admin.settings.oidc.userinfoUsernamePath',
			showWhen: guarded('oidc_connect_userinfo_username_path')
		}
	];
</script>

<div class="flex flex-col gap-4" data-special="oidc-connect">
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
