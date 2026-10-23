# Choose Zeus

Zeus compiles TSX into direct DOM operations and updates only the bindings that
depend on changed signals. Choose the package path that matches what you are
building.

## Zeus Native

Use Zeus Native when you are building an application whose UI and state are
owned by Zeus. Install `@zeus-js/zeus` and `@zeus-js/vite-plugin`, write TSX,
and mount with `render`.

```tsx
import { createSignal, render } from '@zeus-js/zeus'

function App() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>Count: {count()}</button>
}

render(() => <App />, document.getElementById('root')!)
```

Use Native when you want fine-grained updates, direct DOM output, and an app
that uses Zeus signals and components end to end.

## Web Components

Use the Web Components toolchain when you are authoring reusable custom
elements. Keep one TSX source, then generate the custom elements and optional
framework wrappers with `@zeus-js/web-c`.

```tsx
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZNotice = defineElement('z-notice', {}, () => (
  <Host>
    <aside role="status">
      <Slot />
    </aside>
  </Host>
))
```

The generated custom element is the browser-facing contract. React and Vue
wrappers let those applications use the element with framework-appropriate
props, events, refs, and types.

## React or Vue applications

If the application already uses React or Vue, keep that framework in charge of
its app tree. Consume Zeus Web Components or generated wrappers at the
framework boundary. This works well when a component library needs to serve
multiple hosts without replacing their rendering model.

Zeus Native components return DOM nodes and are not React elements or Vue
render functions. A React or Vue application should not mount Native
components into its own reconciled subtree.

## When Zeus is not a fit

- Choose React or Vue directly when your application depends on their ecosystem,
  server-rendering framework, or component libraries throughout the app.
- Choose another framework when you require a mature router, data-fetching
  cache, or SSR and hydration stack as a supported turnkey product. Zeus keeps
  these concerns outside its core and does not currently provide an integrated
  meta-framework.
- Keep server-rendered pages static or use a framework with hydration when the
  page must preserve server-created DOM before client code starts. Zeus SSR
  currently renders HTML without hydrating that markup.
- Choose a VDOM framework when your integration fundamentally requires passing
  arbitrary React elements or Vue VNodes through third-party renderers. Zeus
  Web Components provide DOM slots and a renderer-adapter boundary, not a
  general VNode bridge.

## Start here

- [Complete the 15-minute Hello World](/guide/first-15-minutes)
- [阅读中文 15 分钟上手流程](/guide/first-15-minutes.zh-CN)
- [Build a Native app](/guide/getting-started)
- [Build a Web Component](/guide/quick-start)
- [Consume components from React](/guide/react)
- [Consume components from Vue](/guide/vue)
- [Server rendering limits](/guide/server-rendering)
