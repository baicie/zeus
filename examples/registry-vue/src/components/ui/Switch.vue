<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  checked?: boolean
  disabled?: boolean
  className?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:checked', value: boolean): void }>()

const thumbClass = computed(() =>
  cn(
    'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
    props.checked ? 'translate-x-4' : 'translate-x-0',
  ),
)
const trackClass = computed(() =>
  cn(
    'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--z-ring))]',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
    props.checked ? 'bg-[hsl(var(--z-primary))]' : 'bg-[hsl(var(--z-input))]',
    props.className,
  ),
)
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :data-state="checked ? 'checked' : 'unchecked'"
    :disabled="disabled"
    :class="trackClass"
    @click="emit('update:checked', !checked)"
  >
    <span :data-state="checked ? 'checked' : 'unchecked'" :class="thumbClass" />
  </button>
</template>
