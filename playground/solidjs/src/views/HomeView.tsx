import { useNavigate } from '@solidjs/router'
import type { RouteSectionProps } from '@solidjs/router'

interface FeatureCard {
  path: string
  icon: string
  title: string
  desc: string
  color: string
}

const FEATURES: FeatureCard[] = [
  {
    path: '/counter',
    icon: '🔢',
    title: 'Reactive Counter',
    desc: 'createSignal() — fine-grained reactivity with increment / decrement / reset',
    color: '#7c6fe0',
  },
  {
    path: '/conditional',
    icon: '🔀',
    title: 'Conditional Rendering',
    desc: 'Show / Switch branch compilation. DOM nodes created only when needed.',
    color: '#f38ba8',
  },
  {
    path: '/list',
    icon: '📋',
    title: 'List Rendering',
    desc: '<For> over a signal array. Add, remove and toggle items dynamically.',
    color: '#a6e3a1',
  },
  {
    path: '/binding',
    icon: '✏️',
    title: 'Two-way Binding',
    desc: 'onInput + signal mirrors keyboard input reactively in the DOM.',
    color: '#89dceb',
  },
  {
    path: '/computed',
    icon: '⚡',
    title: 'Computed Values',
    desc: 'createMemo() derives state from multiple signals. Automatically re-runs.',
    color: '#fab387',
  },
]

const SUBTITLE =
  'A comprehensive showcase of SolidJS reactivity features. Select a demo from the sidebar or the cards below.'

const HOW_IT_WORKS =
  "SolidJS compiles JSX to fine-grained DOM operations — reactive signals, memoized computations and effect tracking — with zero Virtual DOM overhead."

export default function HomeView(_props: RouteSectionProps) {
  const navigate = useNavigate()

  return (
    <div class="demo-card">
      <h2>SolidJS Framework Demo</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Choose a Demo</h3>
        <div class="feature-grid">
          {FEATURES.map(card => (
            <div
              class="feature-card"
              style={{ 'border-top': `3px solid ${card.color}` }}
              onClick={() => navigate(card.path)}
            >
              <div class="icon">{card.icon}</div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div class="section" style={{ 'margin-top': '2rem' }}>
        <div class="preview-box">
          <strong>How it works: </strong>
          {HOW_IT_WORKS}
        </div>
      </div>
    </div>
  )
}
