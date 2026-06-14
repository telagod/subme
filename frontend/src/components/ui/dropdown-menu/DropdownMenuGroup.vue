<script setup lang="ts">
import { DropdownMenuGroup, type DropdownMenuGroupProps } from 'reka-ui'

defineProps<DropdownMenuGroupProps>()
</script>

<template>
  <DropdownMenuGroup>
    <slot />
  </DropdownMenuGroup>
</template>
