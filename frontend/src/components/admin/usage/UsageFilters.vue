<template>
  <Card>
    <CardContent class="p-6">
      <!-- Toolbar: left filters (multi-line) + right actions -->
      <div class="flex flex-wrap items-end justify-between gap-4">
        <!-- Left: filters (allowed to wrap to multiple rows) -->
        <div class="flex flex-1 flex-wrap items-end gap-4">
          <!-- User Search -->
          <div ref="userSearchRef" class="usage-filter-dropdown relative w-full sm:w-auto sm:min-w-[240px]">
            <Label class="mb-1 block">{{ t('admin.usage.userFilter') }}</Label>
            <Input
              v-model="userKeyword"
              type="text"
              class="pr-8"
              :placeholder="t('admin.usage.searchUserPlaceholder')"
              @input="debounceUserSearch"
              @focus="showUserDropdown = true"
            />
            <Button
              v-if="filters.user_id"
              type="button"
              variant="ghost"
              size="icon"
              @click="clearUser"
              class="absolute right-1 top-7 h-7 w-7 text-muted-foreground"
              aria-label="Clear user filter"
            >
              ✕
            </Button>
            <div
              v-if="showUserDropdown && (userResults.length > 0 || userKeyword)"
              class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card"
            >
              <Button
                v-for="u in userResults"
                :key="u.id"
                type="button"
                variant="ghost"
                @click="selectUser(u)"
                class="h-auto w-full justify-start px-4 py-2 text-left"
              >
                <span>{{ u.email }}<span v-if="u.deleted" class="ml-1 text-xs text-muted-foreground">（{{ t('admin.usage.userDeletedBadge') }}）</span></span>
                <span class="ml-2 text-xs text-muted-foreground">#{{ u.id }}</span>
              </Button>
            </div>
          </div>

          <!-- API Key Search -->
          <div ref="apiKeySearchRef" class="usage-filter-dropdown relative w-full sm:w-auto sm:min-w-[240px]">
            <Label class="mb-1 block">{{ t('usage.apiKeyFilter') }}</Label>
            <Input
              v-model="apiKeyKeyword"
              type="text"
              class="pr-8"
              :placeholder="t('admin.usage.searchApiKeyPlaceholder')"
              @input="debounceApiKeySearch"
              @focus="onApiKeyFocus"
            />
            <Button
              v-if="filters.api_key_id"
              type="button"
              variant="ghost"
              size="icon"
              @click="onClearApiKey"
              class="absolute right-1 top-7 h-7 w-7 text-muted-foreground"
              aria-label="Clear API key filter"
            >
              ✕
            </Button>
            <div
              v-if="showApiKeyDropdown && apiKeyResults.length > 0"
              class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card"
            >
              <Button
                v-for="k in apiKeyResults"
                :key="k.id"
                type="button"
                variant="ghost"
                @click="selectApiKey(k)"
                class="h-auto w-full justify-start px-4 py-2 text-left"
              >
                <span class="truncate">{{ k.name || `#${k.id}` }}</span>
                <span class="ml-2 text-xs text-muted-foreground">#{{ k.id }}</span>
              </Button>
            </div>
          </div>

          <!-- Model Filter -->
          <div class="w-full sm:w-auto sm:min-w-[220px]">
            <Label class="mb-1 block">{{ t('usage.model') }}</Label>
            <Select
              :model-value="filters.model ?? '__all__'"
              @update:model-value="v => { filters.model = v === '__all__' ? null : v; emitChange() }"
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('admin.usage.allModels')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in modelOptions" :key="String(opt.value ?? '__all__')" :value="String(opt.value ?? '__all__')">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Account Filter -->
          <div ref="accountSearchRef" class="usage-filter-dropdown relative w-full sm:w-auto sm:min-w-[220px]">
            <Label class="mb-1 block">{{ t('admin.usage.account') }}</Label>
            <Input
              v-model="accountKeyword"
              type="text"
              class="pr-8"
              :placeholder="t('admin.usage.searchAccountPlaceholder')"
              @input="debounceAccountSearch"
              @focus="showAccountDropdown = true"
            />
            <Button
              v-if="filters.account_id"
              type="button"
              variant="ghost"
              size="icon"
              @click="clearAccount"
              class="absolute right-1 top-7 h-7 w-7 text-muted-foreground"
              aria-label="Clear account filter"
            >
              ✕
            </Button>
            <div
              v-if="showAccountDropdown && (accountResults.length > 0 || accountKeyword)"
              class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card"
            >
              <Button
                v-for="a in accountResults"
                :key="a.id"
                type="button"
                variant="ghost"
                @click="selectAccount(a)"
                class="h-auto w-full justify-start px-4 py-2 text-left"
              >
                <span class="truncate">{{ a.name }}</span>
                <span class="ml-2 text-xs text-muted-foreground">#{{ a.id }}</span>
              </Button>
            </div>
          </div>

          <!-- Request Type Filter -->
          <div class="w-full sm:w-auto sm:min-w-[180px]">
            <Label class="mb-1 block">{{ t('usage.type') }}</Label>
            <Select
              :model-value="filters.request_type ?? '__all__'"
              @update:model-value="v => { filters.request_type = v === '__all__' ? null : v; emitChange() }"
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('admin.usage.allTypes')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in requestTypeOptions" :key="String(opt.value ?? '__all__')" :value="String(opt.value ?? '__all__')">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Billing Type Filter -->
          <div class="w-full sm:w-auto sm:min-w-[200px]">
            <Label class="mb-1 block">{{ t('admin.usage.billingType') }}</Label>
            <Select
              :model-value="filters.billing_type != null ? String(filters.billing_type) : '__all__'"
              @update:model-value="v => { filters.billing_type = v === '__all__' ? null : Number(v); emitChange() }"
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('admin.usage.allBillingTypes')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in billingTypeOptions" :key="String(opt.value ?? '__all__')" :value="String(opt.value ?? '__all__')">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Billing Mode Filter -->
          <div class="w-full sm:w-auto sm:min-w-[200px]">
            <Label class="mb-1 block">{{ t('admin.usage.billingMode') }}</Label>
            <Select
              :model-value="filters.billing_mode ?? '__all__'"
              @update:model-value="v => { filters.billing_mode = v === '__all__' ? null : v; emitChange() }"
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('admin.usage.allBillingModes')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in billingModeOptions" :key="String(opt.value ?? '__all__')" :value="String(opt.value ?? '__all__')">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Group Filter -->
          <div class="w-full sm:w-auto sm:min-w-[200px]">
            <Label class="mb-1 block">{{ t('admin.usage.group') }}</Label>
            <Select
              :model-value="filters.group_id != null ? String(filters.group_id) : '__all__'"
              @update:model-value="v => { filters.group_id = v === '__all__' ? null : Number(v); emitChange() }"
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('admin.usage.allGroups')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in groupOptions" :key="String(opt.value ?? '__all__')" :value="String(opt.value ?? '__all__')">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        <!-- Right: actions -->
        <div v-if="showActions" class="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
          <Button type="button" variant="outline" @click="$emit('refresh')">
            {{ t('common.refresh') }}
          </Button>
          <Button type="button" variant="outline" @click="$emit('reset')">
            {{ t('common.reset') }}
          </Button>
          <slot name="after-reset" />
          <Button type="button" variant="destructive" @click="$emit('cleanup')">
            {{ t('admin.usage.cleanup.button') }}
          </Button>
          <Button type="button" @click="$emit('export')" :disabled="exporting">
            {{ t('usage.exportExcel') }}
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, toRef, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import type { SelectOption } from '@/components/common/Select.vue'
import type { SimpleApiKey, SimpleUser } from '@/api/admin/usage'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ModelValue = Record<string, any>

interface Props {
  modelValue: ModelValue
  exporting: boolean
  startDate: string
  endDate: string
  showActions?: boolean
  modelOptions?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  showActions: true
})
const emit = defineEmits([
  'update:modelValue',
  'change',
  'refresh',
  'reset',
  'export',
  'cleanup'
])

const { t } = useI18n()
const filters = toRef(props, 'modelValue')

const userSearchRef = ref<HTMLElement | null>(null)
const apiKeySearchRef = ref<HTMLElement | null>(null)
const accountSearchRef = ref<HTMLElement | null>(null)

const userKeyword = ref('')
const userResults = ref<SimpleUser[]>([])
const showUserDropdown = ref(false)
let userSearchTimeout: ReturnType<typeof setTimeout> | null = null

const apiKeyKeyword = ref('')
const apiKeyResults = ref<SimpleApiKey[]>([])
const showApiKeyDropdown = ref(false)
let apiKeySearchTimeout: ReturnType<typeof setTimeout> | null = null

interface SimpleAccount {
  id: number
  name: string
}
const accountKeyword = ref('')
const accountResults = ref<SimpleAccount[]>([])
const showAccountDropdown = ref(false)
let accountSearchTimeout: ReturnType<typeof setTimeout> | null = null

const modelOptions = computed<SelectOption[]>(() => [
  { value: null, label: t('admin.usage.allModels') },
  ...(props.modelOptions ?? []).map((m) => ({ value: m, label: m })),
])
const groupOptions = ref<SelectOption[]>([{ value: null, label: t('admin.usage.allGroups') }])

const requestTypeOptions = ref<SelectOption[]>([
  { value: null, label: t('admin.usage.allTypes') },
  { value: 'ws_v2', label: t('usage.ws') },
  { value: 'stream', label: t('usage.stream') },
  { value: 'sync', label: t('usage.sync') }
])

const billingTypeOptions = ref<SelectOption[]>([
  { value: null, label: t('admin.usage.allBillingTypes') },
  { value: 0, label: t('admin.usage.billingTypeBalance') },
  { value: 1, label: t('admin.usage.billingTypeSubscription') }
])

const billingModeOptions = ref<SelectOption[]>([
  { value: null, label: t('admin.usage.allBillingModes') },
  { value: 'token', label: t('admin.usage.billingModeToken') },
  { value: 'per_request', label: t('admin.usage.billingModePerRequest') },
  { value: 'image', label: t('admin.usage.billingModeImage') }
])

const emitChange = () => emit('change')

const debounceUserSearch = () => {
  if (userSearchTimeout) clearTimeout(userSearchTimeout)
  userSearchTimeout = setTimeout(async () => {
    if (!userKeyword.value) {
      userResults.value = []
      return
    }
    try {
      const results = await adminAPI.usage.searchUsers(userKeyword.value)
      userResults.value = results.sort((a, b) => Number(a.deleted) - Number(b.deleted))
    } catch {
      userResults.value = []
    }
  }, 300)
}

const debounceApiKeySearch = () => {
  if (apiKeySearchTimeout) clearTimeout(apiKeySearchTimeout)
  apiKeySearchTimeout = setTimeout(async () => {
    try {
      apiKeyResults.value = await adminAPI.usage.searchApiKeys(
        filters.value.user_id,
        apiKeyKeyword.value || ''
      )
    } catch {
      apiKeyResults.value = []
    }
  }, 300)
}

const selectUser = async (u: SimpleUser) => {
  userKeyword.value = u.email
  showUserDropdown.value = false
  filters.value.user_id = u.id
  clearApiKey()

  // Auto-load API keys for this user
  try {
    apiKeyResults.value = await adminAPI.usage.searchApiKeys(u.id, '')
  } catch {
    apiKeyResults.value = []
  }

  emitChange()
}

const clearUser = () => {
  userKeyword.value = ''
  userResults.value = []
  showUserDropdown.value = false
  filters.value.user_id = undefined
  clearApiKey()
  emitChange()
}

const selectApiKey = (k: SimpleApiKey) => {
  apiKeyKeyword.value = k.name || String(k.id)
  showApiKeyDropdown.value = false
  filters.value.api_key_id = k.id
  emitChange()
}

const clearApiKey = () => {
  apiKeyKeyword.value = ''
  apiKeyResults.value = []
  showApiKeyDropdown.value = false
  filters.value.api_key_id = undefined
}

const onClearApiKey = () => {
  clearApiKey()
  emitChange()
}

const debounceAccountSearch = () => {
  if (accountSearchTimeout) clearTimeout(accountSearchTimeout)
  accountSearchTimeout = setTimeout(async () => {
    if (!accountKeyword.value) {
      accountResults.value = []
      return
    }
    try {
      const res = await adminAPI.accounts.list(1, 20, { search: accountKeyword.value })
      accountResults.value = res.items.map((a) => ({ id: a.id, name: a.name }))
    } catch {
      accountResults.value = []
    }
  }, 300)
}

const selectAccount = (a: SimpleAccount) => {
  accountKeyword.value = a.name
  showAccountDropdown.value = false
  filters.value.account_id = a.id
  emitChange()
}

const clearAccount = () => {
  accountKeyword.value = ''
  accountResults.value = []
  showAccountDropdown.value = false
  filters.value.account_id = undefined
  emitChange()
}

const onApiKeyFocus = () => {
  showApiKeyDropdown.value = true
  // Trigger search if no results yet
  if (apiKeyResults.value.length === 0) {
    debounceApiKeySearch()
  }
}

const onDocumentClick = (e: MouseEvent) => {
  const target = e.target as Node | null
  if (!target) return

  const clickedInsideUser = userSearchRef.value?.contains(target) ?? false
  const clickedInsideApiKey = apiKeySearchRef.value?.contains(target) ?? false
  const clickedInsideAccount = accountSearchRef.value?.contains(target) ?? false

  if (!clickedInsideUser) showUserDropdown.value = false
  if (!clickedInsideApiKey) showApiKeyDropdown.value = false
  if (!clickedInsideAccount) showAccountDropdown.value = false
}

watch(
  () => props.startDate,
  (value) => {
    filters.value.start_date = value
  },
  { immediate: true }
)

watch(
  () => props.endDate,
  (value) => {
    filters.value.end_date = value
  },
  { immediate: true }
)

watch(
  () => filters.value.user_id,
  (userId) => {
    if (!userId) {
      userKeyword.value = ''
      userResults.value = []
    }
  }
)

watch(
  () => filters.value.api_key_id,
  (apiKeyId) => {
    if (!apiKeyId) {
      apiKeyKeyword.value = ''
      apiKeyResults.value = []
    }
  }
)

watch(
  () => filters.value.account_id,
  (accountId) => {
    if (!accountId) {
      accountKeyword.value = ''
      accountResults.value = []
    }
  }
)

onMounted(async () => {
  document.addEventListener('click', onDocumentClick)
  try {
    const gs = await adminAPI.groups.list(1, 1000)
    groupOptions.value.push(...gs.items.map((g: any) => ({ value: g.id, label: g.name })))
  } catch {
    // Ignore filter option loading errors (page still usable)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>
