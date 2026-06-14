<template>
  <div class="flex flex-col gap-2.5 px-5 py-4">
    <!-- Tag chip container -->
    <div
      class="rounded-[10px] border border-input bg-background px-2.5 py-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15"
    >
      <div class="flex flex-wrap items-center gap-1.5">
        <span
          v-for="suffix in localTags"
          :key="suffix"
          class="inline-flex items-center gap-1 rounded-md border border-border bg-muted py-[3px] pl-2.5 pr-2"
        >
          <span class="whitespace-nowrap font-mono text-[12px] text-foreground">{{ suffix }}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-4 w-4 rounded p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            @click="removeTag(suffix)"
          >
            <svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </span>

        <!-- inline input -->
        <div class="flex min-w-[180px] flex-1">
          <Input
            v-model="draft"
            type="text"
            class="h-auto flex-1 border-none bg-transparent py-[3px] px-1 font-mono text-[12.5px] text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
            :placeholder="localTags.length === 0 ? t('admin.settings.registration.emailSuffixWhitelistPlaceholder') : ''"
            @input="onDraftInput"
            @keydown="onDraftKeydown"
            @blur="commitDraft"
            @paste.prevent="onPaste"
          />
        </div>
      </div>
    </div>

    <p class="m-0 text-[11px] leading-[1.55] text-muted-foreground">{{ t('admin.settings.registration.emailSuffixWhitelistInputHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  isRegistrationEmailSuffixDomainValid,
  normalizeRegistrationEmailSuffixDomain,
  normalizeRegistrationEmailSuffixDomains,
  parseRegistrationEmailSuffixWhitelistInput,
} from '@/utils/registrationEmailPolicy'

const { t } = useI18n()

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

// Prefer dirty form state over saved settings
const activeSource = computed(() => props.formValues ?? props.settings)

// ── Separator keys ─────────────────────────────────────────────────────────────
const separatorKeys = new Set([' ', ',', '，', 'Enter', 'Tab'])

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseTagsFromSource(src: Record<string, unknown>): string[] {
  const raw = src['registration_email_suffix_whitelist']
  if (!Array.isArray(raw)) return []
  return normalizeRegistrationEmailSuffixDomains(raw as string[])
}

// ── Local state ────────────────────────────────────────────────────────────────

const localTags = ref<string[]>(parseTagsFromSource(activeSource.value))
const draft = ref('')

// Re-sync when parent resets (discard) or initial settings load
watch(
  () => activeSource.value['registration_email_suffix_whitelist'],
  (incoming) => {
    const next = normalizeRegistrationEmailSuffixDomains(
      Array.isArray(incoming) ? (incoming as string[]) : [],
    )
    if (JSON.stringify(next) !== JSON.stringify(localTags.value)) {
      localTags.value = next
    }
  },
  { deep: true },
)

// ── Emit ───────────────────────────────────────────────────────────────────────

function emitTags() {
  // Mirror the save transform in SettingsView: wildcard domains are kept as-is,
  // exact domains get @-prefixed so the backend's existing format is preserved.
  const canonical = localTags.value.map((suffix) =>
    suffix.startsWith('*.') ? suffix : `@${suffix}`,
  )
  emit('update:field', 'registration_email_suffix_whitelist', canonical)
}

// ── Tag management ─────────────────────────────────────────────────────────────

function addTag(raw: string) {
  const suffix = normalizeRegistrationEmailSuffixDomain(raw)
  if (!isRegistrationEmailSuffixDomainValid(suffix) || localTags.value.includes(suffix)) return
  localTags.value = [...localTags.value, suffix]
  emitTags()
}

function removeTag(suffix: string) {
  localTags.value = localTags.value.filter((t) => t !== suffix)
  emitTags()
}

function commitDraft() {
  if (!draft.value) return
  addTag(draft.value)
  draft.value = ''
}

// ── Event handlers ─────────────────────────────────────────────────────────────

function onDraftInput() {
  draft.value = normalizeRegistrationEmailSuffixDomain(draft.value)
}

function onDraftKeydown(event: KeyboardEvent) {
  if (event.isComposing) return

  if (separatorKeys.has(event.key)) {
    event.preventDefault()
    commitDraft()
    return
  }

  if (event.key === 'Backspace' && !draft.value && localTags.value.length > 0) {
    localTags.value = localTags.value.slice(0, -1)
    emitTags()
  }
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') || ''
  if (!text.trim()) return
  const tokens = parseRegistrationEmailSuffixWhitelistInput(text)
  for (const token of tokens) {
    addTag(token)
  }
}
</script>
