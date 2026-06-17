<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- Empty state -->
    <div
      v-if="rules.length === 0"
      class="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground"
    >
      {{ t('admin.settings.openaiFastPolicy.empty') }}
    </div>

    <!-- Rule Cards -->
    <div
      v-for="(rule, ruleIndex) in rules"
      :key="ruleIndex"
      class="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-[13px] font-semibold text-foreground">
          {{ t('admin.settings.openaiFastPolicy.ruleHeader', { index: ruleIndex + 1 }) }}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-7 w-7 shrink-0 text-muted-foreground hover:border hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
          @click="removeRule(ruleIndex)"
          :title="t('admin.settings.openaiFastPolicy.removeRule')"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>

      <div class="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
        <!-- Service Tier -->
        <div class="flex flex-col gap-1">
          <Label class="text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.serviceTier') }}</Label>
          <Select
            :modelValue="rule.service_tier"
            @update:modelValue="rule.service_tier = $event as 'all' | 'priority' | 'flex'"
            :options="tierOptions"
          />
        </div>

        <!-- Action -->
        <div class="flex flex-col gap-1">
          <Label class="text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.action') }}</Label>
          <Select
            :modelValue="rule.action"
            @update:modelValue="rule.action = $event as 'pass' | 'filter' | 'block'"
            :options="actionOptions"
          />
        </div>

        <!-- Scope -->
        <div class="flex flex-col gap-1">
          <Label class="text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.scope') }}</Label>
          <Select
            :modelValue="rule.scope"
            @update:modelValue="rule.scope = $event as 'all' | 'oauth' | 'apikey' | 'bedrock'"
            :options="scopeOptions"
          />
        </div>
      </div>

      <!-- Error Message (only when action=block) -->
      <div v-if="rule.action === 'block'" class="mt-1 flex flex-col gap-1">
        <Label class="text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.errorMessage') }}</Label>
        <Input
          v-model="rule.error_message"
          type="text"
          :placeholder="t('admin.settings.openaiFastPolicy.errorMessagePlaceholder')"
        />
        <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.errorMessageHint') }}</p>
      </div>

      <!-- Model Whitelist -->
      <div class="mt-1 flex flex-col gap-1">
        <Label class="text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.modelWhitelist') }}</Label>
        <p class="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.modelWhitelistHint') }}</p>
        <div
          v-for="(_, patternIdx) in rule.model_whitelist || []"
          :key="patternIdx"
          class="mb-1 flex items-center gap-2"
        >
          <Input
            v-model="rule.model_whitelist![patternIdx]"
            type="text"
            class="h-8 font-mono text-xs"
            :placeholder="t('admin.settings.openaiFastPolicy.modelPatternPlaceholder')"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0 text-muted-foreground hover:border hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
            @click="removeModelPattern(rule, patternIdx)"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-auto gap-1 px-0 py-0 text-xs text-primary hover:bg-transparent hover:text-foreground"
          @click="addModelPattern(rule)"
        >
          <svg class="h-[13px] w-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {{ t('admin.settings.openaiFastPolicy.addModelPattern') }}
        </Button>
      </div>

      <!-- Fallback Action (only when model_whitelist is non-empty) -->
      <div
        v-if="rule.model_whitelist && rule.model_whitelist.length > 0"
        class="mt-1 flex flex-col gap-1"
      >
        <Label class="text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.fallbackAction') }}</Label>
        <Select
          :modelValue="rule.fallback_action || 'pass'"
          @update:modelValue="rule.fallback_action = $event as 'pass' | 'filter' | 'block'"
          :options="actionOptions"
        />
        <p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.fallbackActionHint') }}</p>
        <div v-if="rule.fallback_action === 'block'" class="mt-2">
          <Input
            v-model="rule.fallback_error_message"
            type="text"
            :placeholder="t('admin.settings.openaiFastPolicy.fallbackErrorMessagePlaceholder')"
          />
        </div>
      </div>
    </div>

    <!-- Add Rule Button + save hint -->
    <div class="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        class="h-auto gap-1.5 px-3.5 py-[7px] text-[12.5px] font-medium text-muted-foreground hover:border-primary/60 hover:bg-primary/7 hover:text-primary"
        @click="addRule"
      >
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {{ t('admin.settings.openaiFastPolicy.addRule') }}
      </Button>
      <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.openaiFastPolicy.saveHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/common/Select.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { OpenAIFastPolicyRule } from '@/api/admin/settings'

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

const { t } = useI18n()

// ── Options ────────────────────────────────────────────────────────────────
const tierOptions = computed(() => [
  { value: 'all', label: t('admin.settings.openaiFastPolicy.tierAll') },
  { value: 'priority', label: t('admin.settings.openaiFastPolicy.tierPriority') },
  { value: 'flex', label: t('admin.settings.openaiFastPolicy.tierFlex') },
])

const actionOptions = computed(() => [
  { value: 'pass', label: t('admin.settings.openaiFastPolicy.actionPass') },
  { value: 'filter', label: t('admin.settings.openaiFastPolicy.actionFilter') },
  { value: 'block', label: t('admin.settings.openaiFastPolicy.actionBlock') },
])

const scopeOptions = computed(() => [
  { value: 'all', label: t('admin.settings.openaiFastPolicy.scopeAll') },
  { value: 'oauth', label: t('admin.settings.openaiFastPolicy.scopeOAuth') },
  { value: 'apikey', label: t('admin.settings.openaiFastPolicy.scopeAPIKey') },
  { value: 'bedrock', label: t('admin.settings.openaiFastPolicy.scopeBedrock') },
])

// ── Local state (mirrors global settings key) ──────────────────────────────
const activeSource = computed(() => props.formValues ?? props.settings)

function parseRulesFromSource(src: Record<string, unknown>): OpenAIFastPolicyRule[] {
  const raw = src['openai_fast_policy_settings']
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj['rules'])) {
      return (obj['rules'] as OpenAIFastPolicyRule[]).map((rule) => ({
        ...rule,
        model_whitelist: rule.model_whitelist ? [...rule.model_whitelist] : [],
      }))
    }
  }
  return []
}

const rules = ref<OpenAIFastPolicyRule[]>(parseRulesFromSource(activeSource.value))

// Re-sync when parent resets (e.g., after global save)
watch(
  () => activeSource.value['openai_fast_policy_settings'],
  (incoming) => {
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
      const obj = incoming as Record<string, unknown>
      if (Array.isArray(obj['rules'])) {
        rules.value = (obj['rules'] as OpenAIFastPolicyRule[]).map((rule) => ({
          ...rule,
          model_whitelist: rule.model_whitelist ? [...rule.model_whitelist] : [],
        }))
      }
    }
  },
  { deep: true },
)

// Emit cleaned rules up whenever local state changes
function emitRules() {
  const cleaned = rules.value.map((rule) => {
    const whitelist = (rule.model_whitelist || [])
      .map((p) => p.trim())
      .filter((p) => p !== '')
    const hasWhitelist = whitelist.length > 0
    return {
      service_tier: rule.service_tier,
      action: rule.action,
      scope: rule.scope,
      error_message: rule.action === 'block' ? rule.error_message : undefined,
      model_whitelist: hasWhitelist ? whitelist : undefined,
      fallback_action: hasWhitelist ? rule.fallback_action || 'pass' : undefined,
      fallback_error_message:
        hasWhitelist && rule.fallback_action === 'block'
          ? rule.fallback_error_message
          : undefined,
    } as OpenAIFastPolicyRule
  })
  emit('update:field', 'openai_fast_policy_settings', { rules: cleaned })
}

// ── Mutations ──────────────────────────────────────────────────────────────
function addRule() {
  rules.value.push({
    service_tier: 'priority',
    action: 'filter',
    scope: 'all',
    error_message: '',
    model_whitelist: [],
    fallback_action: 'pass',
    fallback_error_message: '',
  })
  emitRules()
}

function removeRule(index: number) {
  rules.value.splice(index, 1)
  emitRules()
}

function addModelPattern(rule: OpenAIFastPolicyRule) {
  if (!rule.model_whitelist) rule.model_whitelist = []
  rule.model_whitelist.push('')
  emitRules()
}

function removeModelPattern(rule: OpenAIFastPolicyRule, idx: number) {
  rule.model_whitelist?.splice(idx, 1)
  emitRules()
}

// Emit on any inline edit (Select uses update:modelValue, inputs use v-model which
// mutates the reactive ref — we watch the whole rules array for deep changes)
watch(rules, emitRules, { deep: true })
</script>
