<template>
  <!-- 小弹窗：调余额 -->
  <Dialog :open="open" @update:open="val => !val && $emit('close')">
    <DialogContent
      class="w-[340px] max-w-[calc(100vw-2rem)] gap-0 p-0"
      :aria-label="t('admin.balanceAdjustPopover.title')"
      @keydown.esc.stop="$emit('close')"
    >
      <!-- Header -->
      <DialogHeader class="border-b border-border px-[18px] pb-3 pt-4">
        <DialogTitle class="text-sm font-bold text-foreground">
          {{ t('admin.balanceAdjustPopover.title') }}
        </DialogTitle>
      </DialogHeader>

      <!-- Body -->
      <div class="flex flex-col gap-3.5 px-[18px] py-4">
        <!-- 当前余额 -->
        <div class="text-[12.5px] text-muted-foreground">
          {{ t('admin.balanceAdjustPopover.currentBalance') }}<span class="font-mono font-semibold text-foreground">${{ fmtBal(currentBalance) }}</span>
        </div>

        <!-- 操作选择 -->
        <div class="flex flex-col gap-1.5">
          <Label class="text-[11.5px] text-muted-foreground">{{ t('admin.balanceAdjustPopover.operationLabel') }}</Label>
          <div class="flex gap-1.5">
            <Button
              v-for="op in ops"
              :key="op.value"
              type="button"
              size="sm"
              :variant="form.operation === op.value ? 'default' : 'outline'"
              class="flex-1 text-xs"
              @click="form.operation = op.value"
            >{{ op.label }}</Button>
          </div>
        </div>

        <!-- 金额输入 -->
        <div class="flex flex-col gap-1.5">
          <Label class="text-[11.5px] text-muted-foreground">{{ t('admin.balanceAdjustPopover.amountLabel') }}</Label>
          <div class="relative">
            <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 select-none text-[13px] text-muted-foreground">$</span>
            <Input
              ref="amountRef"
              v-model.number="form.amount"
              type="number"
              step="any"
              min="0"
              class="pl-7 font-mono text-[13px]"
              placeholder="0.00"
            />
          </div>
        </div>

        <!-- 预览 -->
        <div v-if="form.operation !== 'set'" class="text-[12.5px] text-muted-foreground py-1">
          → <span class="font-mono font-semibold text-foreground">${{ fmtBal(previewBalance) }}</span>
        </div>

        <!-- 备注 -->
        <div class="flex flex-col gap-1.5">
          <Label class="text-[11.5px] text-muted-foreground">{{ t('admin.balanceAdjustPopover.notesLabel') }}</Label>
          <Textarea
            v-model="form.notes"
            :rows="2"
            class="resize-none text-[12.5px]"
            :placeholder="t('admin.balanceAdjustPopover.notesPlaceholder')"
          />
        </div>
      </div>

      <!-- Footer -->
      <DialogFooter class="border-t border-border px-[18px] py-3 gap-2">
        <Button variant="outline" size="sm" @click="$emit('close')">
          {{ t('admin.balanceAdjustPopover.cancelBtn') }}
        </Button>
        <Button
          size="sm"
          :disabled="submitting || !form.amount"
          @click="submit"
        >
          {{ submitting ? t('admin.balanceAdjustPopover.submitting') : t('admin.balanceAdjustPopover.confirmBtn') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores/app'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  open: boolean
  userId: number
  currentBalance: number
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const { t } = useI18n()
const appStore = useAppStore()
const amountRef = ref<HTMLInputElement | null>(null)
const submitting = ref(false)
const form = reactive({ amount: 0, operation: 'add' as 'add' | 'subtract' | 'set', notes: '' })
const ops = computed<{ value: 'add' | 'subtract' | 'set'; label: string }[]>(() => [
  { value: 'add', label: t('admin.balanceAdjustPopover.opAdd') },
  { value: 'subtract', label: t('admin.balanceAdjustPopover.opSubtract') },
  { value: 'set', label: t('admin.balanceAdjustPopover.opSet') },
])

const previewBalance = computed(() => {
  const a = form.amount || 0
  if (form.operation === 'add') return props.currentBalance + a
  if (form.operation === 'subtract') return props.currentBalance - a
  return a
})

function fmtBal(v: number) {
  if (!v && v !== 0) return '0.00'
  const s = v.toFixed(8).replace(/\.?0+$/, '')
  const parts = s.split('.')
  if (parts.length === 1) return s + '.00'
  if (parts[1].length < 2) return s + '0'
  return s
}

watch(() => props.open, async (v) => {
  if (v) {
    form.amount = 0; form.operation = 'add'; form.notes = ''
    await nextTick()
    amountRef.value?.focus()
  }
})

async function submit() {
  if (!form.amount || form.amount <= 0) {
    appStore.showError(t('admin.balanceAdjustPopover.invalidAmount'))
    return
  }
  submitting.value = true
  try {
    await adminAPI.users.updateBalance(props.userId, form.amount, form.operation, form.notes)
    appStore.showSuccess(t('admin.balanceAdjustPopover.adjusted'))
    emit('updated')
    emit('close')
  } catch (e: any) {
    appStore.showError(e?.response?.data?.detail || t('admin.balanceAdjustPopover.operationFailed'))
  } finally { submitting.value = false }
}
</script>
