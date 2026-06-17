<script setup lang="ts">
import { DropdownMenuPortal, type DropdownMenuPortalProps } from 'reka-ui'

defineProps<DropdownMenuPortalProps>()
</script>

<template>
  <DropdownMenuPortal>
    <slot />
  </DropdownMenuPortal>
</template>
