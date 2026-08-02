# @zeus-js/signal (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
/**
 * Batches reactive updates synchronously within the given function.
 * All updates triggered inside `fn` are deferred until the function completes,
 * then flushed together in a single batch.
 */
export declare function batch<T>(fn: () => T): T

export declare function onCleanup(fn: () => void): void

export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((previous: T) => T)) => T
export declare function createSignal<T>(
  initialValue: T,
): [Accessor<T>, Setter<T>]
export declare function createMemo<T>(compute: () => T): Accessor<T>
export declare function createEffect(run: () => void): void
export declare function createRoot<T>(run: (dispose: () => void) => T): T
```
