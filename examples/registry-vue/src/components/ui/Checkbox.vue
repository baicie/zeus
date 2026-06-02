<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  checked?: boolean
  disabled?: boolean
  className?: string
  id?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:checked', value: boolean): void }>()

const className = computed(() =>
  cn(
    'peer h-4 w-4 shrink-0 rounded-sm border border-[hsl(var(--z-primary))]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--z-ring))]',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:bg-[hsl(var(--z-primary))] data-[state=checked]:text-[hsl(var(--z-primary-foreground))]',
    props.className,
  ),
)
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="checked"
    :data-state="checked ? 'checked' : 'unchecked'"
    :disabled="disabled"
    :id="id"
    :class="className"
    @click="emit('update:checked', !checked)"
  >
    <svg
      v-if="checked"
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </button>
</template>
