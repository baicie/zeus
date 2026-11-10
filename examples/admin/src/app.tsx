import { QueryClientProvider, createQueryClient } from '@zeus-js/query'
import { RouterProvider } from '@zeus-js/router'
import { createEffect, createSignal, onCleanup, Show } from '@zeus-js/zeus'
import { createResource } from '@zeus-js/resource'

import { createAdminRouter } from './router'
import { Icon } from './shell/icon'
import { adminApi } from './pages'
import type { Role, SessionUser } from './routes'

/**
 * The application root owns the shared resources and provides them through
 * context. It initializes once: route changes only update bindings inside the
 * provider tree.
 */
export function App() {
  const session = createResource<SessionUser, void>(
    undefined,
    (_key, context) => adminApi.session(context.signal),
  )

  const [signedIn, setSignedIn] = createSignal(false)

  return (
    <Show
      when={!session.pending() || signedIn()}
      fallback={<p class="boot-status">正在验证会话…</p>}
    >
      <Show
        when={session.data()}
        fallback={
          <LoginPage
            onLogin={user => {
              setSignedIn(true)
              void session.refetch().catch(() => setSignedIn(false))
            }}
          />
        }
      >
        <AuthenticatedApp user={session.data()!} />
      </Show>
    </Show>
  )
}

function AuthenticatedApp(props: { user: SessionUser }) {
  const [role, setRole] = createSignal<Role>(props.user.role)
  const queryClient = createQueryClient()
  const router = createAdminRouter({
    queryClient,
    role,
    // Router internals live in a diagnostics panel rather than the product UI.
    diagnostics: true,
    onRoleChange: next => setRole(next),
    session: () => props.user,
    onLogout: async () => {
      const controller = new AbortController()
      await adminApi.logout(controller.signal)
    },
  })
  onCleanup(() => {
    router.dispose()
    queryClient.dispose()
  })

  createEffect(() => {
    document.title = `${router.pathname()} · Zeus Admin`
  })

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function LoginPage(props: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = createSignal('admin@zeus.local')
  const [password, setPassword] = createSignal('')
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  async function submit(event: Event): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = await adminApi.login(email(), password())
      props.onLogin(user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main class="login-page">
      <div class="login-shell">
        <aside class="login-aside" aria-hidden="true">
          <div class="login-aside-brand">
            <span class="brand-glyph">Z</span>
            Zeus Admin
          </div>
          <ul class="login-aside-list">
            <li>
              <Icon name="shield" />
              <span>服务端 HttpOnly 会话与 CSRF 校验</span>
            </li>
            <li>
              <Icon name="list" />
              <span>登录、越权与写操作全部进入审计日志</span>
            </li>
            <li>
              <Icon name="users" />
              <span>按角色区分管理员与只读成员</span>
            </li>
          </ul>
          <p class="login-aside-foot">Zeus Native · Router · Query</p>
        </aside>

        <section
          class="login-card"
          aria-labelledby="login-title"
          data-testid="login-card"
        >
          <div class="login-brand">
            <span class="brand-glyph" aria-hidden="true">
              Z
            </span>
            Zeus Admin
          </div>
          <div>
            <h1 id="login-title" class="login-title">
              登录管理后台
            </h1>
            <p class="login-description">
              使用工作空间凭据登录。会话由服务端 HttpOnly Cookie
              管理，不包含默认弱口令。
            </p>
          </div>
          <form class="login-form" onSubmit={submit}>
            <div class="field">
              <label class="field-label" for="login-email">
                邮箱
              </label>
              <input
                id="login-email"
                class="input"
                type="email"
                autocomplete="username"
                prop:value={email()}
                onInput={event =>
                  setEmail((event.currentTarget as HTMLInputElement).value)
                }
                required
              />
            </div>
            <div class="field">
              <label class="field-label" for="login-password">
                密码
              </label>
              <input
                id="login-password"
                class="input"
                type="password"
                autocomplete="current-password"
                prop:value={password()}
                onInput={event =>
                  setPassword((event.currentTarget as HTMLInputElement).value)
                }
                required
              />
            </div>
            <Show when={error()}>
              <p role="alert" class="form-error" data-testid="login-error">
                <Icon name="alert" /> {error()}
              </p>
            </Show>
            <button type="submit" class="btn btn-primary" disabled={busy()}>
              {busy() ? '登录中…' : '登录'}
            </button>
          </form>
          <p class="login-hint">
            本地首次运行请设置 <code>ZEUS_ADMIN_PASSWORD</code> 与{' '}
            <code>ZEUS_ADMIN_VIEWER_PASSWORD</code>。
          </p>
        </section>
      </div>
    </main>
  )
}
