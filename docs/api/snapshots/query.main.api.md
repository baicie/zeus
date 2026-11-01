# @zeus-js/query (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

````ts
import { JSXValue } from '@zeus-js/runtime-dom'

/** A query key: an array of serializable values owned by the caller. */
export type ZeusQueryKey = readonly unknown[]
export type ZeusQueryStatus = 'pending' | 'error' | 'success'
type ZeusMutationStatus = 'idle' | 'pending' | 'error' | 'success'
export type ZeusFetchStatus = 'fetching' | 'paused' | 'idle'
/** Query metadata, forwarded to the engine unchanged. */
type ZeusQueryMeta = Record<string, unknown>
/** Context passed to `queryFn` for queries, mutations and infinite pages. */
export interface ZeusQueryFunctionContext {
  readonly queryKey: ZeusQueryKey
  readonly signal: AbortSignal
  readonly meta: ZeusQueryMeta | undefined
}
/** Context passed to an infinite query's `queryFn`. */
export interface ZeusInfiniteQueryFunctionContext<
  TParam = unknown,
> extends ZeusQueryFunctionContext {
  readonly pageParam: TParam
}
/** Cached pages of an infinite query. */
export interface ZeusInfiniteData<T, TParam = unknown> {
  readonly pages: T[]
  readonly pageParams: TParam[]
}
export interface ZeusQueryFilters {
  readonly queryKey?: ZeusQueryKey
  readonly exact?: boolean
  readonly type?: 'all' | 'active' | 'inactive'
  readonly stale?: boolean
}
export interface ZeusQueryOptions<T, E = Error> {
  readonly queryKey: ZeusQueryKey
  readonly queryFn: (context: ZeusQueryFunctionContext) => Promise<T> | T
  readonly enabled?: boolean
  readonly staleTime?: number
  readonly gcTime?: number
  readonly retry?:
    | boolean
    | number
    | ((failureCount: number, error: E) => boolean)
  readonly retryDelay?: number | ((attemptIndex: number) => number)
  readonly refetchOnWindowFocus?: boolean | 'always'
  readonly refetchOnMount?: boolean | 'always'
  readonly refetchOnReconnect?: boolean | 'always'
  readonly refetchInterval?: number | false
  readonly networkMode?: 'online' | 'always' | 'offlineFirst'
  readonly initialData?: T
  readonly placeholderData?: T
  readonly select?: (data: T) => T
  readonly meta?: ZeusQueryMeta
}
export interface ZeusInfiniteQueryOptions<T, E = Error, TParam = unknown> {
  readonly queryKey: ZeusQueryKey
  readonly queryFn: (
    context: ZeusInfiniteQueryFunctionContext<TParam>,
  ) => Promise<T> | T
  readonly initialPageParam: TParam
  readonly getNextPageParam: (
    lastPage: T,
    allPages: T[],
    lastPageParam: TParam,
    allPageParams: TParam[],
  ) => TParam | undefined | null
  readonly getPreviousPageParam?: (
    firstPage: T,
    allPages: T[],
    firstPageParam: TParam,
    allPageParams: TParam[],
  ) => TParam | undefined | null
  readonly enabled?: boolean
  readonly staleTime?: number
  readonly gcTime?: number
  readonly retry?:
    | boolean
    | number
    | ((failureCount: number, error: E) => boolean)
  readonly retryDelay?: number | ((attemptIndex: number) => number)
  readonly networkMode?: 'online' | 'always' | 'offlineFirst'
  readonly meta?: ZeusQueryMeta
}
/** Helpers handed to mutation lifecycle callbacks. */
export interface ZeusMutationHelpers {
  /** The query cache the mutation writes to. */
  readonly client: ZeusQueryClient
}
export interface ZeusMutationOptions<
  T,
  E = Error,
  V = void,
  TContext = unknown,
> {
  readonly mutationFn: (
    variables: V,
    context: {
      readonly signal: AbortSignal
    },
  ) => Promise<T> | T
  readonly retry?:
    | boolean
    | number
    | ((failureCount: number, error: E) => boolean)
  readonly retryDelay?: number | ((attemptIndex: number) => number)
  readonly networkMode?: 'online' | 'always' | 'offlineFirst'
  readonly meta?: ZeusQueryMeta
  /**
   * Runs before `mutationFn`. Its return value (for example a snapshot of the
   * optimistic cache write) is handed to the other callbacks as `context`.
   */
  readonly onMutate?: (
    variables: V,
    helpers: ZeusMutationHelpers,
  ) => TContext | Promise<TContext>
  readonly onSuccess?: (
    data: T,
    variables: V,
    context: TContext,
    helpers: ZeusMutationHelpers,
  ) => unknown
  readonly onError?: (
    error: E,
    variables: V,
    context: TContext | undefined,
    helpers: ZeusMutationHelpers,
  ) => unknown
  readonly onSettled?: (
    data: T | undefined,
    error: E | null,
    variables: V,
    context: TContext | undefined,
    helpers: ZeusMutationHelpers,
  ) => unknown
}
/** Options for `ZeusQueryClient.query()`; a signal cancels the fetch. */
export interface ZeusQueryFetchOptions<T, E = Error> extends ZeusQueryOptions<
  T,
  E
> {
  readonly signal?: AbortSignal
}
export interface ZeusQueryClientConfig {
  readonly defaultOptions?: {
    readonly queries?: Partial<
      Omit<ZeusQueryOptions<unknown>, 'queryKey' | 'queryFn'>
    >
    readonly mutations?: Partial<
      Omit<ZeusMutationOptions<unknown, unknown, unknown>, 'mutationFn'>
    >
  }
}
export interface ZeusQueryState<T, E = Error> {
  readonly data: T | undefined
  readonly error: E | null
  readonly status: ZeusQueryStatus
  readonly fetchStatus: ZeusFetchStatus
  readonly pending: boolean
  readonly success: boolean
  readonly errorState: boolean
  readonly stale: boolean
  readonly updatedAt: number
  readonly hasNextPage?: boolean
  readonly isFetchingNextPage?: boolean
}
export interface ZeusMutationState<T, E = Error> {
  readonly data: T | undefined
  readonly error: E | null
  readonly status: ZeusMutationStatus
  readonly pending: boolean
  readonly success: boolean
  readonly errorState: boolean
}
export interface ZeusQuery<T, E = Error> {
  readonly state: () => ZeusQueryState<T, E>
  readonly data: () => T | undefined
  readonly error: () => E | null
  readonly status: () => ZeusQueryStatus
  readonly pending: () => boolean
  readonly success: () => boolean
  readonly errorState: () => boolean
  readonly stale: () => boolean
  readonly isFetching: () => boolean
  refetch(): Promise<T>
  cancel(): Promise<void>
  dispose(): void
}
export interface ZeusInfiniteQuery<
  T,
  E = Error,
  TParam = unknown,
> extends ZeusQuery<ZeusInfiniteData<T, TParam>, E> {
  readonly hasNextPage: () => boolean
  readonly isFetchingNextPage: () => boolean
  fetchNextPage(): Promise<void>
}
export interface ZeusMutation<T, V, E = Error> {
  readonly state: () => ZeusMutationState<T, E>
  readonly data: () => T | undefined
  readonly error: () => E | null
  readonly pending: () => boolean
  readonly success: () => boolean
  readonly errorState: () => boolean
  mutate(variables: V): void
  mutateAsync(variables: V): Promise<T>
  reset(): void
  cancel(): Promise<void>
  dispose(): void
}
/**
 * Zeus-owned query client. The underlying query-core client is an
 * implementation detail; this is the complete public surface.
 */
export interface ZeusQueryClient {
  /**
   * Fetches and caches a query, resolving with the cached or fetched data.
   * Route loaders pass their `request.signal` here so a cancelled navigation
   * also aborts the query.
   */
  query<T, E = Error>(options: ZeusQueryFetchOptions<T, E>): Promise<T>
  getQueryData<T>(queryKey: ZeusQueryKey): T | undefined
  setQueryData<T>(
    queryKey: ZeusQueryKey,
    updater: T | ((previous: T | undefined) => T | undefined),
  ): void
  invalidateQueries(filters?: ZeusQueryFilters): Promise<void>
  cancelQueries(filters?: ZeusQueryFilters): Promise<void>
  removeQueries(filters?: ZeusQueryFilters): void
  clear(): void
  /** Cancels pending queries and clears the cache. */
  dispose(): void
}

export interface QueryClientProviderProps {
  /** Client created by `createQueryClient()`. */
  client: ZeusQueryClient
  children?: JSXValue | (() => JSXValue)
}
/**
 * Creates a Zeus query client. The query-core client stays an implementation
 * detail: only the returned `ZeusQueryClient` is public. Release a shared
 * client with `dispose()` once no provider or loader needs it.
 */
export declare function createQueryClient(
  config?: ZeusQueryClientConfig,
): ZeusQueryClient
/**
 * Provides the query client to the component subtree. The provider mounts the
 * cache's focus/online listeners on initialization and releases them on
 * cleanup; mounting is reference-counted, so several providers may share one
 * client. The provider does not own the client's lifetime.
 */
export declare function QueryClientProvider(
  props: QueryClientProviderProps,
): JSXValue
/** Returns the client provided by `<QueryClientProvider>`; throws outside it. */
export declare function useQueryClient(): ZeusQueryClient
/**
 * Observes a query from the surrounding `<QueryClientProvider>`. The
 * observer is created once; its result is projected onto stable accessors, so
 * reading `data()`, `pending()` or `error()` inside a binding only updates
 * that binding. Pass a function to re-evaluate the options reactively.
 */
export declare function useQuery<T, E = Error>(
  options: ZeusQueryOptions<T, E> | (() => ZeusQueryOptions<T, E>),
): ZeusQuery<T, E>
/** Observes an infinite query from the surrounding `<QueryClientProvider>`. */
export declare function useInfiniteQuery<T, E = Error, TParam = unknown>(
  options:
    | ZeusInfiniteQueryOptions<T, E, TParam>
    | (() => ZeusInfiniteQueryOptions<T, E, TParam>),
): ZeusInfiniteQuery<T, E, TParam>
/**
 * Creates a mutation from the surrounding `<QueryClientProvider>`. Lifecycle
 * callbacks receive `{ client }` so optimistic updates can read and write the
 * shared cache:
 *
 * ```ts
 * onMutate: async vars => {
 *   await client.cancelQueries({ queryKey })
 *   const previous = client.getQueryData(queryKey)
 *   client.setQueryData(queryKey, optimistic(vars))
 *   return previous
 * },
 * onError: (_error, _vars, previous) => client.setQueryData(queryKey, previous),
 * onSettled: () => client.invalidateQueries({ queryKey }),
 * ```
 */
export declare function useMutation<T, V = void, E = Error, TContext = unknown>(
  options:
    | ZeusMutationOptions<T, E, V, TContext>
    | (() => ZeusMutationOptions<T, E, V, TContext>),
): ZeusMutation<T, V, E>
````
