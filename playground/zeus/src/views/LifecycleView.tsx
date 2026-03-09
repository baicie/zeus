import { onCleanup, onMount, onUnmount, render } from '@zeus-js/core'

const SUBTITLE =
  'Demonstrates lifecycle hooks: onMount(), onUnmount(), and onCleanup()'

function LifecycleChild({ name }: { name: string }) {
  onMount(function () {
    console.log(`[${name}] Child onMount`)
  })

  onCleanup(function () {
    console.log(`[${name}] Child cleanup`)
  })

  onUnmount(function () {
    console.log(`[${name}] Child unmount`)
  })

  return <div class="demo-box">Child Component: {name}</div>
}

function LifecycleView() {
  let showChild = true
  let childKey = 0
  let mountedLogs: string[] = []
  let unmountedLogs: string[] = []

  onMount(function () {
    mountedLogs.push('Parent mounted!')
    console.log('Parent onMount called')
  })

  onCleanup(function () {
    console.log('Parent cleanup')
  })

  onUnmount(function () {
    unmountedLogs.push('Parent unmounted!')
    console.log('Parent onUnmount called')
  })

  function toggleChild() {
    showChild = !showChild
    render(LifecycleViewWrapper, document.getElementById('app')!)
  }

  function remountChild() {
    childKey++
    showChild = true
    render(LifecycleViewWrapper, document.getElementById('app')!)
  }

  return (
    <div class="demo-card">
      <h2>🔄 Lifecycle Hooks</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Lifecycle Flow</h3>
        <div class="flow-diagram">
          <div class="flow-step">
            <span class="flow-label">1. Mount</span>
            <span class="flow-desc">Component mounts → onMount() called</span>
          </div>
          <div class="flow-step">
            <span class="flow-label">2. Update</span>
            <span class="flow-desc">Before update → onCleanup() called</span>
          </div>
          <div class="flow-step">
            <span class="flow-label">3. Unmount</span>
            <span class="flow-desc">
              Component unmounts → onUnmount() called
            </span>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Demo Controls</h3>
        <div class="btn-group">
          <button class="btn btn-primary" onClick={toggleChild}>
            {showChild ? 'Hide Child' : 'Show Child'}
          </button>
          <button class="btn btn-secondary" onClick={remountChild}>
            Remount Child (key++)
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Console Output</h3>
        <div class="console-box">
          <p>Open browser console to see lifecycle logs:</p>
          <ul>
            <li>[Parent] Child onMount</li>
            <li>[Parent] Child unmount</li>
            <li>[Parent] Child cleanup</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h3>Child Component (key: {childKey})</h3>
        {showChild ? (
          <LifecycleChild name={`Child-${childKey}`} />
        ) : (
          <div class="demo-box">Child is hidden</div>
        )}
      </div>
    </div>
  )
}

function LifecycleViewWrapper() {
  return <LifecycleView />
}

export default LifecycleViewWrapper
