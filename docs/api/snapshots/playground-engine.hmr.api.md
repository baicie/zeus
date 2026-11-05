# @zeus-js/playground-engine (./hmr) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export type PlaygroundHmrUpdateKind =
  | 'style-only'
  | 'comment-only'
  | 'template-structure'
  | 'signal-initialization'
  | 'component-api'
  | 'unknown'
export interface PlaygroundHmrClassification {
  readonly kind: PlaygroundHmrUpdateKind
  readonly strategy: 'vite-style' | 'preserve-state' | 'dispose-remount'
  readonly preserveState: boolean
}
/**
 * Mirrors the Vite plugin's narrow preservation contract for Playground
 * diagnostics. It never decides that executable edits keep state: only
 * comment-only changes can preserve the module instance.
 */
export declare function classifyPlaygroundHmrUpdate(
  filename: string,
  previousSource: string | undefined,
  nextSource: string,
): PlaygroundHmrClassification
```
