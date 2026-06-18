<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- enable toggle -->
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.dingtalk.enable') }}</Label>
        <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.enableHint') }}</p>
      </div>
      <Toggle :model-value="!!local.dingtalk_connect_enabled" @update:model-value="set('dingtalk_connect_enabled', $event)" />
    </div>

    <!-- expanded fields — only when enabled -->
    <div v-if="local.dingtalk_connect_enabled" class="flex flex-col gap-4 border-t border-border pt-4">
      <!-- App Key / Client ID -->
      <div class="flex flex-col gap-1">
        <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.dingtalk.clientId') }}</Label>
        <Input
          :value="local.dingtalk_connect_client_id"
          type="text"
          class="font-mono text-sm"
          :placeholder="t('admin.settings.dingtalk.clientIdPlaceholder')"
          @input="set('dingtalk_connect_client_id', ($event.target as HTMLInputElement).value)"
        />
        <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.clientIdHint') }}</p>
      </div>

      <!-- App Secret / Client Secret (masked) -->
      <div class="flex flex-col gap-1">
        <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.dingtalk.clientSecret') }}</Label>
        <Input
          :value="local.dingtalk_connect_client_secret"
          type="password"
          class="font-mono text-sm"
          :placeholder="local.dingtalk_connect_client_secret_configured
            ? t('admin.settings.dingtalk.clientSecretConfiguredPlaceholder')
            : t('admin.settings.dingtalk.clientSecretPlaceholder')"
          @input="set('dingtalk_connect_client_secret', ($event.target as HTMLInputElement).value)"
        />
        <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">
          {{ local.dingtalk_connect_client_secret_configured
            ? t('admin.settings.dingtalk.clientSecretConfiguredHint')
            : t('admin.settings.dingtalk.clientSecretHint') }}
        </p>
      </div>

      <!-- Redirect URL -->
      <div class="flex flex-col gap-1">
        <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.dingtalk.redirectUrl') }}</Label>
        <Input
          :value="local.dingtalk_connect_redirect_url"
          type="url"
          class="font-mono text-sm"
          :placeholder="t('admin.settings.dingtalk.redirectUrlPlaceholder')"
          @input="set('dingtalk_connect_redirect_url', ($event.target as HTMLInputElement).value)"
        />
        <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.redirectUrlHint') }}</p>
      </div>

      <!-- Corp Restriction Policy -->
      <div class="flex flex-col gap-1 border-t border-border pt-4">
        <Label class="text-xs font-medium text-muted-foreground">{{ t('admin.settings.dingtalk.corpPolicy.label') }}</Label>
        <p class="mb-2 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.corpPolicy.hint') }}</p>
        <div class="flex flex-col gap-2">
          <label class="flex cursor-pointer items-center gap-2.5">
            <input
              type="radio"
              value="none"
              class="h-4 w-4 accent-primary"
              :checked="local.dingtalk_connect_corp_restriction_policy === 'none'"
              @change="onCorpPolicyChange('none')"
            />
            <span class="text-sm text-foreground/85">{{ t('admin.settings.dingtalk.corpPolicy.none') }}</span>
          </label>
          <label class="flex cursor-pointer items-center gap-2.5">
            <input
              type="radio"
              value="internal_only"
              class="h-4 w-4 accent-primary"
              :checked="local.dingtalk_connect_corp_restriction_policy === 'internal_only'"
              @change="onCorpPolicyChange('internal_only')"
            />
            <span class="text-sm text-foreground/85">{{ t('admin.settings.dingtalk.corpPolicy.internalOnly') }}</span>
          </label>
        </div>
      </div>

      <!-- internal_only-gated fields -->
      <template v-if="local.dingtalk_connect_corp_restriction_policy === 'internal_only'">
        <!-- Bypass Registration -->
        <div class="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.dingtalk.bypassRegistration') }}</Label>
            <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.bypassRegistrationHint') }}</p>
          </div>
          <Toggle :model-value="!!local.dingtalk_connect_bypass_registration" @update:model-value="set('dingtalk_connect_bypass_registration', $event)" />
        </div>

        <!-- Sync Display Name -->
        <div class="flex flex-col gap-2.5 border-t border-border pt-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.dingtalk.syncDisplayName') }}</Label>
              <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.syncDisplayNameHint') }}</p>
            </div>
            <Toggle :model-value="!!local.dingtalk_connect_sync_display_name" @update:model-value="set('dingtalk_connect_sync_display_name', $event)" />
          </div>
          <template v-if="local.dingtalk_connect_sync_display_name">
            <div class="flex items-center gap-2">
              <label class="min-w-[5rem] whitespace-nowrap text-xs text-muted-foreground">{{ t('admin.settings.dingtalk.syncDisplayNameTarget') }}</label>
              <Input
                :value="local.dingtalk_connect_sync_display_name_attr_key"
                type="text"
                placeholder="dingtalk_name"
                class="max-w-xs flex-1 text-sm"
                @input="set('dingtalk_connect_sync_display_name_attr_key', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="flex items-center gap-2">
              <label class="min-w-[5rem] whitespace-nowrap text-xs text-muted-foreground">{{ t('admin.settings.dingtalk.syncAttrDisplayName') }}</label>
              <Input
                :value="local.dingtalk_connect_sync_display_name_attr_name"
                type="text"
                placeholder="钉钉姓名"
                class="max-w-xs flex-1 text-sm"
                @input="set('dingtalk_connect_sync_display_name_attr_name', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.syncDisplayNameTargetHint') }}</p>
          </template>
        </div>

        <!-- Sync Corp Email -->
        <div class="flex flex-col gap-2.5 border-t border-border pt-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.dingtalk.syncCorpEmail') }}</Label>
              <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.syncCorpEmailHint') }}</p>
              <p class="mt-0.5 text-[11.5px] leading-relaxed text-amber-500">{{ t('admin.settings.dingtalk.syncCorpEmailPermissionHint') }}</p>
            </div>
            <Toggle :model-value="!!local.dingtalk_connect_sync_corp_email" @update:model-value="set('dingtalk_connect_sync_corp_email', $event)" />
          </div>
          <template v-if="local.dingtalk_connect_sync_corp_email">
            <div class="flex items-center gap-2">
              <label class="min-w-[5rem] whitespace-nowrap text-xs text-muted-foreground">{{ t('admin.settings.dingtalk.syncCorpEmailTarget') }}</label>
              <Input
                :value="local.dingtalk_connect_sync_corp_email_attr_key"
                type="text"
                placeholder="dingtalk_email"
                class="max-w-xs flex-1 text-sm"
                @input="set('dingtalk_connect_sync_corp_email_attr_key', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="flex items-center gap-2">
              <label class="min-w-[5rem] whitespace-nowrap text-xs text-muted-foreground">{{ t('admin.settings.dingtalk.syncAttrDisplayName') }}</label>
              <Input
                :value="local.dingtalk_connect_sync_corp_email_attr_name"
                type="text"
                placeholder="钉钉企业邮箱"
                class="max-w-xs flex-1 text-sm"
                @input="set('dingtalk_connect_sync_corp_email_attr_name', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.syncCorpEmailTargetHint') }}</p>
          </template>
        </div>

        <!-- Sync Department -->
        <div class="flex flex-col gap-2.5 border-t border-border pt-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <Label class="text-[13px] font-medium text-foreground">{{ t('admin.settings.dingtalk.syncDept') }}</Label>
              <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.syncDeptHint') }}</p>
              <p class="mt-0.5 text-[11.5px] leading-relaxed text-amber-500">{{ t('admin.settings.dingtalk.syncDeptPermissionHint') }}</p>
            </div>
            <Toggle :model-value="!!local.dingtalk_connect_sync_dept" @update:model-value="set('dingtalk_connect_sync_dept', $event)" />
          </div>
          <template v-if="local.dingtalk_connect_sync_dept">
            <div class="flex items-center gap-2">
              <label class="min-w-[5rem] whitespace-nowrap text-xs text-muted-foreground">{{ t('admin.settings.dingtalk.syncDeptTarget') }}</label>
              <Input
                :value="local.dingtalk_connect_sync_dept_attr_key"
                type="text"
                placeholder="dingtalk_department"
                class="max-w-xs flex-1 text-sm"
                @input="set('dingtalk_connect_sync_dept_attr_key', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="flex items-center gap-2">
              <label class="min-w-[5rem] whitespace-nowrap text-xs text-muted-foreground">{{ t('admin.settings.dingtalk.syncAttrDisplayName') }}</label>
              <Input
                :value="local.dingtalk_connect_sync_dept_attr_name"
                type="text"
                placeholder="钉钉部门"
                class="max-w-xs flex-1 text-sm"
                @input="set('dingtalk_connect_sync_dept_attr_name', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <p class="m-0 text-[11px] leading-relaxed text-muted-foreground">{{ t('admin.settings.dingtalk.syncDeptTargetHint') }}</p>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Toggle from '@/components/common/Toggle.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const { t } = useI18n()

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

// Prefer live form dirty-state over persisted settings
const activeSource = () => props.formValues ?? props.settings

// All DingTalk keys mirrored locally for reactive rendering
interface DingtalkLocal {
  dingtalk_connect_enabled: boolean
  dingtalk_connect_client_id: string
  dingtalk_connect_client_secret: string
  dingtalk_connect_client_secret_configured: boolean
  dingtalk_connect_redirect_url: string
  dingtalk_connect_corp_restriction_policy: string
  dingtalk_connect_internal_corp_id: string
  dingtalk_connect_bypass_registration: boolean
  dingtalk_connect_sync_display_name: boolean
  dingtalk_connect_sync_display_name_attr_key: string
  dingtalk_connect_sync_display_name_attr_name: string
  dingtalk_connect_sync_corp_email: boolean
  dingtalk_connect_sync_corp_email_attr_key: string
  dingtalk_connect_sync_corp_email_attr_name: string
  dingtalk_connect_sync_dept: boolean
  dingtalk_connect_sync_dept_attr_key: string
  dingtalk_connect_sync_dept_attr_name: string
}

function pick(src: Record<string, unknown>): DingtalkLocal {
  return {
    dingtalk_connect_enabled: !!(src['dingtalk_connect_enabled'] ?? false),
    dingtalk_connect_client_id: (src['dingtalk_connect_client_id'] as string) ?? '',
    dingtalk_connect_client_secret: (src['dingtalk_connect_client_secret'] as string) ?? '',
    dingtalk_connect_client_secret_configured: !!(src['dingtalk_connect_client_secret_configured'] ?? false),
    dingtalk_connect_redirect_url: (src['dingtalk_connect_redirect_url'] as string) ?? '',
    dingtalk_connect_corp_restriction_policy: (src['dingtalk_connect_corp_restriction_policy'] as string) ?? 'none',
    dingtalk_connect_internal_corp_id: (src['dingtalk_connect_internal_corp_id'] as string) ?? '',
    dingtalk_connect_bypass_registration: !!(src['dingtalk_connect_bypass_registration'] ?? false),
    dingtalk_connect_sync_display_name: !!(src['dingtalk_connect_sync_display_name'] ?? false),
    dingtalk_connect_sync_display_name_attr_key: (src['dingtalk_connect_sync_display_name_attr_key'] as string) ?? 'dingtalk_name',
    dingtalk_connect_sync_display_name_attr_name: (src['dingtalk_connect_sync_display_name_attr_name'] as string) ?? '钉钉姓名',
    dingtalk_connect_sync_corp_email: !!(src['dingtalk_connect_sync_corp_email'] ?? false),
    dingtalk_connect_sync_corp_email_attr_key: (src['dingtalk_connect_sync_corp_email_attr_key'] as string) ?? 'dingtalk_email',
    dingtalk_connect_sync_corp_email_attr_name: (src['dingtalk_connect_sync_corp_email_attr_name'] as string) ?? '钉钉企业邮箱',
    dingtalk_connect_sync_dept: !!(src['dingtalk_connect_sync_dept'] ?? false),
    dingtalk_connect_sync_dept_attr_key: (src['dingtalk_connect_sync_dept_attr_key'] as string) ?? 'dingtalk_department',
    dingtalk_connect_sync_dept_attr_name: (src['dingtalk_connect_sync_dept_attr_name'] as string) ?? '钉钉部门',
  }
}

const local = reactive<DingtalkLocal>(pick(activeSource()))

// Re-sync when parent resets (discard/initial load)
watch(
  () => activeSource(),
  (src) => {
    const fresh = pick(src)
    for (const k of Object.keys(fresh) as (keyof DingtalkLocal)[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (local as any)[k] = (fresh as any)[k]
    }
  },
  { deep: true },
)

function set(key: keyof DingtalkLocal, value: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (local as any)[key] = value
  emit('update:field', key, value)
}

/**
 * When corp_restriction_policy changes away from internal_only, reset
 * dependent toggles to false (matching SettingsView.vue lines 9650-9652).
 */
function onCorpPolicyChange(policy: string) {
  set('dingtalk_connect_corp_restriction_policy', policy)
  if (policy !== 'internal_only') {
    if (local.dingtalk_connect_sync_corp_email) set('dingtalk_connect_sync_corp_email', false)
    if (local.dingtalk_connect_sync_display_name) set('dingtalk_connect_sync_display_name', false)
    if (local.dingtalk_connect_sync_dept) set('dingtalk_connect_sync_dept', false)
  }
}
</script>
