import type { JSXElement } from '@zeus-js/core'
import { signal } from '@zeus-js/core'
import CounterView from './views/CounterView'
import HomeView from './views/HomeView'
import ListView from './views/ListView'
import SyntaxView from './views/SyntaxView'
import './App.css'

const NAV_ITEMS = [
  { key: 'home', icon: '🏠', label: 'Home' },
  { key: 'counter', icon: '🔢', label: 'Counter' },
  { key: 'list', icon: '📋', label: 'List' },
  { key: 'syntax', icon: '🧪', label: 'JSX Syntax' },
]

function Layout(props: { children?: JSXElement }): JSXElement {
  return (
    <div class="layout">
      <aside class="sidebar">
        <h1>Zeus Babel</h1>
        <p class="sub">Vite Playground</p>
      </aside>
      <main class="content">{props.children}</main>
    </div>
  )
}

export default function App(): JSXElement {
  const current = signal('home')

  function renderCurrent(): JSXElement {
    const key = current()
    if (key === 'counter') return <CounterView />
    if (key === 'list') return <ListView />
    if (key === 'syntax') return <SyntaxView />
    return <HomeView />
  }

  return (
    <Layout>
      <div class="tabs">
        {NAV_ITEMS.map(item => (
          <button
            class={current() === item.key ? 'tab active' : 'tab'}
            onClick={() => current(item.key)}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>
      {renderCurrent()}
    </Layout>
  )
}
