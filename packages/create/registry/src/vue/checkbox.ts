import type { RegistryItem } from '../schema'

export const vueCheckbox: RegistryItem = {
  name: 'checkbox',
  type: 'component',
  framework: 'vue',
  description: 'Vue Checkbox component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/Checkbox.vue',
      content: `<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    checked?: boolean
    disabled?: boolean
    class?: string
  }>(),
  {
    checked: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:checked': [value: boolean]
}>()

function handleChange(e: Event) {
  const target = e.target as HTMLInputElement
  emit('update:checked', target.checked)
}
</script>

<template>
  <label
    :class="cn(
      [
        'inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm',
        'border border-[hsl(var(--z-primary))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--z-ring))]',
        'data-[state=checked]:bg-[hsl(var(--z-primary))] data-[state=checked]:text-[hsl(var(--z-primary-foreground))]',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
      ].join(' '),
      props.class,
    )"
  >
    <input
      type="checkbox"
      :checked="checked"
      :disabled="disabled"
      class="sr-only"
      @change="handleChange"
    >
    <span
      v-if="checked"
      class="flex h-full w-full items-center justify-center text-current"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-3 w-3"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  </label>
</template>
`,
    },
  ],
}
