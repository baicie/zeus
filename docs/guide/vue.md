# Vue

Generate Vue 3 wrappers from Web Component sources.

## Install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/vite-plugin @zeus-js/output-wc @zeus-js/output-vue-wrapper
```

## Configure

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
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [wc({ outDir: 'dist/wc' }), vueWrapper({ outDir: 'dist/vue' })],
    }),
  ],
})
```

## Use generated wrapper

```vue
<script setup lang="ts">
import { ZButton } from './dist/vue'
</script>

<template>
  <ZButton variant="outline" @press="onPress"> Button </ZButton>
</template>
```

Vue wrappers use Vue's native event listener system and reactive prop bindings under the hood.

## TypeScript

Add the generated type declarations to your `tsconfig.json` include:

```json
{
  "compilerOptions": {
    "types": ["./dist/vue"]
  }
}
```
