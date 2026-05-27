# @zeus-js/compiler

JSX compiler package.

## compile

```ts
function compile(code: string, options?: CompileOptions): string
```

Compiles JSX code to Zeus runtime helper calls.

```ts
import { compile } from '@zeus-js/compiler'

const result = compile(`<div>{name}</div>`, {
  target: 'dom',
  generate: 'client',
})
```

## CompileOptions

| Option         | Type                        | Default    | Description                |
| -------------- | --------------------------- | ---------- | -------------------------- |
| `target`       | `'dom' \| 'web-components'` | `'dom'`    | Output target              |
| `generate`     | `'client' \| 'server'`      | `'client'` | Client or server rendering |
| `dev`          | `boolean`                   | `false`    | Enable dev mode            |
| `staticMarker` | `string`                    | `'@once'`  | Static expression marker   |

## Target: dom

Generates DOM runtime helper calls.

```tsx
// Input
;<div>{count}</div>

// Output
_h('div', text(count))
```

## Target: web-components

Generates code for custom elements.

```tsx
// Input
<Host>
  <button onClick={handle}>Click</button>
</Host>

// Output
// defineElement call with proper shadow DOM setup
```
