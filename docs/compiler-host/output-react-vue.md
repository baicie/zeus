# React / Vue Wrapper Output

React and Vue wrappers are generated from the same `ComponentManifest` as the Web Component output. They do not re-analyze source code.

## Recommended Build Setup

Use the Web-C aggregate package for component library builds:

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/rolldown'

export default zeus({
  components: {
    include: ['src/components/**/*.{ts,tsx}'],
  },
  plugins: componentLibrary({
    targets: ['wc', 'react', 'vue'],
    register: 'lazy',
    wrapper: 'event-bridge',
  }),
})
```

The individual output packages remain available for advanced internal composition, but `@zeus-js/web-c` is the recommended user-facing entry.

## React

```tsx
import { ZInput } from './dist/react'

export function Demo() {
  return (
    <ZInput
      value="hello"
      disabled={false}
      onValueChange={event => {
        console.log(event.detail.value)
      }}
    >
      <span slot="prefix">@</span>
    </ZInput>
  )
}
```

React wrapper behavior:

- imports the matching Web Component entry
- syncs props as DOM properties
- bridges declared CustomEvents to React-style props such as `onValueChange`
- does not pass event handler props through as DOM attributes
- maps named slot props/children to DOM `slot` attributes
- forwards refs to the underlying custom element instance

React does not consume `models`; controlled behavior stays explicit through `value` and `onValueChange`.

## Vue 3

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ZInput } from './dist/vue'

const email = ref('')
</script>

<template>
  <ZInput v-model:value="email" :disabled="false">
    <template #prefix>@</template>
  </ZInput>
</template>
```

Vue wrapper behavior:

- imports the matching Web Component entry
- syncs props as DOM properties
- bridges declared DOM CustomEvents such as `value-change`
- converts inferred or explicit `models` into `update:<prop>` emits
- maps named Vue slots to DOM `slot` attributes

For the common controlled pattern:

```ts
props: {
  value: String,
},
emits: {
  valueChange: event<{ value: string }>(),
},
```

the analyzer infers:

```ts
models: [
  {
    prop: 'value',
    event: 'value-change',
    eventPath: 'detail.value',
  },
]
```

The Vue wrapper emits both the original `value-change` event and `update:value`.

## Shared Contract

Both wrappers consume:

- `component.props`
- `component.events`
- `component.methods`
- `component.slots`
- `component.models`

Slots, css parts, and models should usually be inferred by the analyzer. Wrapper generators should not guess missing protocol details.
