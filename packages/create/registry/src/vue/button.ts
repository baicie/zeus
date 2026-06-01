import type { RegistryItem } from '../schema'

export const vueButton: RegistryItem = {
  name: 'button',
  type: 'component',
  framework: 'vue',
  description: 'Vue Button component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/Button.vue',
      content: `<script setup lang="ts">
import { computed } from 'vue'
import { ZButton } from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link'
    size?: 'sm' | 'md' | 'lg' | 'icon'
    disabled?: boolean
    class?: string
  }>(),
  {
    variant: 'default',
    size: 'md',
    disabled: false,
  },
)

const classes = computed(() => {
  const variants = {
    default:
      'bg-[hsl(var(--z-primary))] text-[hsl(var(--z-primary-foreground))] shadow hover:opacity-90',
    destructive:
      'bg-[hsl(var(--z-destructive))] text-[hsl(var(--z-destructive-foreground))] shadow-sm hover:opacity-90',
    outline:
      'border border-[hsl(var(--z-input))] bg-transparent shadow-sm hover:bg-[hsl(var(--z-muted))]',
    secondary:
      'bg-[hsl(var(--z-secondary))] text-[hsl(var(--z-secondary-foreground))] shadow-sm hover:opacity-90',
    ghost:
      'hover:bg-[hsl(var(--z-muted))] hover:text-[hsl(var(--z-foreground))]',
    link:
      'text-[hsl(var(--z-primary))] underline-offset-4 hover:underline',
  }

  const sizes = {
    sm: 'h-8 rounded-md px-3 text-xs',
    md: 'h-9 px-4 py-2',
    lg: 'h-10 rounded-md px-8',
    icon: 'h-9 w-9',
  }

  return cn(
    [
      'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium',
      'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--z-ring))]',
      'disabled:pointer-events-none disabled:opacity-50',
    ].join(' '),
    variants[props.variant],
    sizes[props.size],
    props.class,
  )
})
</script>

<template>
  <ZButton
    :variant="variant"
    :size="size"
    :disabled="disabled"
    :class="classes"
  >
    <slot />
  </ZButton>
</template>
`,
    },
  ],
}
