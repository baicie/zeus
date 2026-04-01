import { createMemo, createSignal } from 'solid-js'
import type { RouteSectionProps } from '@solidjs/router'

const SUBTITLE =
  "Uses createSignal() from solid-js. Signals are the foundation of SolidJS reactivity — when a signal value changes, only the specific DOM nodes that depend on it are updated."

function CounterView(_props: RouteSectionProps) {
  const [count, setCount] = createSignal(0)
  const [step, setStep] = createSignal(1)

  function increment() {
    setCount(c => c + step())
  }
  function decrement() {
    setCount(c => c - step())
  }
  function reset() {
    setCount(0)
  }

  const nextValue = createMemo(() => count() + step())

  const chipClass = createMemo(() => {
    return count() > 0
      ? 'chip chip-green'
      : count() < 0
        ? 'chip chip-red'
        : 'chip chip-purple'
  })

  const chipText = createMemo(() => {
    return count() > 0 ? '▲ Positive' : count() < 0 ? '▼ Negative' : '● Zero'
  })

  const absValue = createMemo(() => {
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
          <button class="btn btn-secondary" onClick={() => setStep(1)}>
            ×1
          </button>
          <button class="btn btn-secondary" onClick={() => setStep(5)}>
            ×5
          </button>
          <button class="btn btn-secondary" onClick={() => setStep(10)}>
            ×10
          </button>
        </div>
        <div class="preview-box" style={{ 'margin-top': '.75rem' }}>
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
