# Component Analyzer

The component analyzer parses `defineElement` declarations and produces a `ComponentManifest`. Output targets consume this manifest instead of re-analyzing source code.

## Usage

```ts
import { analyzeComponents } from '@zeus-js/component-analyzer'

const result = await analyzeComponents({
  include: ['src/components/**/*.{ts,tsx}'],
})

console.log(result.manifest.components)
```

## Recommended Source Shape

The analyzer expects `defineElement` options and `props` to be statically readable inline object literals:

```tsx
export const ZInput = defineElement(
  'z-input',
  {
    props: {
      value: String,
      disabled: prop(Boolean),
    },
    emits: {
      valueChange: event<{ value: string }>(),
    },
  },
  setup,
)
```

The third argument may be an inline function or a local function binding:

```tsx
function setup(props, ctx) {
  ctx.expose({
    focus() {},
  })

  return (
    <Host>
      <Slot name="prefix" />
      <input
        part="control"
        onInput={() => ctx.emit.valueChange({ value: '' })}
      />
    </Host>
  )
}
```

## Inference

The analyzer infers public surface from source where the signal is stable:

- `props` from the `defineElement({ props })` schema and local props type.
- `events` from declared `emits`.
- `methods` from `ctx.expose({ ... })`.
- `models` from `<prop>` + `<prop>Change` + `detail.<prop>`.
- `slots` from `<Slot>` and native `<slot>`.
- `hostAttributes` from static host attributes.
- `cssParts` from static `part="..."`.

Metadata should supplement source inference, not duplicate it. Use `meta.slots`, `meta.cssParts`, and `cssVars` only for documentation or cases that cannot be statically inferred.

## Output

```json
{
  "version": 1,
  "components": [
    {
      "tag": "z-input",
      "name": "ZInput",
      "source": "src/input.tsx",
      "props": {
        "value": {
          "type": "string",
          "default": "",
          "reflect": true
        },
        "disabled": {
          "type": "boolean",
          "default": false,
          "reflect": true
        }
      },
      "events": {
        "valueChange": {
          "key": "valueChange",
          "name": "value-change",
          "reactName": "onValueChange",
          "detail": {
            "value": "string"
          },
          "bubbles": true,
          "composed": true,
          "cancelable": false
        }
      },
      "models": [
        {
          "prop": "value",
          "event": "value-change",
          "eventPath": "detail.value"
        }
      ],
      "methods": {
        "focus": {
          "name": "focus"
        }
      },
      "slots": {
        "prefix": {
          "name": "prefix"
        }
      },
      "cssParts": ["control"],
      "cssVars": {}
    }
  ]
}
```

## Diagnostics

Component output builds intentionally reject patterns that make the manifest ambiguous:

- non-literal `defineElement()` options
- spreads inside `options` or `props`
- computed prop keys
- non-static `prop(values)`
- dynamic `ctx.expose()` objects

Zeus is still beta and has no compatibility burden for old internal patterns, so unsupported authoring shapes should be rewritten to the canonical static form instead of adding fallback analysis.
