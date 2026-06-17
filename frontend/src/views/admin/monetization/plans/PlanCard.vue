<template>
  <div
    class="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-card px-4 pb-3.5 pt-[18px] shadow-md transition-colors duration-150 hover:border-primary/30"
    :class="{
      'opacity-60 grayscale-[30%]': !plan.for_sale,
      'border-destructive shadow-[0_0_0_1px_rgba(242,92,105,0.15)]': groupMissing,
    }"
  >
    <!-- Accent bar: primary tint for platform groups, muted for none -->
    <div
      class="absolute left-0 right-0 top-0 h-[3px] rounded-t-xl"
      :class="group ? 'bg-gradient-to-r from-primary/55 to-primary/25' : 'bg-border'"
    />

    <!-- Order tag — top-left, avoids overlapping header controls -->
    <div
      v-if="plan.sort_order != null"
      class="absolute left-2.5 top-2.5 rounded border border-border bg-muted px-[5px] py-px text-[9.5px] font-bold tabular-nums tracking-[0.03em] text-muted-foreground"
      style="pointer-events:none;line-height:1.4"
    >
      #{{ plan.sort_order + 1 }}
    </div>

    <!-- Header row: name + status badge | sort arrows -->
    <div
      class="mt-1 flex items-start justify-between gap-2"
      :class="{ 'pl-[30px]': plan.sort_order != null }"
    >
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <span class="truncate text-sm font-bold text-foreground">{{ plan.name }}</span>
        <Badge :variant="plan.for_sale ? 'default' : 'outline'" class="flex-shrink-0 text-[10px]">
          {{ plan.for_sale ? t('admin.plansCatalog.onSale') : t('admin.plansCatalog.offSale') }}
        </Badge>
      </div>
      <div class="flex flex-shrink-0 flex-col gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-[18px] w-[22px] text-muted-foreground"
          :disabled="isFirst"
          @click="emit('move-up')"
          :title="t('admin.plansCatalog.moveUp')"
        >
          <Icon name="chevronUp" size="xs" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-[18px] w-[22px] text-muted-foreground"
          :disabled="isLast"
          @click="emit('move-down')"
          :title="t('admin.plansCatalog.moveDown')"
        >
          <Icon name="chevronDown" size="xs" />
        </Button>
      </div>
    </div>

    <!-- Price block -->
    <div class="flex items-baseline gap-2">
      <span class="text-[26px] font-bold text-primary">${{ plan.price.toFixed(2) }}</span>
      <span
        v-if="plan.original_price && plan.original_price > plan.price"
        class="font-mono text-xs tabular-nums text-muted-foreground line-through"
      >
        ${{ plan.original_price.toFixed(2) }}
      </span>
      <Badge variant="outline" class="ml-auto whitespace-nowrap bg-primary/15 text-primary border-transparent text-[11px]">
        {{ periodLabel }}
      </Badge>
    </div>

    <!-- Description -->
    <p
      v-if="plan.description"
      class="m-0 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground"
    >
      {{ plan.description }}
    </p>

    <!-- Key config chips -->
    <div class="flex flex-wrap gap-[5px]">
      <template v-if="groupMissing">
        <Badge variant="outline" class="bg-destructive/10 text-destructive border-destructive/15 text-[11px]">
          {{ t('admin.plansCatalog.groupMissingFmt', { id: plan.group_id }) }}
        </Badge>
      </template>
      <template v-else-if="group">
        <GroupBadge
          :name="group.name"
          :platform="group.platform"
          :rate-multiplier="group.rate_multiplier"
          :subscription-type="group.subscription_type"
        />
      </template>

      <Badge
        v-if="group?.daily_limit_usd != null"
        variant="outline"
        class="bg-muted text-muted-foreground border-border text-[11px]"
      >
        {{ t('admin.plansCatalog.dailyLimitFmt', { v: group.daily_limit_usd }) }}
      </Badge>
      <Badge
        v-else-if="group"
        variant="outline"
        class="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 text-[11px]"
      >
        {{ t('admin.plansCatalog.unlimited') }}
      </Badge>
    </div>

    <!-- Features list (top 3 + overflow count) -->
    <ul v-if="plan.features?.length" class="m-0 flex flex-col gap-1 p-0 list-none">
      <li v-for="(f, i) in plan.features.slice(0, 3)" :key="i" class="flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
        <span class="mt-[5px] h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
        {{ f }}
      </li>
      <li v-if="plan.features.length > 3" class="pl-2.5 text-[10.5px] text-muted-foreground/70">
        {{ t('admin.plansCatalog.moreFeaturesFmt', { n: plan.features.length - 3 }) }}
      </li>
    </ul>

    <!-- Footer: on-sale toggle | separator | edit / delete -->
    <div class="mt-auto flex items-center gap-2.5 border-t border-border pt-2.5">
      <Switch
        :model-value="plan.for_sale"
        @update:model-value="emit('toggle-sale')"
        :title="plan.for_sale ? t('admin.plansCatalog.toggleOnTitle') : t('admin.plansCatalog.toggleOffTitle')"
        :aria-label="plan.for_sale ? t('admin.plansCatalog.toggleOnTitle') : t('admin.plansCatalog.toggleOffTitle')"
      />
      <span class="whitespace-nowrap text-[11px] text-muted-foreground">
        {{ plan.for_sale ? t('admin.plansCatalog.onSale') : t('admin.plansCatalog.offSale') }}
      </span>

      <span class="h-4 w-px flex-shrink-0 bg-border" aria-hidden="true" />

      <div class="ml-auto flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          class="h-auto gap-1 whitespace-nowrap px-[9px] py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          @click="emit('edit')"
          :title="t('common.edit')"
        >
          <Icon name="edit" size="sm" />
          <span>{{ t('common.edit') }}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          class="h-auto gap-1 whitespace-nowrap px-[9px] py-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          @click="emit('delete')"
          :title="t('common.delete')"
        >
          <Icon name="trash" size="sm" />
          <span>{{ t('common.delete') }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SubscriptionPlan } from '@/types/payment'
import type { AdminGroup } from '@/types'
import Icon from '@/components/icons/Icon.vue'
import GroupBadge from '@/components/common/GroupBadge.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  plan: SubscriptionPlan
  group?: AdminGroup
  groupMissing?: boolean
  isFirst: boolean
  isLast: boolean
}>()

const emit = defineEmits<{
  'toggle-sale': []
  edit: []
  delete: []
  'move-up': []
  'move-down': []
}>()

const { t } = useI18n()

const periodLabel = computed(() => {
  const unit = props.plan.validity_unit || 'days'
  const n = props.plan.validity_days
  if (unit === 'months') return t('admin.plansCatalog.periodMonths', { n })
  if (unit === 'weeks') return t('admin.plansCatalog.periodWeeks', { n })
  return t('admin.plansCatalog.periodDays', { n })
})
</script>
