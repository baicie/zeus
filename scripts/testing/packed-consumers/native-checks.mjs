import { mountCounter, mountSpreadProbe } from './native.tsx'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function runNativeChecks() {
  const container = document.getElementById('app')
  const counter = mountCounter(container)
  const node = document.getElementById('counter')
  node.click()
  assert(
    node.textContent === '1' && counter.setups() === 1,
    'native fine-grained update failed',
  )
  counter.dispose()
  counter.setCount(2)
  assert(
    counter.cleanups() === 1 && container.textContent === '',
    'native cleanup failed',
  )
  const spread = mountSpreadProbe(container)
  const spreadButton = document.getElementById('spread-probe')
  const child = document.getElementById('spread-child')
  assert(spreadButton.className === 'fixed', 'spread source order failed')
  assert(
    spreadButton.formatter === spread.formatter,
    'spread function identity changed',
  )
  assert(
    child.textContent === 'first',
    'component spread initial value missing',
  )
  spreadButton.click()
  spread.update()
  assert(
    document.getElementById('spread-probe') === spreadButton,
    'spread replaced native DOM',
  )
  assert(
    document.getElementById('spread-child') === child &&
      child.textContent === 'second',
    'component spread lost reactive getter',
  )
  assert(
    !spreadButton.hasAttribute('title'),
    'spread removed key left stale attribute',
  )
  assert(
    spreadButton.style.color === 'blue' &&
      spreadButton.style.backgroundColor === '',
    'spread style diff failed',
  )
  spreadButton.click()
  const state = spread.state()
  assert(
    state.firstClicks === 1 && state.secondClicks === 1,
    'spread event replacement failed',
  )
  assert(
    state.childSetups === 1 && state.formatterCalls === 0,
    'spread reran setup or formatter',
  )
  spread.dispose()
  spreadButton.click()
  const disposed = spread.state()
  assert(
    disposed.attached === 1 &&
      disposed.detached === 1 &&
      disposed.secondClicks === 1,
    'spread ref or listener cleanup failed',
  )
  assert(container.textContent === '', 'spread disposal left DOM')
}
