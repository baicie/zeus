# Router

`@zeus-js/router` adapts the framework-agnostic data router from
`@remix-run/router` to Zeus signals. Matching, nested routes, params, data loading,
history, preload, and error propagation stay in the router engine. Zeus exposes
the resulting state through accessors for exact DOM bindings.

```tsx
import { createRoot, createSignal, render } from '@zeus-js/zeus'
import { createRouter } from '@zeus-js/router'

const router = createRouter({
  routes: [
    {
      id: 'root',
      path: '/',
      children: [
        { id: 'home', index: true },
        {
          id: 'user',
          path: 'users/:id',
          loader: async ({ params }) => fetch(`/api/users/${params.id}`),
          hasErrorBoundary: true,
        },
      ],
    },
  ],
})

function CurrentLocation() {
  const pathname = router.pathname
  const params = router.params
  const errors = router.errors

  return (
    <main>
      <p>{pathname()}</p>
      <p>{params().id}</p>
      {errors() && <p role="alert">The route could not be loaded.</p>}
      <button onClick={() => router.navigate('/users/42')}>Open user</button>
      <button onMouseEnter={() => router.preload('/users/42')}>Preload</button>
    </main>
  )
}

render(() => <CurrentLocation />, document.getElementById('root')!)
```

When `createRouter` runs in an active Zeus owner, that owner's cleanup disposes
the router subscription and aborts active navigation/fetcher work. Call
`router.dispose()` when creating it outside an owner. The default history is
browser history in a DOM and memory history in non-browser environments; pass a
history explicitly to control the environment.

`pathname`, `search`, and `hash` preserve the URL's encoded string forms.
`params` merges params from the matched route chain. `matches`, `loaderData`,
`actionData`, `errors`, `navigation`, `revalidation`, and `initialized` expose
the underlying state through stable Zeus accessors.

In a browser, `preload(href)` invokes the matching leaf route loader without
committing the location and removes its temporary fetcher after it settles.
Failures reject the promise and are also exposed through `errors()` for the
route's configured error boundary. `@remix-run/router` prohibits fetcher preloads
during server rendering, so call it only from browser interactions.
