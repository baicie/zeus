import type { RegistryItem } from '../schema'

export const vueTabs: RegistryItem = {
  name: 'tabs',
  type: 'component',
  framework: 'vue',
  description: 'Vue Tabs component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/Tabs.vue',
      content: `<script setup lang="ts">
import {
  ZTabs,
  ZTabList,
  ZTab,
  ZTabPanel,
} from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    value?: string
    class?: string
  }>(),
  {
    value: undefined,
    class: undefined,
  },
)

const emit = defineEmits<{
  'update:value': [value: string]
}>()

function handleSelect(key: string) {
  emit('update:value', key)
}
</script>

<template>
  <ZTabs
    :value="value"
    :class="cn('flex flex-col', props.class)"
    @select="handleSelect"
  >
    <slot />
  </ZTabs>
</template>
`,
    },
  ],
}

export const vueTabList: RegistryItem = {
  name: 'tabs',
  type: 'component',
  framework: 'vue',
  description: 'Vue TabList component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/TabList.vue',
      content: `<script setup lang="ts">
import { ZTabList } from '@zeus-ui/headless/vue'
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
  <ZTabList
    :class="cn(
      'inline-flex h-9 items-center justify-center rounded-lg p-1 text-muted-foreground',
      props.class,
    )"
  >
    <slot />
  </ZTabList>
</template>
`,
    },
  ],
}

export const vueTab: RegistryItem = {
  name: 'tabs',
  type: 'component',
  framework: 'vue',
  description: 'Vue Tab component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/Tab.vue',
      content: `<script setup lang="ts">
import { ZTab } from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    value: string
    class?: string
    disabled?: boolean
  }>(),
  {
    class: undefined,
    disabled: false,
  },
)
</script>

<template>
  <ZTab
    :value="value"
    :disabled="disabled"
    :class="cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium',
      'ring-offset-background transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-background data-[state=active]:text-foreground',
      'data-[state=active]:shadow',
      props.class,
    )"
  >
    <slot />
  </ZTab>
</template>
`,
    },
  ],
}

export const vueTabPanel: RegistryItem = {
  name: 'tabs',
  type: 'component',
  framework: 'vue',
  description: 'Vue TabPanel component built on @zeus-ui/headless.',

  dependencies: [
    { name: '@zeus-ui/headless' },
    { name: 'clsx' },
    { name: 'tailwind-merge' },
  ],

  registryDependencies: ['utils', 'theme'],

  files: [
    {
      path: 'src/components/ui/TabPanel.vue',
      content: `<script setup lang="ts">
import { ZTabPanel } from '@zeus-ui/headless/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    value: string
    class?: string
  }>(),
  {
    class: undefined,
  },
)
</script>

<template>
  <ZTabPanel
    :value="value"
    :class="cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', props.class)"
  >
    <slot />
  </ZTabPanel>
</template>
`,
    },
  ],
}
