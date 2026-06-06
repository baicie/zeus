# defineElement

`defineElement` declares a Zeus Web Component. The same source is analyzed into a component manifest, Web Component output, React/Vue wrappers, and type declarations.

## Signature

```tsx
defineElement<TProps, THost, TEmits>(
  tag: string,
  options: DefineElementOptions<TProps, TEmits>,
  setup: (
    props: Readonly<TProps>,
    context: DefineElementContext<THost, TEmits>,
  ) => JSX.Element,
): CustomElementConstructor
```

## Minimal Input Example

```tsx
import { Host, Slot, defineElement, event, prop } from '@zeus-js/zeus'

import type { DefineElementContext, EventDefinition } from '@zeus-js/zeus'

export interface InputProps {
  value?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
}

type InputEmits = {
  valueChange: EventDefinition<{ value: string; nativeEvent: Event }>
}

type InputHost = HTMLElement & {
  value?: string
  focus(): void
}

function setup(
  props: InputProps,
  ctx: DefineElementContext<InputHost, InputEmits>,
) {
  let control!: HTMLInputElement

  ctx.expose({
    focus() {
      control.focus()
    },
  })

  return (
    <Host data-invalid={() => (props.invalid ? '' : undefined)}>
      <span part="prefix">
        <Slot name="prefix" />
      </span>

      <input
        ref={(el: HTMLInputElement | null) => {
          if (el) control = el
        }}
        part="control"
        prop:value={() => props.value ?? ''}
        placeholder={() => props.placeholder}
        disabled={() => Boolean(props.disabled)}
        onInput={nativeEvent => {
          const value = control.value
          ctx.host.value = value
          ctx.emit.valueChange({ value, nativeEvent })
        }}
      />
    </Host>
  )
}

export const ZInput = defineElement<InputProps, InputHost, InputEmits>(
  'z-input',
  {
    shadow: false,
    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      placeholder: String,
      disabled: prop(Boolean),
      invalid: prop(Boolean),
    },
    emits: {
      valueChange: event<{ value: string; nativeEvent: Event }>(),
    },
    meta: {
      description: 'Input primitive.',
    },
  },
  setup,
)
```

## Options

```ts
interface DefineElementOptions<TProps, TEmits> {
  shadow?: boolean | ShadowRootInit
  formAssociated?: boolean
  props?: PropOptions<TProps>
  emits?: TEmits
  form?: FormAssociatedOptions<TProps>
  styles?: string | string[]
  models?: readonly ElementModelDefinition<TProps>[]
  cssVars?: Record<string, { description?: string }>
  meta?: DefineElementMeta
}
```

The author-facing surface should stay small. Prefer source inference over metadata:

- `models` is inferred from `<prop>` + `<prop>Change` + `detail.<prop>`.
- `slots` is inferred from `<Slot>` and native `<slot>`.
- `cssParts` is inferred from static `part="..."`.
- `cssVars` is optional documentation for public styling tokens only.

## Props

Supported constructors:

- `String`
- `Number`
- `Boolean`
- `Object`
- `Array`
- `Function`

Useful shorthand:

```ts
props: {
  disabled: prop(Boolean),
}
```

`prop(Boolean)` is equivalent to:

```ts
{
  type: Boolean,
  default: false,
  reflect: true,
}
```

String literal unions use `prop(values)`:

```ts
props: {
  size: prop(['sm', 'md', 'lg'], {
    default: 'md',
    reflect: true,
  }),
}
```

Complex attribute serialization must be explicit:

```ts
props: {
  tokens: {
    type: Array,
    attr: 'tokens',
    reflect: true,
    default: () => [],
    serialize: value => (value?.length ? value.join('|') : null),
    deserialize: value => (value ? value.split('|') : []),
  },
}
```

## Events

Events are declared in `emits`:

```ts
emits: {
  valueChange: event<{ value: string }>(),
  press: event<{ nativeEvent: MouseEvent }>('press'),
}
```

Default event mapping:

- `valueChange` becomes DOM event `value-change`.
- React wrapper exposes `onValueChange`.
- Vue wrapper emits `value-change`.
- Default event options are `bubbles: true`, `composed: true`, `cancelable: false`.

Emit from setup:

```ts
ctx.emit.valueChange({ value: 'next' })
```

Undeclared `ctx.emit.*` calls are not part of the public event surface.

## Vue Models

The analyzer infers Vue model metadata for common controlled props:

```ts
props: {
  value: String,
},
emits: {
  valueChange: event<{ value: string }>(),
},
```

This produces:

```ts
models: [
  {
    prop: 'value',
    event: 'value-change',
    eventPath: 'detail.value',
  },
]
```

Vue users can write:

```vue
<ZInput v-model:value="email" />
```

Use explicit `models` only for non-standard event names or detail paths. Use `models: []` to disable inference for a component.

## Slots And Parts

Do not duplicate common slots and parts in metadata:

```tsx
<Slot name="prefix" />
<input part="control" />
```

The analyzer emits:

- slot `prefix`
- css part `control`

Use `meta.slots` or `meta.cssParts` only when the information cannot be statically inferred or needs extra documentation.

## Exposed Methods

Expose host instance methods with `ctx.expose()`:

```ts
ctx.expose({
  focus() {
    control.focus()
  },
})
```

The analyzer extracts method names and common TypeScript signatures. Lazy Web Component output creates method proxies that wait for the real component chunk before invoking the exposed method.
