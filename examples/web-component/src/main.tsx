import './components/counter'
import './components/card'

const counter = document.querySelector('z-counter') as HTMLElement & {
  initialCount?: number
}

counter?.addEventListener('change', event => {
  const detail = (event as CustomEvent<{ count: number }>).detail
  counter.initialCount = detail.count
})
