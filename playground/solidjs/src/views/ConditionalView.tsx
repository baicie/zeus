import { createSignal, Show } from 'solid-js'
import type { RouteSectionProps } from '@solidjs/router'

interface ChildProps {
  shouldError: () => boolean
}

function Child(props: ChildProps) {
  console.log('Child', props.shouldError())
  return (
    <Show
      when={props.shouldError()}
      fallback={
        <div>
          <h1>Child</h1>
        </div>
      }
    >
      <h1>Error</h1>
    </Show>
  )
}

function ConditionalView(_props: RouteSectionProps) {
  const [shouldError, setShouldError] = createSignal(false)

  return (
    <div class="demo-card">
      <h2>🔀 Conditional Rendering</h2>
      <p class="subtitle">
        SolidJS uses &lt;Show&gt; for conditional rendering. Components are
        created/destroyed based on the condition.
      </p>

      <button
        class="btn btn-primary"
        onClick={() => setShouldError(v => !v)}
      >
        Should Error is {shouldError() ? 'true' : 'false'}
      </button>

      <div style={{ 'margin-top': '1.5rem' }}>
        <Child shouldError={shouldError} />
      </div>
    </div>
  )
}

export default ConditionalView
