import { A } from '@solidjs/router'
import type { ParentProps } from 'solid-js'

interface NavItem {
  path: string
  icon: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/counter', icon: '🔢', label: 'Counter' },
  { path: '/conditional', icon: '🔀', label: 'Conditional' },
  { path: '/list', icon: '📋', label: 'List Render' },
  { path: '/binding', icon: '✏️', label: 'Two-way Bind' },
  { path: '/computed', icon: '⚡', label: 'Computed' },
  { path: '/lifecycle', icon: '🔄', label: 'Lifecycle' },
  { path: '/ref', icon: '🔗', label: 'Ref' },
  { path: '/builtin', icon: '🔧', label: 'Built-in' },
]

function App(props: ParentProps) {
  return (
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <h1>SolidJS</h1>
          <p>Framework Demo</p>
        </div>
        <div class="nav-section">Navigation</div>
        {NAV_ITEMS.map(item => (
          <A
            href={item.path}
            class="nav-link"
            activeClass="active"
            end={item.path === '/'}
          >
            <span class="nav-icon">{item.icon}</span>
            {item.label}
          </A>
        ))}
      </aside>
      <main class="content">{props.children}</main>
    </div>
  )
}

export default App
