import { createSignal, onCleanup, onMount } from 'solid-js'
import type { RouteSectionProps } from '@solidjs/router'

const SUBTITLE =
  'SolidJS lifecycle hooks: onMount runs after the component is first rendered, and onCleanup runs when the component is destroyed or before re-running effects.'

function LifecycleView(_props: RouteSectionProps) {
  const [count, setCount] = createSignal(0)
  const [log, setLog] = createSignal<string[]>([])

  function addLog(msg: string) {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  onMount(() => {
    addLog('onMount called — component mounted')
    console.log('onMount: component has been rendered')
  })

  onCleanup(() => {
    addLog('onCleanup called — component will unmount or effect cleaned up')
    console.log('onCleanup: cleanup triggered')
  })

  function increment() {
    setCount(c => c + 1)
    addLog(`Count incremented to ${count() + 1}`)
  }

  return (
    <div class="demo-card">
      <h2>🔄 Lifecycle Hooks</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Counter Demo</h3>
        <div class="count-display" style={{ 'font-size': '3rem' }}>
          {count()}
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" onClick={increment}>
            + Increment
          </button>
          <button
            class="btn btn-secondary"
            onClick={() => setCount(0)}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Lifecycle Log</h3>
        <div
          class="panel panel-dark"
          style={{
            'max-height': '240px',
            'overflow-y': 'auto',
            'font-family': 'Monaco, Menlo, monospace',
            'font-size': '0.8rem',
          }}
        >
          {log().length === 0 ? (
            <div style={{ color: '#6c7086', padding: '1rem' }}>
              No lifecycle events yet. Click increment to trigger updates.
            </div>
          ) : (
            log().map(entry => (
              <div
                style={{
                  padding: '0.4rem 1rem',
                  'border-bottom': '1px solid #313244',
                  color: '#cdd6f4',
                }}
              >
                {entry}
              </div>
            ))
          )}
        </div>
        <p
          style={{
            'font-size': '0.78rem',
            color: 'var(--muted)',
            'margin-top': '0.5rem',
          }}
        >
          Check the browser console for detailed logs.
        </p>
      </div>

      <div class="section">
        <h3>How It Works</h3>
        <div class="preview-box">
          <ul
            style={{
              'padding-left': '1.2rem',
              display: 'flex',
              'flex-direction': 'column',
              gap: '0.5rem',
            }}
          >
            <li>
              <strong>onMount</strong> — runs once after initial render
            </li>
            <li>
              <strong>onCleanup</strong> — runs before component unmounts or
              when effects re-run
            </li>
            <li>
              SolidJS uses fine-grained reactivity, so components render once
              but <em>effects</em> can run multiple times.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default LifecycleView
