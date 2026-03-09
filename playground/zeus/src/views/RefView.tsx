import { type Ref, onMount, useRef } from '@zeus-js/core'

const SUBTITLE =
  'Demonstrates ref attribute for accessing DOM elements directly'

function RefChild({ inputRef }: { inputRef: Ref<HTMLInputElement> }) {
  onMount(function () {
    if (inputRef) {
      inputRef.focus()
      console.log('Child: Input focused via ref')
    }
  })

  return (
    <div class="demo-box">
      Child Component - Input inside child:
      <input
        ref={inputRef}
        type="text"
        placeholder="I will be focused on mount"
      />
    </div>
  )
}

function RefView() {
  const buttonRef = useRef<HTMLButtonElement>()
  const inputRef = useRef<HTMLInputElement>()
  const boxRef = useRef<HTMLDivElement>()

  let showLog = true

  onMount(function () {
    console.log('View mounted')
    if (buttonRef) {
      console.log('Button ref available:', buttonRef.textContent)
    }
  })

  function handleButtonClick() {
    alert('Button clicked!')
  }

  function focusInput() {
    if (inputRef) {
      inputRef.focus()
    }
  }

  function getBoxInfo() {
    if (boxRef) {
      const rect = boxRef.getBoundingClientRect()
      alert(`Box dimensions: ${rect.width}x${rect.height}`)
    }
  }

  function clearInput() {
    if (inputRef) {
      inputRef.value = ''
    }
  }

  return (
    <div class="demo-card">
      <h2>🔗 DOM Ref</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>useRef for DOM Elements</h3>
        <p>Use ref attribute to get direct access to DOM elements.</p>
      </div>

      <div class="section">
        <h3>Button Ref</h3>
        <button
          ref={buttonRef}
          class="btn btn-primary"
          onClick={handleButtonClick}
        >
          Click Me (check console)
        </button>
      </div>

      <div class="section">
        <h3>Input Ref</h3>
        <input ref={inputRef} type="text" placeholder="Type something..." />
        <div class="btn-group" style={{ marginTop: '0.5rem' }}>
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
          ref={boxRef}
          class="demo-box"
          style={{
            width: '200px',
            height: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Box for size check
        </div>
        <button
          class="btn btn-secondary"
          onClick={getBoxInfo}
          style={{ marginTop: '0.5rem' }}
        >
          Get Box Size
        </button>
      </div>

      <div class="section">
        <h3>Ref with Child Component</h3>
        <RefChild inputRef={inputRef} />
        <p class="note">
          The child component focuses the input on mount using the ref passed
          from parent.
        </p>
      </div>
    </div>
  )
}

export default RefView
