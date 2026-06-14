<template>
  <div class="flex flex-col gap-6 px-5 py-4">
    <!-- ── Custom Endpoints ─────────────────────────────────────────── -->
    <div class="flex flex-col gap-3">
      <p class="m-0 text-[11.5px] leading-[1.55] text-muted-foreground">{{ t('admin.settings.site.customEndpoints.description') }}</p>

      <div v-if="localEndpoints.length > 0" class="flex flex-col gap-2.5">
        <div
          v-for="(ep, index) in localEndpoints"
          :key="index"
          class="overflow-hidden rounded-[10px] border border-border bg-card"
        >
          <div class="flex items-center justify-between gap-2.5 border-b border-border px-3.5 py-2.5">
            <span class="text-[12.5px] font-semibold text-foreground">
              {{ t('admin.settings.site.customEndpoints.itemLabel', { n: index + 1 }) }}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
              @click="removeEndpoint(index)"
            >
              <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
          </div>
          <div class="grid grid-cols-2 gap-3 p-3.5 max-[600px]:grid-cols-1">
            <div>
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.site.customEndpoints.name') }}</Label>
              <Input
                v-model="ep.name"
                type="text"
                :placeholder="t('admin.settings.site.customEndpoints.namePlaceholder')"
                @input="emitEndpoints"
              />
            </div>
            <div>
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.site.customEndpoints.endpointUrl') }}</Label>
              <Input
                v-model="ep.endpoint"
                type="url"
                class="font-mono text-xs"
                :placeholder="t('admin.settings.site.customEndpoints.endpointUrlPlaceholder')"
                @input="emitEndpoints"
              />
            </div>
            <div class="col-span-full max-[600px]:col-span-1">
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.site.customEndpoints.descriptionLabel') }}</Label>
              <Input
                v-model="ep.description"
                type="text"
                :placeholder="t('admin.settings.site.customEndpoints.descriptionPlaceholder')"
                @input="emitEndpoints"
              />
            </div>
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        class="w-full border-dashed text-[12.5px] text-muted-foreground hover:border-ring hover:text-foreground"
        @click="addEndpoint"
      >
        <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {{ t('admin.settings.site.customEndpoints.add') }}
      </Button>
    </div>

    <!-- ── Custom Menu Items ────────────────────────────────────────── -->
    <div class="flex flex-col gap-3 border-t border-border pt-5">
      <p class="m-0 text-[11.5px] leading-[1.55] text-muted-foreground">{{ t('admin.settings.customMenu.description') }}</p>

      <div v-if="localMenuItems.length > 0" class="flex flex-col gap-2.5">
        <div
          v-for="(item, index) in localMenuItems"
          :key="item.id || index"
          class="overflow-hidden rounded-[10px] border border-border bg-card"
        >
          <div class="flex items-center justify-between gap-2.5 border-b border-border px-3.5 py-2.5">
            <span class="text-[12.5px] font-semibold text-foreground">
              {{ t('admin.settings.customMenu.itemLabel', { n: index + 1 }) }}
            </span>
            <div class="flex items-center gap-1">
              <!-- Move up -->
              <Button
                v-if="index > 0"
                type="button"
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-muted-foreground hover:text-foreground"
                :title="t('admin.settings.customMenu.moveUp')"
                @click="moveMenuItem(index, -1)"
              >
                <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </Button>
              <!-- Move down -->
              <Button
                v-if="index < localMenuItems.length - 1"
                type="button"
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-muted-foreground hover:text-foreground"
                :title="t('admin.settings.customMenu.moveDown')"
                @click="moveMenuItem(index, 1)"
              >
                <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
              <!-- Delete -->
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                :title="t('admin.settings.customMenu.remove')"
                @click="removeMenuItem(index)"
              >
                <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 p-3.5 max-[600px]:grid-cols-1">
            <!-- Label -->
            <div>
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.customMenu.name') }}</Label>
              <Input
                v-model="item.label"
                type="text"
                :placeholder="t('admin.settings.customMenu.namePlaceholder')"
                @input="emitMenuItems"
              />
            </div>

            <!-- Visibility -->
            <div>
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.customMenu.visibility') }}</Label>
              <Select :model-value="item.visibility" @update:model-value="(v) => { item.visibility = v as 'user' | 'admin'; emitMenuItems() }">
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{{ t('admin.settings.customMenu.visibilityUser') }}</SelectItem>
                  <SelectItem value="admin">{{ t('admin.settings.customMenu.visibilityAdmin') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- URL (full width) -->
            <div class="col-span-full max-[600px]:col-span-1">
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.customMenu.url') }}</Label>
              <Input
                v-model="item.url"
                type="url"
                class="font-mono text-xs"
                :placeholder="t('admin.settings.customMenu.urlPlaceholder')"
                @input="emitMenuItems"
              />
            </div>

            <!-- SVG Icon (full width) -->
            <div class="col-span-full max-[600px]:col-span-1">
              <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">{{ t('admin.settings.customMenu.iconSvg') }}</Label>
              <ImageUpload
                :model-value="item.icon_svg"
                mode="svg"
                size="sm"
                :upload-label="t('admin.settings.customMenu.uploadSvg')"
                :remove-label="t('admin.settings.customMenu.removeSvg')"
                @update:model-value="(v: string) => { item.icon_svg = v; emitMenuItems() }"
              />
            </div>
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        class="w-full border-dashed text-[12.5px] text-muted-foreground hover:border-ring hover:text-foreground"
        @click="addMenuItem"
      >
        <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {{ t('admin.settings.customMenu.add') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'

const ImageUpload = defineAsyncComponent(() => import('@/components/common/ImageUpload.vue'))

const { t } = useI18n()

interface MenuItem {
  id: string
  label: string
  icon_svg: string
  url: string
  visibility: 'user' | 'admin'
  sort_order: number
}

interface CustomEndpoint {
  name: string
  endpoint: string
  description: string
}

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

// Prefer dirty form state over saved settings
const activeSource = computed(() => props.formValues ?? props.settings)

// ── Helpers ────────────────────────────────────────────────────────────────────

function cloneMenuItems(src: Record<string, unknown>): MenuItem[] {
  const raw = src['custom_menu_items']
  if (!Array.isArray(raw)) return []
  return raw.map((item) => ({ ...(item as MenuItem) }))
}

function cloneEndpoints(src: Record<string, unknown>): CustomEndpoint[] {
  const raw = src['custom_endpoints']
  if (!Array.isArray(raw)) return []
  return raw.map((ep) => ({ ...(ep as CustomEndpoint) }))
}

// ── Local state ────────────────────────────────────────────────────────────────

const localMenuItems = ref<MenuItem[]>(cloneMenuItems(activeSource.value))
const localEndpoints = ref<CustomEndpoint[]>(cloneEndpoints(activeSource.value))

// Re-sync when parent resets (discard) or initial load completes
watch(
  () => activeSource.value['custom_menu_items'],
  (incoming) => {
    if (JSON.stringify(incoming) !== JSON.stringify(localMenuItems.value)) {
      localMenuItems.value = cloneMenuItems(activeSource.value)
    }
  },
  { deep: true },
)

watch(
  () => activeSource.value['custom_endpoints'],
  (incoming) => {
    if (JSON.stringify(incoming) !== JSON.stringify(localEndpoints.value)) {
      localEndpoints.value = cloneEndpoints(activeSource.value)
    }
  },
  { deep: true },
)

// ── Emit helpers ───────────────────────────────────────────────────────────────

function emitMenuItems() {
  emit('update:field', 'custom_menu_items', localMenuItems.value.map((item) => ({ ...item })))
}

function emitEndpoints() {
  emit('update:field', 'custom_endpoints', localEndpoints.value.map((ep) => ({ ...ep })))
}

// ── Menu item CRUD + reorder ───────────────────────────────────────────────────

function addMenuItem() {
  localMenuItems.value = [
    ...localMenuItems.value,
    {
      id: '',
      label: '',
      icon_svg: '',
      url: '',
      visibility: 'user',
      sort_order: localMenuItems.value.length,
    },
  ]
  emitMenuItems()
}

function removeMenuItem(index: number) {
  localMenuItems.value = localMenuItems.value
    .filter((_, i) => i !== index)
    .map((item, i) => ({ ...item, sort_order: i }))
  emitMenuItems()
}

function moveMenuItem(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= localMenuItems.value.length) return
  const items = localMenuItems.value.map((item) => ({ ...item }))
  const temp = items[index]
  items[index] = items[targetIndex]
  items[targetIndex] = temp
  items.forEach((item, i) => { item.sort_order = i })
  localMenuItems.value = items
  emitMenuItems()
}

// ── Endpoint CRUD ──────────────────────────────────────────────────────────────

function addEndpoint() {
  localEndpoints.value = [...localEndpoints.value, { name: '', endpoint: '', description: '' }]
  emitEndpoints()
}

function removeEndpoint(index: number) {
  localEndpoints.value = localEndpoints.value.filter((_, i) => i !== index)
  emitEndpoints()
}
</script>
