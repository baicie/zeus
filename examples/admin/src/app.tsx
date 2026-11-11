import { QueryClientProvider, createQueryClient } from '@zeus-js/query'
import { RouterProvider } from '@zeus-js/router'
import { createEffect, createSignal, onCleanup, Show } from '@zeus-js/zeus'
import { createResource } from '@zeus-js/resource'

import { createAdminRouter } from './router'
import { Icon } from './shell/icon'
import { adminApi, isDemoBuild } from './admin-api'
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
    <>
      <Show when={isDemoBuild}>
        <DemoBanner />
      </Show>
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
    </>
  )
}

/**
 * The demo runs on GitHub Pages against a build-time snapshot, so it cannot
 * save anything. Saying so up front is the point: a visitor must never mistake
 * the demo for the deployment that actually holds their data.
 *
 * The banner is permanent and non-dismissible. A dismissible notice would let
 * the page look like the real console after one click.
 */
function DemoBanner() {
  return (
    <div class="demo-banner" role="status" data-testid="demo-banner">
      <strong>只读演示</strong>
      <span>
        数据为构建时的真实 API 快照，修改类操作已禁用。完整功能见 Docker
        部署版本。
      </span>
    </div>
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

/**
 * Sign-in, matching the reference's `features/auth/sign-in` card: a centred
 * 384px card on the page background, a brand row above it, and a compact form.
 * The reference's social buttons and "forgot password" are omitted because this
 * deployment has neither — an empty control would be a lie.
 */
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
        <div class="login-brand">
          <span class="brand-glyph" aria-hidden="true">
            Z
          </span>
          Zeus Admin
        </div>

        <section
          class="login-card"
          aria-labelledby="login-title"
          data-testid="login-card"
        >
          <div class="login-card-header">
            <h1 id="login-title" class="login-title">
              登录
            </h1>
            <p class="login-description">
              在下方输入邮箱与密码以登录你的工作空间。
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
                placeholder="name@example.com"
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
                placeholder="********"
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
            <button type="submit" class="btn" disabled={busy()}>
              {busy() ? '登录中…' : '登录'}
              <Icon name="logout" />
            </button>
          </form>

          <p class="login-footer">
            本地首次运行请设置 <code>ZEUS_ADMIN_PASSWORD</code> 与{' '}
            <code>ZEUS_ADMIN_VIEWER_PASSWORD</code>。
          </p>
        </section>
      </div>
    </main>
  )
}
