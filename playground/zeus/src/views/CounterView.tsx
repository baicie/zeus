import { computed, signal } from '@zeus-js/core'

const SUBTITLE =
  'Uses signal() from @zeus-js/core. The compiler wraps reactive JSX expressions in effect() so the DOM updates automatically when signal values change.'

function CounterView() {
  const count = signal(0)
  const step = signal(1)

  function increment() {
    count(count() + step())
  }
  function decrement() {
    count(count() - step())
  }
  function reset() {
    count(0)
  }

  const nextValue = computed(function () {
    return count() + step()
  })
  const chipClass = computed(function () {
    return count() > 0
      ? 'chip chip-green'
      : count() < 0
        ? 'chip chip-red'
        : 'chip chip-purple'
  })
  const chipText = computed(function () {
    return count() > 0 ? '▲ Positive' : count() < 0 ? '▼ Negative' : '● Zero'
  })
  const absValue = computed(function () {
    return count() < 0 ? -count() : count()
  })

  return (
    <div class="demo-card">
      <h2>🔢 Reactive Counter</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Counter Value</h3>
        <div class="count-display">{count()}</div>
        <div class="btn-group">
          <button class="btn btn-secondary" onClick={decrement}>
            − Decrement
          </button>
          <button class="btn btn-secondary" onClick={reset}>
            ↺ Reset
          </button>
          <button class="btn btn-primary" onClick={increment}>
            + Increment
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Step Size</h3>
        <div class="btn-group">
          <button class="btn btn-secondary" onClick={() => step(1)}>
            ×1
          </button>
          <button class="btn btn-secondary" onClick={() => step(5)}>
            ×5
          </button>
          <button class="btn btn-secondary" onClick={() => step(10)}>
            ×10
          </button>
        </div>
        <div class="preview-box" style={{ marginTop: '.75rem' }}>
          Step: <strong>{step()}</strong> — next will be{' '}
          <strong>{nextValue()}</strong>
        </div>
      </div>

      <div class="section">
        <h3>State Chips</h3>
        <div class="btn-group">
          <span class={chipClass()}>{chipText()}</span>
          <span class="chip chip-purple">Abs: {absValue()}</span>
        </div>
      </div>
    </div>
  )
}

export default CounterView
