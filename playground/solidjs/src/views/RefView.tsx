import { onMount } from 'solid-js'
import type { RouteSectionProps } from '@solidjs/router'

const SUBTITLE =
  'SolidJS uses ref attribute with let variables to get direct DOM element references. The ref is assigned immediately after the element is created.'

interface RefChildProps {
  inputRef: HTMLInputElement | undefined
}

function RefChild(props: RefChildProps) {
  onMount(() => {
    if (props.inputRef) {
      props.inputRef.focus()
      console.log('Child: Input focused via ref')
    }
  })

  return (
    <div class="demo-box">
      Child Component - Input inside child:
      <input
        ref={props.inputRef}
        type="text"
        placeholder="I will be focused on mount"
        style={{ 'margin-top': '0.5rem', display: 'block', width: '100%' }}
      />
    </div>
  )
}

function RefView(_props: RouteSectionProps) {
  let buttonEl: HTMLButtonElement | undefined
  let inputEl: HTMLInputElement | undefined
  let boxEl: HTMLDivElement | undefined

  onMount(() => {
    console.log('View mounted')
    if (buttonEl) {
      console.log('Button ref available:', buttonEl.textContent)
    }
  })

  function handleButtonClick() {
    alert('Button clicked!')
  }

  function focusInput() {
    if (inputEl) {
      inputEl.focus()
    }
  }

  function getBoxInfo() {
    if (boxEl) {
      const rect = boxEl.getBoundingClientRect()
      alert(`Box dimensions: ${Math.round(rect.width)}x${Math.round(rect.height)}`)
    }
  }

  function clearInput() {
    if (inputEl) {
      inputEl.value = ''
    }
  }

  return (
    <div class="demo-card">
      <h2>🔗 DOM Ref</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Button Ref</h3>
        <p style={{ 'font-size': '0.875rem', color: 'var(--muted)', 'margin-bottom': '0.75rem' }}>
          Use a <code>let</code> variable — SolidJS assigns the DOM element directly.
        </p>
        <button
          ref={buttonEl}
          class="btn btn-primary"
          onClick={handleButtonClick}
        >
          Click Me (check console)
        </button>
      </div>

      <div class="section">
        <h3>Input Ref</h3>
        <input
          ref={inputEl}
          type="text"
          placeholder="Type something..."
        />
        <div class="btn-group" style={{ 'margin-top': '0.5rem' }}>
          <button class="btn btn-secondary" onClick={focusInput}>
            Focus Input
          </button>
          <button class="btn btn-secondary" onClick={clearInput}>
            Clear Input
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Div Ref (getBoundingClientRect)</h3>
        <div
          ref={boxEl}
          class="demo-box"
          style={{
            width: '200px',
            height: '100px',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
          }}
        >
          Box for size check
        </div>
        <button
          class="btn btn-secondary"
          onClick={getBoxInfo}
          style={{ 'margin-top': '0.5rem' }}
        >
          Get Box Size
        </button>
      </div>

      <div class="section">
        <h3>Ref with Child Component</h3>
        <RefChild inputRef={inputEl} />
        <p
          class="char-count"
          style={{ display: 'block', 'margin-top': '0.5rem' }}
        >
          The child component focuses the input on mount using the ref passed
          from parent.
        </p>
      </div>
    </div>
  )
}

export default RefView
