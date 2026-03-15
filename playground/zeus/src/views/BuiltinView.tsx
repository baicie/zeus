import {
  ErrorBoundary,
  Fragment,
  Portal,
  Suspense,
  Transition,
  signal,
} from '@zeus-js/core'
import styles from './BuiltinView.module.css'

const SUBTITLE =
  'Test built-in components: Fragment, Portal, ErrorBoundary, Suspense, Transition'

// ── Fragment Demo ──
function FragmentDemo() {
  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>Fragment</h3>
      <p class={styles.sectionDesc}>
        Renders children without wrapper element.
      </p>
      <div class={styles.demoBox}>
        <Fragment>
          <span class={styles.textRed}>Red text</span>
          <span class={`${styles.textBlue} ${styles.ml10}`}>Blue text</span>
        </Fragment>
      </div>
      <pre class={styles.codeBlock}>{`<Fragment>
  <span>Red text</span>
  <span>Blue text</span>
</Fragment>`}</pre>
    </div>
  )
}

// ── ErrorBoundary Demo ──
function ErrorChild({ shouldError = false }: { shouldError?: boolean }) {
  console.log('ErrorChild', shouldError())
  if (shouldError) {
    throw new Error('Error from ErrorChild!')
  }
  return <div class={styles.successBox}>Normal rendering</div>
}

function ErrorBoundaryDemo() {
  const showError = signal(false)

  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>ErrorBoundary</h3>
      <p class={styles.sectionDesc}>
        Catches errors in child components and displays fallback UI.
      </p>
      <div class={styles.buttonGroup}>
        <button
          class={`${styles.btn} ${showError() ? '' : styles.btnPrimary}`}
          onClick={() => showError(false)}
        >
          Normal
        </button>
        <button
          class={`${styles.btn} ${showError() ? styles.btnDanger : ''}`}
          onClick={() => {
            showError(true)
          }}
        >
          Trigger Error
        </button>
      </div>
      <div class={styles.mt16}>
        <ErrorBoundary
          fallback={(error, reset) => (
            <div class={styles.errorBox}>
              <div class={styles.mb12}>
                <span style={{ fontSize: '20px', marginRight: '8px' }}>⚠️</span>
                <span style={{ fontWeight: '600' }}>
                  Error caught: {error.message}
                </span>
              </div>
              <button
                class={styles.btnSecondary}
                onClick={() => {
                  showError(false)
                  reset()
                }}
              >
                Reset
              </button>
            </div>
          )}
        >
          <ErrorChild shouldError={showError()} />
        </ErrorBoundary>
      </div>
    </div>
  )
}

// ── Suspense Demo ──
// Pre-create the async component function
function AsyncComponent() {
  return <div class={styles.successBox}>Async component loaded!</div>
}

function SuspenseChild() {
  return new Promise<any>(function (resolve) {
    setTimeout(function () {
      resolve(AsyncComponent)
    }, 1500)
  })
}

function SuspenseDemo() {
  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>Suspense</h3>
      <p class={styles.sectionDesc}>
        Shows fallback while async content is loading.
      </p>
      <div class={styles.demoBox}>
        <Suspense
          fallback={
            <div class={styles.loadingBox}>Loading async component...</div>
          }
        >
          <SuspenseChild />
        </Suspense>
      </div>
      <pre
        class={styles.codeBlock}
      >{`<Suspense fallback={<div>Loading...</div>}>
   <SuspenseChild />
</Suspense>`}</pre>
    </div>
  )
}

// ── Transition Demo ──
function TransitionDemo() {
  const show = signal(true)

  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>Transition</h3>
      <p class={styles.sectionDesc}>
        Adds CSS transition effects when elements appear/disappear.
      </p>
      <div class={styles.buttonGroup}>
        <button
          class={`${styles.btn} ${show() ? styles.btnPrimary : ''}`}
          onClick={() => show(true)}
        >
          Show
        </button>
        <button
          class={`${styles.btn} ${!show() ? styles.btnPrimary : ''}`}
          onClick={() => show(false)}
        >
          Hide
        </button>
      </div>
      <div class={styles.transitionContainer}>
        <Transition
          name="fade"
          enter={true}
          leave={true}
          onEnter={el => {
            el.classList.add('fade-enter')
            requestAnimationFrame(function () {
              el.classList.add('fade-enter-active')
              el.classList.remove('fade-enter')
            })
          }}
          onLeave={(el, done) => {
            el.classList.add('fade-leave-active')
            setTimeout(function () {
              el.classList.remove('fade-leave-active')
              done()
            }, 300)
          }}
        >
          {show() && (
            <div class={styles.transitionBox}>Transitioning Element</div>
          )}
        </Transition>
      </div>
      <pre
        class={styles.codeBlock}
      >{`.fade-enter { opacity: 0; transform: translateY(-10px); }
.fade-enter-active { opacity: 1; transform: translateY(0); transition: all 300ms; }
.fade-leave { opacity: 1; transform: translateY(0); }
.fade-leave-active { opacity: 0; transform: translateY(10px); transition: all 300ms; }`}</pre>
    </div>
  )
}

// ── Portal Demo ──
function PortalDemo() {
  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>Portal</h3>
      <p class={styles.sectionDesc}>
        Renders content into a different DOM node.
      </p>
      <div class={styles.demoBox}>
        <div>
          <p class={styles.textMuted} style={{ marginBottom: '8px' }}>
            Content in original location:
          </p>
          <div class={styles.portalSource}>This will be moved</div>
        </div>
      </div>
      <div class={styles.mt16}>
        <p class={styles.textMuted} style={{ marginBottom: '8px' }}>
          Content moved via Portal:
        </p>
        <Portal target="#portal-target">
          <div class={styles.portalBox}>I am in a different location!</div>
        </Portal>
      </div>
      <div id="portal-target" class={styles.portalTarget}>
        <p class={styles.textMuted} style={{ marginBottom: '8px' }}>
          Portal target container:
        </p>
      </div>
      <pre class={styles.codeBlock}>{`<Portal target="#modal-root">
  <div class="modal">Modal content</div>
</Portal>`}</pre>
    </div>
  )
}

// ── Main Component ──
function BuiltinView() {
  return (
    <div class={styles.container}>
      <h2 class={styles.title}>🔧 Built-in Components</h2>
      <p class={styles.subtitle}>{SUBTITLE}</p>

      <FragmentDemo />
      <ErrorBoundaryDemo />
      <SuspenseDemo />
      <TransitionDemo />
      <PortalDemo />
    </div>
  )
}

export default BuiltinView
