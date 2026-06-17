<template>
  <div class="flex flex-col gap-4 px-5 py-4">
    <!-- header row -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <p class="m-0 text-[11.5px] leading-relaxed text-muted-foreground">
        {{ t('admin.settings.agreement.docsHint') }}
      </p>
      <Button type="button" variant="outline" size="sm" class="gap-1.5" @click="addDocument">
        <Icon name="plus" size="sm" class="h-3.5 w-3.5" />
        {{ t('admin.settings.agreement.addDoc') }}
      </Button>
    </div>

    <!-- document cards -->
    <div class="flex flex-col gap-3">
      <div
        v-for="(doc, index) in localDocs"
        :key="doc.id || index"
        class="overflow-hidden rounded-[10px] border border-border bg-card"
      >
        <!-- card header -->
        <div class="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-b from-white/[.018] to-transparent px-3.5 py-2.5">
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
              <Icon :name="index === 1 ? 'shield' : index === 2 ? 'globe' : index === 3 ? 'cog' : 'document'" size="sm" />
            </span>
            <div class="min-w-0">
              <p class="m-0 mb-px overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-foreground">
                {{ doc.title || t('admin.settings.agreement.unnamedDoc') }}
              </p>
              <p class="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground">
                /legal/{{ doc.id || '…' }}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-[30px] w-[30px] flex-shrink-0 text-muted-foreground hover:border hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive disabled:opacity-35"
            :disabled="agreementEnabled && localDocs.length <= 1"
            @click="removeDocument(index)"
          >
            <Icon name="trash" size="sm" />
          </Button>
        </div>

        <!-- fields grid -->
        <div class="grid grid-cols-2 gap-3 p-3.5 max-[600px]:grid-cols-1">
          <div>
            <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
              {{ t('admin.settings.agreement.docTitle') }}
            </Label>
            <Input
              v-model="doc.title"
              type="text"
              :placeholder="t('admin.settings.agreement.docTitlePlaceholder')"
              @input="emitUpdate"
            />
          </div>
          <div>
            <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
              {{ t('admin.settings.agreement.docSlug') }}
            </Label>
            <div class="flex overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
              <span class="inline-flex flex-shrink-0 items-center border-r border-input bg-muted px-2.5 text-[12.5px] whitespace-nowrap text-muted-foreground">
                /legal/
              </span>
              <Input
                v-model="doc.id"
                type="text"
                class="min-w-0 flex-1 rounded-none border-none bg-transparent px-3 py-[7px] text-[13px] text-foreground shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
                placeholder="usage-policy"
                @input="emitUpdate"
              />
            </div>
          </div>
        </div>

        <!-- content textarea -->
        <div class="flex flex-col gap-1 px-3.5 pb-3.5">
          <Label class="mb-1 block text-[11.5px] font-medium text-muted-foreground">
            {{ t('admin.settings.agreement.docContent') }}
          </Label>
          <Textarea
            v-model="doc.content_md"
            rows="8"
            class="resize-y font-mono text-xs"
            :placeholder="t('admin.settings.agreement.docContentPlaceholder')"
            @input="emitUpdate"
          />
        </div>
      </div>
    </div>

    <p v-if="localDocs.length === 0" class="m-0 text-[13px] text-muted-foreground">
      {{ t('admin.settings.agreement.noDocs') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const { t } = useI18n()

interface AgreementDoc {
  id: string
  title: string
  content_md: string
}

const props = defineProps<{
  settings: Record<string, unknown>
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:field': [key: string, value: unknown]
}>()

// ── helpers ────────────────────────────────────────────────────────────────────
/** Prefer formValues (current dirty state) over savedSettings */
const activeSource = computed(() => props.formValues ?? props.settings)

function cloneDocs(src: Record<string, unknown>): AgreementDoc[] {
  const raw = src['login_agreement_documents']
  if (!Array.isArray(raw)) return []
  return raw.map((d) => ({ ...(d as AgreementDoc) }))
}

// ── local state — single source of truth for this component ───────────────────
const localDocs = ref<AgreementDoc[]>(cloneDocs(activeSource.value))

// Re-sync when parent resets (discard) or initial load completes
watch(
  () => activeSource.value['login_agreement_documents'],
  (incoming) => {
    if (JSON.stringify(incoming) !== JSON.stringify(localDocs.value)) {
      localDocs.value = cloneDocs(activeSource.value)
    }
  },
  { deep: true },
)

const agreementEnabled = computed(() => !!activeSource.value['login_agreement_enabled'])

function emitUpdate() {
  emit('update:field', 'login_agreement_documents', localDocs.value.map((d) => ({ ...d })))
}

function addDocument() {
  localDocs.value = [...localDocs.value, { id: '', title: '', content_md: '' }]
  emitUpdate()
}

function removeDocument(index: number) {
  localDocs.value = localDocs.value.filter((_, i) => i !== index)
  emitUpdate()
}
</script>
