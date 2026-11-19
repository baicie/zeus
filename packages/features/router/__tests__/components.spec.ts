import { bindText, createComponent, render } from '@zeus-js/runtime-dom'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRouter,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigation,
  useParams,
  useRouteError,
} from '../src'

import type {
  ZeusLoaderFunctionArgs,
  ZeusRouteObject,
  ZeusRouter,
} from '../src'
import type { JSXValue } from '@zeus-js/runtime-dom'

const userLoader = vi.fn(async ({ params }: ZeusLoaderFunctionArgs) => ({
  name: `User ${params.id}`,
}))

function routes(): ZeusRouteObject[] {
  return [
    {
      id: 'root',
      path: '/',
      element: () => {
        const host = document.createElement('div')
        host.setAttribute('data-testid', 'layout')
        const header = document.createElement('header')
        header.textContent = 'Shell'
        host.append(header)
        const outlet = createComponent(Outlet, {}) as JSXValue
        host.append(outlet as Node)
        return host
      },
      children: [
        {
          id: 'home',
          index: true,
          element: () => {
            const page = document.createElement('p')
            page.setAttribute('data-testid', 'home')
            page.textContent = 'Home'
            return page
          },
        },
        {
          id: 'user',
          path: 'users/:id',
          loader: userLoader,
          element: () => {
            const page = document.createElement('section')
            page.setAttribute('data-testid', 'user')
            const params = useParams()
            const data = useLoaderData()
            const name = document.createElement('h1')
            name.setAttribute('data-testid', 'user-name')
            const nameText = document.createTextNode('')
            name.append(nameText)
            bindText(nameText, () => String(params().id))
            const label = document.createElement('p')
            label.setAttribute('data-testid', 'user-label')
            const labelText = document.createTextNode('')
            label.append(labelText)
            bindText(
              labelText,
              () => (data().user as { name?: string } | undefined)?.name ?? '',
            )
            const link = createComponent(Link, {
              to: `/users/${params().id}`,
              'data-testid': 'self-link',
            })
            page.append(name, label, link as Node)
            return page
          },
          errorElement: () => {
            const page = document.createElement('section')
            page.setAttribute('data-testid', 'user-error')
            const error = useRouteError()
            const status = document.createElement('p')
            status.setAttribute('data-testid', 'user-error-status')
            const value = document.createTextNode('')
            status.append(value)
            bindText(value, () => {
              const current = error()
              return current &&
                typeof current === 'object' &&
                'status' in current
                ? String((current as { status: unknown }).status)
                : 'error'
            })
            page.append(status)
            return page
          },
        },
      ],
    },
  ]
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for condition')
}

describe('@zeus-js/router declarative layer', () => {
  let dom: JSDOM
  let container: HTMLElement

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    })
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('DocumentFragment', dom.window.DocumentFragment)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent)
    // FormData/URLSearchParams/Request stay native: the engine builds the
    // request for submissions, and a JSDOM FormData cannot be encoded by the
    // Node Request implementation.

    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
    userLoader.mockReset()
  })

  it('renders the matched route element through nested Outlets', async () => {
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/users/1'] }),
      window: dom.window as unknown as Window,
    })

    const dispose = render(
      () =>
        createComponent(RouterProvider, {
          router,
          children: () => createComponent(Outlet, {}),
        }),
      container,
    )

    await waitFor(
      () => container.querySelector('[data-testid="user"]') !== null,
    )

    expect(container.querySelector('[data-testid="layout"]')).not.toBeNull()
    expect(
      container.querySelector('[data-testid="user-name"]')?.textContent,
    ).toBe('1')
    await waitFor(
      () =>
        container.querySelector('[data-testid="user-label"]')?.textContent ===
        'User 1',
    )

    dispose()
    router.dispose()
  })

  it('keeps layout state while only replacing the leaf on navigation', async () => {
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/users/1'] }),
      window: dom.window as unknown as Window,
    })

    const dispose = render(
      () =>
        createComponent(RouterProvider, {
          router,
          children: () => createComponent(Outlet, {}),
        }),
      container,
    )

    await waitFor(
      () => container.querySelector('[data-testid="user"]') !== null,
    )
    const layout = container.querySelector('[data-testid="layout"]')
    if (!layout) throw new Error('layout missing')
    layout.setAttribute('data-state', 'kept')

    await router.navigate('/users/2')
    await waitFor(
      () =>
        container.querySelector('[data-testid="user-name"]')?.textContent ===
        '2',
    )

    expect(
      container
        .querySelector('[data-testid="layout"]')
        ?.getAttribute('data-state'),
    ).toBe('kept')

    dispose()
    router.dispose()
  })

  it('keeps a transparent error boundary healthy while children render', async () => {
    userLoader
      .mockResolvedValueOnce({ name: 'ok' })
      .mockRejectedValueOnce(new Response('missing', { status: 404 }))

    const router = createRouter({
      routes: [
        {
          id: 'root',
          path: '/',
          element: () => {
            const shell = document.createElement('div')
            shell.setAttribute('data-testid', 'shell')
            const label = document.createElement('strong')
            label.textContent = 'Shell'
            shell.append(label, createComponent(Outlet, {}) as Node)
            return shell
          },
          children: [
            {
              id: 'admin',
              path: 'admin',
              // No element: a transparent error boundary for its children.
              errorElement: () => {
                const page = document.createElement('section')
                page.setAttribute('data-testid', 'admin-error')
                page.textContent = 'Admin error'
                return page
              },
              children: [
                {
                  id: 'user',
                  path: 'users/:id',
                  loader: userLoader,
                  element: () => {
                    const page = document.createElement('p')
                    page.setAttribute('data-testid', 'user')
                    return page
                  },
                },
              ],
            },
          ],
        },
      ],
      history: createMemoryHistory({ initialEntries: ['/admin/users/1'] }),
      window: dom.window as unknown as Window,
    })

    const dispose = render(
      () => createComponent(RouterProvider, { router }),
      container,
    )

    // Healthy: the transparent route passes through to the leaf element while
    // the shell stays mounted.
    await waitFor(
      () => container.querySelector('[data-testid="user"]') !== null,
    )
    expect(container.querySelector('[data-testid="shell"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="admin-error"]')).toBeNull()

    // Navigate to a leaf whose loader fails: the transparent boundary now
    // renders its error UI in place of the leaf, and the shell survives.
    await router.navigate('/admin/users/2')
    await waitFor(
      () => container.querySelector('[data-testid="admin-error"]') !== null,
    )
    expect(container.querySelector('[data-testid="shell"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="user"]')).toBeNull()

    dispose()
    router.dispose()
  })

  it('renders an errorElement and recovers after a successful re-navigation', async () => {
    userLoader.mockRejectedValueOnce(new Response('missing', { status: 404 }))

    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/users/9'] }),
      window: dom.window as unknown as Window,
    })

    const dispose = render(
      () =>
        createComponent(RouterProvider, {
          router,
          children: () => createComponent(Outlet, {}),
        }),
      container,
    )

    await waitFor(
      () => container.querySelector('[data-testid="user-error"]') !== null,
    )
    expect(
      container.querySelector('[data-testid="user-error-status"]')?.textContent,
    ).toBe('404')

    userLoader.mockResolvedValue({ name: 'Recovered' })
    await router.navigate('/users/9', { replace: true })
    await waitFor(
      () =>
        container.querySelector('[data-testid="user-label"]')?.textContent ===
        'Recovered',
    )
    expect(container.querySelector('[data-testid="user-error"]')).toBeNull()

    dispose()
    router.dispose()
  })

  it('intercepts plain link clicks and navigates without a reload', async () => {
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      window: dom.window as unknown as Window,
    })
    const navigate = vi.spyOn(router, 'navigate')

    const dispose = render(
      () =>
        createComponent(RouterProvider, {
          router,
          children: () => {
            const home = document.createElement('div')
            const link = createComponent(Link, {
              to: '/users/1',
              'data-testid': 'to-user',
            })
            home.append(link as Node, createComponent(Outlet, {}) as Node)
            return home
          },
        }),
      container,
    )

    await waitFor(
      () => container.querySelector('[data-testid="home"]') !== null,
    )

    const anchor = container.querySelector<HTMLAnchorElement>(
      '[data-testid="to-user"]',
    )
    expect(anchor).not.toBeNull()
    expect(anchor!.getAttribute('href')).toBe('/users/1')

    const click = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    })
    anchor!.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(navigate).toHaveBeenCalledWith('/users/1', expect.any(Object))

    await waitFor(
      () => container.querySelector('[data-testid="user"]') !== null,
    )

    dispose()
    router.dispose()
  })

  it('does not intercept modified or external clicks', async () => {
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      window: dom.window as unknown as Window,
    })
    const navigate = vi.spyOn(router, 'navigate')

    const dispose = render(
      () =>
        createComponent(RouterProvider, {
          router,
          children: () =>
            createComponent(Link, {
              to: '/users/1',
              'data-testid': 'to-user',
            }),
        }),
      container,
    )

    const anchor = container.querySelector<HTMLAnchorElement>(
      '[data-testid="to-user"]',
    )!
    const modified = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    })
    anchor.dispatchEvent(modified)
    expect(modified.defaultPrevented).toBe(false)
    expect(navigate).not.toHaveBeenCalled()

    dispose()
    router.dispose()
  })

  it('exposes navigation state and route params through hooks', async () => {
    let observed: {
      state: string
      pathname: string
      param: string | undefined
    } = { state: '', pathname: '', param: undefined }

    const router = createRouter({
      routes: [
        {
          id: 'root',
          path: '/',
          element: () => {
            const navigation = useNavigation()
            const location = useLocation()
            const params = useParams()
            const node = document.createElement('output')
            node.setAttribute('data-testid', 'state')
            const text = document.createTextNode('')
            node.append(text)
            // A binding keeps this up to date without re-running the component.
            bindText(
              text,
              () =>
                `${navigation().state}:${location().pathname}:${params().id ?? ''}`,
            )
            observed = {
              state: navigation().state,
              pathname: location().pathname,
              param: params().id,
            }
            return node
          },
          children: [
            {
              id: 'item',
              path: 'items/:id',
              loader: async ({ params }) => ({ id: params.id }),
              element: () => document.createElement('span'),
            },
          ],
        },
      ],
      history: createMemoryHistory({ initialEntries: ['/items/7'] }),
      window: dom.window as unknown as Window,
    })

    const dispose = render(
      () => createComponent(RouterProvider, { router }),
      container,
    )

    await waitFor(() => observed.param === '7')
    expect(observed.pathname).toBe('/items/7')

    dispose()
    router.dispose()
  })

  it('binds links to the router basename', async () => {
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/app'] }),
      basename: '/app',
      window: dom.window as unknown as Window,
    })

    const dispose = render(
      () =>
        createComponent(RouterProvider, {
          router,
          children: () =>
            createComponent(Link, {
              to: '/users/1',
              'data-testid': 'based-link',
            }),
        }),
      container,
    )

    const anchor = container.querySelector<HTMLAnchorElement>(
      '[data-testid="based-link"]',
    )
    expect(anchor?.getAttribute('href')).toBe('/app/users/1')

    dispose()
    router.dispose()
  })

  it('removes the fetcher and aborts its request when the owner is disposed', async () => {
    let abortSignal: AbortSignal | undefined
    let submitted: string | undefined
    let release: (() => void) | undefined

    // The component is mounted through a fixture route so fetchers get a
    // route context without relying on compiled JSX.
    const router: ZeusRouter = createRouter({
      routes: [
        {
          id: 'root',
          path: '/',
          element: () => {
            const fetcher = useFetcher<{ ok: boolean }>()
            const button = document.createElement('button')
            button.setAttribute('data-testid', 'submit')
            button.addEventListener('click', () => {
              fetcher.submit({ name: 'ada' }, { method: 'post' })
            })
            const state = document.createElement('span')
            state.setAttribute('data-testid', 'fetcher-state')
            bindText(document.createTextNode(''), () => fetcher.state())
            const status = document.createElement('span')
            status.setAttribute('data-testid', 'fetcher-status')
            status.append(state)
            return [button, status]
          },
          action: async ({ request }) => {
            abortSignal = request.signal
            const form = await request.formData()
            submitted = String(form.get('name'))
            // Keeps the fetcher submitting until the test disposes its owner.
            await new Promise<void>(resolve => {
              release = resolve
              request.signal.addEventListener('abort', () => resolve())
            })
            return { ok: !request.signal.aborted }
          },
        },
      ],
      history: createMemoryHistory({ initialEntries: ['/'] }),
      window: dom.window as unknown as Window,
    })

    const dispose = render(
      () => createComponent(RouterProvider, { router }),
      container,
    )

    container
      .querySelector<HTMLButtonElement>('[data-testid="submit"]')!
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

    await waitFor(() => submitted === 'ada')
    expect(abortSignal?.aborted).toBe(false)
    expect(router.fetchers().size).toBe(1)

    dispose()
    // Disposing the owner removes the fetcher and aborts its request.
    expect(abortSignal?.aborted).toBe(true)
    expect(router.fetchers().size).toBe(0)
    release?.()

    router.dispose()
  })
})
