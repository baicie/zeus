import {
  InfiniteQueryObserver,
  MutationObserver,
  QueryClient,
  QueryObserver,
  type MutationFunctionContext,
  type DefaultError,
  type InfiniteData,
  type InfiniteQueryObserverOptions,
  type InfiniteQueryObserverResult,
  type MutationObserverOptions,
  type MutationObserverResult,
  type QueryClientConfig,
  type QueryKey,
  type QueryObserverOptions,
  type QueryObserverResult,
} from '@tanstack/query-core'
import {
  batch,
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from '@zeus-js/signal'
import { getCurrentScope } from '@zeus-js/signal/internal'

export type { QueryClientConfig, QueryKey }

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
    context: { readonly signal: AbortSignal },
  ) => Promise<T> | T
}

export function createQueryClient(config?: QueryClientConfig): ZeusQueryClient {
  const client = new QueryClient(config)
  let disposed = false
  return {
    client,
    dispose: () => {
      if (disposed) return
      disposed = true
      void client.cancelQueries().finally(() => client.clear())
    },
  }
}

export function createQuery<T, E = DefaultError>(
  client: QueryClient | ZeusQueryClient,
  options:
    | QueryObserverOptions<T, E, T, T, QueryKey>
    | (() => QueryObserverOptions<T, E, T, T, QueryKey>),
): ZeusQuery<T, E> {
  const queryClient = unwrapClient(client)
  const readOptions = (): QueryObserverOptions<T, E, T, T, QueryKey> =>
    typeof options === 'function' ? options() : options
  const observer = new QueryObserver<T, E>(queryClient, readOptions())
  const [state, setState] = createSignal<QueryState<T, E>>(
    queryState(observer.getCurrentResult()),
  )
  const unsubscribe = observer.subscribe(result => {
    batch(() => setState(queryState(result)))
  })
  let disposed = false

  const syncOptions = (): void => {
    if (!disposed) observer.setOptions(readOptions())
  }
  if (typeof options === 'function' && getCurrentScope())
    createEffect(syncOptions)

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unsubscribe()
    observer.destroy()
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
    refetch: () => observer.refetch({ cancelRefetch: true }),
    cancel: () =>
      queryClient.cancelQueries({ queryKey: readOptions().queryKey }),
    dispose,
  }
}

export function createInfiniteQuery<T, E = DefaultError>(
  client: QueryClient | ZeusQueryClient,
  options: InfiniteQueryObserverOptions<
    T,
    E,
    InfiniteData<T>,
    QueryKey,
    unknown
  >,
): ZeusInfiniteQuery<T, E> {
  const queryClient = unwrapClient(client)
  const observer = new InfiniteQueryObserver<
    T,
    E,
    InfiniteData<T>,
    QueryKey,
    unknown
  >(queryClient, options)
  const [state, setState] = createSignal<QueryState<InfiniteData<T>, E>>(
    queryState(observer.getCurrentResult()),
  )
  const unsubscribe = observer.subscribe(result => {
    batch(() => setState(queryState(result)))
  })
  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unsubscribe()
    observer.destroy()
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
    fetchNextPage: () => observer.fetchNextPage(),
    refetch: () => observer.refetch({ cancelRefetch: true }),
    cancel: () => queryClient.cancelQueries({ queryKey: options.queryKey }),
    dispose,
  }
}

export function createMutation<T, V, E = DefaultError>(
  client: QueryClient | ZeusQueryClient,
  options: ZeusMutationOptions<T, E, V>,
): ZeusMutation<T, V, E> {
  const queryClient = unwrapClient(client)
  const requestControllers = new Set<AbortController>()
  const queuedControllers: AbortController[] = []
  const controllersByContext = new WeakMap<object, AbortController>()
  const observer = new MutationObserver<T, E, V, unknown>(queryClient, {
    ...options,
    mutationFn: async (variables, context: MutationFunctionContext) => {
      let requestController = controllersByContext.get(context)
      if (!requestController) {
        requestController = queuedControllers.shift()
        if (requestController)
          controllersByContext.set(context, requestController)
      }
      if (!requestController)
        throw new Error('Mutation request was not initialized')
      if (disposed) throw new Error('Mutation has been disposed')
      return options.mutationFn(variables, {
        signal: requestController.signal,
      })
    },
  })
  const [state, setState] = createSignal<MutationState<T, E>>(
    mutationState(observer.getCurrentResult()),
  )
  const unsubscribe = observer.subscribe(result => {
    batch(() => setState(mutationState(result)))
  })
  let disposed = false
  const cancel = async (): Promise<void> => {
    const pendingControllers = [...requestControllers]
    // query-core may invoke mutationFn on the next microtask. Let it install
    // the consumer's abort listener before delivering cancellation.
    await Promise.resolve()
    for (const requestController of pendingControllers)
      requestController.abort()
  }
  const mutateAsync = (variables: V): Promise<T> => {
    if (disposed) return Promise.reject(new Error('Mutation has been disposed'))
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

function unwrapClient(client: QueryClient | ZeusQueryClient): QueryClient {
  return client instanceof QueryClient ? client : client.client
}

function queryState<T, E>(
  result: QueryObserverResult<T, E> | InfiniteQueryObserverResult<T, E>,
): QueryState<T, E> {
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
    hasNextPage: 'hasNextPage' in result ? result.hasNextPage : undefined,
    isFetchingNextPage:
      'isFetchingNextPage' in result ? result.isFetchingNextPage : undefined,
  }
}

function mutationState<T, E, V>(
  result: MutationObserverResult<T, E, V, unknown>,
): MutationState<T, E> {
  return {
    data: result.data,
    error: result.error,
    status: result.status,
    pending: result.isPending,
    success: result.isSuccess,
    errorState: result.isError,
  }
}
