import {
  createSignal,
  ErrorBoundary,
  For,
  Show,
  Suspense,
  Switch,
  Match,
} from 'solid-js'
import { Portal } from 'solid-js/web'
import type { RouteSectionProps } from '@solidjs/router'
import styles from './BuiltinView.module.css'

const SUBTITLE =
  'Test built-in components: Show, Switch/Match, Portal, ErrorBoundary, Suspense'

// ── Show Demo (conditional, like Fragment but for branches) ──
function ShowDemo() {
  const [visible, setVisible] = createSignal(true)

  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>Show</h3>
      <p class={styles.sectionDesc}>
        Conditionally renders content. The when branch is only mounted when true.
      </p>
      <div class={styles.buttonGroup}>
        <button
          class={`${styles.btn} ${visible() ? styles.btnPrimary : ''}`}
          onClick={() => setVisible(true)}
        >
          Show
        </button>
        <button
          class={`${styles.btn} ${!visible() ? styles.btnPrimary : ''}`}
          onClick={() => setVisible(false)}
        >
          Hide
        </button>
      </div>
      <div class={styles.demoBox}>
        <Show when={visible()} fallback={<span class={styles.textMuted}>Content is hidden</span>}>
          <div class={styles.successBox}>
            Content is visible! Toggle to see the effect.
          </div>
        </Show>
      </div>
      <pre class={styles.codeBlock}>{`<Show when={visible()} fallback={<div>Hidden</div>}>
  <div>Visible</div>
</Show>`}</pre>
    </div>
  )
}

// ── Switch / Match Demo ──
function SwitchDemo() {
  const [tab, setTab] = createSignal<'home' | 'about' | 'contact'>('home')

  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>Switch / Match</h3>
      <p class={styles.sectionDesc}>
        Pattern matching for multiple conditions — cleaner than multiple if-else.
      </p>
      <div class={styles.buttonGroup}>
        <For each={(['home', 'about', 'contact'] as const)}>
          {t => (
            <button
              class={`${styles.btn} ${tab() === t ? styles.btnPrimary : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          )}
        </For>
      </div>
      <div class={styles.demoBox} style={{ 'flex-direction': 'column', gap: '0.5rem' }}>
        <Switch>
          <Match when={tab() === 'home'}>
            <div class={styles.successBox}>🏠 Home page content</div>
          </Match>
          <Match when={tab() === 'about'}>
            <div class={styles.successBox}>ℹ️ About page content</div>
          </Match>
          <Match when={tab() === 'contact'}>
            <div class={styles.successBox}>📧 Contact page content</div>
          </Match>
        </Switch>
      </div>
      <pre class={styles.codeBlock}>{`<Switch>
  <Match when={tab() === 'home'}>
    <HomePage />
  </Match>
  <Match when={tab() === 'about'}>
    <AboutPage />
  </Match>
</Switch>`}</pre>
    </div>
  )
}

// ── ErrorBoundary Demo ──
interface ErrorChildProps {
  shouldError: () => boolean
}

function ErrorChild(props: ErrorChildProps) {
  console.log('ErrorChild', props.shouldError())
  if (props.shouldError()) {
    throw new Error('Error from ErrorChild!')
  }
  return <div class={styles.successBox}>Normal rendering — no errors</div>
}

function ErrorBoundaryDemo() {
  const [showError, setShowError] = createSignal(false)

  return (
    <div class={styles.section}>
      <h3 class={styles.sectionTitle}>ErrorBoundary</h3>
      <p class={styles.sectionDesc}>
        Catches errors in child components and displays a fallback UI.
      </p>
      <div class={styles.buttonGroup}>
        <button
          class={`${styles.btn} ${!showError() ? styles.btnPrimary : ''}`}
          onClick={() => setShowError(false)}
        >
          Normal
        </button>
        <button
          class={`${styles.btn} ${showError() ? styles.btnDanger : ''}`}
          onClick={() => setShowError(true)}
        >
          Trigger Error
        </button>
      </div>
      <div class={styles.mt16}>
        <ErrorBoundary
          fallback={(error, reset) => (
            <div class={styles.errorBox}>
              <div class={styles.mb12}>
                <span style={{ 'font-size': '20px', 'margin-right': '8px' }}>⚠️</span>
                <span style={{ 'font-weight': '600' }}>
                  Error caught: {error.message}
                </span>
              </div>
              <button
                class={styles.btnSecondary}
                onClick={() => {
                  setShowError(false)
                  reset()
                }}
              >
                Reset
              </button>
            </div>
          )}
        >
          <ErrorChild shouldError={showError} />
        </ErrorBoundary>
      </div>
    </div>
  )
}

// ── Suspense Demo ──
function AsyncComponent() {
  return <div class={styles.successBox}>Async component loaded!</div>
}

function SuspenseChild() {
  return new Promise<any>(resolve => {
    setTimeout(() => {
      resolve(AsyncComponent)
    }, 1500)
  }) as unknown as any
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
            <div class={styles.loadingBox}>Loading async component (1.5s)...</div>
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
          <p class={styles.textMuted} style={{ 'margin-bottom': '8px' }}>
            Content in original location:
          </p>
          <div class={styles.portalSource}>This will be moved via Portal</div>
        </div>
      </div>
      <div class={styles.mt16}>
        <p class={styles.textMuted} style={{ 'margin-bottom': '8px' }}>
          Content moved via Portal:
        </p>
        <Portal mount={document.getElementById('portal-target-solid')!}>
          <div class={styles.portalBox}>
            I am rendered via Portal into #portal-target-solid!
          </div>
        </Portal>
      </div>
      <div id="portal-target-solid" class={styles.portalTarget}>
        <p class={styles.textMuted} style={{ 'margin-bottom': '8px' }}>
          Portal target container (check DOM):
        </p>
      </div>
      <pre class={styles.codeBlock}>{`<Portal mount={document.getElementById('modal-root')}>
  <div class="modal">Modal content</div>
</Portal>`}</pre>
    </div>
  )
}

// ── Main Component ──
function BuiltinView(_props: RouteSectionProps) {
  return (
    <div class={styles.container}>
      <h2 class={styles.title}>🔧 Built-in Components</h2>
      <p class={styles.subtitle}>{SUBTITLE}</p>

      <ShowDemo />
      <SwitchDemo />
      <ErrorBoundaryDemo />
      <SuspenseDemo />
      <PortalDemo />
    </div>
  )
}

export default BuiltinView
