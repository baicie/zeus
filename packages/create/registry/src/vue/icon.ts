import type { RegistryItem } from '../schema'

export const vueIcon: RegistryItem = {
  name: 'icon',
  type: 'component',
  framework: 'vue',
  description: 'Icon component built on @zeus-ui/headless.',

  dependencies: [{ name: '@zeus-ui/headless' }],

  files: [
    {
      path: 'src/components/ui/Icon.vue',
      content: `<script setup lang="ts">
import { ZIcon } from '@zeus-ui/headless/vue'

const props = withDefaults(
  defineProps<{
    name?: string
    size?: string
    label?: string
    class?: string
  }>(),
  {
    name: 'check',
    size: '1em',
    label: undefined,
    class: undefined,
  },
)
</script>

<template>
  <ZIcon
    :name="name"
    :size="size"
    :label="label"
    :class="props.class"
  >
    <slot />
  </ZIcon>
</template>
`,
    },
  ],
}
