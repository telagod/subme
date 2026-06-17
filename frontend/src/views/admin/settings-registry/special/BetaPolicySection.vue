<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- loading -->
    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground">
      <svg class="h-4 w-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {{ t('common.loading') }}
    </div>

    <template v-else>
      <!-- Rule Cards -->
      <div
        v-for="rule in rules"
        :key="rule.beta_token"
        class="flex flex-col gap-3 rounded-[10px] border border-border p-4"
      >
        <!-- card header -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[13px] font-semibold text-foreground">{{ getBetaDisplayName(rule.beta_token) }}</span>
          <span class="rounded-[5px] border border-border bg-muted px-[7px] py-0.5 font-mono text-[11px] text-muted-foreground">{{ rule.beta_token }}</span>
        </div>

        <div class="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
          <!-- Action -->
          <div class="flex flex-col gap-1">
            <Label class="text-[11.5px] font-medium">{{ t('admin.settings.betaPolicy.action') }}</Label>
            <Select :modelValue="rule.action" @update:modelValue="rule.action = $event as any">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in actionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Scope -->
          <div class="flex flex-col gap-1">
            <Label class="text-[11.5px] font-medium">{{ t('admin.settings.betaPolicy.scope') }}</Label>
            <Select :modelValue="rule.scope" @update:modelValue="rule.scope = $event as any">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in scopeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Error Message (only when action=block) -->
        <div v-if="rule.action === 'block'" class="mt-1 flex flex-col gap-1">
          <Label class="text-[11.5px] font-medium">{{ t('admin.settings.betaPolicy.errorMessage') }}</Label>
          <Input
            v-model="rule.error_message"
            type="text"
            :placeholder="t('admin.settings.betaPolicy.errorMessagePlaceholder')"
          />
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.betaPolicy.errorMessageHint') }}</p>
        </div>

        <!-- Quick Presets (only for tokens with presets) -->
        <div v-if="betaPresets[rule.beta_token]?.length" class="mt-1 flex flex-col gap-1">
          <Label class="text-[11.5px] font-medium">{{ t('admin.settings.betaPolicy.quickPresets') }}</Label>
          <div class="flex flex-wrap gap-1.5">
            <Button
              v-for="preset in betaPresets[rule.beta_token]"
              :key="preset.label"
              type="button"
              variant="outline"
              size="sm"
              class="h-auto border-primary/30 bg-primary/8 px-[11px] py-1 text-xs font-medium text-primary hover:bg-primary/18"
              @click="applyPreset(rule, preset)"
              :title="preset.description"
            >
              {{ preset.label }}
            </Button>
          </div>
        </div>

        <!-- Model Whitelist -->
        <div class="mt-1 flex flex-col gap-1">
          <Label class="text-[11.5px] font-medium">{{ t('admin.settings.betaPolicy.modelWhitelist') }}</Label>
          <p class="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.betaPolicy.modelWhitelistHint') }}</p>
          <!-- existing patterns -->
          <div
            v-for="(_, index) in rule.model_whitelist || []"
            :key="index"
            class="mb-1 flex items-center gap-2"
          >
            <Input
              v-model="rule.model_whitelist![index]"
              type="text"
              class="h-8 font-mono text-xs"
              :placeholder="t('admin.settings.betaPolicy.modelPatternPlaceholder')"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 flex-shrink-0 text-muted-foreground hover:border hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
              @click="rule.model_whitelist!.splice(index, 1)"
              :aria-label="t('common.remove')"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
          <!-- add pattern -->
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-auto justify-start gap-1 px-0 py-1 text-xs text-primary hover:bg-transparent hover:text-foreground"
            @click="addModelPattern(rule)"
          >
            <svg class="h-[13px] w-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {{ t('admin.settings.betaPolicy.addModelPattern') }}
          </Button>
          <!-- Common pattern chips -->
          <div class="mt-1 flex flex-wrap items-center gap-1.5">
            <span class="text-[11px] text-muted-foreground">{{ t('admin.settings.betaPolicy.commonPatterns') }}:</span>
            <Button
              v-for="pattern in commonModelPatterns"
              :key="pattern"
              type="button"
              variant="outline"
              size="sm"
              class="h-auto rounded-[5px] px-[9px] py-0.5 font-mono text-[11.5px] text-muted-foreground hover:border-primary hover:bg-primary/7 hover:text-primary"
              @click="addQuickPattern(rule, pattern)"
            >
              {{ pattern }}
            </Button>
          </div>
        </div>

        <!-- Fallback Action (only when model_whitelist is non-empty) -->
        <div
          v-if="rule.model_whitelist && rule.model_whitelist.length > 0"
          class="mt-1 flex flex-col gap-1"
        >
          <Label class="text-[11.5px] font-medium">{{ t('admin.settings.betaPolicy.fallbackAction') }}</Label>
          <Select :modelValue="rule.fallback_action || 'pass'" @update:modelValue="rule.fallback_action = $event as any">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in actionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
            </SelectContent>
          </Select>
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.betaPolicy.fallbackActionHint') }}</p>
          <!-- Fallback Error Message (only when fallback_action=block) -->
          <div v-if="rule.fallback_action === 'block'" class="mt-2 flex flex-col gap-1">
            <Input
              v-model="rule.fallback_error_message"
              type="text"
              :placeholder="t('admin.settings.betaPolicy.fallbackErrorMessagePlaceholder')"
            />
            <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.betaPolicy.errorMessageHint') }}</p>
          </div>
        </div>
      </div>

      <!-- Save button -->
      <div class="flex justify-end border-t border-border pt-4">
        <Button
          type="button"
          :disabled="saving"
          @click="save"
        >
          <svg v-if="saving" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {{ saving ? t('common.saving') : t('common.save') }}
        </Button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores'
import { extractApiErrorMessage } from '@/utils/apiError'
import type { BetaPolicyRule } from '@/api/admin/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(true)
const saving = ref(false)

const rules = ref<BetaPolicyRule[]>([])

// ── Options ────────────────────────────────────────────────────────────────
const actionOptions = computed(() => [
  { value: 'pass', label: t('admin.settings.betaPolicy.actionPass') },
  { value: 'filter', label: t('admin.settings.betaPolicy.actionFilter') },
  { value: 'block', label: t('admin.settings.betaPolicy.actionBlock') },
])

const scopeOptions = computed(() => [
  { value: 'all', label: t('admin.settings.betaPolicy.scopeAll') },
  { value: 'oauth', label: t('admin.settings.betaPolicy.scopeOAuth') },
  { value: 'apikey', label: t('admin.settings.betaPolicy.scopeAPIKey') },
  { value: 'bedrock', label: t('admin.settings.betaPolicy.scopeBedrock') },
])

// ── Display names ──────────────────────────────────────────────────────────
const betaDisplayNames: Record<string, string> = {
  'fast-mode-2026-02-01': 'Fast Mode',
  'context-1m-2025-08-07': 'Context 1M',
}

function getBetaDisplayName(token: string): string {
  return betaDisplayNames[token] || token
}

// ── Quick presets ──────────────────────────────────────────────────────────
const betaPresets: Record<
  string,
  Array<{
    label: string
    description: string
    action: 'pass' | 'filter' | 'block'
    model_whitelist: string[]
    fallback_action: 'pass' | 'filter' | 'block'
  }>
> = {
  'context-1m-2025-08-07': [
    {
      label: t('admin.settings.betaPolicy.presetOpusOnly'),
      description: t('admin.settings.betaPolicy.presetOpusOnlyDesc'),
      action: 'pass',
      model_whitelist: ['claude-opus-4-6'],
      fallback_action: 'filter',
    },
  ],
}

// ── Common patterns ────────────────────────────────────────────────────────
const commonModelPatterns = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-*',
  'claude-sonnet-*',
]

function applyPreset(
  rule: BetaPolicyRule,
  preset: {
    action: 'pass' | 'filter' | 'block'
    model_whitelist: string[]
    fallback_action: 'pass' | 'filter' | 'block'
  },
) {
  rule.action = preset.action
  rule.model_whitelist = [...preset.model_whitelist]
  rule.fallback_action = preset.fallback_action
}

function addModelPattern(rule: BetaPolicyRule) {
  if (!rule.model_whitelist) rule.model_whitelist = []
  rule.model_whitelist.push('')
}

function addQuickPattern(rule: BetaPolicyRule, pattern: string) {
  if (!rule.model_whitelist) rule.model_whitelist = []
  if (!rule.model_whitelist.includes(pattern)) {
    rule.model_whitelist.push(pattern)
  }
}

// ── Load ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  loading.value = true
  try {
    const settings = await adminAPI.settings.getBetaPolicySettings()
    rules.value = settings.rules
  } catch {
    // silent — form stays at defaults
  } finally {
    loading.value = false
  }
})

// ── Save ───────────────────────────────────────────────────────────────────
async function save() {
  saving.value = true
  try {
    const cleanedRules = rules.value.map((rule) => {
      const whitelist = rule.model_whitelist?.filter((p) => p.trim() !== '')
      const hasWhitelist = whitelist && whitelist.length > 0
      return {
        beta_token: rule.beta_token,
        action: rule.action,
        scope: rule.scope,
        error_message: rule.error_message,
        model_whitelist: hasWhitelist ? whitelist : undefined,
        fallback_action: hasWhitelist ? rule.fallback_action || 'pass' : undefined,
        fallback_error_message:
          hasWhitelist && rule.fallback_action === 'block'
            ? rule.fallback_error_message
            : undefined,
      } as BetaPolicyRule
    })
    const updated = await adminAPI.settings.updateBetaPolicySettings({ rules: cleanedRules })
    rules.value = updated.rules
    appStore.showSuccess(t('admin.settings.betaPolicy.saved'))
  } catch (error: unknown) {
    appStore.showError(
      extractApiErrorMessage(error, t('admin.settings.betaPolicy.saveFailed')),
    )
  } finally {
    saving.value = false
  }
}
</script>
