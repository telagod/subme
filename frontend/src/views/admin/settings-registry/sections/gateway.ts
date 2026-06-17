/**
 * Gateway tab — Claude Code version gates, scheduling, forwarding behaviour,
 * web-search emulation (schema-able parts), usage records.
 *
 * Sources:
 *   SettingsView.vue lines 3674–4431  (activeTab === 'gateway', second block)
 *   SettingsView.vue lines  205–1352  (activeTab === 'gateway', first block)
 *
 * Flat form. bindings migrated (16 keys):
 *   min_claude_code_version, max_claude_code_version
 *   allow_ungrouped_key_scheduling, openai_advanced_scheduler_enabled
 *   enable_fingerprint_unification, enable_metadata_passthrough,
 *   enable_cch_signing, enable_claude_oauth_system_prompt_injection,
 *   claude_oauth_system_prompt, claude_oauth_system_prompt_blocks,
 *   enable_anthropic_cache_ttl_1h_injection,
 *   rewrite_message_cache_control, antigravity_user_agent_version,
 *   openai_codex_user_agent, openai_allow_claude_code_codex_plugin
 *   allow_user_view_error_requests
 *
 * Backlog — non-form state, need section.component:
 *   webSearchConfig (provider list with API-key toggling, quota bar, ProxySelector, test dialog)
 *   overloadCooldownForm     (own async save cycle, lines  206–305)
 *   rateLimit429CooldownForm (own async save cycle, lines  308–412)
 *   streamTimeoutForm        (own async save + showWhen on action field, lines 415–592)
 *   rectifierForm            (own async save + nested pattern list, lines 595–792)
 *   betaPolicyForm           (rule cards with model-whitelist chips + presets, lines 794–1071)
 *   openaiFastPolicyForm     (dynamic rule list with service-tier Select, lines 1073–1351)
 */
import type { SettingsSection } from '../types'

const claudeCode: SettingsSection = {
  id: 'gateway.claudeCode',
  tab: 'gateway',
  title: 'admin.settings.claudeCode.title',
  description: 'admin.settings.claudeCode.description',
  fields: [
    {
      key: 'min_claude_code_version',
      label: 'admin.settings.claudeCode.minVersion',
      type: 'text',
      placeholder: 'admin.settings.claudeCode.minVersionPlaceholder',
      help: 'admin.settings.claudeCode.minVersionHint',
    },
    {
      key: 'max_claude_code_version',
      label: 'admin.settings.claudeCode.maxVersion',
      type: 'text',
      placeholder: 'admin.settings.claudeCode.maxVersionPlaceholder',
      help: 'admin.settings.claudeCode.maxVersionHint',
    },
  ],
}

const scheduling: SettingsSection = {
  id: 'gateway.scheduling',
  tab: 'gateway',
  title: 'admin.settings.scheduling.title',
  description: 'admin.settings.scheduling.description',
  fields: [
    {
      key: 'allow_ungrouped_key_scheduling',
      label: 'admin.settings.scheduling.allowUngroupedKey',
      type: 'switch',
      help: 'admin.settings.scheduling.allowUngroupedKeyHint',
    },
    {
      key: 'openai_advanced_scheduler_enabled',
      label: 'admin.settings.openaiExperimentalScheduler.title',
      type: 'switch',
      help: 'admin.settings.openaiExperimentalScheduler.description',
    },
  ],
}

const forwarding: SettingsSection = {
  id: 'gateway.forwarding',
  tab: 'gateway',
  title: 'admin.settings.gatewayForwarding.title',
  description: 'admin.settings.gatewayForwarding.description',
  fields: [
    {
      key: 'enable_fingerprint_unification',
      label: 'admin.settings.gatewayForwarding.fingerprintUnification',
      type: 'switch',
      help: 'admin.settings.gatewayForwarding.fingerprintUnificationHint',
    },
    {
      key: 'enable_metadata_passthrough',
      label: 'admin.settings.gatewayForwarding.metadataPassthrough',
      type: 'switch',
      help: 'admin.settings.gatewayForwarding.metadataPassthroughHint',
    },
    {
      key: 'enable_cch_signing',
      label: 'admin.settings.gatewayForwarding.cchSigning',
      type: 'switch',
      help: 'admin.settings.gatewayForwarding.cchSigningHint',
    },
    {
      key: 'enable_claude_oauth_system_prompt_injection',
      label: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptInjection',
      type: 'switch',
      help: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptInjectionHint',
    },
    {
      key: 'claude_oauth_system_prompt',
      label: 'admin.settings.gatewayForwarding.claudeOAuthSystemPrompt',
      type: 'textarea',
      placeholder: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptPlaceholder',
      help: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptHint',
      showWhen: (values) => values.enable_claude_oauth_system_prompt_injection !== false,
    },
    {
      key: 'claude_oauth_system_prompt_blocks',
      label: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptBlocks',
      type: 'json',
      placeholder: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptBlocksPlaceholder',
      help: 'admin.settings.gatewayForwarding.claudeOAuthSystemPromptBlocksHint',
      showWhen: (values) => values.enable_claude_oauth_system_prompt_injection !== false,
    },
    {
      key: 'enable_anthropic_cache_ttl_1h_injection',
      label: 'admin.settings.gatewayForwarding.anthropicCacheTTL1hInjection',
      type: 'switch',
      help: 'admin.settings.gatewayForwarding.anthropicCacheTTL1hInjectionHint',
    },
    {
      key: 'rewrite_message_cache_control',
      label: 'admin.settings.gatewayForwarding.rewriteMessageCacheControl',
      type: 'switch',
      help: 'admin.settings.gatewayForwarding.rewriteMessageCacheControlHint',
    },
    {
      key: 'antigravity_user_agent_version',
      label: 'admin.settings.gatewayForwarding.antigravityUserAgentVersion',
      type: 'text',
      placeholder: 'admin.settings.gatewayForwarding.antigravityUserAgentVersionPlaceholder',
      help: 'admin.settings.gatewayForwarding.antigravityUserAgentVersionHint',
    },
    {
      key: 'openai_codex_user_agent',
      label: 'admin.settings.gatewayForwarding.openaiCodexUserAgent',
      type: 'text',
      placeholder: 'admin.settings.gatewayForwarding.openaiCodexUserAgentPlaceholder',
      help: 'admin.settings.gatewayForwarding.openaiCodexUserAgentHint',
    },
    {
      key: 'openai_allow_claude_code_codex_plugin',
      label: 'admin.settings.gatewayForwarding.openaiAllowClaudeCodeCodexPlugin',
      type: 'switch',
      help: 'admin.settings.gatewayForwarding.openaiAllowClaudeCodeCodexPluginDesc',
    },
  ],
}

// webSearchConfig lives in a non-flat reactive object (provider array with
// per-provider api_key, quota, proxy, test-dialog state). It is backlogged
// for a dedicated section.component.

const usageRecords: SettingsSection = {
  id: 'gateway.usageRecords',
  tab: 'gateway',
  title: 'admin.settings.usageRecords.title',
  description: 'admin.settings.usageRecords.description',
  fields: [
    {
      key: 'allow_user_view_error_requests',
      label: 'admin.settings.user_error_view.label',
      type: 'switch',
      help: 'admin.settings.user_error_view.description',
    },
  ],
}

export default [claudeCode, scheduling, forwarding, usageRecords] as SettingsSection[]
