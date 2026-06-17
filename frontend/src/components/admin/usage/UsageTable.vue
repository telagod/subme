<template>
  <Card class="usage-table-card flex flex-col overflow-hidden">
    <DataTable
      :columns="columns"
      :data="data"
      :loading="loading"
      :server-side-sort="serverSideSort"
      :default-sort-key="defaultSortKey"
      :default-sort-order="defaultSortOrder"
      :estimate-row-height="88"
      :overscan="12"
      @sort="(key, order) => $emit('sort', key, order)"
    >
        <template #cell-user="{ row }">
          <div class="text-sm">
            <Button
              v-if="row.user?.email"
              variant="link"
              class="h-auto p-0 font-medium text-primary underline decoration-dashed underline-offset-2 transition-colors hover:text-foreground"
              @click="$emit('userClick', row.user_id, row.user?.email)"
              :title="t('admin.usage.clickToViewBalance')"
            >
              {{ row.user.email }}
            </Button>
            <span v-else class="font-medium text-foreground">-</span>
            <Badge v-if="row.user?.deleted_at" variant="outline" class="ml-1 bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px] px-1 py-px leading-tight">
              {{ t('admin.usage.userDeletedBadge') }}
            </Badge>
            <span class="ml-1 text-muted-foreground">#{{ row.user_id }}</span>
          </div>
        </template>

        <template #cell-api_key="{ row }">
          <span class="text-sm text-foreground">{{ row.api_key?.name || '-' }}</span>
        </template>

        <template #cell-account="{ row }">
          <span class="text-sm text-foreground">{{ row.account?.name || '-' }}</span>
        </template>

        <template #cell-model="{ row }">
          <div v-if="row.model_mapping_chain && row.model_mapping_chain.includes('→')" class="space-y-0.5 text-xs">
            <div v-for="(step, i) in row.model_mapping_chain.split('→')" :key="i"
                 class="break-all"
                 :class="i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'"
                 :style="i > 0 ? `padding-left: ${i * 0.75}rem` : ''">
              <span v-if="i > 0" class="mr-0.5">↳</span>{{ step }}
            </div>
          </div>
          <div v-else-if="row.upstream_model && row.upstream_model !== row.model" class="space-y-0.5 text-xs">
            <div class="break-all font-medium text-foreground">
              {{ row.model }}
            </div>
            <div class="break-all text-muted-foreground">
              <span class="mr-0.5">↳</span>{{ row.upstream_model }}
            </div>
          </div>
          <span v-else class="font-medium text-foreground">{{ row.model }}</span>
        </template>

        <template #cell-reasoning_effort="{ row }">
          <span class="text-sm text-foreground">
            {{ formatReasoningEffort(row.reasoning_effort) }}
          </span>
        </template>

        <template #cell-endpoint="{ row }">
          <div class="max-w-[320px] space-y-1 text-xs">
            <div class="break-all text-foreground/85">
              <span class="font-medium text-muted-foreground">{{ t('usage.inbound') }}:</span>
              <span class="ml-1">{{ row.inbound_endpoint?.trim() || '-' }}</span>
            </div>
            <div class="break-all text-foreground/85">
              <span class="font-medium text-muted-foreground">{{ t('usage.upstream') }}:</span>
              <span class="ml-1">{{ row.upstream_endpoint?.trim() || '-' }}</span>
            </div>
          </div>
        </template>

        <template #cell-group="{ row }">
          <Badge v-if="row.group" variant="secondary" class="text-xs font-medium">
            {{ row.group.name }}
          </Badge>
          <span v-else class="text-sm text-muted-foreground">-</span>
        </template>

        <template #cell-stream="{ row }">
          <Badge variant="outline" class="border-transparent text-xs font-medium" :class="getRequestTypeBadgeClass(row)">
            {{ getRequestTypeLabel(row) }}
          </Badge>
        </template>

        <template #cell-billing_mode="{ row }">
          <Badge variant="outline" class="border-transparent text-xs font-medium" :class="getBillingModeBadgeClass(getDisplayBillingMode(row))">
            {{ getBillingModeLabel(getDisplayBillingMode(row), t) }}
          </Badge>
        </template>

        <template #cell-tokens="{ row }">
          <!-- 图片生成请求（仅按次计费时显示图片格式） -->
          <div v-if="isImageUsage(row)" class="flex items-center gap-1.5">
            <svg class="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="font-medium text-foreground">{{ row.image_count }}{{ t('usage.imageUnit') }}</span>
            <span class="text-muted-foreground">({{ formatImageBillingSize(row, t) }})</span>
          </div>
          <!-- Token 请求 -->
          <div v-else class="flex items-center gap-1.5">
            <div class="space-y-1 text-sm">
              <div class="flex items-center gap-2">
                <div class="inline-flex items-center gap-1">
                  <Icon name="arrowDown" size="sm" class="h-3.5 w-3.5 text-emerald-400" />
                  <span class="font-medium text-foreground">{{ row.input_tokens?.toLocaleString() || 0 }}</span>
                </div>
                <div class="inline-flex items-center gap-1">
                  <Icon name="arrowUp" size="sm" class="h-3.5 w-3.5 text-violet-400" />
                  <span class="font-medium text-foreground">{{ row.output_tokens?.toLocaleString() || 0 }}</span>
                </div>
              </div>
              <div v-if="row.cache_read_tokens > 0 || row.cache_creation_tokens > 0" class="flex items-center gap-2">
                <div v-if="row.cache_read_tokens > 0" class="inline-flex items-center gap-1">
                  <svg class="h-3.5 w-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  <span class="font-medium text-sky-400">{{ formatCacheTokens(row.cache_read_tokens) }}</span>
                </div>
                <div v-if="row.cache_creation_tokens > 0" class="inline-flex items-center gap-1">
                  <svg class="h-3.5 w-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  <span class="font-medium text-amber-400">{{ formatCacheTokens(row.cache_creation_tokens) }}</span>
                  <Badge v-if="row.cache_creation_1h_tokens > 0" variant="outline" class="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] px-1 py-px leading-tight">1h</Badge>
                  <Badge v-if="row.cache_ttl_overridden" variant="outline" :title="t('usage.cacheTtlOverriddenHint')" class="bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px] px-1 py-px leading-tight cursor-help">R</Badge>
                </div>
              </div>
              <div v-if="hasImageOutputTokens(row)" class="flex items-center gap-2">
                <div class="inline-flex items-center gap-1">
                  <svg class="h-3.5 w-3.5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span class="font-medium text-pink-400">{{ row.image_output_tokens.toLocaleString() }}</span>
                </div>
              </div>
            </div>
            <!-- Token Detail Tooltip -->
            <div
              class="group relative"
              @mouseenter="showTokenTooltip($event, row)"
              @mouseleave="hideTokenTooltip"
            >
              <div class="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-accent transition-colors group-hover:bg-sky-500/10">
                <Icon name="infoCircle" size="xs" class="text-muted-foreground group-hover:text-foreground" />
              </div>
            </div>
          </div>
        </template>

        <template #cell-cost="{ row }">
          <div class="text-sm">
            <div class="flex items-center gap-1.5">
              <span class="font-medium text-emerald-400">${{ row.actual_cost?.toFixed(6) || '0.000000' }}</span>
              <!-- Cost Detail Tooltip -->
              <div
                class="group relative"
                @mouseenter="showTooltip($event, row)"
                @mouseleave="hideTooltip"
              >
                <div class="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-secondary border border-border transition-colors group-hover:bg-accent">
                  <Icon name="infoCircle" size="xs" class="text-muted-foreground group-hover:text-foreground" />
                </div>
              </div>
            </div>
            <div v-if="row.account_rate_multiplier != null" class="mt-0.5 text-[11px] text-amber-400">
              A ${{ accountBilled(row).toFixed(6) }}
            </div>
          </div>
        </template>

        <template #cell-first_token="{ row }">
          <span v-if="row.first_token_ms != null" class="text-sm text-muted-foreground">{{ formatDuration(row.first_token_ms) }}</span>
          <span v-else class="text-sm text-muted-foreground">-</span>
        </template>

        <template #cell-duration="{ row }">
          <span class="text-sm text-muted-foreground">{{ formatDuration(row.duration_ms) }}</span>
        </template>

        <template #cell-created_at="{ value }">
          <span class="text-sm text-muted-foreground">{{ formatDateTime(value) }}</span>
        </template>

        <template #cell-user_agent="{ row }">
          <span v-if="row.user_agent" class="text-sm text-muted-foreground block max-w-[320px] truncate" :title="row.user_agent">{{ formatUserAgent(row.user_agent) }}</span>
          <span v-else class="text-sm text-muted-foreground">-</span>
        </template>

        <template #cell-ip_address="{ row }">
          <span v-if="row.ip_address" class="text-sm font-mono text-muted-foreground">{{ row.ip_address }}</span>
          <span v-else class="text-sm text-muted-foreground">-</span>
        </template>

        <template #empty><EmptyState :message="t('usage.noRecords')" /></template>
      </DataTable>
  </Card>

  <!-- Token Tooltip Portal -->
  <Teleport to="body">
    <div
      v-if="tokenTooltipVisible"
      class="fixed z-[9999] pointer-events-none -translate-y-1/2"
      :style="{
        left: tokenTooltipPosition.x + 'px',
        top: tokenTooltipPosition.y + 'px'
      }"
    >
      <div class="whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg">
        <div class="space-y-1.5">
          <div>
            <div class="text-xs font-semibold text-foreground mb-1">{{ t('usage.tokenDetails') }}</div>
            <div v-if="tokenTooltipData && tokenTooltipData.input_tokens > 0" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.inputTokens') }}</span>
              <span class="font-medium text-foreground">{{ tokenTooltipData.input_tokens.toLocaleString() }}</span>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.output_tokens > 0 && !hasImageOutputTokens(tokenTooltipData)" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.outputTokens') }}</span>
              <span class="font-medium text-foreground">{{ tokenTooltipData.output_tokens.toLocaleString() }}</span>
            </div>
            <div v-if="tokenTooltipData && hasImageOutputTokens(tokenTooltipData) && textOutputTokens(tokenTooltipData) > 0" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.outputTokens') }}</span>
              <span class="font-medium text-foreground">{{ textOutputTokens(tokenTooltipData).toLocaleString() }}</span>
            </div>
            <div v-if="tokenTooltipData && hasImageOutputTokens(tokenTooltipData)" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('usage.imageOutputTokens') }}</span>
              <span class="font-medium text-pink-400">{{ tokenTooltipData.image_output_tokens.toLocaleString() }}</span>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.cache_creation_tokens > 0">
              <!-- 有 5m/1h 明细时，展开显示 -->
              <template v-if="tokenTooltipData.cache_creation_5m_tokens > 0 || tokenTooltipData.cache_creation_1h_tokens > 0">
                <div v-if="tokenTooltipData.cache_creation_5m_tokens > 0" class="flex items-center justify-between gap-4">
                  <span class="text-muted-foreground flex items-center gap-1.5">
                    {{ t('admin.usage.cacheCreation5mTokens') }}
                    <Badge variant="outline" class="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1 py-px leading-tight">5m</Badge>
                  </span>
                  <span class="font-medium text-foreground">{{ tokenTooltipData.cache_creation_5m_tokens.toLocaleString() }}</span>
                </div>
                <div v-if="tokenTooltipData.cache_creation_1h_tokens > 0" class="flex items-center justify-between gap-4">
                  <span class="text-muted-foreground flex items-center gap-1.5">
                    {{ t('admin.usage.cacheCreation1hTokens') }}
                    <Badge variant="outline" class="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] px-1 py-px leading-tight">1h</Badge>
                  </span>
                  <span class="font-medium text-foreground">{{ tokenTooltipData.cache_creation_1h_tokens.toLocaleString() }}</span>
                </div>
              </template>
              <!-- 无明细时，只显示聚合值 -->
              <div v-else class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('admin.usage.cacheCreationTokens') }}</span>
                <span class="font-medium text-foreground">{{ tokenTooltipData.cache_creation_tokens.toLocaleString() }}</span>
              </div>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.cache_ttl_overridden" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground flex items-center gap-1.5">
                {{ t('usage.cacheTtlOverriddenLabel') }}
                <Badge variant="outline" class="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px] px-1 py-px leading-tight">R-{{ tokenTooltipData.cache_creation_1h_tokens > 0 ? '5m' : '1H' }}</Badge>
              </span>
              <span class="font-medium text-rose-400">{{ tokenTooltipData.cache_creation_1h_tokens > 0 ? t('usage.cacheTtlOverridden1h') : t('usage.cacheTtlOverridden5m') }}</span>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.cache_read_tokens > 0" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.cacheReadTokens') }}</span>
              <span class="font-medium text-foreground">{{ tokenTooltipData.cache_read_tokens.toLocaleString() }}</span>
            </div>
          </div>
          <div class="flex items-center justify-between gap-6 border-t border-border pt-1.5">
            <span class="text-muted-foreground">{{ t('usage.totalTokens') }}</span>
            <span class="font-semibold text-foreground">{{ ((tokenTooltipData?.input_tokens || 0) + (tokenTooltipData?.output_tokens || 0) + (tokenTooltipData?.cache_creation_tokens || 0) + (tokenTooltipData?.cache_read_tokens || 0)).toLocaleString() }}</span>
          </div>
        </div>
        <div class="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-popover border-t-transparent"></div>
      </div>
    </div>
  </Teleport>

  <!-- Cost Tooltip Portal -->
  <Teleport to="body">
    <div
      v-if="tooltipVisible"
      class="fixed z-[9999] pointer-events-none -translate-y-1/2"
      :style="{
        left: tooltipPosition.x + 'px',
        top: tooltipPosition.y + 'px'
      }"
    >
      <div class="whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg">
        <div class="space-y-1.5">
          <!-- Cost Breakdown -->
          <div class="mb-2 border-b border-border pb-1.5">
            <div class="text-xs font-semibold text-foreground mb-1">{{ t('usage.costDetails') }}</div>
            <div v-if="tooltipData && tooltipData.input_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.inputCost') }}</span>
              <span class="font-medium text-foreground">${{ tooltipData.input_cost.toFixed(6) }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.output_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.outputCost') }}</span>
              <span class="font-medium text-foreground">${{ tooltipData.output_cost.toFixed(6) }}</span>
            </div>
            <div v-if="tooltipData && hasImageOutputCost(tooltipData)" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('usage.imageOutputCost') }}</span>
              <span class="font-medium text-pink-400">${{ tooltipData.image_output_cost.toFixed(6) }}</span>
            </div>
            <!-- Token billing: show unit prices per 1M tokens（image 行优先走下方 per-image 分支） -->
            <template v-if="!isImageUsage(tooltipData) && (!tooltipData?.billing_mode || tooltipData.billing_mode === BILLING_MODE_TOKEN)">
              <div v-if="tooltipData && tooltipData.input_tokens > 0" class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.inputTokenPrice') }}</span>
                <span class="font-medium text-sky-400">{{ formatTokenPricePerMillion(tooltipData.input_cost, tooltipData.input_tokens) }} {{ t('usage.perMillionTokens') }}</span>
              </div>
              <div v-if="tooltipData && tooltipData.output_cost > 0 && textOutputTokens(tooltipData) > 0" class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.outputTokenPrice') }}</span>
                <span class="font-medium text-violet-400">{{ formatTokenPricePerMillion(tooltipData.output_cost, textOutputTokens(tooltipData)) }} {{ t('usage.perMillionTokens') }}</span>
              </div>
              <div v-if="tooltipData && hasImageOutputTokens(tooltipData)" class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageOutputTokenPrice') }}</span>
                <span class="font-medium text-pink-400">{{ formatTokenPricePerMillion(tooltipData.image_output_cost ?? 0, tooltipData.image_output_tokens) }} {{ t('usage.perMillionTokens') }}</span>
              </div>
            </template>
            <template v-else-if="tooltipData && isImageUsage(tooltipData)">
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageCount') }}</span>
                <span class="font-medium text-foreground">{{ tooltipData.image_count }}{{ t('usage.imageUnit') }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageBillingSize') }}</span>
                <span class="font-medium text-foreground">{{ formatImageBillingSize(tooltipData, t) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageSizeSource') }}</span>
                <span class="font-medium text-foreground">{{ formatImageSizeSource(tooltipData, t) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageInputSize') }}</span>
                <span class="font-medium text-foreground">{{ formatImageInputSize(tooltipData, t) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageOutputSize') }}</span>
                <span class="font-medium text-foreground">{{ formatImageOutputSize(tooltipData, t) }}</span>
              </div>
              <div v-if="formatImageSizeBreakdown(tooltipData)" class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageSizeBreakdown') }}</span>
                <span class="font-medium text-foreground">{{ formatImageSizeBreakdown(tooltipData) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageUnitPrice') }}</span>
                <span class="font-medium text-sky-400">${{ imageUnitPrice(tooltipData).toFixed(6) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted-foreground">{{ t('usage.imageTotalPrice') }}</span>
                <span class="font-medium text-foreground">${{ tooltipData.total_cost?.toFixed(6) || '0.000000' }}</span>
              </div>
            </template>
            <div v-else class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('usage.unitPrice') }}</span>
              <span class="font-medium text-sky-400">${{ tooltipData?.total_cost?.toFixed(6) || '0.000000' }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.cache_creation_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.cacheCreationCost') }}</span>
              <span class="font-medium text-foreground">${{ tooltipData.cache_creation_cost.toFixed(6) }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.cache_read_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-muted-foreground">{{ t('admin.usage.cacheReadCost') }}</span>
              <span class="font-medium text-foreground">${{ tooltipData.cache_read_cost.toFixed(6) }}</span>
            </div>
          </div>
          <!-- Rate and Summary -->
          <div class="flex items-center justify-between gap-6">
            <span class="text-muted-foreground">{{ t('usage.serviceTier') }}</span>
            <span class="font-semibold text-sky-400">{{ getUsageServiceTierLabel(tooltipData?.service_tier, t) }}</span>
          </div>
          <div class="flex items-center justify-between gap-6">
            <span class="text-muted-foreground">{{ t('usage.rate') }}</span>
            <span class="font-semibold text-foreground">{{ formatMultiplier(tooltipData?.rate_multiplier || 1) }}x</span>
          </div>
          <div class="flex items-center justify-between gap-6">
            <span class="text-muted-foreground">{{ t('usage.original') }}</span>
            <span class="font-medium text-foreground">${{ tooltipData?.total_cost?.toFixed(6) || '0.000000' }}</span>
          </div>
          <div class="flex items-center justify-between gap-6">
            <span class="text-muted-foreground">{{ t('usage.userBilled') }}</span>
            <span class="font-semibold text-emerald-400">${{ tooltipData?.actual_cost?.toFixed(6) || '0.000000' }}</span>
          </div>
          <!-- Account billing (separated from user billing) -->
          <div class="flex items-center justify-between gap-6 border-t border-border pt-1.5">
            <span class="text-muted-foreground">{{ t('usage.accountMultiplier') }}</span>
            <span class="font-semibold text-foreground">{{ formatMultiplier(tooltipData?.account_rate_multiplier ?? 1) }}x</span>
          </div>
          <div class="flex items-center justify-between gap-6">
            <span class="text-muted-foreground">{{ t('usage.accountBilled') }}</span>
            <span class="font-semibold text-emerald-400">
              ${{ accountBilled({
                total_cost: tooltipData?.total_cost,
                account_stats_cost: tooltipData?.account_stats_cost,
                account_rate_multiplier: tooltipData?.account_rate_multiplier,
              }).toFixed(6) }}
            </span>
          </div>
        </div>
        <div class="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-popover border-t-transparent"></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime, formatReasoningEffort } from '@/utils/format'
import { formatCacheTokens, formatMultiplier } from '@/utils/formatters'
import { formatTokenPricePerMillion } from '@/utils/usagePricing'
import { getUsageServiceTierLabel } from '@/utils/usageServiceTier'
import { resolveUsageRequestType } from '@/utils/usageRequestType'
import {
  BILLING_MODE_TOKEN,
  getBillingModeLabel,
  getBillingModeBadgeClass,
  isImageUsage,
  getDisplayBillingMode,
  imageUnitPrice,
} from '@/utils/billingMode'
import {
  formatImageBillingSize,
  formatImageInputSize,
  formatImageOutputSize,
  formatImageSizeBreakdown,
  formatImageSizeSource,
  hasImageOutputTokens,
  textOutputTokens,
  hasImageOutputCost,
} from '@/utils/imageUsage'

/** Compute the account-billed cost for display: (account_stats_cost ?? total_cost) * rate_multiplier */
function accountBilled(row: { total_cost?: number | null; account_stats_cost?: number | null; account_rate_multiplier?: number | null }): number {
  const base = row.account_stats_cost != null ? row.account_stats_cost : (row.total_cost ?? 0)
  const result = base * (row.account_rate_multiplier ?? 1)
  return Number.isNaN(result) ? 0 : result
}


import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import DataTable from '@/components/common/DataTable.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Icon from '@/components/icons/Icon.vue'
import type { AdminUsageLog } from '@/types'
import type { Column } from '@/components/common/types'

interface Props {
  data: AdminUsageLog[]
  loading?: boolean
  columns: Column[]
  serverSideSort?: boolean
  defaultSortKey?: string
  defaultSortOrder?: 'asc' | 'desc'
}

withDefaults(defineProps<Props>(), {
  loading: false,
  serverSideSort: false,
  defaultSortKey: '',
  defaultSortOrder: 'asc'
})
defineEmits<{
  userClick: [userID: number, email?: string]
  sort: [key: string, order: 'asc' | 'desc']
}>()
const { t } = useI18n()

// Tooltip state - cost
const tooltipVisible = ref(false)
const tooltipPosition = ref({ x: 0, y: 0 })
const tooltipData = ref<AdminUsageLog | null>(null)

// Tooltip state - token
const tokenTooltipVisible = ref(false)
const tokenTooltipPosition = ref({ x: 0, y: 0 })
const tokenTooltipData = ref<AdminUsageLog | null>(null)

const getRequestTypeLabel = (row: AdminUsageLog): string => {
  const requestType = resolveUsageRequestType(row)
  if (requestType === 'ws_v2') return t('usage.ws')
  if (requestType === 'stream') return t('usage.stream')
  if (requestType === 'sync') return t('usage.sync')
  return t('usage.unknown')
}

const getRequestTypeBadgeClass = (row: AdminUsageLog): string => {
  const requestType = resolveUsageRequestType(row)
  if (requestType === 'ws_v2') return 'bg-violet-900 text-violet-200'
  if (requestType === 'stream') return 'bg-blue-900 text-blue-200'
  if (requestType === 'sync') return 'bg-accent text-muted-foreground'
  return 'bg-amber-900 text-amber-200'
}



const formatUserAgent = (ua: string): string => {
  return ua
}

const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// Cost tooltip functions
const showTooltip = (event: MouseEvent, row: AdminUsageLog) => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  tooltipData.value = row
  tooltipPosition.value.x = rect.right + 8
  tooltipPosition.value.y = rect.top + rect.height / 2
  tooltipVisible.value = true
}

const hideTooltip = () => {
  tooltipVisible.value = false
  tooltipData.value = null
}

// Token tooltip functions
const showTokenTooltip = (event: MouseEvent, row: AdminUsageLog) => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  tokenTooltipData.value = row
  tokenTooltipPosition.value.x = rect.right + 8
  tokenTooltipPosition.value.y = rect.top + rect.height / 2
  tokenTooltipVisible.value = true
}

const hideTokenTooltip = () => {
  tokenTooltipVisible.value = false
  tokenTooltipData.value = null
}
</script>

<style scoped>
.usage-table-card {
  /*
   * 给表格一个相对视口的高度上界。
   *
   * DataTable 内部根 .table-wrapper 为 flex:1 / min-height:0，需要父级是「有界高度的
   * flex column」才能启用内部滚动、让 @tanstack/vue-virtual 行虚拟化生效。
   * 此前外层是不带高度约束的 .overflow-auto（且非 flex 容器），.table-wrapper 的 flex:1
   * 失效、退化为内容全高，虚拟化器据此判定「整屏可见」从而全量渲染 —— 大 page_size 下
   * 上万 DOM 节点同帧布局，整页卡死。
   *
   * 这里直接用相对视口的 max-height 自带高度源头（不依赖祖先 flex 链是否传导高度），
   * 数据多时表格在框内虚拟滚动，数据少时按内容自然高度，二者皆正常。
   */
  max-height: calc(100vh - 300px);
  min-height: 360px;
}
</style>
