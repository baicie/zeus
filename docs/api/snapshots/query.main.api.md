# @zeus-js/query (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import {
  DefaultError,
  MutationObserverResult,
  QueryObserverResult,
  InfiniteData,
  InfiniteQueryObserverResult,
  MutationObserverOptions,
  QueryClient,
  InfiniteQueryObserverOptions,
  QueryKey,
  QueryObserverOptions,
  QueryClientConfig,
} from '@tanstack/query-core'
export { QueryClientConfig, QueryKey } from '@tanstack/query-core'
import { Accessor } from '@zeus-js/signal'

export interface ZeusQueryClient {
  readonly client: QueryClient
  dispose(): void
}
export interface QueryState<T, E = DefaultError> {
  readonly data: T | undefined
  readonly error: E | null
  readonly status: QueryObserverResult<T, E>['status']
  readonly fetchStatus: QueryObserverResult<T, E>['fetchStatus']
  readonly pending: boolean
  readonly success: boolean
  readonly errorState: boolean
  readonly stale: boolean
  readonly updatedAt: number
  readonly hasNextPage?: boolean
  readonly isFetchingNextPage?: boolean
}
export interface ZeusQuery<T, E = DefaultError> {
  readonly state: Accessor<QueryState<T, E>>
  readonly data: Accessor<T | undefined>
  readonly error: Accessor<E | null>
  readonly status: Accessor<QueryState<T, E>['status']>
  readonly pending: Accessor<boolean>
  readonly success: Accessor<boolean>
  readonly errorState: Accessor<boolean>
  readonly stale: Accessor<boolean>
  readonly isFetching: Accessor<boolean>
  refetch(): Promise<QueryObserverResult<T, E>>
  cancel(): Promise<void>
  dispose(): void
}
export interface ZeusInfiniteQuery<T, E = DefaultError> extends ZeusQuery<
  InfiniteData<T>,
  E
> {
  readonly hasNextPage: Accessor<boolean>
  readonly isFetchingNextPage: Accessor<boolean>
  fetchNextPage(): Promise<InfiniteQueryObserverResult<InfiniteData<T>, E>>
}
export interface MutationState<T, E = DefaultError> {
  readonly data: T | undefined
  readonly error: E | null
  readonly status: MutationObserverResult<T, E>['status']
  readonly pending: boolean
  readonly success: boolean
  readonly errorState: boolean
}
export interface ZeusMutation<T, V, E = DefaultError> {
  readonly state: Accessor<MutationState<T, E>>
  readonly data: Accessor<T | undefined>
  readonly error: Accessor<E | null>
  readonly pending: Accessor<boolean>
  readonly success: Accessor<boolean>
  readonly errorState: Accessor<boolean>
  mutate(variables: V): void
  mutateAsync(variables: V): Promise<T>
  reset(): void
  cancel(): Promise<void>
  dispose(): void
}
export interface ZeusMutationOptions<T, E, V> extends Omit<
  MutationObserverOptions<T, E, V, unknown>,
  'mutationFn'
> {
  mutationFn: (
    variables: V,
    context: {
      readonly signal: AbortSignal
    },
  ) => Promise<T> | T
}
export declare function createQueryClient(
  config?: QueryClientConfig,
): ZeusQueryClient
export declare function createQuery<T, E = DefaultError>(
  client: QueryClient | ZeusQueryClient,
  options:
    | QueryObserverOptions<T, E, T, T, QueryKey>
    | (() => QueryObserverOptions<T, E, T, T, QueryKey>),
): ZeusQuery<T, E>
export declare function createInfiniteQuery<T, E = DefaultError>(
  client: QueryClient | ZeusQueryClient,
  options: InfiniteQueryObserverOptions<
    T,
    E,
    InfiniteData<T>,
    QueryKey,
    unknown
  >,
): ZeusInfiniteQuery<T, E>
export declare function createMutation<T, V, E = DefaultError>(
  client: QueryClient | ZeusQueryClient,
  options: ZeusMutationOptions<T, E, V>,
): ZeusMutation<T, V, E>
```
