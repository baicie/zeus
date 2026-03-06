import { computed, signal } from '@zeus-js/core'

const MAX_LEN = 100
const SUBTITLE =
  'Pattern: onInput updates a signal, and JSX expressions that read the signal re-render reactively. Zeus compiles them into effect()-wrapped DOM mutations.'

function colorForRatio(ratio: number): string {
  if (ratio < 0.6) return '#a6e3a1'
  if (ratio < 0.85) return '#fab387'
  return '#f38ba8'
}

// ── Extracted component functions ──

function EchoEmpty() {
  return <span style={{ color: '#9ca3af' }}>Live echo appears here…</span>
}

interface EchoFilledProps {
  text: () => string
}
function EchoFilled(props: EchoFilledProps) {
  return <span>{props.text()}</span>
}

function GreetingEmpty() {
  return <span style={{ color: '#9ca3af' }}>Enter a name above…</span>
}

interface GreetingFilledProps {
  name: () => string
}
function GreetingFilled(props: GreetingFilledProps) {
  return (
    <span>
      Hello, <strong>{props.name()}</strong>!
    </span>
  )
}

interface LangOptionProps {
  value: string
  isChecked: () => boolean
  onChange: (v: string) => void
}
function LangOption(props: LangOptionProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '.5rem',
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        name="lang"
        value={props.value}
        checked={props.isChecked()}
        onChange={(e: Event) =>
          props.onChange((e.target as HTMLInputElement).value)
        }
        style={{ accentColor: '#7c6fe0' }}
      />
      {props.value.charAt(0).toUpperCase() + props.value.slice(1)}
    </label>
  )
}

// ── Main component ──

function BindingView() {
  const message = signal('')
  const firstName = signal('')
  const lastName = signal('')
  const volume = signal(50)
  const lang = signal('typescript')

  function handleMessage(e: Event) {
    const val = (e.target as HTMLInputElement).value
    if (val.length <= MAX_LEN) message(val)
  }

  // computed() for all reactive expressions
  const charCount = computed(function () {
    return message().length
  })
  const remaining = computed(function () {
    return MAX_LEN - message().length
  })
  const echoIsEmpty = computed(function () {
    return message().length === 0
  })
  const boxColor = computed(function () {
    return colorForRatio(message().length / MAX_LEN)
  })

  const greetIsEmpty = computed(function () {
    return firstName().length === 0 && lastName().length === 0
  })
  const fullName = computed(function () {
    const f = firstName()
    const l = lastName()
    return f + (f && l ? ' ' : '') + l
  })

  const volumeLabel = computed(function () {
    return volume() === 0
      ? '🔇 Muted'
      : volume() < 33
        ? '🔈 Low'
        : volume() < 66
          ? '🔉 Medium'
          : '🔊 High'
  })
  const volDisplay = computed(function () {
    return volume()
  })

  const isRust = computed(function () {
    return lang() === 'rust'
  })
  const isTs = computed(function () {
    return lang() === 'typescript'
  })
  const isJs = computed(function () {
    return lang() === 'javascript'
  })

  return (
    <div class="demo-card">
      <h2>✏️ Two-way Data Binding</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Text Mirror</h3>
        <div class="field">
          <label>
            Your message ({charCount()} / {MAX_LEN})
          </label>
          <input placeholder="Start typing…" onInput={handleMessage} />
        </div>
        <div class="preview-box" style={{ borderColor: boxColor() }}>
          {echoIsEmpty() ? EchoEmpty() : EchoFilled({ text: message })}
        </div>
        <p class="char-count">{remaining()} characters remaining</p>
      </div>

      <div class="section">
        <h3>Derived Greeting</h3>
        <div class="calc-grid">
          <div class="field">
            <label>First name</label>
            <input
              placeholder="e.g. Jane"
              onInput={e => firstName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label>Last name</label>
            <input
              placeholder="e.g. Doe"
              onInput={e => lastName((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
        <div class="preview-box">
          {greetIsEmpty()
            ? GreetingEmpty()
            : GreetingFilled({ name: fullName })}
        </div>
      </div>

      <div class="section">
        <h3>Range Slider</h3>
        <div class="field">
          <label>Volume: {volDisplay()}%</label>
          <input
            type="range"
            min="0"
            max="100"
            onInput={e => volume(Number((e.target as HTMLInputElement).value))}
            style={{ width: '100%', accentColor: '#7c6fe0' }}
          />
        </div>
        <div class="preview-box">
          {volumeLabel()} — Volume: <strong>{volDisplay()}%</strong>
        </div>
      </div>

      <div class="section">
        <h3>Radio Group</h3>
        <div
          class="btn-group"
          style={{
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '.4rem',
          }}
        >
          {(['typescript', 'rust', 'javascript'] as const).map(function (l) {
            return LangOption({
              value: l,
              isChecked: function () {
                return lang() === l
              },
              onChange: function (v) {
                lang(v)
              },
            })
          })}
        </div>
        <div class="preview-box" style={{ marginTop: '.75rem' }}>
          Selected: <strong>{lang()}</strong>
          {isRust() && ' 🦀'}
          {isTs() && ' 🔷'}
          {isJs() && ' 🟨'}
        </div>
      </div>
    </div>
  )
}

export default BindingView
