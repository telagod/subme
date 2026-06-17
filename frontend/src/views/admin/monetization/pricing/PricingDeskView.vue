<template>
  <AppLayout>
    <div class="flex flex-col gap-3.5">
      <!-- 页头 -->
      <div class="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="m-0 text-[21px] font-bold tracking-[.01em] text-foreground">{{ t('admin.pricingDesk.title') }}</h1>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('admin.pricingDesk.desc') }}</p>
        </div>
        <div class="flex items-center gap-2">
          <!-- 刷新 -->
          <Button
            variant="outline"
            size="sm"
            :disabled="loading"
            @click="fetchAll"
          >
            <RefreshCwIcon class="h-3.5 w-3.5 flex-shrink-0" :class="loading ? 'pd-spinning' : ''" />
            {{ t('admin.pricingDesk.refresh') }}
          </Button>

          <!-- 价格模拟器 -->
          <Button
            size="sm"
            @click="simulatorVisible = true"
          >
            <CalculatorIcon class="h-3.5 w-3.5 flex-shrink-0 text-primary-foreground" />
            {{ t('admin.pricingDesk.simulatorBtn') }}
          </Button>
        </div>
      </div>

      <!-- 同步成功 toast -->
      <Transition name="pd-toast">
        <div v-if="syncToast" class="rise rounded-[10px] border border-emerald-500/50 bg-emerald-500/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-500">
          {{ t('admin.pricingDesk.syncSuccess', { n: syncToast }) }}
        </div>
      </Transition>

      <!-- 错误提示 -->
      <div v-if="error" class="rise rounded-[10px] border border-destructive/50 bg-destructive/10 px-3.5 py-2.5 text-[12.5px] text-destructive">
        {{ t('admin.pricingDesk.loadFailed') }}{{ error }}
      </div>

      <!-- 矩阵表格 -->
      <MatrixTable
        :loading="loading"
        :platforms="platforms"
        :active-groups="activeGroups"
        :matrix="matrix"
        :official-pricing-cache="officialPricingCache as Record<string, OfficialPricing | 'loading'>"
        :sync-loading="syncLoading"
        @hover-model="ensureOfficialPricing"
        @update-multiplier="handleUpdateMultiplier"
        @sync-catalog="handleSyncCatalog"
        @open-detail="handleOpenDetail"
      />

      <!-- 价格模拟器抽屉 -->
      <PriceSimulator
        :visible="simulatorVisible"
        :platforms="platforms"
        :matrix="matrix"
        :active-groups="activeGroups"
        :official-pricing-cache="officialPricingCache as Record<string, OfficialPricing | 'loading'>"
        @close="simulatorVisible = false"
        @need-official-pricing="ensureOfficialPricing"
      />

      <!-- 供应商核对抽屉 -->
      <ProviderVerifyDrawer
        :open="detailDrawerVisible"
        :slug="detailSlug"
        :model-name="detailModel"
        @close="detailDrawerVisible = false"
        @override-saved="handleOverrideSaved"
      />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RefreshCwIcon, CalculatorIcon } from 'lucide-vue-next'
import AppLayout from '@/components/layout/AppLayout.vue'
import { Button } from '@/components/ui/button'
import MatrixTable from './MatrixTable.vue'
import PriceSimulator from './PriceSimulator.vue'
import ProviderVerifyDrawer from './ProviderVerifyDrawer.vue'
import { usePricingMatrix } from './usePricingMatrix'
import type { OfficialPricing } from './usePricingMatrix'

const { t } = useI18n()
const {
  loading,
  error,
  matrix,
  platforms,
  activeGroups,
  officialPricingCache,
  fetchAll,
  ensureOfficialPricing,
  updateGroupMultiplier,
  syncCatalog,
  invalidateOfficialPricingForModel
} = usePricingMatrix()

const simulatorVisible = ref(false)

// 供应商核对抽屉状态
const detailDrawerVisible = ref(false)
const detailSlug = ref('')
const detailModel = ref('')

// 同步目录状态
const syncLoading = ref(false)
const syncToast = ref<number | null>(null)
let syncToastTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => fetchAll())

async function handleUpdateMultiplier(groupId: number, value: number) {
  try {
    await updateGroupMultiplier(groupId, value)
  } catch (e) {
    console.error('更新倍率失败', e)
  }
}

async function handleSyncCatalog() {
  if (syncLoading.value) return
  syncLoading.value = true
  try {
    const result = await syncCatalog()
    // 展示 toast
    syncToast.value = result.synced
    if (syncToastTimer) clearTimeout(syncToastTimer)
    syncToastTimer = setTimeout(() => { syncToast.value = null }, 3500)
  } catch (e) {
    console.error('同步目录失败', e)
  } finally {
    syncLoading.value = false
  }
}

function handleOpenDetail(payload: { slug: string; model: string }) {
  detailSlug.value = payload.slug
  detailModel.value = payload.model
  detailDrawerVisible.value = true
}

/** 覆盖保存/删除后失效官方价缓存，刷新计价台的基准价展示 */
function handleOverrideSaved(modelId: string) {
  void invalidateOfficialPricingForModel(modelId)
}
</script>

<style scoped>
.rise { opacity: 0; transform: translateY(8px); animation: rise .45s cubic-bezier(.22,.68,0,1.2) forwards; }
@keyframes rise { to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .rise { animation: none; opacity: 1; transform: none; } .pd-spinning { animation: none; } }

.pd-spinning { animation: pd-spin 1s linear infinite; }
@keyframes pd-spin { to { transform: rotate(360deg); } }

.pd-toast-enter-active { transition: opacity .22s, transform .22s; }
.pd-toast-leave-active { transition: opacity .35s; }
.pd-toast-enter-from { opacity: 0; transform: translateY(-6px); }
.pd-toast-leave-to { opacity: 0; }
</style>
