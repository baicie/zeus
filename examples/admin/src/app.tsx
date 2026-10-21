import type { ZeusRouter } from '@zeus-js/router'
import { createMutation, createQuery, createQueryClient } from '@zeus-js/query'
import { createResource } from '@zeus-js/resource'
import type { DataGridElement } from '@zeus-web/data-grid/wc'
import type { InputElement } from '@zeus-web/input/wc'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from '@zeus-js/zeus'

import {
  adminApi,
  createAdminRouter,
  type Role,
  type User,
  type UserStatus,
} from './routes'

interface PageProps {
  router: ZeusRouter
  queryClient: ReturnType<typeof createQueryClient>
}

export function App() {
  const [role, setRole] = createSignal<Role>('viewer')
  const [preloadStatus, setPreloadStatus] = createSignal('尚未预加载')
  const queryClient = createQueryClient()
  onCleanup(() => queryClient.dispose())
  const router = createAdminRouter(role)
  const summary = createResource('admin-summary', (_key, context) =>
    adminApi.getSummary(context.signal),
  )
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
      prop:onclick={handleLinkClick}
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
            prop:onchange={changeRole}
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
              prop:onclick={() => void router.navigate(-1)}
            >
              后退
            </button>
            <button
              data-testid="history-forward"
              prop:onclick={() => void router.navigate(1)}
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
                    <OverviewPage summary={summary} />
                  </Show>
                  <Show when={routeId() === 'users'}>
                    <UsersPage router={router} queryClient={queryClient} />
                  </Show>
                  <Show when={routeId() === 'user'}>
                    <UserPage router={router} queryClient={queryClient} />
                  </Show>
                  <Show when={routeId() === 'reports'}>
                    <ReportsPage summary={summary} />
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
            <button
              data-testid="preload-ada"
              prop:onclick={() => void preloadAda()}
            >
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

function OverviewPage(props: {
  summary: ReturnType<
    typeof createResource<{ totalUsers: number; teams: number }, string>
  >
}) {
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
          <strong data-testid="summary-user-count">
            {props.summary.data()?.totalUsers ?? '…'}
          </strong>
          <span>查看用户列表 →</span>
        </a>
        <a class="overview-card" href="/admin/reports">
          <span>管理报表</span>
          <strong data-testid="summary-team-count">
            {props.summary.data()?.teams ?? '…'}
          </strong>
          <span>检查访问权限 →</span>
        </a>
      </div>
    </section>
  )
}

function UsersPage(props: PageProps) {
  const [search, setSearch] = createSignal('')
  const [status, setStatus] = createSignal<UserStatus | 'all'>('all')
  const [page, setPage] = createSignal(1)
  const pageSize = 3
  const [selectedKeys, setSelectedKeys] = createSignal<readonly string[]>([])
  const query = createQuery(props.queryClient, () => ({
    queryKey: ['admin-users', search(), status(), page(), pageSize],
    queryFn: ({ signal }) =>
      adminApi.listUsers(
        { search: search(), status: status(), page: page(), pageSize },
        signal,
      ),
    staleTime: 500,
    retry: false,
  }))
  const result = () => query.data()
  const users = () => result()?.rows ?? []
  const pageCount = () =>
    Math.max(1, Math.ceil((result()?.total ?? 0) / pageSize))
  const selectedUser = () => users().find(user => user.id === selectedKeys()[0])
  let inputElement: InputElement | undefined
  let gridElement: DataGridElement | undefined

  const scheduleGridRows = (
    element: DataGridElement,
    rows: readonly User[],
  ): void => {
    queueMicrotask(() => {
      if (typeof element.setRows === 'function') void element.setRows([...rows])
    })
  }

  const bindSearchInput = (element: InputElement | null): void => {
    if (!element) return
    inputElement = element
    const onValueChange = (event: Event): void => {
      const value =
        (event as CustomEvent<{ value?: string }>).detail?.value ?? ''
      setSearch(value)
      setPage(1)
      setSelectedKeys([])
    }
    element.addEventListener('value-change', onValueChange)
    onCleanup(() => element.removeEventListener('value-change', onValueChange))
  }

  const bindGrid = (element: DataGridElement | null): void => {
    if (!element) return
    gridElement = element
    // The published DataGrid beta used by this example owns a separate
    // runtime-dom signal engine. Use its imperative model update API so a
    // query result change is observed even when the controlled prop effect
    // cannot cross that engine boundary.
    scheduleGridRows(element, users())
    const onSelectionChange = (event: Event): void => {
      const detail = (
        event as CustomEvent<{ selection?: { keys?: unknown[] } }>
      ).detail
      const keys = detail?.selection?.keys ?? []
      setSelectedKeys(keys.map(key => String(key)))
    }
    element.addEventListener('selection-change', onSelectionChange)
    onCleanup(() =>
      element.removeEventListener('selection-change', onSelectionChange),
    )
  }

  createEffect(() => {
    const nextRows = [...users()]
    if (gridElement && typeof gridElement.setRows === 'function')
      scheduleGridRows(gridElement, nextRows)
  })

  createEffect(() => {
    if (!query.pending() && page() > pageCount()) setPage(pageCount())
  })

  function updateStatus(event: Event): void {
    setStatus(
      (event.currentTarget as HTMLSelectElement).value as UserStatus | 'all',
    )
    setPage(1)
    setSelectedKeys([])
  }

  function openSelectedUser(): void {
    const user = selectedUser()
    if (user) void props.router.navigate(`/admin/users/${user.id}`)
  }

  return (
    <section class="page" data-testid="users-page">
      <p class="eyebrow">成员目录</p>
      <h1>用户管理</h1>
      <p class="page-intro">
        通过 Query adapter 读取成员目录，输入搜索词或状态筛选会取消旧请求。
      </p>
      <div class="filter-bar" aria-label="用户筛选">
        <div class="search-field">
          <label for="user-search">搜索用户</label>
          <zw-input
            id="user-search"
            aria-label="搜索用户"
            placeholder="姓名、邮箱或团队"
            prop:value={search()}
            ref={bindSearchInput}
            data-testid="user-search"
          />
        </div>
        <label class="status-field" for="user-status">
          状态
          <select
            id="user-status"
            data-testid="user-status"
            prop:onchange={updateStatus}
          >
            <option value="all">全部</option>
            <option value="active">活跃</option>
            <option value="invited">待邀请</option>
            <option value="suspended">已暂停</option>
          </select>
        </label>
      </div>
      <Show when={query.pending()}>
        <p role="status" data-testid="users-loading">
          加载中…
        </p>
      </Show>
      <Show when={query.errorState()}>
        <p role="alert">{String(query.error())}</p>
      </Show>
      <zw-data-grid
        data-testid="user-grid"
        aria-label="工作空间成员"
        selection-mode="single"
        prop:columns={[
          {
            id: 'name',
            header: '姓名',
            field: 'name',
            width: 220,
            sortable: true,
          },
          {
            id: 'email',
            header: '邮箱',
            field: 'email',
            width: 260,
            sortable: true,
          },
          {
            id: 'team',
            header: '团队',
            field: 'team',
            width: 160,
            sortable: true,
          },
          {
            id: 'status',
            header: '状态',
            field: 'status',
            width: 120,
            sortable: true,
          },
        ]}
        prop:selectedKeys={[...selectedKeys()]}
        ref={bindGrid}
      />
      <div class="grid-actions">
        <span data-testid="selection-status">
          {selectedUser()
            ? `已选择：${selectedUser()?.name}`
            : '请选择一位成员'}
        </span>
        <button
          data-testid="open-selected-user"
          disabled={!selectedUser()}
          prop:onclick={openSelectedUser}
        >
          查看详情
        </button>
      </div>
      <div class="pagination" aria-label="用户分页">
        <button
          data-testid="page-prev"
          disabled={page() <= 1}
          prop:onclick={() => setPage(Math.max(1, page() - 1))}
        >
          上一页
        </button>
        <span data-testid="page-indicator">
          第 {page()} / {pageCount()} 页
        </span>
        <button
          data-testid="page-next"
          disabled={page() >= pageCount()}
          prop:onclick={() => setPage(Math.min(pageCount(), page() + 1))}
        >
          下一页
        </button>
      </div>
      <p class="example-links">
        <a href="/admin/users/error">体验 loader 失败</a>
        <a href="/admin/users/missing">访问不存在的用户</a>
      </p>
    </section>
  )
}

function UserPage(props: PageProps) {
  const userId = () => props.router.params().id ?? ''
  const resource = createResource(
    userId,
    (id, context) => adminApi.getUser(id, context.signal),
    { staleTime: 1_000 },
  )
  const [editing, setEditing] = createSignal(false)
  const [draftEmail, setDraftEmail] = createSignal('')
  const [updatedUser, setUpdatedUser] = createSignal<User | undefined>(
    undefined,
  )
  const mutation = createMutation(props.queryClient, {
    retry: false,
    mutationFn: (input: { id: string; email: string }, context) =>
      adminApi.updateUser(input.id, { email: input.email }, context.signal),
  })
  let inputElement: InputElement | undefined
  let dialogElement: HTMLElement | undefined

  const user = () => updatedUser() ?? resource.data()

  function openEditor(): void {
    setDraftEmail(user()?.email ?? '')
    setEditing(true)
  }

  function closeEditor(): void {
    setEditing(false)
  }

  async function saveUser(event: Event): Promise<void> {
    event.preventDefault()
    const nextUser = await mutation.mutateAsync({
      id: userId(),
      email: draftEmail(),
    })
    setUpdatedUser(nextUser)
    void props.queryClient.client
      .invalidateQueries({ queryKey: ['admin-users'] })
      .catch(() => undefined)
    setEditing(false)
  }

  const bindUserInput = (element: InputElement | null): void => {
    if (!element) return
    inputElement = element
    const onValueChange = (event: Event): void => {
      setDraftEmail(
        (event as CustomEvent<{ value?: string }>).detail?.value ?? '',
      )
    }
    element.addEventListener('value-change', onValueChange)
    onCleanup(() => element.removeEventListener('value-change', onValueChange))
  }

  const bindDialog = (element: HTMLElement | null): void => {
    if (!element) return
    dialogElement = element
    const onOpenChange = (event: Event): void => {
      const open = Boolean(
        (event as CustomEvent<{ open?: boolean }>).detail?.open,
      )
      setEditing(open)
    }
    element.addEventListener('open-change', onOpenChange)
    onCleanup(() => element.removeEventListener('open-change', onOpenChange))
  }

  return (
    <section class="page" data-testid="user-detail">
      <a class="back-link" href="/admin/users">
        ← 返回用户列表
      </a>
      <p class="eyebrow">成员详情</p>
      <Show when={resource.pending()}>
        <p role="status">加载详情中…</p>
      </Show>
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
      <button data-testid="edit-user" prop:onclick={openEditor}>
        编辑成员
      </button>
      <span class="save-status" role="status" data-testid="save-status">
        {mutation.pending()
          ? '保存中…'
          : mutation.success()
            ? '已保存'
            : mutation.errorState()
              ? '保存失败'
              : ''}
      </span>
      <Show when={editing()}>
        <zw-dialog
          data-testid="user-dialog"
          prop:open={editing()}
          ref={bindDialog}
        >
          <zw-dialog-content>
            <zw-dialog-title>编辑成员</zw-dialog-title>
            <zw-dialog-description>
              更新邮箱后保存，列表查询会自动失效并刷新。
            </zw-dialog-description>
            <form prop:onsubmit={saveUser} data-testid="user-form">
              <label for="user-email">邮箱</label>
              <zw-input
                id="user-email"
                type="email"
                required
                prop:value={draftEmail()}
                ref={bindUserInput}
              />
              <div class="dialog-actions">
                <button type="button" prop:onclick={closeEditor}>
                  取消
                </button>
                <button type="submit" disabled={mutation.pending()}>
                  保存
                </button>
              </div>
            </form>
          </zw-dialog-content>
        </zw-dialog>
      </Show>
    </section>
  )
}

function ReportsPage(props: {
  summary: ReturnType<
    typeof createResource<{ totalUsers: number; teams: number }, string>
  >
}) {
  return (
    <section class="page" data-testid="reports-page">
      <p class="eyebrow">访问权限 · 管理员</p>
      <h1>管理报表</h1>
      <p class="page-intro">当前演示身份已通过 route loader 权限检查。</p>
      <div class="overview-grid">
        <article class="overview-card">
          <span>成员总数</span>
          <strong data-testid="reports-user-count">
            {props.summary.data()?.totalUsers ?? '…'}
          </strong>
        </article>
        <article class="overview-card">
          <span>团队总数</span>
          <strong data-testid="reports-team-count">
            {props.summary.data()?.teams ?? '…'}
          </strong>
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
