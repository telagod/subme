<script setup lang="ts">
interface Props {
  fullscreen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  fullscreen: false
})
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:18px;">
    <!-- Header skeleton -->
    <div class="bg-card border border-border rounded-xl" :style="props.fullscreen ? 'padding:28px;' : 'padding:18px;'">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;" class="border-b border-border pb-[14px]">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="height:20px;width:160px;border-radius:4px;" class="animate-pulse bg-muted"></div>
          <div style="height:10px;width:280px;border-radius:4px;opacity:.7;" class="animate-pulse bg-muted"></div>
        </div>
        <div v-if="!props.fullscreen" style="display:flex;flex-wrap:wrap;gap:8px;">
          <div v-for="w in [120,140,120,32,96,96,32]" :key="w" :style="`height:32px;width:${w}px;border-radius:6px;`" class="animate-pulse bg-muted"></div>
        </div>
      </div>
      <div style="margin-top:18px;display:grid;grid-template-columns:5fr 7fr;gap:16px;">
        <div class="bg-muted rounded-xl" style="padding:14px;">
          <div style="display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:center;">
            <div style="height:96px;border-radius:8px;" class="animate-pulse bg-muted/60"></div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="height:14px;width:110px;border-radius:4px;" class="animate-pulse bg-muted/60"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div v-for="i in 4" :key="i" style="height:50px;border-radius:6px;" class="animate-pulse bg-muted/60"></div>
              </div>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-content:center;">
          <div v-for="i in 6" :key="i" class="bg-card border border-border rounded-xl animate-pulse" style="height:72px;"></div>
        </div>
      </div>
    </div>

    <!-- Row: Concurrency + Throughput -->
    <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:16px;">
      <div v-for="(_span,i) in [1,1,2]" :key="i" class="bg-card border border-border rounded-xl p-5 flex flex-col animate-pulse" style="min-height:320px;">
        <div style="height:14px;width:140px;border-radius:4px;margin-bottom:16px;" class="bg-muted"></div>
        <div style="flex:1;border-radius:6px;" class="bg-muted"></div>
      </div>
    </div>

    <!-- Row: Visual Analysis 3-up -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
      <div v-for="i in 3" :key="i" class="bg-card border border-border rounded-xl p-5 flex flex-col animate-pulse" style="min-height:240px;">
        <div style="height:14px;width:140px;border-radius:4px;margin-bottom:16px;" class="bg-muted"></div>
        <div style="flex:1;border-radius:6px;" class="bg-muted"></div>
      </div>
    </div>

    <!-- Alert Events skeleton -->
    <div class="bg-card border border-border rounded-xl" :style="props.fullscreen ? 'padding:28px;' : 'padding:18px;'">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;">
        <div style="height:14px;width:180px;border-radius:4px;" class="animate-pulse bg-muted"></div>
        <div v-if="!props.fullscreen" style="display:flex;gap:8px;">
          <div v-for="w in [120,96,96]" :key="w" :style="`height:32px;width:${w}px;border-radius:6px;`" class="animate-pulse bg-muted"></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div v-for="i in 5" :key="i" class="bg-muted rounded-xl animate-pulse" style="padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
            <div style="height:10px;width:200px;border-radius:3px;" class="bg-muted/60"></div>
            <div style="height:10px;width:280px;border-radius:3px;opacity:.7;" class="bg-muted/60"></div>
          </div>
          <div style="height:26px;width:72px;border-radius:6px;" class="bg-muted/60"></div>
        </div>
      </div>
    </div>
  </div>
</template>
