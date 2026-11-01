import {
  InfiniteQueryObserver,
  MutationObserver,
  QueryClient,
  QueryObserver,
  type InfiniteQueryObserverOptions,
  type InfiniteQueryObserverResult,
  type MutationFunctionContext,
  type MutationObserverResult,
  type QueryFilters,
  type QueryKey,
  type QueryFunctionContext,
  type QueryObserverOptions,
  type QueryObserverResult,
} from '@tanstack/query-core'
import { createContext, inject, provide } from '@zeus-js/runtime-dom'
import { batch, createEffect, createSignal, onCleanup } from '@zeus-js/signal'
import { getCurrentScope } from '@zeus-js/signal/internal'

import { attachEngine, getEngine } from './internal'

import type {
  ZeusInfiniteData,
  ZeusInfiniteQuery,
  ZeusInfiniteQueryOptions,
  ZeusMutation,
  ZeusMutationHelpers,
  ZeusMutationOptions,
  ZeusMutationState,
  ZeusQuery,
  ZeusQueryClient,
  ZeusQueryClientConfig,
  ZeusQueryFetchOptions,
  ZeusQueryFilters,
  ZeusQueryOptions,
  ZeusQueryState,
} from './types'
import type { JSXValue } from '@zeus-js/runtime-dom'

export type {
  ZeusFetchStatus,
  ZeusInfiniteData,
  ZeusInfiniteQuery,
  ZeusInfiniteQueryFunctionContext,
  ZeusInfiniteQueryOptions,
  ZeusMutation,
  ZeusMutationHelpers,
  ZeusMutationOptions,
  ZeusMutationState,
  ZeusQuery,
  ZeusQueryClient,
  ZeusQueryClientConfig,
  ZeusQueryFetchOptions,
  ZeusQueryFilters,
  ZeusQueryFunctionContext,
  ZeusQueryKey,
  ZeusQueryOptions,
  ZeusQueryState,
  ZeusQueryStatus,
} from './types'

export interface QueryClientProviderProps {
  /** Client created by `createQueryClient()`. */
  client: ZeusQueryClient
  children?: JSXValue | (() => JSXValue)
}

const QueryClientContext = createContext<ZeusQueryClient | undefined>()

/**
 * Creates a Zeus query client. The query-core client stays an implementation
 * detail: only the returned `ZeusQueryClient` is public. Release a shared
 * client with `dispose()` once no provider or loader needs it.
 */
export function createQueryClient(
  config: ZeusQueryClientConfig = {},
): ZeusQueryClient {
  const engine = new QueryClient(
    config as ConstructorParameters<typeof QueryClient>[0],
  )

  const client: ZeusQueryClient = {
    query: options => runQuery(engine, options),
    getQueryData: queryKey => engine.getQueryData(queryKey),
    setQueryData: (queryKey, updater) => {
      engine.setQueryData(queryKey, updater as never)
    },
    invalidateQueries: filters =>
      engine.invalidateQueries(toEngineFilters(filters)),
    cancelQueries: filters => engine.cancelQueries(toEngineFilters(filters)),
    removeQueries: filters => engine.removeQueries(toEngineFilters(filters)),
    clear: () => engine.clear(),
    dispose: () => {
      void engine
        .cancelQueries()
        .catch(() => undefined)
        .finally(() => engine.clear())
    },
  }

  attachEngine(client, engine)

  return client
}

/**
 * Provides the query client to the component subtree. The provider mounts the
 * cache's focus/online listeners on initialization and releases them on
 * cleanup; mounting is reference-counted, so several providers may share one
 * client. The provider does not own the client's lifetime.
 */
export function QueryClientProvider(props: QueryClientProviderProps): JSXValue {
  provide(QueryClientContext, props.client)

  const engine = getEngine(props.client)
  engine.mount()
  onCleanup(() => engine.unmount())

  return resolveChildren(props.children)
}

/** Returns the client provided by `<QueryClientProvider>`; throws outside it. */
export function useQueryClient(): ZeusQueryClient {
  const client = inject(QueryClientContext, undefined)

  if (!client) {
    throw new Error(
      '[Zeus query] useQueryClient() must be called inside <QueryClientProvider>.',
    )
  }

  return client
}

/**
 * Observes a query from the surrounding `<QueryClientProvider>`. The
 * observer is created once; its result is projected onto stable accessors, so
 * reading `data()`, `pending()` or `error()` inside a binding only updates
 * that binding. Pass a function to re-evaluate the options reactively.
 */
export function useQuery<T, E = Error>(
  options: ZeusQueryOptions<T, E> | (() => ZeusQueryOptions<T, E>),
): ZeusQuery<T, E> {
  const engine = getEngine(useQueryClient())
  const readOptions = (): ZeusQueryOptions<T, E> =>
    typeof options === 'function' ? options() : options
  const observer = new QueryObserver<T, E, T, T, QueryKey>(
    engine,
    toEngineQueryOptions(readOptions()),
  )
  const [state, setState] = createSignal<ZeusQueryState<T, E>>(
    toQueryState(observer.getCurrentResult()),
  )
  const unsubscribe = observer.subscribe(result => {
    batch(() => setState(toQueryState(result)))
  })
  let disposed = false

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unsubscribe()
    observer.destroy()
  }

  if (typeof options === 'function' && getCurrentScope()) {
    createEffect(() => {
      if (!disposed) observer.setOptions(toEngineQueryOptions(readOptions()))
    })
  }
  if (getCurrentScope()) onCleanup(dispose)

  return {
    state,
    data: () => state().data,
    error: () => state().error,
    status: () => state().status,
    pending: () => state().pending,
    success: () => state().success,
    errorState: () => state().errorState,
    stale: () => state().stale,
    isFetching: () => state().fetchStatus !== 'idle',
    refetch: () =>
      observer.refetch({ cancelRefetch: true }).then(result => {
        if (result.error) throw result.error
        return result.data as T
      }),
    cancel: () => engine.cancelQueries({ queryKey: readOptions().queryKey }),
    dispose,
  }
}

/** Observes an infinite query from the surrounding `<QueryClientProvider>`. */
export function useInfiniteQuery<T, E = Error, TParam = unknown>(
  options:
    | ZeusInfiniteQueryOptions<T, E, TParam>
    | (() => ZeusInfiniteQueryOptions<T, E, TParam>),
): ZeusInfiniteQuery<T, E, TParam> {
  const engine = getEngine(useQueryClient())
  const readOptions = (): ZeusInfiniteQueryOptions<T, E, TParam> =>
    typeof options === 'function' ? options() : options
  const observer = new InfiniteQueryObserver<
    T,
    E,
    ZeusInfiniteData<T, TParam>,
    QueryKey,
    TParam
  >(engine, toEngineInfiniteOptions(readOptions()))
  const [state, setState] = createSignal<
    ZeusQueryState<ZeusInfiniteData<T, TParam>, E>
  >(toInfiniteQueryState(observer.getCurrentResult()))
  const unsubscribe = observer.subscribe(result => {
    batch(() => setState(toInfiniteQueryState(result)))
  })
  let disposed = false

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unsubscribe()
    observer.destroy()
  }

  if (typeof options === 'function' && getCurrentScope()) {
    createEffect(() => {
      if (!disposed) observer.setOptions(toEngineInfiniteOptions(readOptions()))
    })
  }
  if (getCurrentScope()) onCleanup(dispose)

  return {
    state,
    data: () => state().data,
    error: () => state().error,
    status: () => state().status,
    pending: () => state().pending,
    success: () => state().success,
    errorState: () => state().errorState,
    stale: () => state().stale,
    isFetching: () => state().fetchStatus !== 'idle',
    hasNextPage: () => state().hasNextPage ?? false,
    isFetchingNextPage: () => state().isFetchingNextPage ?? false,
    fetchNextPage: () =>
      observer.fetchNextPage().then(result => {
        if (result.error) throw result.error
      }),
    refetch: () =>
      observer.refetch({ cancelRefetch: true }).then(result => {
        if (result.error) throw result.error
        return result.data as ZeusInfiniteData<T, TParam>
      }),
    cancel: () => engine.cancelQueries({ queryKey: readOptions().queryKey }),
    dispose,
  }
}

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
export function useMutation<T, V = void, E = Error, TContext = unknown>(
  options:
    | ZeusMutationOptions<T, E, V, TContext>
    | (() => ZeusMutationOptions<T, E, V, TContext>),
): ZeusMutation<T, V, E> {
  const client = useQueryClient()
  const engine = getEngine(client)
  const readOptions = (): ZeusMutationOptions<T, E, V, TContext> =>
    typeof options === 'function' ? options() : options
  const helpers: ZeusMutationHelpers = { client }
  const requestControllers = new Set<AbortController>()
  const queuedControllers: AbortController[] = []
  const controllersByContext = new WeakMap<object, AbortController>()
  let disposed = false

  const buildObserverOptions = (): ConstructorParameters<
    typeof MutationObserver<T, E, V, TContext>
  >[1] => {
    const current = readOptions()
    return {
      retry: current.retry,
      retryDelay: current.retryDelay,
      networkMode: current.networkMode,
      meta: current.meta,
      mutationFn: async (variables, context: MutationFunctionContext) => {
        let requestController = controllersByContext.get(context)
        if (!requestController) {
          requestController = queuedControllers.shift()
          if (requestController)
            controllersByContext.set(context, requestController)
        }
        if (!requestController) {
          throw new Error(
            '[Zeus query] Mutation request was not initialized; call mutate()/mutateAsync().',
          )
        }
        if (disposed) {
          throw new Error('[Zeus query] Mutation has been disposed.')
        }
        return readOptions().mutationFn(variables, {
          signal: requestController.signal,
        })
      },
      onMutate: variables =>
        readOptions().onMutate?.(variables, helpers) as
          | TContext
          | Promise<TContext>,
      onSuccess: (data, variables, onMutateResult) =>
        readOptions().onSuccess?.(data, variables, onMutateResult, helpers),
      onError: (error, variables, onMutateResult) =>
        readOptions().onError?.(error, variables, onMutateResult, helpers),
      onSettled: (data, error, variables, onMutateResult) =>
        readOptions().onSettled?.(
          data,
          error,
          variables,
          onMutateResult,
          helpers,
        ),
    }
  }

  const observer = new MutationObserver<T, E, V, TContext>(
    engine,
    buildObserverOptions(),
  )
  const [state, setState] = createSignal<ZeusMutationState<T, E>>(
    toMutationState(observer.getCurrentResult()),
  )
  const unsubscribe = observer.subscribe(result => {
    batch(() => setState(toMutationState(result)))
  })

  const cancel = async (): Promise<void> => {
    const pendingControllers = [...requestControllers]
    // query-core may invoke mutationFn on the next microtask. Let it install
    // the consumer's abort listener before delivering cancellation.
    await Promise.resolve()
    for (const requestController of pendingControllers)
      requestController.abort()
  }

  const mutateAsync = (variables: V): Promise<T> => {
    if (disposed) {
      return Promise.reject(
        new Error('[Zeus query] Mutation has been disposed.'),
      )
    }
    // Refresh retry/meta/callbacks for a function-form options object before
    // the mutation starts; the observer is created once and otherwise keeps
    // the options captured at initialization.
    if (typeof options === 'function')
      observer.setOptions(buildObserverOptions())
    const requestController = new AbortController()
    requestControllers.add(requestController)
    queuedControllers.push(requestController)
    return observer
      .mutate(variables)
      .finally(() => requestControllers.delete(requestController))
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    for (const requestController of requestControllers)
      requestController.abort()
    unsubscribe()
    observer.reset()
  }
  if (getCurrentScope()) onCleanup(dispose)

  return {
    state,
    data: () => state().data,
    error: () => state().error,
    pending: () => state().pending,
    success: () => state().success,
    errorState: () => state().errorState,
    mutate: variables => {
      void mutateAsync(variables).catch(() => undefined)
    },
    mutateAsync,
    reset: () => observer.reset(),
    cancel,
    dispose,
  }
}

function runQuery<T, E>(
  engine: QueryClient,
  options: ZeusQueryFetchOptions<T, E>,
): Promise<T> {
  const signal = options.signal

  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ?? new DOMException('Aborted', 'AbortError'),
    )
  }

  return engine.query({
    queryKey: options.queryKey,
    queryFn: context =>
      Promise.resolve(
        options.queryFn({
          queryKey: context.queryKey,
          signal: signal
            ? combineSignals(context.signal, signal)
            : context.signal,
          meta: context.meta,
        }),
      ),
    enabled: options.enabled,
    staleTime: options.staleTime,
    gcTime: options.gcTime,
    retry: options.retry,
    retryDelay: options.retryDelay,
    networkMode: options.networkMode,
    initialData: options.initialData,
    meta: options.meta,
  } as Parameters<QueryClient['query']>[0]) as Promise<T>
}

function combineSignals(signal: AbortSignal, other: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, other])
  }

  const controller = new AbortController()
  const abort = (event: Event): void =>
    controller.abort((event.target as AbortSignal).reason)
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener('abort', abort, { once: true })
  if (other.aborted) controller.abort(other.reason)
  else other.addEventListener('abort', abort, { once: true })
  return controller.signal
}

function resolveChildren(
  children: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof children === 'function' ? children() : (children ?? null)
}

function toEngineFilters(filters: ZeusQueryFilters | undefined): QueryFilters {
  if (!filters) return {}
  return {
    queryKey: filters.queryKey,
    exact: filters.exact,
    type: filters.type,
    stale: filters.stale,
  }
}

function toEngineQueryOptions<T, E>(
  options: ZeusQueryOptions<T, E>,
): QueryObserverOptions<T, E, T, T, QueryKey> {
  return {
    queryKey: options.queryKey,
    queryFn: context =>
      Promise.resolve(
        options.queryFn({
          queryKey: context.queryKey,
          signal: context.signal,
          meta: context.meta,
        }),
      ),
    enabled: options.enabled,
    staleTime: options.staleTime,
    gcTime: options.gcTime,
    retry: options.retry,
    retryDelay: options.retryDelay,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
    refetchOnMount: options.refetchOnMount,
    refetchOnReconnect: options.refetchOnReconnect,
    refetchInterval: options.refetchInterval,
    networkMode: options.networkMode,
    initialData: options.initialData,
    placeholderData: options.placeholderData,
    select: options.select,
    meta: options.meta,
  } as QueryObserverOptions<T, E, T, T, QueryKey>
}

function toEngineInfiniteOptions<T, E, TParam>(
  options: ZeusInfiniteQueryOptions<T, E, TParam>,
): InfiniteQueryObserverOptions<
  T,
  E,
  ZeusInfiniteData<T, TParam>,
  QueryKey,
  TParam
> {
  return {
    queryKey: options.queryKey,
    queryFn: (context: QueryFunctionContext<QueryKey, TParam>) =>
      Promise.resolve(
        options.queryFn({
          queryKey: context.queryKey,
          signal: context.signal,
          meta: context.meta,
          pageParam: context.pageParam as TParam,
        }),
      ),
    initialPageParam: options.initialPageParam,
    getNextPageParam: options.getNextPageParam,
    getPreviousPageParam: options.getPreviousPageParam,
    enabled: options.enabled,
    staleTime: options.staleTime,
    gcTime: options.gcTime,
    retry: options.retry,
    retryDelay: options.retryDelay,
    networkMode: options.networkMode,
    meta: options.meta,
  } as InfiniteQueryObserverOptions<
    T,
    E,
    ZeusInfiniteData<T, TParam>,
    QueryKey,
    TParam
  >
}

function toQueryState<T, E>(
  result: QueryObserverResult<T, E>,
): ZeusQueryState<T, E> {
  return {
    data: result.data,
    error: result.error,
    status: result.status,
    fetchStatus: result.fetchStatus,
    pending: result.isPending,
    success: result.isSuccess,
    errorState: result.isError,
    stale: result.isStale,
    updatedAt: result.dataUpdatedAt,
  }
}

function toInfiniteQueryState<T, E, TParam>(
  result: InfiniteQueryObserverResult<ZeusInfiniteData<T, TParam>, E>,
): ZeusQueryState<ZeusInfiniteData<T, TParam>, E> {
  return {
    data: result.data,
    error: result.error,
    status: result.status,
    fetchStatus: result.fetchStatus,
    pending: result.isPending,
    success: result.isSuccess,
    errorState: result.isError,
    stale: result.isStale,
    updatedAt: result.dataUpdatedAt,
    hasNextPage: result.hasNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
  }
}

function toMutationState<T, E, V>(
  result: MutationObserverResult<T, E, V, unknown>,
): ZeusMutationState<T, E> {
  return {
    data: result.data,
    error: result.error,
    status: result.status,
    pending: result.isPending,
    success: result.isSuccess,
    errorState: result.isError,
  }
}
