import { RouterView } from '@zeus-js/router'
import { effect } from '@zeus-js/core'
import router from './router'

interface NavItem {
  path: string
  icon: string
  label: string
  desc: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: '🏠', label: 'Home', desc: 'Overview' },
  { path: '/counter', icon: '🔢', label: 'Counter', desc: 'signal()' },
  {
    path: '/conditional',
    icon: '🔀',
    label: 'Conditional',
    desc: 'branch rendering',
  },
  { path: '/list', icon: '📋', label: 'List Render', desc: 'array mapping' },
  {
    path: '/binding',
    icon: '✏️',
    label: 'Two-way Bind',
    desc: 'reactive input',
  },
  { path: '/computed', icon: '⚡', label: 'Computed', desc: 'derived state' },
  { path: '/lifecycle', icon: '🔄', label: 'Lifecycle', desc: 'hooks demo' },
  { path: '/ref', icon: '🔗', label: 'Ref', desc: 'DOM reference' },
  {
    path: '/builtin',
    icon: '🔧',
    label: 'Built-in',
    desc: 'Fragment, Portal...',
  },
]

function NavLink(props: NavItem): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = '#' + props.path
  a.className = 'nav-link'
  a.innerHTML = '<span class="nav-icon">' + props.icon + '</span>' + props.label

  // Navigate on click
  a.addEventListener('click', function (e) {
    e.preventDefault()
    router.push(props.path)
  })

  // Reactively toggle active class based on current route
  // Use _currentRouteComputed which reads a signal for proper reactivity
  const routeComputed = (router as any)._currentRouteComputed
  effect(function () {
    // Read the computed to track the route signal
    const route = routeComputed()
    const current = route ? route.path : ''
    if (current === props.path) {
      a.classList.add('active')
    } else {
      a.classList.remove('active')
    }
  })

  return a
}

function App() {
  return (
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <h1>⚡ Zeus</h1>
          <p>Framework Demo</p>
        </div>
        <div class="nav-section">Navigation</div>
        {NAV_ITEMS.map(function (item) {
          return NavLink(item)
        })}
      </aside>
      <main class="content">
        <RouterView />
      </main>
    </div>
  )
}

export default App
