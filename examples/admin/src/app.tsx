import { QueryClientProvider, createQueryClient } from '@zeus-js/query'
import { RouterProvider } from '@zeus-js/router'
import { createEffect, createSignal, onCleanup, Show } from '@zeus-js/zeus'
import { createResource } from '@zeus-js/resource'

import { createAdminRouter } from './router'
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
      <section
        class="login-card"
        aria-labelledby="login-title"
        data-testid="login-card"
      >
        <p class="eyebrow">Zeus Admin · 受保护工作空间</p>
        <h1 id="login-title">登录管理后台</h1>
        <p class="page-intro">
          会话由服务端 HttpOnly Cookie 管理。演示账号只在本机
          seed，不包含默认弱口令。
        </p>
        <form class="login-form" onSubmit={submit}>
          <label for="login-email">
            邮箱
            <input
              id="login-email"
              type="email"
              autocomplete="username"
              prop:value={email()}
              onInput={event =>
                setEmail((event.currentTarget as HTMLInputElement).value)
              }
              required
            />
          </label>
          <label for="login-password">
            密码
            <input
              id="login-password"
              type="password"
              autocomplete="current-password"
              prop:value={password()}
              onInput={event =>
                setPassword((event.currentTarget as HTMLInputElement).value)
              }
              required
            />
          </label>
          <Show when={error()}>
            <p role="alert" class="form-error" data-testid="login-error">
              {error()}
            </p>
          </Show>
          <button type="submit" disabled={busy()}>
            {busy() ? '登录中…' : '登录'}
          </button>
        </form>
        <p class="login-hint">
          本地首次运行请设置 <code>ZEUS_ADMIN_PASSWORD</code> 与
          <code>ZEUS_ADMIN_VIEWER_PASSWORD</code>。
        </p>
      </section>
    </main>
  )
}
