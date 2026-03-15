import { signal } from '@zeus-js/core'

function Child({ shouldError }: { shouldError: () => boolean }) {
  console.log('Child', shouldError())
  if (shouldError()) {
    return <h1>Error</h1>
  }
  return <h1>Child</h1>
}

// ── Main component ──
function ConditionalView() {
  const shouldError = signal(false)

  return (
    <div class="demo-card">
      <h2>🔀 Conditional Rendering</h2>
      <button onClick={() => shouldError(!shouldError())}>
        Should Error is {shouldError() ? 'true' : 'false'}
      </button>

      <Child shouldError={shouldError} />
    </div>
  )
}

export default ConditionalView
