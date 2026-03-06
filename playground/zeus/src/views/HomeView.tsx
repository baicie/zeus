import router from '../router'

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
    desc: 'signal() — fine-grained reactivity with increment / decrement / reset',
    color: '#7c6fe0',
  },
  {
    path: '/conditional',
    icon: '🔀',
    title: 'Conditional Rendering',
    desc: 'Ternary & logical-AND branch compilation. DOM nodes created only when needed.',
    color: '#f38ba8',
  },
  {
    path: '/list',
    icon: '📋',
    title: 'List Rendering',
    desc: 'Array.map() over a signal. Add, remove and toggle items dynamically.',
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
    desc: 'computed() derives state from multiple signals. Automatically re-runs.',
    color: '#fab387',
  },
]

const SUBTITLE =
  'A comprehensive showcase of Zeus compilation features. Select a demo from the sidebar or the cards below.'
const HOW_IT_WORKS =
  'Zeus compiles JSX to fine-grained DOM operations — template(), insert() and effect() — with zero Virtual DOM overhead.'

function FeatureCardEl(card: FeatureCard): HTMLElement {
  const el = document.createElement('div')
  el.className = 'feature-card'
  el.style.borderTop = '3px solid ' + card.color
  el.innerHTML =
    '<div class="icon">' +
    card.icon +
    '</div>' +
    '<h3>' +
    card.title +
    '</h3>' +
    '<p>' +
    card.desc +
    '</p>'
  el.addEventListener('click', function () {
    router.push(card.path)
  })
  return el
}

function HomeView() {
  return (
    <div class="demo-card">
      <h2>Zeus Framework Demo</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Choose a Demo</h3>
        <div class="feature-grid">
          {FEATURES.map(card => FeatureCardEl(card))}
        </div>
      </div>

      <div class="section" style={{ marginTop: '2rem' }}>
        <div class="preview-box">
          <strong>How it works: </strong>
          {HOW_IT_WORKS}
        </div>
      </div>
    </div>
  )
}

export default HomeView
