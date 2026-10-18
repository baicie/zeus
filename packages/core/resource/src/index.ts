import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from '@zeus-js/signal'
import { getCurrentScope } from '@zeus-js/signal/internal'

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

interface CacheEntry<T> {
  data: T
  updatedAt: number
}

const primitiveKey = (value: unknown): string => {
  if (typeof value === 'string') return `string:${value}`
  if (typeof value === 'number') return `number:${value}`
  if (typeof value === 'boolean') return `boolean:${value}`
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  throw new Error('Resource source objects require an explicit options.key')
}

/**
 * Creates a single-owner async resource. Every request has a generation and
 * AbortSignal, so a late response cannot overwrite a newer result.
 */
export function createResource<T, K>(
  source: Source<K>,
  fetcher: (source: K, context: ResourceContext) => Promise<T> | T,
  options: ResourceOptions<K, T> = {},
): Resource<T> {
  const keyOf = options.key ?? (primitiveKey as (source: K) => string)
  const cache = new Map<string, CacheEntry<T>>()
  const [state, setState] = createSignal<ResourceState<T>>({
    status: 'pending',
    pending: true,
    success: false,
    error: undefined,
    data: options.initialData,
    stale: options.initialData !== undefined,
    updatedAt: undefined,
  })
  let controller: AbortController | undefined
  let generation = 0
  let disposed = false
  let lastSource!: K

  const cancel = (): void => {
    generation++
    controller?.abort()
    controller = undefined
  }

  const refetch = async (): Promise<T> => {
    if (disposed) throw new Error('Resource has been disposed')
    const currentSource = lastSource
    const key = keyOf(currentSource)
    const now = Date.now()
    cancel()
    const requestGeneration = ++generation
    const cached = cache.get(key)
    if (
      cached &&
      options.staleTime !== undefined &&
      now - cached.updatedAt < options.staleTime
    ) {
      setState({
        status: 'success',
        pending: false,
        success: true,
        error: undefined,
        data: cached.data,
        stale: false,
        updatedAt: cached.updatedAt,
      })
      return cached.data
    }

    const requestController = new AbortController()
    controller = requestController
    const previous = state().data
    setState({
      status: 'pending',
      pending: true,
      success: false,
      error: undefined,
      data: previous,
      stale: previous !== undefined,
      updatedAt: state().updatedAt,
    })

    try {
      const data = await fetcher(currentSource, {
        signal: requestController.signal,
      })
      if (disposed || requestGeneration !== generation) {
        throw new Error('Resource request became stale')
      }
      const updatedAt = Date.now()
      cache.set(key, { data, updatedAt })
      setState({
        status: 'success',
        pending: false,
        success: true,
        error: undefined,
        data,
        stale: false,
        updatedAt,
      })
      return data
    } catch (error) {
      if (disposed || requestGeneration !== generation) throw error
      if (requestController.signal.aborted) {
        setState({
          ...state(),
          status: 'pending',
          pending: true,
          success: false,
          stale: state().data !== undefined,
        })
      } else {
        setState({
          ...state(),
          status: 'error',
          pending: false,
          success: false,
          error,
          stale: state().data !== undefined,
        })
      }
      throw error
    } finally {
      if (controller === requestController) controller = undefined
    }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    cancel()
    cache.clear()
  }

  const readSource = (): K =>
    typeof source === 'function' ? (source as Accessor<K>)() : source

  const load = (): void => {
    lastSource = readSource()
    void refetch().catch(() => undefined)
  }

  if (typeof source === 'function' && getCurrentScope()) {
    createEffect(load)
  } else {
    lastSource = readSource()
    void refetch().catch(() => undefined)
  }
  if (getCurrentScope()) onCleanup(dispose)

  return {
    state,
    status: () => state().status,
    pending: () => state().pending,
    success: () => state().success,
    error: () => state().error,
    data: () => state().data,
    stale: () => state().stale,
    updatedAt: () => state().updatedAt,
    refetch,
    cancel,
    dispose,
  }
}
