# Vue

Generate Vue 3 wrappers from Web Component sources.

## Install

```bash
pnpm add @zeus-js/zeus @zeus-js/web-c
pnpm add -D @vitejs/plugin-vue vite typescript
```

## Configure

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import zeus, { componentLibrary } from '@zeus-js/web-c/vite'

export default defineConfig({
  plugins: [
    vue(),
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      plugins: componentLibrary({
        targets: ['wc', 'vue'],
      }),
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
