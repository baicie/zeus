import { computed, signal } from '@zeus-js/core'

const SUBTITLE =
  'Zeus compiles logical && and ternary ?: into insert() calls with reactive accessors. Only the live branch touches the DOM.'

type Theme = 'light' | 'dark'
type Status = 'idle' | 'loading' | 'success' | 'error'

// ── Sub-components — can now be used as <PanelVisible /> JSX tags ──

function PanelVisible() {
  return (
    <div
      class="panel"
      style={{
        marginTop: '.75rem',
        background: '#f0ebff',
        borderColor: '#c4b5fd',
      }}
    >
      <strong>Panel is visible!</strong>
      <p style={{ marginTop: '.4rem', fontSize: '.875rem', color: '#6b7280' }}>
        This element is removed from the DOM when the signal is false.
      </p>
    </div>
  )
}

function ThemeLight() {
  return (
    <div class="panel panel-light" style={{ marginTop: '.75rem' }}>
      ☀️ <strong>Light Mode</strong> — bright background, dark text.
    </div>
  )
}

function ThemeDark() {
  return (
    <div class="panel panel-dark" style={{ marginTop: '.75rem' }}>
      🌙 <strong>Dark Mode</strong> — dark background, light text.
    </div>
  )
}

function StatusLoading() {
  return (
    <div class="preview-box" style={{ marginTop: '.75rem' }}>
      Simulating an async operation… Only this branch is in the DOM right now.
    </div>
  )
}

function StatusSuccess() {
  return (
    <div
      class="preview-box"
      style={{
        marginTop: '.75rem',
        background: '#edfdf4',
        borderColor: '#86efac',
      }}
    >
      ✓ Operation completed successfully!
    </div>
  )
}

function StatusError() {
  return (
    <div
      class="preview-box"
      style={{
        marginTop: '.75rem',
        background: '#fff0f0',
        borderColor: '#fca5a5',
      }}
    >
      ✕ Something went wrong. Try again.
    </div>
  )
}

// ── Main component ──

function ConditionalView() {
  const showPanel = signal(true)
  const theme = signal<Theme>('light')
  const status = signal<Status>('idle')

  function cycleStatus() {
    const order: Status[] = ['idle', 'loading', 'success', 'error']
    const idx = order.indexOf(status())
    status(order[(idx + 1) % order.length])
  }

  const btnLabel = computed(function () {
    return showPanel() ? 'Hide Panel' : 'Show Panel'
  })
  const switchLabel = computed(function () {
    return theme() === 'light' ? '🌙 Dark' : '☀️ Light'
  })
  const badgeClass = computed(function () {
    return status() === 'success'
      ? 'chip chip-green'
      : status() === 'error'
        ? 'chip chip-red'
        : 'chip chip-purple'
  })
  const badgeText = computed(function () {
    return status() === 'idle'
      ? '○ Idle'
      : status() === 'loading'
        ? '⟳ Loading…'
        : status() === 'success'
          ? '✓ Success'
          : '✕ Error'
  })

  return (
    <div class="demo-card">
      <h2>🔀 Conditional Rendering</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Logical AND — show / hide</h3>
        <div class="btn-group">
          <button
            class="btn btn-primary"
            onClick={() => showPanel(!showPanel())}
          >
            {btnLabel()}
          </button>
        </div>
        {showPanel() && <PanelVisible />}
      </div>

      <div class="section">
        <h3>Ternary — switch between branches</h3>
        <div class="btn-group">
          <button
            class="btn btn-secondary"
            onClick={() => theme(theme() === 'light' ? 'dark' : 'light')}
          >
            Switch to {switchLabel()}
          </button>
        </div>
        {theme() === 'light' ? <ThemeLight /> : <ThemeDark />}
      </div>

      <div class="section">
        <h3>Multi-branch — chained ternary (status badge)</h3>
        <div class="btn-group">
          <button class="btn btn-secondary" onClick={cycleStatus}>
            Next Status →
          </button>
          <span class={badgeClass()}>{badgeText()}</span>
        </div>
        {status() === 'loading' && <StatusLoading />}
        {status() === 'success' && <StatusSuccess />}
        {status() === 'error' && <StatusError />}
      </div>
    </div>
  )
}

export default ConditionalView
