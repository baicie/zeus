# React / Vue Wrapper Output

Generate framework-specific wrappers from the same `defineElement` source.

## React

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin/vite'
import wc from '@zeus-js/output-wc/vite'
import react from '@zeus-js/output-react-wrapper/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: { include: ['src/components/**/*.ts'] },
      outputs: [wc({ outDir: 'dist/wc' }), react({ outDir: 'dist/react' })],
    }),
  ],
})
```

### Generated API

```tsx
import { ZButton } from './dist/react'

// Props map to element props
<ZButton variant="outline" disabled={false}>
  Click me
</ZButton>

// Events become React event props
<ZButton onPress={event => {
  // event.detail contains the native CustomEvent detail
  console.log(event.detail.nativeEvent)
}}>
  Press me
</ZButton>
```

## Vue 3

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import zeus from '@zeus-js/vite-plugin/vite'
import wc from '@zeus-js/output-wc/vite'
import vueWrapper from '@zeus-js/output-vue-wrapper/vite'

export default defineConfig({
  plugins: [
    vue(),
    zeus({
      components: { include: ['src/components/**/*.ts'] },
      outputs: [wc({ outDir: 'dist/wc' }), vueWrapper({ outDir: 'dist/vue' })],
    }),
  ],
})
```

### Generated API

```vue
<script setup lang="ts">
import { ZButton } from './dist/vue'
</script>

<template>
  <!-- Props are reactive -->
  <ZButton variant="outline" :disabled="false" @press="onPress">
    Click me
  </ZButton>
</template>
```

## Shared behavior

Both wrappers:

- Sync props as DOM properties
- Attach event listeners via `addEventListener`
- Reflect prop changes back to the custom element
- Support TypeScript with generated `.d.ts` files
