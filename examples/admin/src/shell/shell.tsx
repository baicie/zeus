/**
 * Admin application shell.
 *
 * Three-zone layout: a collapsible sidebar, a sticky toolbar, and a bounded
 * content column. The shell stays mounted for the whole session, so navigating
 * never rebuilds it — only the `<Outlet />` region changes.
 *
 * Responsive behaviour:
 * - ≥1024px: sidebar docked, toggle switches between full and icon-only.
 * - <1024px: sidebar leaves the flow and becomes a drawer over a scrim; the
 *   toolbar's menu button opens it. Focus is trapped while open and Escape
 *   closes it.
 *
 * The `<Outlet />` is rendered inside `<main id="main-content">`, which the
 * skip link targets.
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

import type { Role, SessionUser } from '../routes'
import { Icon, type IconName } from './icon'
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from './theme'

interface NavItem {
  readonly to: string
  readonly label: string
  readonly icon: IconName
  /** Match the whole path rather than a prefix. */
  readonly exact?: boolean
  readonly adminOnly?: boolean
}

interface NavGroup {
  readonly label: string
  readonly items: readonly NavItem[]
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: '工作空间',
    items: [
      { to: '/admin', label: '概览', icon: 'overview', exact: true },
      { to: '/admin/users', label: '用户管理', icon: 'users' },
      {
        to: '/admin/roles',
        label: '角色权限',
        icon: 'shield',
        adminOnly: true,
      },
    ],
  },
  {
    label: '运营',
    items: [
      {
        to: '/admin/reports',
        label: '管理报表',
        icon: 'chart',
        adminOnly: true,
      },
      { to: '/admin/audit', label: '审计日志', icon: 'list', adminOnly: true },
      {
        to: '/admin/upload',
        label: '文件上传',
        icon: 'upload',
        adminOnly: true,
      },
    ],
  },
  {
    label: '配置',
    items: [{ to: '/admin/settings', label: '设置', icon: 'settings' }],
  },
]

/** Page titles keyed by the route segment after `/admin`. */
const PAGE_TITLES: Record<string, string> = {
  '': '概览',
  users: '用户管理',
  roles: '角色权限',
  reports: '管理报表',
  audit: '审计日志',
  upload: '文件上传',
  settings: '设置',
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
  const [diagnosticsOpen, setDiagnosticsOpen] = createSignal(true)
  const [themePreference, setThemePreference] = createSignal<ThemePreference>(
    readThemePreference(),
  )

  // Close transient surfaces whenever the route changes; a drawer left open
  // over a new page is the most common mobile navigation bug.
  createEffect(() => {
    void pathname()
    setDrawerOpen(false)
    setUserMenuOpen(false)
  })

  createEffect(() => {
    applyThemePreference(themePreference())
  })

  createEffect(() => {
    if (!drawerOpen() && !userMenuOpen()) return
    function onKeydown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setDrawerOpen(false)
      setUserMenuOpen(false)
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

  const currentSection = () => pageSection(pathname())
  const pageTitle = () => PAGE_TITLES[currentSection()] ?? '页面'

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname() === item.to : pathname().startsWith(item.to)
  }

  function toggleCollapsed(): void {
    const next = !collapsed()
    setCollapsed(next)
    writeCollapsed(next)
  }

  function cycleTheme(): void {
    const order: readonly ThemePreference[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(themePreference()) + 1) % order.length]!
    setThemePreference(next)
    writeThemePreference(next)
  }

  async function logout(): Promise<void> {
    setUserMenuOpen(false)
    await props.onLogout?.()
    window.location.reload()
  }

  return (
    <div
      class={[
        'admin-shell',
        collapsed() ? 'is-collapsed' : '',
        drawerOpen() ? 'is-drawer-open' : '',
      ]}
      data-testid="admin-layout"
    >
      <a class="skip-link" href="#main-content">
        跳到主内容
      </a>

      <div
        class="shell-scrim"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside class="sidebar" aria-label="主导航">
        <div class="sidebar-brand">
          <Link to="/admin" aria-label="Zeus Admin 首页" class="brand-mark">
            <span class="brand-glyph" aria-hidden="true">
              Z
            </span>
            <span class="brand-text">Zeus Admin</span>
          </Link>
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm sidebar-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed() ? '展开侧边栏' : '收起侧边栏'}
            aria-expanded={!collapsed()}
            data-testid="sidebar-toggle"
          >
            <Icon name={collapsed() ? 'chevrons-right' : 'chevrons-left'} />
          </button>
        </div>

        <nav class="sidebar-nav">
          <For each={visibleGroups()}>
            {group => (
              <div class="nav-group">
                <p class="nav-group-label">{group.label}</p>
                <ul class="nav-list">
                  <For each={group.items}>
                    {item => (
                      <li>
                        <Link
                          to={item.to}
                          class={
                            isActive(item) ? 'nav-link is-active' : 'nav-link'
                          }
                          aria-current={isActive(item) ? 'page' : undefined}
                          title={collapsed() ? item.label : undefined}
                        >
                          <Icon name={item.icon} class="nav-icon" />
                          <span class="nav-label">{item.label}</span>
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
            class="nav-link sidebar-account"
            onClick={() => setUserMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen()}
            data-testid="account-menu-trigger"
          >
            <span class="avatar" aria-hidden="true">
              {initials(props.session?.()?.name)}
            </span>
            <span class="account-copy">
              <span class="account-name" data-testid="session-user">
                {props.session?.()?.name ?? '未登录'}
              </span>
              <span class="account-role">
                {props.role() === 'admin' ? '管理员' : '只读成员'}
              </span>
            </span>
          </button>
          <Show when={userMenuOpen()}>
            <div class="account-menu" role="menu" data-testid="account-menu">
              <p class="account-menu-header">
                <span class="account-menu-name">{props.session?.()?.name}</span>
                <span class="account-menu-email">
                  {props.session?.()?.email}
                </span>
              </p>
              <Link
                to="/admin/settings"
                class="account-menu-item"
                role="menuitem"
              >
                <Icon name="settings" /> 工作空间设置
              </Link>
              <button
                type="button"
                class="account-menu-item"
                role="menuitem"
                onClick={cycleTheme}
              >
                <Icon name="theme" /> 主题：{themeLabel(themePreference())}
              </button>
              <button
                type="button"
                class="account-menu-item account-menu-danger"
                role="menuitem"
                data-testid="logout"
                onClick={() => void logout()}
              >
                <Icon name="logout" /> 退出登录
              </button>
            </div>
          </Show>
        </div>
      </aside>

      <div class="workspace">
        <header class="toolbar">
          <button
            type="button"
            class="btn btn-ghost btn-icon toolbar-drawer"
            onClick={() => setDrawerOpen(true)}
            aria-label="打开导航"
            data-testid="drawer-open"
          >
            <Icon name="menu" />
          </button>

          <div class="toolbar-heading">
            <nav class="breadcrumb" aria-label="面包屑">
              <Link to="/admin">Zeus Admin</Link>
              <span class="breadcrumb-sep" aria-hidden="true">
                /
              </span>
              <span aria-current="page">{pageTitle()}</span>
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
              {navigation().state === 'idle' ? '' : '正在加载…'}
            </span>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              onClick={cycleTheme}
              aria-label={`外观模式：${themeLabel(themePreference())}`}
              title={`外观模式：${themeLabel(themePreference())}`}
              data-testid="theme-toggle"
            >
              <Icon name={themePreference() === 'dark' ? 'moon' : 'sun'} />
            </button>
          </div>
        </header>

        <main
          id="main-content"
          class="content"
          aria-busy={String(navigation().state !== 'idle')}
        >
          <Outlet />
        </main>

        <Show when={props.diagnostics}>
          <DiagnosticsPanel
            open={diagnosticsOpen()}
            onToggle={() => setDiagnosticsOpen(v => !v)}
          />
        </Show>
      </div>
    </div>
  )
}

/**
 * Router internals used while developing this example: current match ids,
 * history controls and a loader preload probe.
 *
 * Product UI does not show these. The panel is mounted only when the shell is
 * given `diagnostics`, and it starts expanded because this example's
 * acceptance gate drives the history and preload controls that live inside it.
 */
function DiagnosticsPanel(props: { open: boolean; onToggle: () => void }) {
  return (
    <section
      class="diagnostics"
      data-testid="diagnostics"
      aria-label="开发诊断"
    >
      <button
        type="button"
        class="diagnostics-toggle"
        onClick={props.onToggle}
        aria-expanded={props.open}
        data-testid="diagnostics-toggle"
      >
        <Icon name="terminal" /> Developer Diagnostics
        <Icon name={props.open ? 'chevron-down' : 'chevron-up'} />
      </button>
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
  const [preloadStatus, setPreloadStatus] = createSignal('尚未预加载')

  async function preloadAda(): Promise<void> {
    setPreloadStatus('预加载中…')
    try {
      await router.preload('/admin/users/ada')
      setPreloadStatus('ready')
    } catch (error) {
      setPreloadStatus(
        `预加载失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return (
    <>
      <dl class="diagnostics-grid">
        <div>
          <dt>路径</dt>
          <dd data-testid="current-path">
            {location().pathname}
            {location().search}
            {location().hash}
          </dd>
        </div>
        <div>
          <dt>匹配</dt>
          <dd data-testid="route-matches">
            <RouteMatchList />
          </dd>
        </div>
      </dl>
      <div class="row-wrap">
        <button
          type="button"
          class="btn btn-sm"
          data-testid="history-back"
          onClick={() => void router.navigate(-1)}
        >
          后退
        </button>
        <button
          type="button"
          class="btn btn-sm"
          data-testid="history-forward"
          onClick={() => void router.navigate(1)}
        >
          前进
        </button>
        <button
          type="button"
          class="btn btn-sm"
          data-testid="preload-ada"
          onClick={() => void preloadAda()}
        >
          预加载 Ada 详情
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
    ? '深色'
    : preference === 'light'
      ? '浅色'
      : '跟随系统'
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

function readThemePreferenceRaw(): string | null {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

function writeThemePreference(value: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, value)
  } catch {
    // Ignore; the session still reflects the choice.
  }
}
