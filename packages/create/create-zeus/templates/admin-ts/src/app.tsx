import { For, Show, createSignal } from '@zeus-js/zeus'

type Page = 'audit' | 'roles' | 'users'

interface UserRow {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: string
}

const users: readonly UserRow[] = [
  { id: 'ada', name: 'Ada Lovelace', email: 'ada@example.test', role: 'admin' },
  {
    id: 'grace',
    name: 'Grace Hopper',
    email: 'grace@example.test',
    role: 'viewer',
  },
]

const roles = [
  { name: 'admin', permissions: 'users:read, users:write, audit:read' },
  { name: 'viewer', permissions: 'users:read' },
]

const audit = [
  { id: '1', actor: 'ada@example.test', action: 'login' },
  { id: '2', actor: 'ada@example.test', action: 'users:update' },
]

export function App() {
  const [signedIn, setSignedIn] = createSignal(false)
  const [page, setPage] = createSignal<Page>('users')
  const [search, setSearch] = createSignal('')

  const visibleUsers = () =>
    users.filter(user =>
      `${user.name} ${user.email}`
        .toLowerCase()
        .includes(search().trim().toLowerCase()),
    )

  return (
    <Show
      when={signedIn()}
      fallback={
        <main data-testid="login-card">
          <h1>Zeus Admin</h1>
          <p>Sign in with your workspace account.</p>
          <button type="button" onClick={() => setSignedIn(true)}>
            Sign in
          </button>
        </main>
      }
    >
      <div class="shell" data-testid="admin-layout">
        <aside aria-label="Admin navigation">
          <h2>Zeus Admin</h2>
          <nav>
            <button type="button" onClick={() => setPage('users')}>
              Users
            </button>
            <button type="button" onClick={() => setPage('roles')}>
              Roles
            </button>
            <button type="button" onClick={() => setPage('audit')}>
              Audit
            </button>
          </nav>
          <button type="button" onClick={() => setSignedIn(false)}>
            Sign out
          </button>
        </aside>
        <main>
          <Show when={page() === 'users'}>
            <section aria-labelledby="users-heading">
              <h1 id="users-heading">Users</h1>
              <label>
                Search users
                <input
                  type="search"
                  value={search()}
                  onInput={event => {
                    if (event.currentTarget instanceof HTMLInputElement) {
                      setSearch(event.currentTarget.value)
                    }
                  }}
                />
              </label>
              <ul>
                <For each={visibleUsers()}>
                  {user => (
                    <li data-testid={`user-${user.id}`}>
                      {user.name} · {user.email} · {user.role}
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
          <Show when={page() === 'roles'}>
            <section aria-labelledby="roles-heading">
              <h1 id="roles-heading">Roles</h1>
              <ul>
                <For each={roles}>
                  {role => (
                    <li>
                      {role.name}: {role.permissions}
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
          <Show when={page() === 'audit'}>
            <section aria-labelledby="audit-heading">
              <h1 id="audit-heading">Audit log</h1>
              <ol>
                <For each={audit}>
                  {entry => (
                    <li>
                      {entry.actor} · {entry.action}
                    </li>
                  )}
                </For>
              </ol>
            </section>
          </Show>
        </main>
      </div>
    </Show>
  )
}
