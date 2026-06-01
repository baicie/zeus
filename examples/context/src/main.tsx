import { createContext, inject } from '@zeus-js/runtime-dom'
import { defineElement, Host, Slot, state, render } from '@zeus-js/zeus'

type ThemeValue = { mode: 'light' | 'dark'; toggle: () => void }
type UserValue = { name: string; level: number }

const ThemeContext = createContext<ThemeValue>()
const UserContext = createContext<UserValue>({ name: 'Guest', level: 0 })

function ThemeToggle() {
  const theme = inject(ThemeContext) as ThemeValue
  return (
    <div class={`theme-toggle ${theme.mode}`}>
      <span class="mode-label">Theme: {theme.mode}</span>
      <button onClick={theme.toggle}>Toggle</button>
    </div>
  )
}

function UserBadge() {
  const user = inject(UserContext) as UserValue
  return (
    <div class="user-badge">
      <span class="user-name">{user.name}</span>
      <span class="user-level">Lv.{user.level}</span>
    </div>
  )
}

function DeepChild() {
  const theme = inject(ThemeContext) as ThemeValue
  const user = inject(UserContext) as UserValue
  return (
    <div class="deep-child">
      <p>
        {user.name} (level {user.level}) is using {theme.mode} mode
      </p>
    </div>
  )
}

function MiddleChild() {
  return <DeepChild />
}

defineElement(
  'z-context-card',
  { shadow: false, consumes: [ThemeContext, UserContext] },
  () => {
    const theme = inject(ThemeContext) as ThemeValue
    const user = inject(UserContext) as UserValue
    return (
      <Host>
        <div class={`wc-card ${theme.mode}`}>
          <div class="wc-header">
            <Slot name="header">
              <strong>{user.name}</strong>
            </Slot>
          </div>
          <div class="wc-body">
            <Slot>
              <p>No content provided.</p>
            </Slot>
          </div>
          <div class="wc-footer">
            <span class="wc-mode">{theme.mode}</span>
            <span class="wc-level">Lv.{user.level}</span>
          </div>
        </div>
      </Host>
    )
  },
)

function App() {
  const theme = state<ThemeValue>({
    mode: 'light',
    toggle() {
      this.mode = this.mode === 'light' ? 'dark' : 'light'
    },
  })
  const user = state<UserValue>({ name: 'Alice', level: 12 })

  return (
    <ThemeContext.Provider value={theme}>
      <UserContext.Provider value={user}>
        <div class="panel">
          <div class="panel-header">
            <h2>Context Demo</h2>
            <ThemeToggle />
          </div>
          <UserBadge />
          <div class="panel-body">
            <MiddleChild />
          </div>
          <div class="panel-wc">
            <h3>Web Component with context</h3>
            <p>
              The custom element below receives theme + user context via the DOM
              bridge.
            </p>
            <ThemeContext.Provider value={theme} bridge>
              <UserContext.Provider value={user} bridge>
                <z-context-card>
                  <span slot="header">
                    <UserBadge />
                  </span>
                  <p>Slotted content inside the Web Component.</p>
                </z-context-card>
              </UserContext.Provider>
            </ThemeContext.Provider>
          </div>
        </div>
      </UserContext.Provider>
    </ThemeContext.Provider>
  )
}

render(() => <App />, document.getElementById('root')!)
