/**
 * Security tab — registration gates, auth providers, TOTP, Turnstile.
 * Keys sourced from SettingsView.vue activeTab === 'security' blocks (lines 48 & 1355).
 *
 * Backlog: Admin API Key section uses its own async CRUD flow (not flat key/value),
 * so it stays in SettingsView.vue as a section.component candidate.
 */
import type { SettingsSection } from '../types'

const registration: SettingsSection = {
  id: 'security.registration',
  tab: 'security',
  title: 'admin.settings.registration.title',
  description: 'admin.settings.registration.description',
  fields: [
    {
      key: 'registration_enabled',
      label: 'admin.settings.registration.enableRegistration',
      type: 'switch',
      help: 'admin.settings.registration.enableRegistrationHint',
    },
    {
      key: 'email_verify_enabled',
      label: 'admin.settings.registration.emailVerification',
      type: 'switch',
      help: 'admin.settings.registration.emailVerificationHint',
    },
    // registration_email_suffix_whitelist is rendered by security.emailWhitelist
    // (EmailSuffixWhitelistSection.vue) registered in sections/emailWhitelist.ts.
    {
      key: 'promo_code_enabled',
      label: 'admin.settings.registration.promoCode',
      type: 'switch',
      help: 'admin.settings.registration.promoCodeHint',
    },
    {
      key: 'invitation_code_enabled',
      label: 'admin.settings.registration.invitationCode',
      type: 'switch',
      help: 'admin.settings.registration.invitationCodeHint',
    },
    {
      key: 'password_reset_enabled',
      label: 'admin.settings.registration.passwordReset',
      type: 'switch',
      help: 'admin.settings.registration.passwordResetHint',
      showWhen: (v) => !!v['email_verify_enabled'],
    },
    {
      key: 'totp_enabled',
      label: 'admin.settings.registration.totp',
      type: 'switch',
      help: 'admin.settings.registration.totpHint',
    },
    // force_email_on_third_party_signup lives in the Users tab in SettingsView
    // (authSourceDefaults card, line 3356) — registered in sections/users.ts.
  ],
}

const apiKeyAcl: SettingsSection = {
  id: 'security.apiKeyAcl',
  tab: 'security',
  title: 'admin.settings.apiKeyAcl.title',
  description: 'admin.settings.apiKeyAcl.description',
  fields: [
    {
      key: 'api_key_acl_trust_forwarded_ip',
      label: 'admin.settings.apiKeyAcl.trustForwardedIp',
      type: 'switch',
      help: 'admin.settings.apiKeyAcl.trustForwardedIpHint',
    },
  ],
}

const turnstile: SettingsSection = {
  id: 'security.turnstile',
  tab: 'security',
  title: 'admin.settings.turnstile.title',
  description: 'admin.settings.turnstile.description',
  fields: [
    {
      key: 'turnstile_enabled',
      label: 'admin.settings.turnstile.enabled',
      type: 'switch',
    },
    {
      key: 'turnstile_site_key',
      label: 'admin.settings.turnstile.siteKey',
      type: 'text',
      showWhen: (v) => !!v['turnstile_enabled'],
    },
    {
      key: 'turnstile_secret_key',
      label: 'admin.settings.turnstile.secretKey',
      type: 'password',
      sensitive: true,
      showWhen: (v) => !!v['turnstile_enabled'],
    },
  ],
}

const linuxdo: SettingsSection = {
  id: 'security.linuxdo',
  tab: 'security',
  title: 'admin.settings.linuxdo.title',
  description: 'admin.settings.linuxdo.description',
  fields: [
    {
      key: 'linuxdo_connect_enabled',
      label: 'admin.settings.linuxdo.enabled',
      type: 'switch',
    },
    {
      key: 'linuxdo_connect_client_id',
      label: 'admin.settings.linuxdo.clientId',
      type: 'text',
      showWhen: (v) => !!v['linuxdo_connect_enabled'],
    },
    {
      key: 'linuxdo_connect_client_secret',
      label: 'admin.settings.linuxdo.clientSecret',
      type: 'password',
      sensitive: true,
      showWhen: (v) => !!v['linuxdo_connect_enabled'],
    },
    {
      key: 'linuxdo_connect_redirect_url',
      label: 'admin.settings.linuxdo.redirectUrl',
      type: 'text',
      showWhen: (v) => !!v['linuxdo_connect_enabled'],
    },
  ],
}

const github: SettingsSection = {
  id: 'security.github',
  tab: 'security',
  title: 'admin.settings.github.title',
  description: 'admin.settings.github.description',
  fields: [
    {
      key: 'github_oauth_enabled',
      label: 'admin.settings.github.enabled',
      type: 'switch',
    },
    {
      key: 'github_oauth_client_id',
      label: 'admin.settings.github.clientId',
      type: 'text',
      showWhen: (v) => !!v['github_oauth_enabled'],
    },
    {
      key: 'github_oauth_client_secret',
      label: 'admin.settings.github.clientSecret',
      type: 'password',
      sensitive: true,
      showWhen: (v) => !!v['github_oauth_enabled'],
    },
    {
      key: 'github_oauth_redirect_url',
      label: 'admin.settings.github.redirectUrl',
      type: 'text',
      showWhen: (v) => !!v['github_oauth_enabled'],
    },
    {
      key: 'github_oauth_frontend_redirect_url',
      label: 'admin.settings.github.frontendRedirectUrl',
      type: 'text',
      showWhen: (v) => !!v['github_oauth_enabled'],
    },
  ],
}

const google: SettingsSection = {
  id: 'security.google',
  tab: 'security',
  title: 'admin.settings.google.title',
  description: 'admin.settings.google.description',
  fields: [
    {
      key: 'google_oauth_enabled',
      label: 'admin.settings.google.enabled',
      type: 'switch',
    },
    {
      key: 'google_oauth_client_id',
      label: 'admin.settings.google.clientId',
      type: 'text',
      showWhen: (v) => !!v['google_oauth_enabled'],
    },
    {
      key: 'google_oauth_client_secret',
      label: 'admin.settings.google.clientSecret',
      type: 'password',
      sensitive: true,
      showWhen: (v) => !!v['google_oauth_enabled'],
    },
    {
      key: 'google_oauth_redirect_url',
      label: 'admin.settings.google.redirectUrl',
      type: 'text',
      showWhen: (v) => !!v['google_oauth_enabled'],
    },
    {
      key: 'google_oauth_frontend_redirect_url',
      label: 'admin.settings.google.frontendRedirectUrl',
      type: 'text',
      showWhen: (v) => !!v['google_oauth_enabled'],
    },
  ],
}

// WeChat, DingTalk, OIDC have multi-step sub-form UIs (mode selectors, multi-panel
// sync field grids, PKCE toggles) that exceed FieldRenderer capacity.
// Backlogged as section.component migrations.

export default [registration, apiKeyAcl, turnstile, linuxdo, github, google] as SettingsSection[]
