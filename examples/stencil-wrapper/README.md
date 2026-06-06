# Stencil Wrapper Demo

这个示例用 Stencil 定义两个 Web Components：

- `z-demo-button`
- `z-demo-input`

并通过官方 output targets 生成框架 wrapper：

- React：`src/generated/react`
- Vue：`src/generated/vue`

```bash
pnpm -C examples/stencil-wrapper build
```

React 使用示例：

```tsx
import { ZDemoButton, ZDemoInput } from '@zeus-js/example-stencil-wrapper/react'

export function App() {
  return (
    <>
      <ZDemoInput
        value="hello"
        onValueChange={event => console.log(event.detail.value)}
      />
      <ZDemoButton onPress={() => console.log('pressed')}>Save</ZDemoButton>
    </>
  )
}
```

Vue 使用示例：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ZDemoButton, ZDemoInput } from '@zeus-js/example-stencil-wrapper/vue'

const value = ref('hello')
</script>

<template>
  <ZDemoInput
    :value="value"
    @value-change="event => (value = event.detail.value)"
  />
  <ZDemoButton @press="() => console.log('pressed')">Save</ZDemoButton>
</template>
```
