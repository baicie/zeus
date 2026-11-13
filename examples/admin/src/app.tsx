import { QueryClientProvider, createQueryClient } from '@zeus-js/query'
import { RouterProvider } from '@zeus-js/router'
import { createEffect, createSignal, onCleanup, Show } from '@zeus-js/zeus'
import { createResource } from '@zeus-js/resource'

import {
  applyDocumentLang,
  i18n,
  readPersonalLocale,
  readStoredLocaleForAnyAccount,
  resolveInitialLocale,
  t,
} from './i18n'
import { createAdminRouter } from './router'
import { Icon } from './shell/icon'
import { adminApi, isDemoBuild } from './admin-api'
import type { Role, SessionUser } from './routes'

/**
 * The application root owns the shared resources and provides them through
 * context. It initializes once: route changes only update bindings inside the
 * provider tree.
 */
/**
 * Resolves the first-paint language before anything renders.
 *
 * Called once at module load, not from inside the component: writing the locale
 * signal during a render would re-enter the effect graph that is currently
 * being built.
 *
 * Order: this account's stored choice, then the browser's own languages, then
 * the workspace default, then English. Doing it here — rather than after the
 * session resolves — is what avoids a flash of the wrong language: the login
 * card is already on screen before any authenticated call can return.
 */
function bootstrapLocale(): void {
  const stored = isDemoBuild ? undefined : readStoredLocaleForAnyAccount()
  const locale =
    stored ?? resolveInitialLocale(undefined, navigator.languages) ?? 'en'
  applyDocumentLang(locale)
  void i18n.setLocale(locale)
}

bootstrapLocale()

export function App() {
  const session = createResource<SessionUser, void>(
    undefined,
    (_key, context) => adminApi.session(context.signal),
  )

  const [signedIn, setSignedIn] = createSignal(false)

  /*
   * Once the session resolves, this account's own choice takes over from the
   * pre-login guess. Without this a user who picked English would see it flip
   * back to the workspace default every time the session refreshed.
   *
   * The effect must not write a dependency it read. It used to compare against
   * `i18n.locale()` — making the locale a dependency — and then call
   * `setLocale`, i.e. an effect synchronously updating its own dependency. Zeus
   * rejects that by throwing
   *
   *   A reactive effect cannot synchronously update its own dependencies.
   *
   * and the throw landed on the settings page's language switch, which is
   * exactly where a person changes the preference: the write re-ran this
   * effect, which saw the mismatch again and wrote again.
   *
   * The fix is ordering, not suppression: the comparison stays (it is what
   * avoids a redundant write on every session refresh), but the write is
   * scheduled after the effect returns, so it can no longer run inside its own
   * tracking pass. `queueMicrotask` runs before paint, so the interface does
   * not flicker.
   */
  createEffect(() => {
    const user = session.data()
    if (!user) return
    const personal = readPersonalLocale(user.id)
    if (!personal || personal === i18n.locale()) return
    queueMicrotask(() => {
      // Re-checked when it runs: a later session update may have changed what
      // the account wants, and this must not overwrite it with a stale read.
      if (readPersonalLocale(user.id) !== personal) return
      if (i18n.locale() === personal) return
      void i18n.setLocale(personal)
      applyDocumentLang(personal)
    })
  })

  return (
    <>
      <Show when={isDemoBuild}>
        <DemoBanner />
      </Show>
      <Show
        when={!session.pending() || signedIn()}
        fallback={<p class="boot-status">{t('auth.verifyingSession')}</p>}
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
  /*
   * The shell sizes itself against the viewport and positions the sidebar from
   * the document top, so it has to know how much room the banner takes. The
   * height is measured rather than hard-coded: the line wraps to two rows on a
   * narrow screen, and a fixed value would then leave either a scrollbar or a
   * gap. A ResizeObserver keeps it right across resizes.
   */
  let banner: HTMLDivElement | undefined
  const write = (): void => {
    if (!banner) return
    document.documentElement.style.setProperty(
      '--demo-banner-height',
      `${banner.getBoundingClientRect().height}px`,
    )
  }
  const observer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(write)
  onCleanup(() => {
    observer?.disconnect()
    document.documentElement.style.removeProperty('--demo-banner-height')
  })

  return (
    <div
      class="demo-banner"
      role="status"
      data-testid="demo-banner"
      ref={(element: HTMLDivElement | null) => {
        if (!element || element === banner) return
        banner = element
        observer?.observe(element)
        write()
      }}
    >
      <strong>{t('demo.badge')}</strong>
      <span>{t('demo.body')}</span>
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
              {t('auth.signIn')}
            </h1>
            <p class="login-description">{t('auth.signInDescription')}</p>
          </div>

          <form class="login-form" onSubmit={submit}>
            <div class="field">
              <label class="field-label" for="login-email">
                {t('auth.email')}
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
                {t('auth.password')}
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
              {busy() ? t('auth.signingIn') : t('auth.signIn')}
              <Icon name="logout" />
            </button>
          </form>

          <p class="login-footer">
            {t('auth.firstRunHint')} <code>ZEUS_ADMIN_PASSWORD</code>
            {' / '}
            <code>ZEUS_ADMIN_VIEWER_PASSWORD</code>。
          </p>
        </section>
      </div>
    </main>
  )
}
