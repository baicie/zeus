import { Link, useParams, useRouteError, useRouter } from '@zeus-js/router'
import { useMutation, useQuery, useQueryClient } from '@zeus-js/query'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from '@zeus-js/zeus'
import type { DataGridElement } from '@zeus-web/data-grid/wc'
import type { InputElement } from '@zeus-web/input/wc'

import {
  adminSummaryQueryKey,
  adminUserQueryKey,
  USER_LIST_STALE_TIME,
  USER_PAGE_SIZE,
  userListQueryKey,
  type AdminSummary,
  type AdminAuditEvent,
  type AdminRoleRecord,
  type Role,
  type SessionUser,
  type User,
  type UserStatus,
} from './routes'
import { createHttpAdminApi } from './api'
import type { WorkspaceSettings } from './api'
import { Icon } from './shell/icon'
import { useSession } from './session'

export const adminApi = createHttpAdminApi(
  import.meta.env.VITE_ZEUS_ADMIN_API ?? '',
)

export function OverviewPage() {
  const summary = useSummaryQuery()
  const session = useSession()

  return (
    <section class="page" data-testid="overview-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">工作空间概览</h2>
          <p class="page-description">
            成员与团队的实时摘要，数据由服务端会话校验后返回。
          </p>
        </div>
      </header>

      <div class="stat-grid">
        <article class="stat">
          <span class="stat-label">
            <Icon name="users" /> 团队成员
          </span>
          <strong class="stat-value" data-testid="summary-user-count">
            {summary.data()?.totalUsers ?? '—'}
          </strong>
          <span class="stat-foot">当前工作空间内的全部成员</span>
        </article>
        <article class="stat">
          <span class="stat-label">
            <Icon name="team" /> 团队总数
          </span>
          <strong class="stat-value" data-testid="summary-team-count">
            {summary.data()?.teams ?? '—'}
          </strong>
          <span class="stat-foot">成员所属的不同团队</span>
        </article>
      </div>

      <section class="stack">
        <h3>快捷操作</h3>
        <div class="quick-actions">
          <Link class="quick-action" to="/admin/users">
            <span class="quick-action-icon">
              <Icon name="users" />
            </span>
            <span class="quick-action-copy">
              <span class="quick-action-title">管理成员</span>
              <span class="quick-action-description">
                搜索、筛选并编辑成员资料
              </span>
            </span>
          </Link>
          <Show when={session.role === 'admin'}>
            <Link class="quick-action" to="/admin/audit">
              <span class="quick-action-icon">
                <Icon name="list" />
              </span>
              <span class="quick-action-copy">
                <span class="quick-action-title">审计日志</span>
                <span class="quick-action-description">
                  查看登录与写操作的服务端记录
                </span>
              </span>
            </Link>
            <Link class="quick-action" to="/admin/reports">
              <span class="quick-action-icon">
                <Icon name="chart" />
              </span>
              <span class="quick-action-copy">
                <span class="quick-action-title">管理报表</span>
                <span class="quick-action-description">汇总成员与团队数据</span>
              </span>
            </Link>
          </Show>
        </div>
      </section>
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
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">成员目录</h2>
          <p class="page-description">
            搜索或按状态筛选成员，选中后可进入详情编辑。
          </p>
        </div>
        <div class="page-actions">
          <Link class="btn" to="/admin/users/error">
            <Icon name="alert" /> 体验加载失败
          </Link>
        </div>
      </header>

      <div class="filter-bar" aria-label="用户筛选">
        <div class="field search-field">
          <label class="field-label" for="user-search">
            搜索成员
          </label>
          <zw-input
            id="user-search"
            aria-label="搜索用户"
            placeholder="姓名、邮箱或团队"
            prop:value={search()}
            ref={bindSearchInput}
            data-testid="user-search"
          />
        </div>
        <div class="field status-field">
          <label class="field-label" for="user-status">
            状态
          </label>
          <select
            id="user-status"
            class="select"
            data-testid="user-status"
            prop:onchange={updateStatus}
          >
            <option value="all">全部状态</option>
            <option value="active">活跃</option>
            <option value="invited">待邀请</option>
            <option value="suspended">已暂停</option>
          </select>
        </div>
      </div>

      <Show when={query.errorState()}>
        <div class="state-block state-block-error" role="alert">
          <Icon name="alert" />
          <p class="state-title">无法加载成员目录</p>
          <p class="state-description">{String(query.error())}</p>
        </div>
      </Show>

      <div class="grid-frame">
        <div class="grid-toolbar">
          <span class="muted" data-testid="selection-status">
            {selectedUser()
              ? `已选择：${selectedUser()?.name}`
              : `${result()?.total ?? 0} 位成员`}
          </span>
          <span class="spacer" />
          <Show when={query.pending()}>
            <span class="row" role="status" data-testid="users-loading">
              <span class="spinner" aria-hidden="true" /> 加载中…
            </span>
          </Show>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            data-testid="open-selected-user"
            disabled={!selectedUser()}
            prop:onclick={openSelectedUser}
          >
            查看详情
          </button>
        </div>

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

        <div class="pagination">
          <button
            type="button"
            class="btn btn-sm"
            data-testid="page-prev"
            disabled={page() <= 1}
            prop:onclick={() => setPage(Math.max(1, page() - 1))}
          >
            <Icon name="arrowLeft" /> 上一页
          </button>
          <span class="page-indicator" data-testid="page-indicator">
            第 {page()} / {pageCount()} 页
          </span>
          <button
            type="button"
            class="btn btn-sm"
            data-testid="page-next"
            disabled={page() >= pageCount()}
            prop:onclick={() => setPage(Math.min(pageCount(), page() + 1))}
          >
            下一页 <Icon name="arrowRight" />
          </button>
        </div>
      </div>
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
        <Icon name="arrowLeft" /> 返回用户列表
      </Link>

      <header class="page-header">
        <div class="page-heading">
          <Show
            when={user()}
            fallback={
              <div class="stack">
                <div
                  class="skeleton skeleton-line"
                  style={{ width: '180px', height: '24px' }}
                />
                <div
                  class="skeleton skeleton-line"
                  style={{ width: '260px' }}
                />
              </div>
            }
          >
            <h2 class="page-title">{user()?.name}</h2>
            <p class="page-description">{user()?.email}</p>
          </Show>
        </div>
        <div class="page-actions">
          <button
            type="button"
            class="btn btn-primary"
            data-testid="edit-user"
            disabled={!user()}
            prop:onclick={openEditor}
          >
            <Icon name="edit" /> 编辑成员
          </button>
        </div>
      </header>

      <Show when={query.pending()}>
        <p class="row muted" role="status">
          <span class="spinner" aria-hidden="true" /> 加载详情中…
        </p>
      </Show>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">成员资料</h3>
            <p class="card-description">
              数据来自 route loader，与列表共享同一份查询缓存。
            </p>
          </div>
          <span class="save-status" role="status" data-testid="save-status">
            {mutation.pending()
              ? '保存中…'
              : mutation.success()
                ? '已保存'
                : mutation.errorState()
                  ? '保存失败'
                  : ''}
          </span>
        </div>
        <div class="card-body">
          <dl class="detail-grid">
            <div>
              <dt>用户 ID</dt>
              <dd class="mono" data-testid="detail-id">
                {params().id}
              </dd>
            </div>
            <div>
              <dt>邮箱</dt>
              <dd>{user()?.email ?? ''}</dd>
            </div>
            <div>
              <dt>团队</dt>
              <dd>{user()?.team ?? ''}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                <StatusBadge status={user()?.status} />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <Show when={editing()}>
        <zw-dialog
          data-testid="user-dialog"
          prop:open={editing()}
          ref={bindDialog}
        >
          <zw-dialog-content>
            <zw-dialog-title>编辑成员</zw-dialog-title>
            <zw-dialog-description>
              更新邮箱后保存。详情缓存先乐观更新，失败时回滚，列表查询随后失效。
            </zw-dialog-description>
            <form
              prop:onsubmit={saveUser}
              data-testid="user-form"
              class="settings-form"
            >
              <div class="field">
                <label class="field-label" for="user-email">
                  邮箱
                </label>
                <zw-input
                  id="user-email"
                  type="email"
                  required
                  prop:value={draftEmail()}
                  ref={bindUserInput}
                />
              </div>
              <div class="row" style={{ 'justify-content': 'flex-end' }}>
                <button type="button" class="btn" prop:onclick={closeEditor}>
                  取消
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  disabled={mutation.pending()}
                >
                  {mutation.pending() ? '保存中…' : '保存'}
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
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">管理报表</h2>
          <p class="page-description">
            汇总当前工作空间的成员与团队规模。数据由服务端在通过角色校验后返回。
          </p>
        </div>
      </header>
      <div class="stat-grid">
        <article class="stat">
          <span class="stat-label">
            <Icon name="users" /> 成员总数
          </span>
          <strong class="stat-value" data-testid="reports-user-count">
            {summary.data()?.totalUsers ?? '—'}
          </strong>
          <span class="stat-foot">跨全部团队</span>
        </article>
        <article class="stat">
          <span class="stat-label">
            <Icon name="team" /> 团队总数
          </span>
          <strong class="stat-value" data-testid="reports-team-count">
            {summary.data()?.teams ?? '—'}
          </strong>
          <span class="stat-foot">已建立的团队</span>
        </article>
      </div>
    </section>
  )
}

export function ErrorPage() {
  const error = useRouteError()
  const status = () => errorStatus(error())

  return (
    <section class="page error-page" data-testid="route-error" role="alert">
      <p class="error-status" data-testid="error-status">
        {status()}
      </p>
      <h2 class="page-title">{errorHeading(status())}</h2>
      <p class="page-description" data-testid="error-message">
        {errorMessage(error())}
      </p>
      <div class="page-actions">
        <Link class="btn btn-primary" to="/admin/users">
          <Icon name="arrowLeft" /> 返回用户列表
        </Link>
        <Link class="btn" to="/admin">
          回到概览
        </Link>
      </div>
    </section>
  )
}

export function AuditPage() {
  const [page, setPage] = createSignal(1)
  const [auditError, setAuditError] = createSignal('')
  const [events, setEvents] = createSignal<readonly AdminAuditEvent[]>([])
  const [total, setTotal] = createSignal(0)
  const pageSize = 20
  const pageCount = () => Math.max(1, Math.ceil(total() / pageSize))
  const [auditVersion, setAuditVersion] = createSignal(0)

  createEffect(() => {
    const currentPage = page()
    void auditVersion()
    const controller = new AbortController()
    setAuditError('')
    adminApi
      .listAudit(currentPage, pageSize, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        setEvents(result.rows)
        setTotal(result.total)
      })
      .catch(error => {
        if (!controller.signal.aborted) setAuditError(errorMessage(error))
      })
    onCleanup(() => controller.abort())
  })

  return (
    <section class="page" data-testid="audit-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">审计日志</h2>
          <p class="page-description">
            登录、越权尝试与写操作由服务端记录在 SQLite 中，并非浏览器内存。
          </p>
        </div>
        <div class="page-actions">
          <button
            type="button"
            class="btn"
            data-testid="audit-refresh"
            onClick={() => setAuditVersion(v => v + 1)}
          >
            <Icon name="refresh" /> 刷新
          </button>
        </div>
      </header>

      <Show when={auditError()}>
        <div class="state-block state-block-error" role="alert">
          <Icon name="alert" />
          <p class="state-title">无法加载审计日志</p>
          <p class="state-description" data-testid="audit-error">
            {auditError()}
          </p>
        </div>
      </Show>

      <Show when={!auditError()}>
        <div class="card">
          <div style={{ overflow: 'auto' }}>
            <table class="table" data-testid="audit-table">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">操作</th>
                  <th scope="col">对象</th>
                  <th scope="col">结果</th>
                </tr>
              </thead>
              <tbody>
                <For each={events()}>
                  {event => (
                    <tr>
                      <td class="audit-time">
                        {new Date(event.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td>
                        <span class="audit-action">{event.action}</span>
                      </td>
                      <td class="mono">{event.target ?? '—'}</td>
                      <td>
                        <OutcomeBadge outcome={event.outcome} />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={events().length === 0}>
              <div class="state-block">
                <Icon name="inbox" />
                <p class="state-title">暂无审计记录</p>
                <p class="state-description">
                  一旦发生登录、写操作或越权尝试，记录会出现在这里。
                </p>
              </div>
            </Show>
          </div>
          <div class="pagination">
            <button
              type="button"
              class="btn btn-sm"
              data-testid="audit-prev"
              disabled={page() <= 1}
              onClick={() => setPage(Math.max(1, page() - 1))}
            >
              <Icon name="arrowLeft" /> 上一页
            </button>
            <span class="page-indicator" data-testid="audit-page-indicator">
              第 {page()} / {pageCount()} 页
            </span>
            <button
              type="button"
              class="btn btn-sm"
              data-testid="audit-next"
              disabled={page() >= pageCount()}
              onClick={() => setPage(Math.min(pageCount(), page() + 1))}
            >
              下一页 <Icon name="arrowRight" />
            </button>
          </div>
        </div>
      </Show>
    </section>
  )
}

export function RolesPage() {
  const roles: readonly AdminRoleRecord[] = [
    {
      role: 'admin',
      description: '管理成员、角色、设置与审计记录。',
      members: 1,
      capabilities: ['用户 CRUD', '角色变更', '审计读取', '上传', '设置写入'],
    },
    {
      role: 'viewer',
      description: '只读访问用户、报表与设置。',
      members: 7,
      capabilities: ['用户读取', '报表读取', '设置读取'],
    },
  ]

  return (
    <section class="page" data-testid="roles-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">角色与权限</h2>
          <p class="page-description">
            浏览器的角色只用于界面呈现。每次读写都由服务端 session 重新校验。
          </p>
        </div>
      </header>
      <div class="role-grid">
        <For each={roles}>
          {record => (
            <article class="role-card" data-testid={`role-${record.role}`}>
              <div class="role-card-header">
                <h3 class="role-card-title">
                  {record.role === 'admin' ? '管理员' : '只读成员'}
                </h3>
                <span class="badge badge-accent">{record.members} 位成员</span>
              </div>
              <p class="role-card-description">{record.description}</p>
              <div>
                <p class="field-label" style={{ 'margin-bottom': '8px' }}>
                  能力
                </p>
                <ul class="capability-list">
                  <For each={record.capabilities}>
                    {capability => (
                      <li class="capability">
                        <Icon name="check" /> {capability}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  )
}

export function SettingsPage() {
  const [settings, setSettings] = createSignal<WorkspaceSettings | undefined>(
    undefined,
  )
  const [status, setStatus] = createSignal('')
  const [error, setError] = createSignal('')
  const [saving, setSaving] = createSignal(false)

  createEffect(() => {
    const controller = new AbortController()
    adminApi
      .getSettings(controller.signal)
      .then(value => {
        setSettings(value)
        applyTheme(value.theme)
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      })
    onCleanup(() => controller.abort())
  })

  async function save(event: Event): Promise<void> {
    event.preventDefault()
    const current = settings()
    if (!current) return
    setSaving(true)
    setError('')
    setStatus('')
    const controller = new AbortController()
    try {
      const next = await adminApi.updateSettings(current, controller.signal)
      setSettings(next)
      applyTheme(next.theme)
      setStatus('设置已保存')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  function patch<K extends keyof WorkspaceSettings>(
    key: K,
    value: WorkspaceSettings[K],
  ): void {
    setSettings(current => (current ? { ...current, [key]: value } : current))
  }

  return (
    <section class="page" data-testid="settings-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">工作空间设置</h2>
          <p class="page-description">
            名称、语言与主题持久化在服务端 SQLite，刷新或重启服务后仍然保留。
          </p>
        </div>
      </header>

      <Show
        when={settings()}
        fallback={
          <div class="settings-layout">
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
          </div>
        }
      >
        <form class="settings-layout" onSubmit={save}>
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">常规</h3>
                <p class="card-description">工作空间名称与界面语言。</p>
              </div>
            </div>
            <div class="card-body settings-form">
              <div class="field">
                <label class="field-label" for="workspace-name">
                  工作空间名称
                </label>
                <input
                  id="workspace-name"
                  class="input"
                  value={settings()!.workspaceName}
                  onInput={event =>
                    patch(
                      'workspaceName',
                      (event.currentTarget as HTMLInputElement).value,
                    )
                  }
                />
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label" for="workspace-locale">
                    语言
                  </label>
                  <select
                    id="workspace-locale"
                    class="select"
                    value={settings()!.locale}
                    onChange={event =>
                      patch(
                        'locale',
                        (event.currentTarget as HTMLSelectElement)
                          .value as WorkspaceSettings['locale'],
                      )
                    }
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="workspace-theme">
                    主题
                  </label>
                  <select
                    id="workspace-theme"
                    class="select"
                    value={settings()!.theme}
                    onChange={event =>
                      patch(
                        'theme',
                        (event.currentTarget as HTMLSelectElement)
                          .value as WorkspaceSettings['theme'],
                      )
                    }
                  >
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="card-footer settings-actions">
              <button type="submit" class="btn btn-primary" disabled={saving()}>
                {saving() ? '保存中…' : '保存设置'}
              </button>
              <Show when={status()}>
                <span class="row" role="status" data-testid="settings-status">
                  <Icon name="check" /> {status()}
                </span>
              </Show>
              <Show when={error()}>
                <span
                  class="row state-block-error"
                  role="alert"
                  data-testid="settings-error"
                >
                  <Icon name="alert" /> {error()}
                </span>
              </Show>
            </div>
          </div>
        </form>
      </Show>
    </section>
  )
}

export function UploadPage() {
  const [upload, setUpload] = createSignal<
    { id: string; filename: string; bytes: number; sha256: string } | undefined
  >(undefined)
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  async function submit(event: Event): Promise<void> {
    event.preventDefault()
    const input = (event.currentTarget as HTMLFormElement).querySelector(
      'input[type=file]',
    ) as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) {
      setError('请选择文件。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const controller = new AbortController()
      setUpload(await adminApi.uploadFile(file, controller.signal))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class="page" data-testid="upload-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">文件上传</h2>
          <p class="page-description">
            仅接受文本、Markdown、JSON 与 PNG，上限 64
            KiB。服务端拒绝路径分隔符与隐藏文件名。
          </p>
        </div>
      </header>

      <form class="settings-layout" onSubmit={submit} data-testid="upload-form">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">选择文件</h3>
              <p class="card-description">
                上传后服务端会返回文件摘要与 SHA-256。
              </p>
            </div>
          </div>
          <div class="card-body settings-form">
            <div class="field">
              <label class="field-label" for="upload-file">
                文件
              </label>
              <input
                id="upload-file"
                class="input"
                type="file"
                accept=".txt,.md,.json,.png"
              />
            </div>
            <Show when={error()}>
              <p class="form-error" role="alert" data-testid="upload-error">
                <Icon name="alert" /> {error()}
              </p>
            </Show>
            <Show when={upload()}>
              <div class="upload-result" data-testid="upload-result">
                <p class="row">
                  <Icon name="check" /> 上传成功
                </p>
                <dl class="detail-grid">
                  <div>
                    <dt>文件</dt>
                    <dd>{upload()!.filename}</dd>
                  </div>
                  <div>
                    <dt>大小</dt>
                    <dd>{upload()!.bytes} bytes</dd>
                  </div>
                  <div>
                    <dt>SHA-256</dt>
                    <dd
                      class="mono"
                      style={{ 'font-size': '12px', 'word-break': 'break-all' }}
                    >
                      {upload()!.sha256}
                    </dd>
                  </div>
                </dl>
              </div>
            </Show>
          </div>
          <div class="card-footer">
            <button type="submit" class="btn btn-primary" disabled={busy()}>
              {busy() ? '上传中…' : '上传'}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}

/**
 * Writes the server-persisted theme onto the document. The settings page owns
 * this because the value lives in SQLite; the shell's toggle owns only the
 * local preview preference.
 */
function applyTheme(theme: WorkspaceSettings['theme']): void {
  document.documentElement.dataset.theme = theme
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

function useSummaryQuery() {
  return useQuery<AdminSummary>({
    queryKey: adminSummaryQueryKey,
    queryFn: ({ signal }) => adminApi.getSummary(signal),
    staleTime: 5_000,
    retry: false,
  })
}

/** Human-readable heading for a loader error status. */
function errorHeading(status: string): string {
  switch (status) {
    case '403':
      return '没有访问权限'
    case '404':
      return '页面不存在'
    case '500':
      return '服务端出现错误'
    default:
      return '页面加载失败'
  }
}

/**
 * Audit outcome pill. Only three outcomes exist in the schema; anything else
 * is rendered as-is so a new server value is still visible.
 */
function OutcomeBadge(props: { outcome: string }) {
  const tone = () =>
    props.outcome === 'success'
      ? 'audit-outcome-success'
      : props.outcome === 'denied' || props.outcome === 'failure'
        ? 'audit-outcome-denied'
        : 'audit-outcome-neutral'
  const icon = () =>
    props.outcome === 'success'
      ? 'check'
      : props.outcome === 'denied' || props.outcome === 'failure'
        ? 'alert'
        : 'clock'
  return (
    <span class={`audit-outcome ${tone()}`}>
      <Icon name={icon()} /> {props.outcome}
    </span>
  )
}

/**
 * Status pill for a member. The label carries the meaning and the colour
 * reinforces it, so the state is never conveyed by colour alone.
 */
function StatusBadge(props: { status: UserStatus | undefined }) {
  const meta = () => {
    switch (props.status) {
      case 'active':
        return { label: '活跃', tone: 'badge-success' }
      case 'invited':
        return { label: '待邀请', tone: 'badge-warning' }
      case 'suspended':
        return { label: '已暂停', tone: 'badge-danger' }
      default:
        return { label: '未知', tone: '' }
    }
  }
  return (
    <span class={`badge badge-dot ${meta().tone}`.trim()}>{meta().label}</span>
  )
}
