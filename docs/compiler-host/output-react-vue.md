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

## Framework Cell Renderers

Ordinary children and named slots stay on the DOM slot contract above. A
component that renders framework content into containers it owns, such as a
virtualized grid cell, uses a renderer adapter instead
([RFC-011](../rfcs/RFC-011-framework-renderer-adapter.md), status Proposal).

`@zeus-js/web-c-runtime` exports `createRendererHost(adapter)`. The host
reconciles keyed entries (`{ key, container, data, context }`): an unchanged key
and container is updated, a changed container remounts, and a missing key is
disposed. All disposals of a `render` call run before its mounts, so two keys can
swap containers in one call. Two keys that use the same container in one call
throw `ZEUS_RENDERER_DUPLICATE_CONTAINER`. Every mount receives a
`RendererSession` with a strictly increasing `generation` and an `AbortSignal`
that is aborted before disposal.

The framework adapters live in separate entries so the wrapper main entries do
not import React DOM or the Vue renderer:

```ts
import { createRendererHost } from '@zeus-js/web-c-runtime'
import { createReactRenderer } from '@zeus-js/output-react-wrapper/renderer'

const host = createRendererHost(
  createReactRenderer((row: Row) => <Cell row={row} />, { strict: true }),
)
host.render([{ key: 'row-1', container, data: row, context: undefined }])
host.dispose()
```

`createVueRenderer(render, { appContext })` from
`@zeus-js/output-vue-wrapper/renderer` has the same shape and resolves
components and provides from `appContext`. Both adapters commit synchronously,
unmount Portal and Teleport content on dispose, and report failures as
`ZEUS_RENDERER_ADAPTER_FAILURE`, `ZEUS_RENDERER_DISPOSED` or
`ZEUS_RENDERER_CONTAINER_MISMATCH`. The React entry needs `react-dom` as a peer
dependency. Both renderer entries import only types from
`@zeus-js/web-c-runtime`, which is an optional peer dependency of the wrappers;
install it when you use `createRendererHost`.

Errors thrown during `mount`, `update` or `dispose` (including effect cleanups
and unmount hooks) are thrown to the host as `ZEUS_RENDERER_ADAPTER_FAILURE`
with the original error as `cause`. A failed `dispose` still unmounts the root
and marks the handle `disposed`, so the host's retry does not unmount it twice.
Errors raised later, for example by a state update after the call returned, are
not attributed to the next call:

- React passes them to the `onError(error, session)` option, or to
  `globalThis.reportError` (`console.error` where it does not exist).
- Vue lets them propagate to the application's `config.errorHandler`.

Vue `update` always re-renders, even when `data` is the same object that was
mutated in place.

Call `host.render`, `host.setAdapter` and `host.dispose` with the React adapter
outside React rendering and commits, for example from an event handler or a
scheduled task, not from a render function, `useLayoutEffect` or `useEffect`.
React cannot flush a nested root there, so `mount` and `update` throw
`ZEUS_RENDERER_ADAPTER_FAILURE` instead of returning before the DOM is
committed.
