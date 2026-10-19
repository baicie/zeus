import { createResource } from '@zeus-js/resource'
import { ErrorBoundary, render } from '@zeus-js/zeus'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindText } from '../src'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Resource and ErrorBoundary integration', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('DocumentFragment', dom.window.DocumentFragment)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('routes an explicit resource error through a boundary after pending state', async () => {
    const container = document.createElement('main')
    const request = deferred<string>()
    const error = new Error('load failed')
    const resource = createResource('key', (_key, context) => {
      context.signal.addEventListener(
        'abort',
        () => request.reject('aborted'),
        {
          once: true,
        },
      )
      return request.promise
    })

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            const text = document.createTextNode('')
            bindText(text, () => {
              const currentError = resource.error()
              if (currentError) throw currentError
              return resource.pending()
                ? 'loading'
                : (resource.data() ?? 'empty')
            })
            return text
          },
          fallback: caught => {
            const node = document.createElement('strong')
            node.textContent = caught === error ? 'error' : 'wrong error'
            return node
          },
        }),
      container,
    )

    expect(container.textContent).toBe('loading')
    request.reject(error)

    await vi.waitFor(() => {
      expect(resource.status()).toBe('error')
      expect(container.textContent).toBe('error')
    })

    dispose()
    resource.dispose()
  })

  it('recovers after refetch succeeds and the failed branch is reset', async () => {
    const container = document.createElement('main')
    const requests: ReturnType<typeof deferred<string>>[] = []
    const error = new Error('first request failed')
    const resource = createResource('key', () => {
      const request = deferred<string>()
      requests.push(request)
      return request.promise
    })
    let reset!: () => void

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            const text = document.createTextNode('')
            bindText(text, () => {
              const currentError = resource.error()
              if (currentError) throw currentError
              return resource.pending()
                ? 'loading'
                : (resource.data() ?? 'empty')
            })
            return text
          },
          fallback: (_caught, retry) => {
            reset = retry
            return document.createTextNode('retry')
          },
        }),
      container,
    )

    requests[0]!.reject(error)
    await vi.waitFor(() => expect(container.textContent).toBe('retry'))

    const recovery = resource.refetch()
    requests[1]!.resolve('recovered')
    await expect(recovery).resolves.toBe('recovered')
    reset()

    expect(resource.status()).toBe('success')
    expect(container.textContent).toBe('recovered')

    dispose()
    resource.dispose()
  })

  it('cancels the resource request when the boundary owner is disposed', () => {
    const container = document.createElement('main')
    const request = deferred<string>()
    const abort = vi.fn()
    let resource!: ReturnType<typeof createResource<string, string>>

    const dispose = render(() => {
      resource = createResource('key', (_key, context) => {
        context.signal.addEventListener('abort', abort, { once: true })
        return request.promise
      })
      return ErrorBoundary({
        children: () => {
          const text = document.createTextNode('')
          bindText(text, () =>
            resource.pending() ? 'loading' : (resource.data() ?? 'empty'),
          )
          return text
        },
        fallback: () => document.createTextNode('error'),
      })
    }, container)

    expect(container.textContent).toBe('loading')
    dispose()

    expect(abort).toHaveBeenCalledOnce()
    expect(() => resource.dispose()).not.toThrow()
  })

  it('cancels an outer resource after child initialization fails and ignores late data', async () => {
    const container = document.createElement('main')
    const request = deferred<string>()
    const abort = vi.fn()
    const childError = new Error('child initialization failed')
    let resource!: ReturnType<typeof createResource<string, string>>

    const dispose = render(() => {
      resource = createResource('key', (_key, context) => {
        context.signal.addEventListener('abort', abort, { once: true })
        return request.promise
      })
      return ErrorBoundary({
        children: () => {
          throw childError
        },
        fallback: error => {
          const node = document.createElement('strong')
          node.textContent = error === childError ? 'fallback' : 'wrong error'
          return node
        },
      })
    }, container)

    expect(container.textContent).toBe('fallback')
    expect(resource.status()).toBe('pending')

    dispose()
    request.resolve('late')
    await request.promise
    await Promise.resolve()

    expect(abort).toHaveBeenCalledOnce()
    expect(resource.status()).toBe('pending')
    expect(resource.data()).toBeUndefined()
    expect(container.childNodes).toHaveLength(0)
  })
})
