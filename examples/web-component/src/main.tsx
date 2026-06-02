import './components/counter'
import './components/card'
import './components/host-button'

const counter = document.querySelector('z-counter') as HTMLElement & {
  initialCount?: number
}

counter?.addEventListener('change', event => {
  const detail = (event as CustomEvent<{ count: number }>).detail
  counter.initialCount = detail.count
})

const hostButton = document.querySelector('z-host-button') as HTMLElement & {
  disabled?: boolean
}

hostButton?.addEventListener('press', () => {
  console.info('Host Button pressed!')
})
