import type { RegistryItem } from '../schema'

export const vueDialog: RegistryItem = {
  name: 'dialog',
  type: 'component',
  framework: 'vue',
  description: 'Vue Dialog components built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/Dialog.vue',
      content: `<script setup lang="ts">
import {
  ZDialog,
  ZDialogContent,
  ZDialogDescription,
  ZDialogTitle,
  ZDialogTrigger,
} from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    open?: boolean
    class?: string
  }>(),
  {
    open: false,
    class: undefined,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

function handleOpenChange(open: boolean) {
  emit('update:open', open)
}
</script>

<template>
  <ZDialog
    :open="open"
    @open-change="handleOpenChange"
  >
    <slot />
  </ZDialog>
</template>
`,
    },
    {
      path: 'src/components/ui/DialogTrigger.vue',
      content: `<script setup lang="ts">
import { ZDialogTrigger } from '@zeus-ui/headless/vue'

const props = withDefaults(
  defineProps<{
    as?: string
    class?: string
  }>(),
  {
    as: 'button',
    class: undefined,
  },
)
</script>

<template>
  <ZDialogTrigger
    :as="as"
    :class="props.class"
  >
    <slot />
  </ZDialogTrigger>
</template>
`,
    },
    {
      path: 'src/components/ui/DialogContent.vue',
      content: `<script setup lang="ts">
import { ZDialogContent } from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    class?: string
  }>(),
  {
    class: undefined,
  },
)
</script>

<template>
  <ZDialogContent
    :class="cn(
      [
        'fixed inset-0 z-50',
        'data-[state=closed]:hidden',
        '[&_[part=overlay]]:fixed [&_[part=overlay]]:inset-0',
        '[&_[part=overlay]]:bg-black/50',
        '[&_[part=panel]]:fixed [&_[part=panel]]:left-1/2 [&_[part=panel]]:top-1/2',
        '[&_[part=panel]]:w-full [&_[part=panel]]:max-w-lg',
        '[&_[part=panel]]:-translate-x-1/2 [&_[part=panel]]:-translate-y-1/2',
        '[&_[part=panel]]:rounded-lg [&_[part=panel]]:border [&_[part=panel]]:border-[hsl(var(--z-border))]',
        '[&_[part=panel]]:bg-[hsl(var(--z-background))] [&_[part=panel]]:p-6',
        '[&_[part=panel]]:text-[hsl(var(--z-foreground))] [&_[part=panel]]:shadow-lg',
      ].join(' '),
      props.class,
    )"
  >
    <slot />
  </ZDialogContent>
</template>
`,
    },
    {
      path: 'src/components/ui/DialogTitle.vue',
      content: `<script setup lang="ts">
import { ZDialogTitle } from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    class?: string
  }>(),
  {
    class: undefined,
  },
)
</script>

<template>
  <ZDialogTitle
    :class="cn('text-lg font-semibold leading-none tracking-tight', props.class)"
  >
    <slot />
  </ZDialogTitle>
</template>
`,
    },
    {
      path: 'src/components/ui/DialogDescription.vue',
      content: `<script setup lang="ts">
import { ZDialogDescription } from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    class?: string
  }>(),
  {
    class: undefined,
  },
)
</script>

<template>
  <ZDialogDescription
    :class="cn('text-sm text-[hsl(var(--z-muted-foreground))]', props.class)"
  >
    <slot />
  </ZDialogDescription>
</template>
`,
    },
  ],
}
