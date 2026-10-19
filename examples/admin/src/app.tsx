import type { ZeusRouter } from '@zeus-js/router'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
} from '@zeus-js/zeus'

import { createAdminRouter, type Role, type User } from './routes'

interface PageProps {
  router: ZeusRouter
}

export function App() {
  const [role, setRole] = createSignal<Role>('viewer')
  const [preloadStatus, setPreloadStatus] = createSignal('尚未预加载')
  const router = createAdminRouter(role)
  const initialized = createMemo(() => router.initialized())
  const routeId = createMemo(() => {
    const matches = router.matches()
    return matches[matches.length - 1]?.route.id
  })
  const routeError = createMemo(() => Object.values(router.errors() ?? {})[0])
  const hasError = createMemo(() => routeError() !== undefined)

  createEffect(() => {
    document.title = `${router.pathname()} · Zeus Admin`
  })

  function handleLinkClick(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const anchor =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href]')
        : null
    if (
      !anchor ||
      anchor.hasAttribute('download') ||
      (anchor.target && anchor.target !== '_self')
    )
      return
    const target = new URL(anchor.href, window.location.href)
    if (target.origin !== window.location.origin) return
    event.preventDefault()
    void router.navigate(`${target.pathname}${target.search}${target.hash}`)
  }

  async function preloadAda(): Promise<void> {
    setPreloadStatus('预加载中…')
    try {
      await router.preload('/admin/users/ada')
      setPreloadStatus('ready')
    } catch (error) {
      setPreloadStatus(`预加载失败：${errorMessage(error)}`)
    }
  }

  function changeRole(event: Event): void {
    setRole((event.currentTarget as HTMLSelectElement).value as Role)
    // Navigating to the same URL re-runs the route loader with this session's
    // current role. This also lets a denied route recover without a reload.
    void router.navigate(router.location(), { replace: true })
  }

  return (
    <div
      class="admin-shell"
      data-testid="admin-layout"
      onClick={handleLinkClick}
    >
      <aside class="sidebar">
        <a class="brand" href="/admin" aria-label="Zeus Admin 首页">
          Z<span>Zeus Admin</span>
        </a>
        <p class="sidebar-label">工作空间</p>
        <nav aria-label="主导航">
          <a
            href="/admin"
            aria-current={router.pathname() === '/admin' ? 'page' : undefined}
          >
            概览
          </a>
          <a
            href="/admin/users"
            aria-current={
              router.pathname().startsWith('/admin/users') ? 'page' : undefined
            }
          >
            用户管理
          </a>
          <a
            href="/admin/reports"
            aria-current={
              router.pathname() === '/admin/reports' ? 'page' : undefined
            }
          >
            管理报表
          </a>
        </nav>
        <div class="session">
          <label for="session-role">演示身份</label>
          <select
            id="session-role"
            data-testid="role-select"
            prop:value={role()}
            onChange={changeRole}
          >
            <option value="viewer">只读成员</option>
            <option value="admin">管理员</option>
          </select>
          <p>身份只保存在当前页面中。管理报表由 route loader 检查权限。</p>
        </div>
      </aside>

      <div class="workspace">
        <header class="toolbar">
          <div>
            <span class="eyebrow">Zeus Native · Router</span>
            <p class="current-path" data-testid="current-path">
              {router.pathname()}
              {router.search()}
              {router.hash()}
            </p>
          </div>
          <div class="history-controls" aria-label="历史导航">
            <button
              data-testid="history-back"
              onClick={() => void router.navigate(-1)}
            >
              后退
            </button>
            <button
              data-testid="history-forward"
              onClick={() => void router.navigate(1)}
            >
              前进
            </button>
          </div>
        </header>

        <main
          id="main-content"
          aria-busy={String(router.navigation().state !== 'idle')}
        >
          <div class="route-status">
            <span data-testid="route-matches">
              {router
                .matches()
                .map(match => match.route.id)
                .join(' / ')}
            </span>
            <span role="status" data-testid="navigation-status">
              {router.navigation().state === 'idle' ? '就绪' : '正在加载…'}
            </span>
          </div>
          <Show
            when={initialized()}
            fallback={<p role="status">正在加载页面…</p>}
          >
            <Show
              when={hasError()}
              fallback={
                <>
                  <Show
                    when={routeId() === 'start' || routeId() === 'overview'}
                  >
                    <OverviewPage />
                  </Show>
                  <Show when={routeId() === 'users'}>
                    <UsersPage router={router} />
                  </Show>
                  <Show when={routeId() === 'user'}>
                    <UserPage router={router} />
                  </Show>
                  <Show when={routeId() === 'reports'}>
                    <ReportsPage />
                  </Show>
                </>
              }
            >
              <ErrorPage error={routeError()} />
            </Show>
          </Show>

          <section class="preload-panel" aria-label="路由预加载">
            <div>
              <h2>提前准备下一页</h2>
              <p>预加载会执行详情 loader，并保持当前 URL。</p>
            </div>
            <button data-testid="preload-ada" onClick={() => void preloadAda()}>
              预加载 Ada 详情
            </button>
            <p role="status" data-testid="preload-status">
              {preloadStatus()}
            </p>
          </section>
        </main>
        <footer>通过公开 Router / Signal API 构建 · 无页面刷新导航</footer>
      </div>
    </div>
  )
}

function OverviewPage() {
  return (
    <section class="page" data-testid="overview-page">
      <p class="eyebrow">工作空间概览</p>
      <h1>欢迎回来</h1>
      <p class="page-intro">
        从用户列表开始，查看成员信息、访问权限与路由错误处理。
      </p>
      <div class="overview-grid">
        <a class="overview-card" href="/admin/users">
          <span>团队成员</span>
          <strong>3</strong>
          <span>查看用户列表 →</span>
        </a>
        <a class="overview-card" href="/admin/reports">
          <span>管理报表</span>
          <strong>管理员</strong>
          <span>检查访问权限 →</span>
        </a>
      </div>
    </section>
  )
}

function UsersPage(props: PageProps) {
  const users = () =>
    (props.router.loaderData().users as readonly User[] | undefined) ?? []
  return (
    <section class="page" data-testid="users-page">
      <p class="eyebrow">成员目录</p>
      <h1>用户管理</h1>
      <p class="page-intro">
        选择成员查看详情。列表与详情由嵌套路由和独立 loader 驱动。
      </p>
      <table role="grid" data-testid="user-grid">
        <caption>工作空间成员</caption>
        <thead>
          <tr>
            <th scope="col">姓名</th>
            <th scope="col">邮箱</th>
            <th scope="col">团队</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <For each={users()}>
            {(user: User) => (
              <tr>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.team}</td>
                <td>
                  <a
                    data-testid={`user-${user.id}`}
                    href={`/admin/users/${user.id}`}
                  >
                    查看 {user.name}
                  </a>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p class="example-links">
        <a href="/admin/users/error">体验 loader 失败</a>
        <a href="/admin/users/missing">访问不存在的用户</a>
      </p>
    </section>
  )
}

function UserPage(props: PageProps) {
  const user = () => props.router.loaderData().user as User | undefined
  const [editing, setEditing] = createSignal(false)
  const [draftEmail, setDraftEmail] = createSignal('')
  const [saveStatus, setSaveStatus] = createSignal('')

  function openEditor(): void {
    setDraftEmail(user()?.email ?? '')
    setSaveStatus('')
    setEditing(true)
  }

  function closeEditor(): void {
    setEditing(false)
    setSaveStatus('')
  }

  function saveUser(event: Event): void {
    event.preventDefault()
    setSaveStatus('保存中…')
    window.setTimeout(() => {
      setSaveStatus('已保存')
      setEditing(false)
    }, 30)
  }

  return (
    <section class="page" data-testid="user-detail">
      <a class="back-link" href="/admin/users">
        ← 返回用户列表
      </a>
      <p class="eyebrow">成员详情</p>
      <h1>{user()?.name ?? ''}</h1>
      <dl class="detail-grid">
        <div>
          <dt>用户 ID</dt>
          <dd data-testid="detail-id">{props.router.params().id}</dd>
        </div>
        <div>
          <dt>邮箱</dt>
          <dd>{user()?.email ?? ''}</dd>
        </div>
        <div>
          <dt>团队</dt>
          <dd>{user()?.team ?? ''}</dd>
        </div>
      </dl>
      <p class="page-intro">
        详情数据来自 route loader；地址可直接打开、刷新或使用历史导航返回。
      </p>
      <button data-testid="edit-user" onClick={openEditor}>
        编辑成员
      </button>
      <span class="save-status" role="status" data-testid="save-status">
        {saveStatus()}
      </span>
      <Show when={editing()}>
        <div class="dialog-backdrop" data-testid="user-dialog-backdrop">
          <div
            class="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-dialog-title"
            data-testid="user-dialog"
          >
            <h2 id="user-dialog-title">编辑成员</h2>
            <form onSubmit={saveUser} data-testid="user-form">
              <label for="user-email">邮箱</label>
              <input
                id="user-email"
                type="email"
                required
                prop:value={draftEmail()}
                onInput={event =>
                  setDraftEmail((event.currentTarget as HTMLInputElement).value)
                }
              />
              <div class="dialog-actions">
                <button type="button" onClick={closeEditor}>
                  取消
                </button>
                <button type="submit">保存</button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </section>
  )
}

function ReportsPage() {
  return (
    <section class="page" data-testid="reports-page">
      <p class="eyebrow">访问权限 · 管理员</p>
      <h1>管理报表</h1>
      <p class="page-intro">当前演示身份已通过 route loader 权限检查。</p>
      <div class="overview-grid">
        <article class="overview-card">
          <span>成员总数</span>
          <strong>3</strong>
        </article>
        <article class="overview-card">
          <span>团队总数</span>
          <strong>3</strong>
        </article>
      </div>
    </section>
  )
}

function ErrorPage(props: { error: unknown }) {
  return (
    <section class="page error-page" data-testid="route-error" role="alert">
      <p class="eyebrow">路由未能完成</p>
      <h1 data-testid="error-status">{errorStatus(props.error)}</h1>
      <p class="page-intro" data-testid="error-message">
        {errorMessage(props.error)}
      </p>
      <a class="primary-link" href="/admin/users">
        返回用户列表
      </a>
    </section>
  )
}

function errorStatus(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error)
    return String(error.status)
  return '页面加载失败'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'data' in error)
    return String(error.data)
  return '加载出现异常，请返回用户列表重试。'
}
