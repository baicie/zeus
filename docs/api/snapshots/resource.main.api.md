# @zeus-js/resource (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { Accessor } from '@zeus-js/signal'

export type ResourceStatus = 'pending' | 'success' | 'error'
export interface ResourceState<T> {
  readonly status: ResourceStatus
  readonly pending: boolean
  readonly success: boolean
  readonly error: unknown
  readonly data: T | undefined
  readonly stale: boolean
  readonly updatedAt: number | undefined
}
export interface ResourceContext {
  readonly signal: AbortSignal
}
export interface ResourceOptions<K, T> {
  /** Converts a source value into a cache key. Primitive keys are supported by default. */
  key?: (source: K) => string
  /** Fresh results are reused until this many milliseconds have elapsed. */
  staleTime?: number
  /** Optional value shown before the first successful request. */
  initialData?: T
}
export interface Resource<T> {
  readonly state: Accessor<ResourceState<T>>
  readonly status: Accessor<ResourceStatus>
  readonly pending: Accessor<boolean>
  readonly success: Accessor<boolean>
  readonly error: Accessor<unknown>
  readonly data: Accessor<T | undefined>
  readonly stale: Accessor<boolean>
  readonly updatedAt: Accessor<number | undefined>
  /** Starts a request for the current source and cancels the previous one. */
  refetch(): Promise<T>
  cancel(): void
  dispose(): void
}
type Source<K> = K | Accessor<K>
/**
 * Creates a single-owner async resource. Every request has a generation and
 * AbortSignal, so a late response cannot overwrite a newer result.
 */
export declare function createResource<T, K>(
  source: Source<K>,
  fetcher: (source: K, context: ResourceContext) => Promise<T> | T,
  options?: ResourceOptions<K, T>,
): Resource<T>
```
