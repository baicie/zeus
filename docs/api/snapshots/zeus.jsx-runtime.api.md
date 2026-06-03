# @zeus-js/zeus (./jsx-runtime) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import type { JSXValue } from './dist/zeus'

export declare const Fragment: symbol
export declare function jsx(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
export declare function jsxs(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
export declare function jsxDEV(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
```
