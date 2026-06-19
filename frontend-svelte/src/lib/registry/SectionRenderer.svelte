<script lang="ts">
	/**
	 * SectionRenderer · 单 section 卡片（POC 4）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/SectionRenderer.vue。
	 *
	 * 两态路由：
	 *   1. section.special 命中 → 渲染对应 special 组件，原生字段 grid 不出。
	 *   2. 否则展开 section.fields → 每条字段走 FieldRenderer。
	 *
	 * Callback props（Svelte 5 idiomatic）：
	 *   - onFieldUpdate({ key, value }) —— FieldRenderer onUpdate(value) + key 包装后调用
	 *     上抛父级。Special 组件也走同一 callback。
	 *   - 不再用 createEventDispatcher —— runes 模式下回调 prop 更直观、测试更友好。
	 */
	import { _ } from 'svelte-i18n';
	import FieldRenderer from './FieldRenderer.svelte';
	import SmtpSection from './special/SmtpSection.svelte';
	import TestEmailSection from './special/TestEmailSection.svelte';
	import AdminApiKeySection from './special/AdminApiKeySection.svelte';
	import EmailSuffixWhitelistSection from './special/EmailSuffixWhitelistSection.svelte';
	import CustomMenuSection from './special/CustomMenuSection.svelte';
	import DingtalkConnectSection from './special/DingtalkConnectSection.svelte';
	import OidcConnectSection from './special/OidcConnectSection.svelte';
	import WechatConnectSection from './special/WechatConnectSection.svelte';
	import UserDefaultsSection from './special/UserDefaultsSection.svelte';
	import AuthSourceDefaultsSection from './special/AuthSourceDefaultsSection.svelte';
	import AffiliateCustomUsersSection from './special/AffiliateCustomUsersSection.svelte';
	import OverloadCooldownSection from './special/OverloadCooldownSection.svelte';
	import RateLimit429Section from './special/RateLimit429Section.svelte';
	import PaymentProviderListSection from './special/PaymentProviderListSection.svelte';
	import LoginAgreementDocumentsSection from './special/LoginAgreementDocumentsSection.svelte';
	import BackupSection from './special/BackupSection.svelte';
	import QuotaNotifySection from './special/QuotaNotifySection.svelte';
	import StreamTimeoutSection from './special/StreamTimeoutSection.svelte';
	import RectifierSection from './special/RectifierSection.svelte';
	import BetaPolicySection from './special/BetaPolicySection.svelte';
	import OpenaiFastPolicySection from './special/OpenaiFastPolicySection.svelte';
	import WebSearchEmulationSection from './special/WebSearchEmulationSection.svelte';
	import type { SectionDef } from './types';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		section: SectionDef;
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { section, values, dirtyKeys, onFieldUpdate }: Props = $props();

	const title = $derived.by(() => {
		const t = $_(section.titleKey);
		return t === section.titleKey ? section.id : t;
	});

	const description = $derived.by(() => {
		if (!section.descriptionKey) return '';
		const t = $_(section.descriptionKey);
		return t === section.descriptionKey ? '' : t;
	});

	function bubble(key: string, value: unknown) {
		onFieldUpdate?.({ key, value });
	}
</script>

<section
	class="rounded-lg border border-border bg-card p-5"
	data-section-id={section.id}
>
	<header class="mb-4">
		<h2 class="text-base font-semibold text-foreground">{title}</h2>
		{#if description}
			<p class="mt-1 text-xs text-muted-foreground">{description}</p>
		{/if}
	</header>

	{#if section.special === 'smtp'}
		<SmtpSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'test-email'}
		<TestEmailSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'admin-api-key'}
		<AdminApiKeySection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'email-suffix-whitelist'}
		<EmailSuffixWhitelistSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'custom-menu'}
		<CustomMenuSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'dingtalk-connect'}
		<DingtalkConnectSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'oidc-connect'}
		<OidcConnectSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'wechat-connect'}
		<WechatConnectSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'user-defaults'}
		<UserDefaultsSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'auth-source-defaults'}
		<AuthSourceDefaultsSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'affiliate-custom-users'}
		<AffiliateCustomUsersSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'overload-cooldown'}
		<OverloadCooldownSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'rate-limit-429'}
		<RateLimit429Section {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'payment-provider-list'}
		<PaymentProviderListSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'login-agreement-documents'}
		<LoginAgreementDocumentsSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'backup'}
		<BackupSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'quota-notify'}
		<QuotaNotifySection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'stream-timeout'}
		<StreamTimeoutSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'rectifier'}
		<RectifierSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'beta-policy'}
		<BetaPolicySection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'openai-fast-policy'}
		<OpenaiFastPolicySection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special === 'web-search-emulation'}
		<WebSearchEmulationSection {values} {dirtyKeys} {onFieldUpdate} />
	{:else if section.special}
		<p class="text-xs text-destructive">[unknown special: {section.special}]</p>
	{:else if section.fields && section.fields.length > 0}
		<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
			{#each section.fields as field (field.key)}
				<FieldRenderer
					{field}
					value={values[field.key]}
					dirty={dirtyKeys.has(field.key)}
					formValues={values}
					onUpdate={(v) => bubble(field.key, v)}
				/>
			{/each}
		</div>
	{:else}
		<p class="text-xs text-muted-foreground">[empty section]</p>
	{/if}
</section>
