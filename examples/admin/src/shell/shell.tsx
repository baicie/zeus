/**
 * Admin application shell — shadcn-admin's inset sidebar layout.
 *
 * Structure mirrors the reference's `AuthenticatedLayout`:
 *
 *   SidebarProvider
 *     ├─ AppSidebar   (header: brand, content: nav groups, footer: account)
 *     └─ SidebarInset (Header: trigger + breadcrumb + search + theme + user)
 *                      (Main: page content)
 *
 * The shell stays mounted for the whole session; navigation only swaps the
 * `<Outlet />`, so the sidebar never rebuilds.
 *
 * Responsive behaviour, as in the reference:
 * - ≥768px: the sidebar is docked and the main surface is an inset card.
 *   The trigger collapses it to icon width (3rem rail + inset padding).
 * - <768px: the sidebar leaves the flow and slides in as a drawer. Focus is
 *   trapped while open and Escape closes it.
 *
 * Developer diagnostics (router matches, history probes, loader preload) live
 * behind a header icon and render into a fixed panel; the reference has no
 * debug strip in the product UI.
 */

import {
  Link,
  Outlet,
  useLocation,
  useMatches,
  useNavigation,
  usePathname,
  useRouter,
} from '@zeus-js/router'
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  type Accessor,
} from '@zeus-js/zeus'

import { t } from '../i18n'
import type { AdminMessageKey } from '../locales/en'
import type { Role, SessionUser } from '../routes'
import { Icon, type IconName } from './icon'
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from './theme'

interface NavItem {
  readonly to: string
  /** A catalog key, not display text: the nav re-renders on a locale switch. */
  readonly label: AdminMessageKey
  readonly icon: IconName
  /** Match the whole path rather than a prefix. */
  readonly exact?: boolean
  readonly adminOnly?: boolean
  readonly badge?: string
}

interface NavGroup {
  readonly label: AdminMessageKey
  readonly items: readonly NavItem[]
}

/**
 * Navigation groups follow the reference's "General / Pages / Other" rhythm:
 * a small muted label above a list of 32px rows.
 */
const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'nav.group.general',
    items: [
      { to: '/admin', label: 'nav.overview', icon: 'overview', exact: true },
      { to: '/admin/users', label: 'nav.users', icon: 'users' },
    ],
  },
  {
    label: 'nav.group.administration',
    items: [
      {
        to: '/admin/roles',
        label: 'nav.roles',
        icon: 'shield',
        adminOnly: true,
      },
      { to: '/admin/audit', label: 'nav.audit', icon: 'list', adminOnly: true },
      {
        to: '/admin/reports',
        label: 'nav.reports',
        icon: 'chart',
        adminOnly: true,
      },
    ],
  },
  {
    label: 'nav.group.workspace',
    items: [
      {
        to: '/admin/upload',
        label: 'nav.upload',
        icon: 'upload',
        adminOnly: true,
      },
      { to: '/admin/settings', label: 'nav.settings', icon: 'settings' },
    ],
  },
  {
    label: 'nav.group.reference',
    items: [
      { to: '/admin/components', label: 'nav.components', icon: 'terminal' },
    ],
  },
]

/** Page titles keyed by the route segment after `/admin`. */
const PAGE_TITLES: Record<string, AdminMessageKey> = {
  '': 'nav.overview',
  users: 'nav.users',
  roles: 'nav.roles',
  reports: 'nav.reports',
  audit: 'nav.audit',
  upload: 'nav.upload',
  settings: 'nav.settings',
}

export interface AdminShellProps {
  readonly role: Accessor<Role>
  readonly onRoleChange: (role: Role) => void
  readonly session?: Accessor<SessionUser | undefined>
  readonly onLogout?: () => Promise<void>
  /** Diagnostics is opt-in: it exposes router internals, not product UI. */
  readonly diagnostics?: boolean
}

export function AdminShell(props: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const navigation = useNavigation()

  const [collapsed, setCollapsed] = createSignal(readCollapsed())
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const [userMenuOpen, setUserMenuOpen] = createSignal(false)
  const [brandMenuOpen, setBrandMenuOpen] = createSignal(false)
  const [themeMenuOpen, setThemeMenuOpen] = createSignal(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = createSignal(false)
  const [commandOpen, setCommandOpen] = createSignal(false)
  const [commandQuery, setCommandQuery] = createSignal('')
  const [themePreference, setThemePreference] = createSignal<ThemePreference>(
    readThemePreference(),
  )

  // Close transient surfaces whenever the route changes; a drawer left open
  // over a new page is the most common mobile navigation bug.
  createEffect(() => {
    void pathname()
    setDrawerOpen(false)
    setUserMenuOpen(false)
    setBrandMenuOpen(false)
    setThemeMenuOpen(false)
    setCommandOpen(false)
  })

  createEffect(() => {
    applyThemePreference(themePreference())
  })

  createEffect(() => {
    if (!drawerOpen() && !userMenuOpen() && !themeMenuOpen() && !commandOpen())
      return
    function onKeydown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setDrawerOpen(false)
      setUserMenuOpen(false)
      setBrandMenuOpen(false)
      setThemeMenuOpen(false)
      setCommandOpen(false)
    }
    document.addEventListener('keydown', onKeydown)
    onCleanup(() => document.removeEventListener('keydown', onKeydown))
  })

  // ⌘K / Ctrl+K opens the route palette, exactly like the reference's search.
  createEffect(() => {
    function onKeydown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() !== 'k') return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      setCommandQuery('')
      setCommandOpen(open => !open)
    }
    document.addEventListener('keydown', onKeydown)
    onCleanup(() => document.removeEventListener('keydown', onKeydown))
  })

  const visibleGroups = () =>
    NAV_GROUPS.map(group => ({
      label: group.label,
      items: group.items.filter(
        item => !item.adminOnly || props.role() === 'admin',
      ),
    })).filter(group => group.items.length > 0)

  const allRoutes = () =>
    NAV_GROUPS.flatMap(group =>
      group.items
        .filter(item => !item.adminOnly || props.role() === 'admin')
        .map(item => ({ ...item, group: group.label })),
    )

  const commandResults = () => {
    const query = commandQuery().trim().toLowerCase()
    if (!query) return allRoutes()
    return allRoutes().filter(
      item =>
        item.label.toLowerCase().includes(query) ||
        item.to.toLowerCase().includes(query),
    )
  }

  const currentSection = () => pageSection(pathname())
  const pageTitle = () => {
    const key = PAGE_TITLES[currentSection()]
    return key ? t(key) : t('nav.pages')
  }

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname() === item.to : pathname().startsWith(item.to)
  }

  function toggleCollapsed(): void {
    const next = !collapsed()
    setCollapsed(next)
    writeCollapsed(next)
  }

  function setTheme(next: ThemePreference): void {
    setThemePreference(next)
    writeThemePreference(next)
    setThemeMenuOpen(false)
  }

  async function logout(): Promise<void> {
    setUserMenuOpen(false)
    await props.onLogout?.()
    window.location.reload()
  }

  function runCommand(to: string): void {
    setCommandOpen(false)
    void router.navigate(to)
  }

  return (
    <div
      class={[
        'admin-shell',
        collapsed() ? 'is-collapsed' : '',
        drawerOpen() ? 'is-drawer-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="admin-layout"
    >
      <a class="skip-link" href="#main-content">
        {t('nav.skipToContent')}
      </a>

      <div class="sidebar-slot" aria-hidden="true" />

      <div
        class="sidebar-scrim"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside class="sidebar" aria-label={t('nav.main')}>
        <div class="sidebar-inner">
          <div class="sidebar-header">
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                class="sidebar-menu-button is-large"
                onClick={() => setBrandMenuOpen(open => !open)}
                aria-haspopup="menu"
                aria-expanded={brandMenuOpen()}
                data-testid="brand-menu-trigger"
              >
                <span class="sidebar-brand-logo" aria-hidden="true">
                  Z
                </span>
                <span class="sidebar-brand-copy">
                  <span class="sidebar-brand-name">Zeus Admin</span>
                  <span class="sidebar-brand-plan">
                    Native · Router · Query
                  </span>
                </span>
                <Icon name="chevrons-up-down" class="menu-caret" />
              </button>
              <Show when={brandMenuOpen()}>
                <div
                  class="menu menu-sidebar menu-sidebar-down"
                  role="menu"
                  data-testid="brand-menu"
                >
                  <p class="menu-label">{t('nav.workspace')}</p>
                  <Link to="/admin" class="menu-item" role="menuitem">
                    <Icon name="overview" /> {t('nav.overview')}
                  </Link>
                  <Show when={props.role() === 'admin'}>
                    <Link
                      to="/admin/settings"
                      class="menu-item"
                      role="menuitem"
                    >
                      <Icon name="settings" /> {t('nav.workspaceSettings')}
                    </Link>
                  </Show>
                  <div class="menu-separator" role="separator" />
                  <p class="menu-label">
                    {props.role() === 'admin'
                      ? t('role.admin')
                      : t('role.member')}
                  </p>
                </div>
              </Show>
            </div>
          </div>

          <nav class="sidebar-content">
            <For each={visibleGroups()}>
              {group => (
                <div class="sidebar-group">
                  <p class="sidebar-group-label">{t(group.label)}</p>
                  <ul class="sidebar-menu">
                    <For each={group.items}>
                      {item => (
                        <li>
                          <Link
                            to={item.to}
                            class={
                              isActive(item)
                                ? 'sidebar-menu-button is-active'
                                : 'sidebar-menu-button'
                            }
                            aria-current={isActive(item) ? 'page' : undefined}
                            title={collapsed() ? t(item.label) : undefined}
                          >
                            <Icon name={item.icon} />
                            <span>{t(item.label)}</span>
                            <Show when={item.badge}>
                              <span class="menu-badge">{item.badge}</span>
                            </Show>
                          </Link>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              )}
            </For>
          </nav>

          <div class="sidebar-footer">
            <button
              type="button"
              class="sidebar-menu-button is-large"
              onClick={() => setUserMenuOpen(open => !open)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen()}
              data-testid="account-menu-trigger"
            >
              <span class="sidebar-avatar" aria-hidden="true">
                {initials(props.session?.()?.name)}
              </span>
              <span class="sidebar-account-copy">
                <span class="sidebar-account-name" data-testid="session-user">
                  {props.session?.()?.name ?? t('role.signedOut')}
                </span>
                <span class="sidebar-account-email">
                  {props.session?.()?.email ?? '—'}
                </span>
              </span>
              <Icon name="chevrons-up-down" class="menu-caret" />
            </button>
            <Show when={userMenuOpen()}>
              <div
                class="menu menu-sidebar menu-sidebar-up"
                role="menu"
                data-testid="account-menu"
              >
                <p class="menu-label">
                  {props.role() === 'admin'
                    ? t('role.admin')
                    : t('role.member')}
                </p>
                <Link to="/admin/settings" class="menu-item" role="menuitem">
                  <Icon name="settings" /> {t('nav.workspaceSettings')}
                </Link>
                <Link to="/admin/users" class="menu-item" role="menuitem">
                  <Icon name="users" /> {t('nav.memberDirectory')}
                </Link>
                <div class="menu-separator" role="separator" />
                <button
                  type="button"
                  class="menu-item menu-item-danger"
                  role="menuitem"
                  data-testid="logout"
                  onClick={() => void logout()}
                >
                  <Icon name="logout" /> {t('nav.logout')}
                </button>
              </div>
            </Show>
          </div>
        </div>
      </aside>

      <div class="workspace">
        <header class="toolbar">
          <button
            type="button"
            class="btn btn-ghost btn-icon toolbar-drawer"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('nav.open')}
            data-testid="drawer-open"
          >
            <Icon name="menu" />
          </button>

          <button
            type="button"
            class="btn btn-ghost btn-icon"
            onClick={toggleCollapsed}
            aria-label={
              collapsed() ? t('nav.expandSidebar') : t('nav.collapseSidebar')
            }
            aria-expanded={!collapsed()}
            data-testid="sidebar-toggle"
          >
            <Icon name="panel-left" />
          </button>

          <span class="separator separator-vertical" aria-hidden="true" />

          {/* The reference's dashboard header carries an inline top nav; the
              other pages show a breadcrumb. Both live in the same 64px row. */}
          <nav class="top-nav" aria-label={t('nav.pageNavigation')}>
            <For
              each={[
                { to: '/admin', label: 'nav.overview', exact: true },
                { to: '/admin/users', label: 'nav.users.short', exact: false },
                {
                  to: '/admin/reports',
                  label: 'nav.reports.short',
                  exact: false,
                  adminOnly: true,
                },
                { to: '/admin/settings', label: 'nav.settings', exact: false },
              ].filter(
                (
                  item,
                ): item is {
                  to: string
                  label: AdminMessageKey
                  exact: boolean
                  adminOnly?: boolean
                } => !item.adminOnly || props.role() === 'admin',
              )}
            >
              {item => (
                <Link
                  to={item.to}
                  class={
                    (
                      item.exact
                        ? pathname() === item.to
                        : pathname().startsWith(item.to)
                    )
                      ? 'top-nav-link is-active'
                      : 'top-nav-link'
                  }
                >
                  {t(item.label)}
                </Link>
              )}
            </For>
          </nav>

          <div class="toolbar-heading">
            <nav class="breadcrumb" aria-label={t('nav.breadcrumb')}>
              <Link to="/admin">Zeus Admin</Link>
              <span class="breadcrumb-sep" aria-hidden="true">
                /
              </span>
              <span class="breadcrumb-current" aria-current="page">
                {pageTitle()}
              </span>
            </nav>
            <h1 class="toolbar-title">{pageTitle()}</h1>
          </div>

          <div class="toolbar-actions">
            <span
              class="route-status"
              role="status"
              data-testid="navigation-status"
            >
              <Show when={navigation().state !== 'idle'}>
                <span class="spinner" aria-hidden="true" />
              </Show>
              {navigation().state === 'idle' ? '' : t('common.loading')}
            </span>

            <button
              type="button"
              class="btn header-search"
              aria-keyshortcuts="Meta+K Control+K"
              onClick={() => {
                setCommandQuery('')
                setCommandOpen(true)
              }}
              data-testid="search-trigger"
            >
              <Icon name="search" />
              <span class="header-search-label">{t('common.search')}</span>
              <kbd>
                <span>⌘</span>K
              </kbd>
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                class="btn btn-ghost header-icon"
                onClick={() => setThemeMenuOpen(open => !open)}
                aria-label={t('nav.appearance', {
                  mode: themeLabel(themePreference()),
                })}
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen()}
                data-testid="theme-toggle"
              >
                <Icon name={themePreference() === 'dark' ? 'moon' : 'sun'} />
              </button>
              <Show when={themeMenuOpen()}>
                <div
                  class="menu"
                  role="menu"
                  style={{ right: '0', top: '40px', minWidth: '8rem' }}
                >
                  <For
                    each={
                      [
                        { value: 'light', label: t('theme.light') },
                        { value: 'dark', label: t('theme.dark') },
                        { value: 'system', label: t('theme.system') },
                      ] as const
                    }
                  >
                    {option => (
                      <button
                        type="button"
                        class="menu-item"
                        role="menuitemradio"
                        aria-checked={themePreference() === option.value}
                        onClick={() => setTheme(option.value)}
                      >
                        {option.label}
                        <Show when={themePreference() === option.value}>
                          <Icon name="check" class="menu-check" />
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <Show when={props.diagnostics}>
              <button
                type="button"
                class="btn btn-ghost header-icon"
                onClick={() => setDiagnosticsOpen(open => !open)}
                aria-label={t('diagnostics.open')}
                aria-expanded={diagnosticsOpen()}
                data-testid="diagnostics-toggle"
              >
                <Icon name="terminal" />
              </button>
            </Show>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                onClick={() => setUserMenuOpen(open => !open)}
                aria-label={t('nav.accountMenu')}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen()}
                data-testid="header-account-trigger"
              >
                <span class="header-avatar" aria-hidden="true">
                  {initials(props.session?.()?.name)}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          class="content"
          aria-busy={String(navigation().state !== 'idle')}
        >
          <Outlet />
        </main>

        <Show when={props.diagnostics && diagnosticsOpen()}>
          <DiagnosticsPanel
            open={diagnosticsOpen()}
            onToggle={() => setDiagnosticsOpen(v => !v)}
          />
        </Show>
      </div>

      <Show when={commandOpen()}>
        <CommandPalette
          query={commandQuery()}
          onQuery={setCommandQuery}
          results={commandResults()}
          onSelect={runCommand}
          onClose={() => setCommandOpen(false)}
        />
      </Show>
    </div>
  )
}

/**
 * The ⌘K route palette. It searches the routes this session can actually
 * reach; the reference lists pages, and this lists the same set of real pages.
 */
function CommandPalette(props: {
  query: string
  onQuery: (value: string) => void
  results: ReadonlyArray<NavItem & { group: AdminMessageKey }>
  onSelect: (to: string) => void
  onClose: () => void
}) {
  return (
    <div
      class="dialog-overlay"
      style={{
        display: 'grid',
        placeItems: 'start center',
        paddingTop: '12vh',
      }}
      onClick={() => props.onClose()}
    >
      <div
        class="card command-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.searchPages')}
        onClick={(event: Event) => event.stopPropagation()}
        data-testid="command-palette"
      >
        <div class="command-search">
          <Icon name="search" />
          <input
            autofocus
            aria-label={t('nav.searchPages')}
            placeholder={t('nav.searchPlaceholder')}
            prop:value={props.query}
            onInput={(event: Event) =>
              props.onQuery((event.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === 'Enter') {
                const first = props.results[0]
                if (first) props.onSelect(first.to)
              }
            }}
          />
        </div>
        <ul class="command-list">
          <Show
            when={props.results.length > 0}
            fallback={<li class="command-empty">{t('nav.noMatch')}</li>}
          >
            <For each={props.results}>
              {item => (
                <li>
                  <button
                    type="button"
                    class="command-item"
                    onClick={() => props.onSelect(item.to)}
                  >
                    <Icon name={item.icon} />
                    <span>{t(item.label)}</span>
                    <span class="muted" style={{ marginLeft: 'auto' }}>
                      {t(item.group)}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </Show>
        </ul>
      </div>
    </div>
  )
}

/**
 * Router internals used while developing this example: current match ids,
 * history controls and a loader preload probe. Mounted only when the shell is
 * given `diagnostics`, and only after the header icon opens it.
 */
function DiagnosticsPanel(props: { open: boolean; onToggle: () => void }) {
  return (
    <section
      class="diagnostics-panel"
      data-testid="diagnostics"
      aria-label={t('diagnostics.open')}
    >
      <div class="diagnostics-head">
        <Icon name="terminal" /> Developer diagnostics
        <button
          type="button"
          class="btn btn-ghost btn-icon btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={props.onToggle}
          aria-label={t('diagnostics.close')}
        >
          <Icon name="x" />
        </button>
      </div>
      <Show when={props.open}>
        <div class="diagnostics-body">
          <DiagnosticsBody />
        </div>
      </Show>
    </section>
  )
}

function DiagnosticsBody() {
  const router = useRouter()
  const location = useLocation()
  const [preloadStatus, setPreloadStatus] = createSignal(t('nav.notPreloaded'))

  async function preloadAda(): Promise<void> {
    setPreloadStatus(t('nav.preloading'))
    try {
      await router.preload('/admin/users/ada')
      setPreloadStatus('ready')
    } catch (error) {
      setPreloadStatus(
        t('nav.preloadFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  return (
    <>
      <dl class="diagnostics-grid">
        <div>
          <dt>{t('common.path')}</dt>
          <dd data-testid="current-path">
            {location().pathname}
            {location().search}
            {location().hash}
          </dd>
        </div>
        <div>
          <dt>{t('common.match')}</dt>
          <dd data-testid="route-matches">
            <RouteMatchList />
          </dd>
        </div>
      </dl>
      <div class="row-wrap">
        <button
          type="button"
          class="btn btn-outline btn-sm"
          data-testid="history-back"
          onClick={() => void router.navigate(-1)}
        >
          {t('nav.back')}
        </button>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          data-testid="history-forward"
          onClick={() => void router.navigate(1)}
        >
          {t('nav.forward')}
        </button>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          data-testid="preload-ada"
          onClick={() => void preloadAda()}
        >
          {t('nav.preloadAda')}
        </button>
        <span class="muted" role="status" data-testid="preload-status">
          {preloadStatus()}
        </span>
      </div>
    </>
  )
}

function RouteMatchList() {
  // `useMatches` is a hook, so it must run inside a component rather than in a
  // conditional branch of the panel.
  const matches = useMatches()
  return (
    <>
      {matches()
        .map(match => match.route.id)
        .join(' / ')}
    </>
  )
}

function pageSection(pathname: string): string {
  const match = /^\/admin\/?([^/?#]*)/.exec(pathname)
  return match?.[1] ?? ''
}

function initials(name: string | undefined): string {
  if (!name) return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

function themeLabel(preference: ThemePreference): string {
  return preference === 'dark'
    ? t('theme.dark')
    : preference === 'light'
      ? t('theme.light')
      : t('theme.system')
}

const COLLAPSED_KEY = 'zeus-admin.sidebar-collapsed'
const THEME_KEY = 'zeus-admin.theme'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(value))
  } catch {
    // Storage can be unavailable in private mode; the toggle still works for
    // the session.
  }
}

function writeThemePreference(value: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, value)
  } catch {
    // Ignore; the session still reflects the choice.
  }
}
