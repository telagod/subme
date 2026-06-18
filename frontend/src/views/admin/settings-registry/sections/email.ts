/**
 * Email tab — SMTP configuration, notification switches, and email template editor.
 *
 * Keys sourced from SettingsView.vue activeTab === 'email' region (lines 6198–6616).
 *
 * form. bindings in old view: 15
 *   email_verify_enabled (read-only gate from security tab, not editable here),
 *   smtp_host, smtp_port, smtp_username, smtp_password, smtp_password_configured,
 *   smtp_from_email, smtp_from_name, smtp_use_tls,
 *   subscription_expiry_notify_enabled,
 *   balance_low_notify_enabled, balance_low_notify_threshold, balance_low_notify_recharge_url,
 *   account_quota_notify_enabled, account_quota_notify_emails
 *
 * Notes:
 *   - email_verify_enabled is a read gate (owned by security tab), not re-exposed here.
 *   - smtp_password_configured is a read-only hint flag, not a flat-editable key.
 *   - smtp_password: special placeholder logic depends on smtp_password_configured;
 *     schema renders it as 'password' type; the nuanced placeholder is a FieldRenderer concern.
 *   - account_quota_notify_emails: complex per-item list — handled via escape hatch.
 *   - EmailTemplateEditor: existing async component, escape hatch section.
 *
 * Flat schema fields: 11
 *   smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name,
 *   smtp_use_tls, subscription_expiry_notify_enabled,
 *   balance_low_notify_enabled, balance_low_notify_threshold, balance_low_notify_recharge_url
 * Escape hatch sections: EmailTemplateEditorSection (EmailTemplateEditor component)
 *                        QuotaNotifySection (account_quota_notify_enabled + account_quota_notify_emails)
 * Non-schema read-only: email_verify_enabled (gate), smtp_password_configured (hint)
 * Total covered: 15 / 15 ✓
 */
import { defineAsyncComponent } from 'vue'
import type { SettingsSection } from '../types'

const smtp: SettingsSection = {
  id: 'email.smtp',
  tab: 'email',
  title: 'admin.settings.smtp.title',
  description: 'admin.settings.smtp.description',
  fields: [],
  component: defineAsyncComponent(
    () => import('../special/SmtpSection.vue'),
  ),
}

const testEmail: SettingsSection = {
  id: 'email.test-email',
  tab: 'email',
  title: 'admin.settings.testEmail.title',
  description: 'admin.settings.testEmail.description',
  fields: [],
  component: defineAsyncComponent(
    () => import('../special/TestEmailSection.vue'),
  ),
}

const subscriptionExpiry: SettingsSection = {
  id: 'email.subscription-expiry',
  tab: 'email',
  title: 'admin.settings.subscriptionExpiryNotify.title',
  description: 'admin.settings.subscriptionExpiryNotify.description',
  fields: [
    {
      key: 'subscription_expiry_notify_enabled',
      label: 'admin.settings.subscriptionExpiryNotify.enabled',
      type: 'switch',
      help: 'admin.settings.subscriptionExpiryNotify.enabledHint',
    },
  ],
}

/**
 * EmailTemplateEditor — complex multi-tab template editor.
 * No flat key bindings; handled entirely by the existing component.
 */
const emailTemplates: SettingsSection = {
  id: 'email.templates',
  tab: 'email',
  title: 'admin.settings.emailTemplates.title',
  description: 'admin.settings.emailTemplates.description',
  fields: [],
  component: defineAsyncComponent(
    () => import('@/views/admin/settings/EmailTemplateEditor.vue'),
  ),
}

const balanceNotify: SettingsSection = {
  id: 'email.balance-notify',
  tab: 'email',
  title: 'admin.settings.balanceNotify.title',
  description: 'admin.settings.balanceNotify.description',
  fields: [
    {
      key: 'balance_low_notify_enabled',
      label: 'admin.settings.balanceNotify.enabled',
      type: 'switch',
    },
    {
      key: 'balance_low_notify_threshold',
      label: 'admin.settings.balanceNotify.threshold',
      type: 'number',
      help: 'admin.settings.balanceNotify.thresholdHint',
      showWhen: (v) => !!v['balance_low_notify_enabled'],
    },
    {
      key: 'balance_low_notify_recharge_url',
      label: 'admin.settings.balanceNotify.rechargeUrl',
      type: 'text',
      help: 'admin.settings.balanceNotify.rechargeUrlHint',
    },
  ],
}

/**
 * Quota notify — account_quota_notify_emails is a complex per-item toggle+email list.
 * Escape hatch to QuotaNotifySection component.
 * Covers: account_quota_notify_enabled, account_quota_notify_emails
 */
const quotaNotify: SettingsSection = {
  id: 'email.quota-notify',
  tab: 'email',
  title: 'admin.settings.quotaNotify.title',
  description: 'admin.settings.quotaNotify.description',
  fields: [],
  component: defineAsyncComponent(
    () => import('../special/QuotaNotifySection.vue'),
  ),
}

export default [smtp, testEmail, subscriptionExpiry, emailTemplates, balanceNotify, quotaNotify] as SettingsSection[]
