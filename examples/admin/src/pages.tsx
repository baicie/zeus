import {
  Link,
  Outlet,
  useLocation,
  useMatches,
  useNavigation,
  useParams,
  usePathname,
  useRouteError,
  useRouter,
} from '@zeus-js/router'
import { useMutation, useQuery, useQueryClient } from '@zeus-js/query'
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  type Accessor,
} from '@zeus-js/zeus'
import type { DataGridElement } from '@zeus-web/data-grid/wc'
import type { InputElement } from '@zeus-web/input/wc'

import {
  adminApi,
  adminSummaryQueryKey,
  adminUserQueryKey,
  USER_LIST_STALE_TIME,
  USER_PAGE_SIZE,
  userListQueryKey,
  type AdminSummary,
  type Role,
  type User,
  type UserStatus,
} from './routes'

/** The application shell; it stays mounted across route changes. */
export function AdminShell(props: {
  role: Accessor<Role>
  onRoleChange: (role: Role) => void
}) {
  const router = useRouter()
  const location = useLocation()
  const pathname = usePathname()
  const matches = useMatches()
  const navigation = useNavigation()
  const [preloadStatus, setPreloadStatus] = createSignal('尚未预加载')

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
    const next = (event.currentTarget as HTMLSelectElement).value as Role
    // The route loader reads this signal; re-running the current URL applies
    // the new role and lets a denied route recover without a reload.
    props.onRoleChange(next)
    void router.navigate(location(), { replace: true })
  }

  return (
    <div class="admin-shell" data-testid="admin-layout">
      <aside class="sidebar">
        <Link class="brand" to="/admin" aria-label="Zeus Admin 首页">
          Z<span>Zeus Admin</span>
        </Link>
        <p class="sidebar-label">工作空间</p>
        <nav aria-label="主导航">
          <Link
            to="/admin"
            aria-current={pathname() === '/admin' ? 'page' : undefined}
          >
            概览
          </Link>
          <Link
            to="/admin/users"
            aria-current={
              pathname().startsWith('/admin/users') ? 'page' : undefined
            }
          >
            用户管理
          </Link>
          <Link
            to="/admin/reports"
            aria-current={pathname() === '/admin/reports' ? 'page' : undefined}
          >
            管理报表
          </Link>
        </nav>
        <div class="session">
          <label for="session-role">演示身份</label>
          <select
            id="session-role"
            data-testid="role-select"
            prop:value={props.role()}
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
              {location().pathname}
              {location().search}
              {location().hash}
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
          aria-busy={String(navigation().state !== 'idle')}
        >
          <div class="route-status">
            <span data-testid="route-matches">
              {matches()
                .map(match => match.route.id)
                .join(' / ')}
            </span>
            <span role="status" data-testid="navigation-status">
              {navigation().state === 'idle' ? '就绪' : '正在加载…'}
            </span>
          </div>
          <Outlet />

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

export function OverviewPage() {
  const summary = useSummaryQuery()

  return (
    <section class="page" data-testid="overview-page">
      <p class="eyebrow">工作空间概览</p>
      <h1>欢迎回来</h1>
      <p class="page-intro">
        从用户列表开始，查看成员信息、访问权限与路由错误处理。
      </p>
      <div class="overview-grid">
        <Link class="overview-card" to="/admin/users">
          <span>团队成员</span>
          <strong data-testid="summary-user-count">
            {summary.data()?.totalUsers ?? '…'}
          </strong>
          <span>查看用户列表 →</span>
        </Link>
        <Link class="overview-card" to="/admin/reports">
          <span>管理报表</span>
          <strong data-testid="summary-team-count">
            {summary.data()?.teams ?? '…'}
          </strong>
          <span>检查访问权限 →</span>
        </Link>
      </div>
    </section>
  )
}

export function UsersPage() {
  const router = useRouter()
  const [search, setSearch] = createSignal('')
  const [status, setStatus] = createSignal<UserStatus | 'all'>('all')
  const [page, setPage] = createSignal(1)
  const [selectedKeys, setSelectedKeys] = createSignal<readonly string[]>([])
  const query = useQuery(() => ({
    queryKey: userListQueryKey(search(), status(), page()),
    queryFn: ({ signal }) =>
      adminApi.listUsers(
        {
          search: search(),
          status: status(),
          page: page(),
          pageSize: USER_PAGE_SIZE,
        },
        signal,
      ),
    staleTime: USER_LIST_STALE_TIME,
    retry: false,
  }))
  const result = () => query.data()
  const emptyUsers: readonly User[] = []
  // Query status and staleness updates retain the same data reference. Only
  // replace grid rows when that data changes, preserving an in-flight click.
  const users = createMemo<readonly User[]>(() => result()?.rows ?? emptyUsers)
  const pageCount = () =>
    Math.max(1, Math.ceil((result()?.total ?? 0) / USER_PAGE_SIZE))
  const selectedUser = () => users().find(user => user.id === selectedKeys()[0])
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
    const nextRows = users()
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
    if (user) void router.navigate(`/admin/users/${user.id}`)
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
        <Link to="/admin/users/error">体验 loader 失败</Link>
        <Link to="/admin/users/missing">访问不存在的用户</Link>
      </p>
    </section>
  )
}

export function UserPage() {
  const params = useParams()
  const queryClient = useQueryClient()
  const userId = () => params().id ?? ''
  const query = useQuery(() => ({
    queryKey: adminUserQueryKey(userId()),
    queryFn: ({ signal }) => adminApi.getUser(userId(), signal),
    staleTime: 1_000,
    retry: false,
  }))
  const [editing, setEditing] = createSignal(false)
  const [draftEmail, setDraftEmail] = createSignal('')
  const mutation = useMutation<
    User,
    { id: string; email: string },
    Error,
    User | undefined
  >(() => ({
    retry: false,
    mutationFn: (input, context) =>
      adminApi.updateUser(input.id, { email: input.email }, context.signal),
    onMutate: async (input, { client }) => {
      const key = adminUserQueryKey(input.id)
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<User>(key)
      if (previous)
        client.setQueryData<User>(key, { ...previous, email: input.email })
      return previous
    },
    onError: (_error, input, previous, { client }) => {
      client.setQueryData(adminUserQueryKey(input.id), previous)
    },
    onSettled: (data, _error, input, _previous, { client }) => {
      if (data) client.setQueryData(adminUserQueryKey(input.id), data)
      void client
        .invalidateQueries({ queryKey: ['admin-users'] })
        .catch(() => undefined)
    },
  }))
  const user = () => query.data()

  function openEditor(): void {
    setDraftEmail(user()?.email ?? '')
    setEditing(true)
  }

  function closeEditor(): void {
    setEditing(false)
  }

  async function saveUser(event: Event): Promise<void> {
    event.preventDefault()
    try {
      await mutation.mutateAsync({ id: userId(), email: draftEmail() })
      setEditing(false)
    } catch {
      // The mutation state drives the save status; the dialog stays open.
    }
  }

  const bindUserInput = (element: InputElement | null): void => {
    if (!element) return
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
      <Link class="back-link" to="/admin/users">
        ← 返回用户列表
      </Link>
      <p class="eyebrow">成员详情</p>
      <Show when={query.pending()}>
        <p role="status">加载详情中…</p>
      </Show>
      <h1>{user()?.name ?? ''}</h1>
      <dl class="detail-grid">
        <div>
          <dt>用户 ID</dt>
          <dd data-testid="detail-id">{params().id}</dd>
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
      <button
        data-testid="edit-user"
        disabled={!user()}
        prop:onclick={openEditor}
      >
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
              更新邮箱后保存，详情缓存会先乐观更新，失败时回滚，列表查询随后失效。
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

export function ReportsPage() {
  const summary = useSummaryQuery()

  return (
    <section class="page" data-testid="reports-page">
      <p class="eyebrow">访问权限 · 管理员</p>
      <h1>管理报表</h1>
      <p class="page-intro">当前演示身份已通过 route loader 权限检查。</p>
      <div class="overview-grid">
        <article class="overview-card">
          <span>成员总数</span>
          <strong data-testid="reports-user-count">
            {summary.data()?.totalUsers ?? '…'}
          </strong>
        </article>
        <article class="overview-card">
          <span>团队总数</span>
          <strong data-testid="reports-team-count">
            {summary.data()?.teams ?? '…'}
          </strong>
        </article>
      </div>
    </section>
  )
}

export function ErrorPage() {
  const error = useRouteError()

  return (
    <section class="page error-page" data-testid="route-error" role="alert">
      <p class="eyebrow">路由未能完成</p>
      <h1 data-testid="error-status">{errorStatus(error())}</h1>
      <p class="page-intro" data-testid="error-message">
        {errorMessage(error())}
      </p>
      <Link class="primary-link" to="/admin/users">
        返回用户列表
      </Link>
    </section>
  )
}

function useSummaryQuery() {
  return useQuery<AdminSummary>({
    queryKey: adminSummaryQueryKey,
    queryFn: ({ signal }) => adminApi.getSummary(signal),
    staleTime: 5_000,
    retry: false,
  })
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
