import { createMemo, createSignal, For, Show } from 'solid-js'
import type { RouteSectionProps } from '@solidjs/router'

const MAX_LEN = 100
const SUBTITLE =
  'Pattern: onInput updates a signal, and JSX expressions that read the signal update reactively. SolidJS compiles them into direct DOM mutations with no virtual DOM diffing.'

function colorForRatio(ratio: number): string {
  if (ratio < 0.6) return '#a6e3a1'
  if (ratio < 0.85) return '#fab387'
  return '#f38ba8'
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
        'align-items': 'center',
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
        style={{ 'accent-color': '#7c6fe0' }}
      />
      {props.value.charAt(0).toUpperCase() + props.value.slice(1)}
    </label>
  )
}

function BindingView(_props: RouteSectionProps) {
  const [message, setMessage] = createSignal('')
  const [firstName, setFirstName] = createSignal('')
  const [lastName, setLastName] = createSignal('')
  const [volume, setVolume] = createSignal(50)
  const [lang, setLang] = createSignal('typescript')

  // computed() equivalents
  const charCount = createMemo(() => message().length)
  const remaining = createMemo(() => MAX_LEN - message().length)
  const echoIsEmpty = createMemo(() => message().length === 0)
  const boxColor = createMemo(() =>
    colorForRatio(message().length / MAX_LEN)
  )

  const greetIsEmpty = createMemo(
    () => firstName().length === 0 && lastName().length === 0
  )
  const fullName = createMemo(() => {
    const f = firstName()
    const l = lastName()
    return f + (f && l ? ' ' : '') + l
  })

  const volumeLabel = createMemo(() => {
    if (volume() === 0) return '🔇 Muted'
    if (volume() < 33) return '🔈 Low'
    if (volume() < 66) return '🔉 Medium'
    return '🔊 High'
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
          <input
            placeholder="Start typing…"
            value={message()}
            onInput={(e: InputEvent) => {
              const val = (e.target as HTMLInputElement).value
              if (val.length <= MAX_LEN) setMessage(val)
            }}
          />
        </div>
        <div class="preview-box" style={{ 'border-color': boxColor() }}>
          <Show when={!echoIsEmpty()} fallback={<span style={{ color: '#9ca3af' }}>Live echo appears here…</span>}>
            <span>{message()}</span>
          </Show>
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
              value={firstName()}
              onInput={e =>
                setFirstName((e.target as HTMLInputElement).value)
              }
            />
          </div>
          <div class="field">
            <label>Last name</label>
            <input
              placeholder="e.g. Doe"
              value={lastName()}
              onInput={e => setLastName((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
        <div class="preview-box">
          <Show
            when={!greetIsEmpty()}
            fallback={<span style={{ color: '#9ca3af' }}>Enter a name above…</span>}
          >
            Hello, <strong>{fullName()}</strong>!
          </Show>
        </div>
      </div>

      <div class="section">
        <h3>Range Slider</h3>
        <div class="field">
          <label>Volume: {volume()}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={volume()}
            onInput={e =>
              setVolume(Number((e.target as HTMLInputElement).value))
            }
            style={{ width: '100%', 'accent-color': '#7c6fe0' }}
          />
        </div>
        <div class="preview-box">
          {volumeLabel()} — Volume: <strong>{volume()}%</strong>
        </div>
      </div>

      <div class="section">
        <h3>Radio Group</h3>
        <div
          class="btn-group"
          style={{
            'flex-direction': 'column',
            'align-items': 'flex-start',
            gap: '.4rem',
          }}
        >
          <For each={['typescript', 'rust', 'javascript']}>
            {l => (
              <LangOption
                value={l}
                isChecked={() => lang() === l}
                onChange={v => setLang(v)}
              />
            )}
          </For>
        </div>
        <div class="preview-box" style={{ 'margin-top': '.75rem' }}>
          Selected: <strong>{lang()}</strong>
          {lang() === 'rust' && ' 🦀'}
          {lang() === 'typescript' && ' 🔷'}
          {lang() === 'javascript' && ' 🟨'}
        </div>
      </div>
    </div>
  )
}

export default BindingView
