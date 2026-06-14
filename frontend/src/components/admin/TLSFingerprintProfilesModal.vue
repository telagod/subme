<template>
  <BaseDialog
    :show="show"
    :title="t('admin.tlsFingerprintProfiles.title')"
    width="wide"
    @close="$emit('close')"
  >
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <p class="text-sm text-muted-foreground">
          {{ t('admin.tlsFingerprintProfiles.description') }}
        </p>
        <Button size="sm" @click="showCreateModal = true">
          <Icon name="plus" size="sm" class="mr-1" />
          {{ t('admin.tlsFingerprintProfiles.createProfile') }}
        </Button>
      </div>

      <!-- Profiles Table -->
      <div v-if="loading" class="flex items-center justify-center py-8">
        <Icon name="refresh" size="lg" class="animate-spin text-muted-foreground" />
      </div>

      <div v-else-if="profiles.length === 0" class="py-8 text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary border border-border ">
          <Icon name="shield" size="lg" class="text-primary" />
        </div>
        <h4 class="mb-1 text-sm font-medium text-foreground">
          {{ t('admin.tlsFingerprintProfiles.noProfiles') }}
        </h4>
        <p class="text-sm text-muted-foreground">
          {{ t('admin.tlsFingerprintProfiles.createFirstProfile') }}
        </p>
      </div>

      <div v-else class="max-h-96 overflow-auto rounded-lg border border-border">
        <table class="min-w-full divide-y divide-border">
          <thead class="sticky top-0 bg-muted">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                {{ t('admin.tlsFingerprintProfiles.columns.name') }}
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                {{ t('admin.tlsFingerprintProfiles.columns.description') }}
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                {{ t('admin.tlsFingerprintProfiles.columns.grease') }}
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                {{ t('admin.tlsFingerprintProfiles.columns.alpn') }}
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                {{ t('admin.tlsFingerprintProfiles.columns.actions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border bg-card">
            <tr v-for="profile in profiles" :key="profile.id" class="hover:bg-accent">
              <td class="px-3 py-2">
                <div class="font-medium text-foreground text-sm">{{ profile.name }}</div>
              </td>
              <td class="px-3 py-2">
                <div v-if="profile.description" class="text-sm text-muted-foreground max-w-xs truncate">
                  {{ profile.description }}
                </div>
                <div v-else class="text-xs text-muted-foreground">—</div>
              </td>
              <td class="px-3 py-2">
                <Icon
                  :name="profile.enable_grease ? 'check' : 'lock'"
                  size="sm"
                  :class="profile.enable_grease ? 'text-emerald-400' : 'text-muted-foreground'"
                />
              </td>
              <td class="px-3 py-2">
                <div v-if="profile.alpn_protocols?.length" class="flex flex-wrap gap-1">
                  <Badge
                    v-for="proto in profile.alpn_protocols.slice(0, 3)"
                    :key="proto"
                    variant="secondary"
                    class="text-xs"
                  >
                    {{ proto }}
                  </Badge>
                  <span v-if="profile.alpn_protocols.length > 3" class="text-xs text-muted-foreground">
                    +{{ profile.alpn_protocols.length - 3 }}
                  </span>
                </div>
                <div v-else class="text-xs text-muted-foreground">—</div>
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    @click="handleEdit(profile)"
                    class="h-7 w-7 text-muted-foreground hover:text-primary"
                    :title="t('common.edit')"
                  >
                    <Icon name="edit" size="sm" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    @click="handleDelete(profile)"
                    class="h-7 w-7 text-muted-foreground hover:text-destructive"
                    :title="t('common.delete')"
                  >
                    <Icon name="trash" size="sm" />
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <Button variant="outline" @click="$emit('close')">
          {{ t('common.close') }}
        </Button>
      </div>
    </template>

    <!-- Create/Edit Modal -->
    <BaseDialog
      :show="showCreateModal || showEditModal"
      :title="showEditModal ? t('admin.tlsFingerprintProfiles.editProfile') : t('admin.tlsFingerprintProfiles.createProfile')"
      width="wide"
      :z-index="60"
      @close="closeFormModal"
    >
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Paste YAML -->
        <div>
          <Label>{{ t('admin.tlsFingerprintProfiles.form.pasteYaml') }}</Label>
          <Textarea
            v-model="yamlInput"
            :rows="4"
            class="font-mono text-xs"
            :placeholder="t('admin.tlsFingerprintProfiles.form.pasteYamlPlaceholder')"
            @paste="handleYamlPaste"
          />
          <div class="mt-1 flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" @click="parseYamlInput">
              {{ t('admin.tlsFingerprintProfiles.form.parseYaml') }}
            </Button>
            <p class="text-xs text-muted-foreground">
              {{ t('admin.tlsFingerprintProfiles.form.pasteYamlHint') }}
              <a href="https://tls.sub2api.org" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline">{{ t('admin.tlsFingerprintProfiles.form.openCollector') }}</a>
            </p>
          </div>
        </div>

        <Separator />

        <!-- Basic Info -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.name') }}</Label>
            <Input
              v-model="form.name"
              type="text"
              required
              :placeholder="t('admin.tlsFingerprintProfiles.form.namePlaceholder')"
            />
          </div>
          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.description') }}</Label>
            <Input
              v-model="form.description"
              type="text"
              :placeholder="t('admin.tlsFingerprintProfiles.form.descriptionPlaceholder')"
            />
          </div>
        </div>

        <!-- GREASE Toggle -->
        <div class="flex items-center gap-3">
          <Switch
            :checked="form.enable_grease"
            @update:checked="form.enable_grease = $event"
          />
          <div>
            <span class="text-sm font-medium text-foreground/85">
              {{ t('admin.tlsFingerprintProfiles.form.enableGrease') }}
            </span>
            <p class="text-xs text-muted-foreground">
              {{ t('admin.tlsFingerprintProfiles.form.enableGreaseHint') }}
            </p>
          </div>
        </div>

        <!-- TLS Array Fields - 2 column grid -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.cipherSuites') }}</Label>
            <Textarea
              v-model="fieldInputs.cipher_suites"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'0x1301, 0x1302, 0xc02c'"
            />
            <p class="text-xs text-muted-foreground mt-1">{{ t('admin.tlsFingerprintProfiles.form.cipherSuitesHint') }}</p>
          </div>

          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.curves') }}</Label>
            <Textarea
              v-model="fieldInputs.curves"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'29, 23, 24'"
            />
            <p class="text-xs text-muted-foreground mt-1">{{ t('admin.tlsFingerprintProfiles.form.curvesHint') }}</p>
          </div>

          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.signatureAlgorithms') }}</Label>
            <Textarea
              v-model="fieldInputs.signature_algorithms"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'0x0403, 0x0804, 0x0401'"
            />
          </div>

          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.supportedVersions') }}</Label>
            <Textarea
              v-model="fieldInputs.supported_versions"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'0x0304, 0x0303'"
            />
          </div>

          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.keyShareGroups') }}</Label>
            <Textarea
              v-model="fieldInputs.key_share_groups"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'29, 23'"
            />
          </div>

          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.extensions') }}</Label>
            <Textarea
              v-model="fieldInputs.extensions"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'0x0000, 0x0005, 0x000a'"
            />
          </div>

          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.pointFormats') }}</Label>
            <Textarea
              v-model="fieldInputs.point_formats"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'0'"
            />
          </div>

          <div>
            <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.pskModes') }}</Label>
            <Textarea
              v-model="fieldInputs.psk_modes"
              :rows="2"
              class="font-mono text-xs"
              :placeholder="'1'"
            />
          </div>
        </div>

        <!-- ALPN Protocols - full width -->
        <div>
          <Label class="mb-1 block text-xs">{{ t('admin.tlsFingerprintProfiles.form.alpnProtocols') }}</Label>
          <Textarea
            v-model="fieldInputs.alpn_protocols"
            :rows="2"
            class="font-mono text-xs"
            :placeholder="'h2, http/1.1'"
          />
        </div>
      </form>

      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" type="button" @click="closeFormModal">
            {{ t('common.cancel') }}
          </Button>
          <Button @click="handleSubmit" :disabled="submitting">
            <Icon v-if="submitting" name="refresh" size="sm" class="mr-1 animate-spin" />
            {{ showEditModal ? t('common.update') : t('common.create') }}
          </Button>
        </div>
      </template>
    </BaseDialog>

    <!-- Delete Confirmation -->
    <ConfirmDialog
      :show="showDeleteDialog"
      :title="t('admin.tlsFingerprintProfiles.deleteProfile')"
      :message="t('admin.tlsFingerprintProfiles.deleteConfirmMessage', { name: deletingProfile?.name })"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="showDeleteDialog = false"
    />
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { adminAPI } from '@/api/admin'
import type { TLSFingerprintProfile } from '@/api/admin/tlsFingerprintProfile'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

// eslint-disable-next-line @typescript-eslint/no-unused-vars
void emit // suppress unused warning - emit is used via $emit in template

const { t } = useI18n()
const appStore = useAppStore()

const profiles = ref<TLSFingerprintProfile[]>([])
const loading = ref(false)
const submitting = ref(false)
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteDialog = ref(false)
const editingProfile = ref<TLSFingerprintProfile | null>(null)
const deletingProfile = ref<TLSFingerprintProfile | null>(null)
const yamlInput = ref('')

// Raw string inputs for array fields
const fieldInputs = reactive({
  cipher_suites: '',
  curves: '',
  point_formats: '',
  signature_algorithms: '',
  alpn_protocols: '',
  supported_versions: '',
  key_share_groups: '',
  psk_modes: '',
  extensions: ''
})

const form = reactive({
  name: '',
  description: null as string | null,
  enable_grease: false
})

// Load profiles when dialog opens
watch(() => props.show, (newVal) => {
  if (newVal) {
    loadProfiles()
  }
})

const loadProfiles = async () => {
  loading.value = true
  try {
    profiles.value = await adminAPI.tlsFingerprintProfiles.list()
  } catch (error) {
    appStore.showError(t('admin.tlsFingerprintProfiles.loadFailed'))
    console.error('Error loading TLS fingerprint profiles:', error)
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.name = ''
  form.description = null
  form.enable_grease = false
  fieldInputs.cipher_suites = ''
  fieldInputs.curves = ''
  fieldInputs.point_formats = ''
  fieldInputs.signature_algorithms = ''
  fieldInputs.alpn_protocols = ''
  fieldInputs.supported_versions = ''
  fieldInputs.key_share_groups = ''
  fieldInputs.psk_modes = ''
  fieldInputs.extensions = ''
  yamlInput.value = ''
}

/**
 * Parse YAML output from tls-fingerprint-web and fill form fields.
 * Expected format:
 *   # comment lines
 *   profile_key:
 *     name: "Profile Name"
 *     enable_grease: false
 *     cipher_suites: [4866, 4867, ...]
 *     alpn_protocols: ["h2", "http/1.1"]
 *     ...
 */
const parseYamlInput = () => {
  const text = yamlInput.value.trim()
  if (!text) return

  // Simple YAML parser for flat key-value structure
  // Extracts "key: value" lines, handling arrays like [1, 2, 3] and ["h2", "http/1.1"]
  const lines = text.split('\n')

  let foundName = false

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue

    // Match "key: value" pattern (must have at least 2 leading spaces to be a property)
    const match = trimmed.match(/^(\w+):\s*(.+)$/)
    if (!match) continue

    const [, key, rawValue] = match
    const value = rawValue.trim()

    switch (key) {
      case 'name': {
        // Remove surrounding quotes
        const unquoted = value.replace(/^["']|["']$/g, '')
        if (unquoted) {
          form.name = unquoted
          foundName = true
        }
        break
      }
      case 'enable_grease':
        form.enable_grease = value === 'true'
        break
      case 'cipher_suites':
      case 'curves':
      case 'point_formats':
      case 'signature_algorithms':
      case 'supported_versions':
      case 'key_share_groups':
      case 'psk_modes':
      case 'extensions': {
        // Parse YAML array: [1, 2, 3] — values are decimal integers from tls-fingerprint-web
        const arrMatch = value.match(/^\[(.*)?\]$/)
        if (arrMatch) {
          const inner = arrMatch[1] || ''
          fieldInputs[key as keyof typeof fieldInputs] = inner
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .join(', ')
        }
        break
      }
      case 'alpn_protocols': {
        // Parse string array: ["h2", "http/1.1"]
        const arrMatch = value.match(/^\[(.*)?\]$/)
        if (arrMatch) {
          const inner = arrMatch[1] || ''
          fieldInputs.alpn_protocols = inner
            .split(',')
            .map(s => s.trim().replace(/^["']|["']$/g, ''))
            .filter(s => s.length > 0)
            .join(', ')
        }
        break
      }
    }
  }

  if (foundName) {
    appStore.showSuccess(t('admin.tlsFingerprintProfiles.form.yamlParsed'))
  } else {
    appStore.showError(t('admin.tlsFingerprintProfiles.form.yamlParseFailed'))
  }
}

// Auto-parse on paste event
const handleYamlPaste = () => {
  // Use nextTick to ensure v-model has updated
  setTimeout(() => parseYamlInput(), 50)
}

const closeFormModal = () => {
  showCreateModal.value = false
  showEditModal.value = false
  editingProfile.value = null
  resetForm()
}

// Parse a comma-separated string of numbers supporting both hex (0x...) and decimal
const parseNumericArray = (input: string): number[] => {
  if (!input.trim()) return []
  return input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10))
    .filter(n => !isNaN(n))
}

// Parse a comma-separated string of string values
const parseStringArray = (input: string): string[] => {
  if (!input.trim()) return []
  return input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

// Format a number as hex with 0x prefix and 4-digit padding
const formatHex = (n: number): string => '0x' + n.toString(16).padStart(4, '0')

// Format numeric arrays for display in textarea (null-safe)
const formatNumericArray = (arr: number[] | null | undefined): string => (arr ?? []).map(formatHex).join(', ')

// For point_formats and psk_modes (uint8), show as plain numbers (null-safe)
const formatPlainNumericArray = (arr: number[] | null | undefined): string => (arr ?? []).join(', ')

const handleEdit = (profile: TLSFingerprintProfile) => {
  editingProfile.value = profile
  form.name = profile.name
  form.description = profile.description
  form.enable_grease = profile.enable_grease
  fieldInputs.cipher_suites = formatNumericArray(profile.cipher_suites)
  fieldInputs.curves = formatPlainNumericArray(profile.curves)
  fieldInputs.point_formats = formatPlainNumericArray(profile.point_formats)
  fieldInputs.signature_algorithms = formatNumericArray(profile.signature_algorithms)
  fieldInputs.alpn_protocols = (profile.alpn_protocols ?? []).join(', ')
  fieldInputs.supported_versions = formatNumericArray(profile.supported_versions)
  fieldInputs.key_share_groups = formatPlainNumericArray(profile.key_share_groups)
  fieldInputs.psk_modes = formatPlainNumericArray(profile.psk_modes)
  fieldInputs.extensions = formatNumericArray(profile.extensions)
  showEditModal.value = true
}

const handleDelete = (profile: TLSFingerprintProfile) => {
  deletingProfile.value = profile
  showDeleteDialog.value = true
}

const handleSubmit = async () => {
  if (!form.name.trim()) {
    appStore.showError(t('admin.tlsFingerprintProfiles.form.name') + ' ' + t('common.required'))
    return
  }

  submitting.value = true
  try {
    const data = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      enable_grease: form.enable_grease,
      cipher_suites: parseNumericArray(fieldInputs.cipher_suites),
      curves: parseNumericArray(fieldInputs.curves),
      point_formats: parseNumericArray(fieldInputs.point_formats),
      signature_algorithms: parseNumericArray(fieldInputs.signature_algorithms),
      alpn_protocols: parseStringArray(fieldInputs.alpn_protocols),
      supported_versions: parseNumericArray(fieldInputs.supported_versions),
      key_share_groups: parseNumericArray(fieldInputs.key_share_groups),
      psk_modes: parseNumericArray(fieldInputs.psk_modes),
      extensions: parseNumericArray(fieldInputs.extensions)
    }

    if (showEditModal.value && editingProfile.value) {
      await adminAPI.tlsFingerprintProfiles.update(editingProfile.value.id, data)
      appStore.showSuccess(t('admin.tlsFingerprintProfiles.updateSuccess'))
    } else {
      await adminAPI.tlsFingerprintProfiles.create(data)
      appStore.showSuccess(t('admin.tlsFingerprintProfiles.createSuccess'))
    }

    closeFormModal()
    loadProfiles()
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('admin.tlsFingerprintProfiles.saveFailed'))
    console.error('Error saving TLS fingerprint profile:', error)
  } finally {
    submitting.value = false
  }
}

const confirmDelete = async () => {
  if (!deletingProfile.value) return

  try {
    await adminAPI.tlsFingerprintProfiles.delete(deletingProfile.value.id)
    appStore.showSuccess(t('admin.tlsFingerprintProfiles.deleteSuccess'))
    showDeleteDialog.value = false
    deletingProfile.value = null
    loadProfiles()
  } catch (error: any) {
    appStore.showError(error.response?.data?.detail || t('admin.tlsFingerprintProfiles.deleteFailed'))
    console.error('Error deleting TLS fingerprint profile:', error)
  }
}
</script>
