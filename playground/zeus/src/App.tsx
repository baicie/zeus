import type { JSXElement } from '@zeus-js/core'
import {
  NAV_ITEMS,
  RouterLink,
  RouterProvider,
  RouterView,
  router,
} from './router'

function Layout(props: { children?: JSXElement }): JSXElement {
  return (
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <h1>⚡ Zeus</h1>
          <p>Framework Demo</p>
        </div>
        <div class="nav-section">Navigation</div>
        {NAV_ITEMS.map(function (item) {
          return (
            <RouterLink to={item.path} class="nav-link" activeClass="active">
              <span class="nav-icon">{item.icon}</span>
              {item.label}
            </RouterLink>
          )
        })}
      </aside>
      <main class="content">{props.children}</main>
    </div>
  )
}

function App(): JSXElement {
  return (
    <RouterProvider router={router}>
      <Layout>
        <RouterView />
      </Layout>
    </RouterProvider>
  )
}

export default App
