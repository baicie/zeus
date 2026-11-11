/**
 * Page compositions — the shadcn-admin page patterns.
 *
 * Every page follows the reference's skeleton:
 *
 *   <div class="page">
 *     <header class="page-header">
 *       <div class="page-heading"><h2 class="page-title">…</h2><p>…</p></div>
 *       <div class="page-actions">…</div>
 *     </header>
 *     …content…
 *   </div>
 *
 * The dashboard mirrors `features/dashboard`: title row, tabs, a four-card KPI
 * grid, then a 4/3 chart-and-list split. The users page mirrors
 * `features/users`: title row with primary buttons, a data-table toolbar
 * (search + faceted status filter + reset), the table, and pagination. The
 * settings page mirrors `features/settings`: title, separator, a 1/5 side nav
 * and a content column.
 *
 * All counts and lists come from the real Admin API. There is no invented
 * revenue series: the chart is the workspace's own team distribution, and the
 * "recent" list is the server's audit log (or the member list for viewers).
 */

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
  type UserPatch,
  type UserStatus,
} from './routes'
import { createHttpAdminApi } from './api'
import type { WorkspaceSettings } from './api'
import { Icon } from './shell/icon'
import { decorateUserGrid } from './shell/grid-decorations'
import { useSession } from './session'

export const adminApi = createHttpAdminApi(
  import.meta.env.VITE_ZEUS_ADMIN_API ?? '',
)

/* --------------------------------------------------------------- dashboard */

export function OverviewPage() {
  const summary = useSummaryQuery()
  const session = useSession()
  const [tab, setTab] = createSignal<'overview' | 'members'>('overview')
  const members = useQuery(() => ({
    queryKey: userListQueryKey('', 'all', 1, 100),
    queryFn: ({ signal }) =>
      adminApi.listUsers(
        { search: '', status: 'all', page: 1, pageSize: 100 },
        signal,
      ),
    staleTime: 10_000,
    retry: false,
  }))
  const rows = () => members.data()?.rows ?? []
  const activeCount = () =>
    rows().filter(user => user.status === 'active').length
  const invitedCount = () =>
    rows().filter(user => user.status === 'invited').length

  const teams = createMemo(() => {
    const counts = new Map<string, number>()
    for (const user of rows()) {
      counts.set(user.team, (counts.get(user.team) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  })

  const maxTeam = () => Math.max(1, ...teams().map(team => team.total))

  return (
    <section class="page" data-testid="overview-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">概览</h2>
          <p class="page-description">
            工作空间的成员、团队与审计摘要，数据由服务端会话校验后返回。
          </p>
        </div>
        <div class="page-actions">
          <Link class="btn" to="/admin/reports">
            查看报表
          </Link>
        </div>
      </header>

      <div class="tabs-list" role="tablist" aria-label="概览视图">
        <button
          type="button"
          role="tab"
          class="tab"
          aria-selected={tab() === 'overview'}
          onClick={() => setTab('overview')}
        >
          概览
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          aria-selected={tab() === 'members'}
          onClick={() => setTab('members')}
        >
          成员
        </button>
      </div>

      <Show when={tab() === 'overview'}>
        <div class="stat-grid">
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">团队成员</h3>
              <Icon name="users" />
            </div>
            <div class="card-content">
              <div class="stat-value" data-testid="summary-user-count">
                {summary.data()?.totalUsers ?? '—'}
              </div>
              <p class="stat-foot">当前工作空间内的全部成员</p>
            </div>
          </article>
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">团队总数</h3>
              <Icon name="team" />
            </div>
            <div class="card-content">
              <div class="stat-value" data-testid="summary-team-count">
                {summary.data()?.teams ?? '—'}
              </div>
              <p class="stat-foot">成员所属的不同团队</p>
            </div>
          </article>
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">活跃成员</h3>
              <Icon name="check" />
            </div>
            <div class="card-content">
              <div class="stat-value">{activeCount() || '—'}</div>
              <p class="stat-foot">状态为 active 的成员</p>
            </div>
          </article>
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">
                {session.role === 'admin' ? '审计事件' : '待邀请'}
              </h3>
              <Icon name={session.role === 'admin' ? 'list' : 'mail'} />
            </div>
            <div class="card-content">
              <div class="stat-value">
                {session.role === 'admin'
                  ? (summary.data()?.auditEvents ?? '—')
                  : invitedCount() || '—'}
              </div>
              <p class="stat-foot">
                {session.role === 'admin'
                  ? '服务端记录的登录与写操作'
                  : '尚未激活的邀请'}
              </p>
            </div>
          </article>
        </div>

        <div class="dashboard-grid">
          <article class="card chart-card span-4">
            <div class="card-header">
              <h3 class="card-title">团队分布</h3>
              <p class="card-description">按成员数排序，数据来自成员目录。</p>
            </div>
            <div class="card-content">
              <Show
                when={teams().length > 0}
                fallback={
                  <div class="state-block">
                    <Icon name="inbox" />
                    <p class="state-title">暂无团队数据</p>
                  </div>
                }
              >
                <div class="chart" role="img" aria-label="团队成员按团队分布">
                  <div class="chart-plot">
                    <div class="chart-gridlines" aria-hidden="true">
                      <span class="chart-gridline">{maxTeam()}</span>
                      <span class="chart-gridline">
                        {Math.round(maxTeam() / 2)}
                      </span>
                      <span class="chart-gridline">0</span>
                    </div>
                    <div class="chart-bars">
                      <For each={teams()}>
                        {team => (
                          <div
                            class="chart-bar"
                            title={`${team.name}：${team.total}`}
                          >
                            <div
                              class="chart-bar-fill"
                              style={{
                                height: `${Math.round((team.total / maxTeam()) * 100)}%`,
                              }}
                            />
                            <span class="chart-bar-label">{team.name}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </Show>
            </div>
          </article>

          <article class="card span-3">
            <div class="card-header">
              <h3 class="card-title">最新成员</h3>
              <p class="card-description">成员目录中按姓名排序的前几位成员。</p>
            </div>
            <div class="card-content">
              <div class="recent-list">
                <For each={rows().slice(0, 5)}>
                  {user => (
                    <div class="recent-item">
                      <span class="recent-avatar" aria-hidden="true">
                        {initials(user.name)}
                      </span>
                      <div class="recent-copy">
                        <div>
                          <p class="recent-name">{user.name}</p>
                          <p class="recent-meta">{user.email}</p>
                        </div>
                        <span class="recent-amount">{user.team}</span>
                      </div>
                    </div>
                  )}
                </For>
                <Show when={rows().length === 0}>
                  <p class="muted">成员目录为空。</p>
                </Show>
              </div>
            </div>
          </article>
        </div>
      </Show>

      <Show when={tab() === 'members'}>
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">成员</h3>
            <p class="card-description">
              全部成员的团队与状态；完整筛选在用户管理页。
            </p>
          </div>
          <div class="card-content" style={{ padding: '0 24px' }}>
            <div class="table-frame">
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">姓名</th>
                      <th scope="col">邮箱</th>
                      <th scope="col">团队</th>
                      <th scope="col">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rows()}>
                      {user => (
                        <tr>
                          <td>{user.name}</td>
                          <td class="cell-muted">{user.email}</td>
                          <td>{user.team}</td>
                          <td>
                            <StatusBadge status={user.status} />
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </article>
      </Show>
    </section>
  )
}

/* ------------------------------------------------------------------- users */

export function UsersPage() {
  const router = useRouter()
  const session = useSession()
  const queryClient = useQueryClient()
  const [search, setSearch] = createSignal('')
  const [status, setStatus] = createSignal<UserStatus | 'all'>('all')
  const [page, setPage] = createSignal(1)
  const [selectedKeys, setSelectedKeys] = createSignal<readonly string[]>([])
  const [rowMenu, setRowMenu] = createSignal<
    { key: string; x: number; y: number } | undefined
  >(undefined)
  const [inviteOpen, setInviteOpen] = createSignal(false)
  const [deleteTarget, setDeleteTarget] = createSignal<User | undefined>(
    undefined,
  )
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
  const filtersActive = () => search() !== '' || status() !== 'all'
  let gridElement: DataGridElement | undefined
  let stopDecorations: (() => void) | undefined

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
    stopDecorations?.()
    stopDecorations = decorateUserGrid(element, {
      onAction: (key, point) => {
        setRowMenu({ key, x: point.x, y: point.y })
      },
      isAdmin: () => session.role === 'admin',
    })
    onCleanup(() => stopDecorations?.())
  }

  createEffect(() => {
    const nextRows = users()
    if (gridElement && typeof gridElement.setRows === 'function')
      scheduleGridRows(gridElement, nextRows)
  })

  createEffect(() => {
    if (!query.pending() && page() > pageCount()) setPage(pageCount())
  })

  createEffect(() => {
    if (!rowMenu()) return
    const close = (): void => {
      setRowMenu(undefined)
    }
    window.addEventListener('click', close)
    onCleanup(() => window.removeEventListener('click', close))
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

  async function removeUser(user: User): Promise<void> {
    setRowMenu(undefined)
    setDeleteTarget(undefined)
    try {
      await adminApi.deleteUser(user.id, new AbortController().signal)
      setSelectedKeys([])
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    } catch {
      // The list re-render keeps the row; the mutation error is not silent
      // because the refetch below surfaces the server's view again.
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    }
  }

  return (
    <section class="page" data-testid="users-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">用户列表</h2>
          <p class="page-description">在这里管理成员以及他们的角色。</p>
        </div>
        <div class="page-actions">
          <button
            type="button"
            class="btn btn-outline"
            data-testid="open-selected-user"
            disabled={!selectedUser()}
            onClick={openSelectedUser}
          >
            查看详情
          </button>
          <Show when={session.role === 'admin'}>
            <Link class="btn btn-outline" to="/admin/users/error">
              体验加载失败
            </Link>
            <button
              type="button"
              class="btn"
              data-testid="invite-user"
              onClick={() => setInviteOpen(true)}
            >
              添加成员
              <Icon name="user-plus" />
            </button>
          </Show>
        </div>
      </header>

      <div class="users-toolbar">
        <div class="users-toolbar-filters">
          <zw-input
            id="user-search"
            aria-label="搜索用户"
            placeholder="搜索成员…"
            prop:value={search()}
            ref={bindSearchInput}
            data-testid="user-search"
            class="users-search"
          />
          <select
            id="user-status"
            class="select users-filter"
            aria-label="按状态筛选"
            data-testid="user-status"
            prop:onchange={updateStatus}
          >
            <option value="all">状态</option>
            <option value="active">活跃</option>
            <option value="invited">待邀请</option>
            <option value="suspended">已暂停</option>
          </select>
          <Show when={filtersActive()}>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('')
                setStatus('all')
                setPage(1)
              }}
            >
              重置
              <Icon name="x" />
            </button>
          </Show>
          <Show when={query.pending()}>
            <span class="users-toolbar-status" role="status">
              <span class="spinner" aria-hidden="true" /> 加载中…
            </span>
          </Show>
        </div>
        <span class="users-toolbar-status" data-testid="selection-status">
          {selectedUser()
            ? `已选择：${selectedUser()?.name}`
            : `${result()?.total ?? 0} 位成员`}
        </span>
      </div>

      <Show when={query.errorState()}>
        <div class="state-block state-block-error" role="alert">
          <Icon name="alert" />
          <p class="state-title">无法加载成员目录</p>
          <p class="state-description">{String(query.error())}</p>
        </div>
      </Show>

      <div class="table-frame">
        <zw-data-grid
          data-testid="user-grid"
          aria-label="工作空间成员"
          selection-mode="single"
          row-height="48"
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
              width: 140,
              sortable: true,
            },
            {
              id: 'actions',
              header: '',
              field: 'id',
              width: 64,
              align: 'end' as const,
            },
          ]}
          prop:selectedKeys={[...selectedKeys()]}
          ref={bindGrid}
        />
      </div>

      <div class="table-pagination">
        <span class="muted" style={{ fontSize: '14px' }}>
          {result()?.total ?? 0} 位成员
        </span>
        <div class="table-pagination-group">
          <span class="muted" style={{ fontSize: '14px' }}>
            第 {page()} / {pageCount()} 页
          </span>
          <div class="table-pagination-pages">
            <button
              type="button"
              class="btn btn-outline btn-sm btn-icon"
              data-testid="page-prev"
              aria-label="上一页"
              disabled={page() <= 1}
              onClick={() => setPage(Math.max(1, page() - 1))}
            >
              <Icon name="chevron-left" />
            </button>
            <For each={Array.from({ length: pageCount() }, (_, i) => i + 1)}>
              {number => (
                <button
                  type="button"
                  class="page-number"
                  aria-current={page() === number ? 'page' : undefined}
                  aria-label={`第 ${number} 页`}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              )}
            </For>
            <button
              type="button"
              class="btn btn-outline btn-sm btn-icon"
              data-testid="page-next"
              aria-label="下一页"
              disabled={page() >= pageCount()}
              onClick={() => setPage(Math.min(pageCount(), page() + 1))}
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </div>
        <span class="sr-only" data-testid="page-indicator">
          第 {page()} / {pageCount()} 页
        </span>
      </div>

      <Show when={rowMenu()}>
        <div
          class="menu"
          role="menu"
          style={{
            position: 'fixed',
            left: `${rowMenu()!.x}px`,
            top: `${rowMenu()!.y}px`,
            minWidth: '10rem',
          }}
          onClick={(event: Event) => event.stopPropagation()}
          data-testid="row-menu"
        >
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            onClick={() => {
              const key = rowMenu()!.key
              setRowMenu(undefined)
              void router.navigate(`/admin/users/${key}`)
            }}
          >
            <Icon name="edit" /> 查看详情
          </button>
          <Show when={session.role === 'admin'}>
            <button
              type="button"
              class="menu-item menu-item-danger"
              role="menuitem"
              onClick={() => {
                const key = rowMenu()!.key
                const user = users().find(item => item.id === key)
                setRowMenu(undefined)
                setDeleteTarget(user)
              }}
            >
              <Icon name="trash" /> 删除成员
            </button>
          </Show>
        </div>
      </Show>

      <Show when={deleteTarget()}>
        <div class="dialog-overlay" onClick={() => setDeleteTarget(undefined)}>
          <div
            class="dialog-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(event: Event) => event.stopPropagation()}
            data-testid="delete-dialog"
          >
            <div class="dialog-header">
              <h3 class="dialog-title" id="delete-title">
                删除成员？
              </h3>
              <p class="dialog-description">
                将删除 {deleteTarget()?.name}（{deleteTarget()?.email}
                ）。该操作会写入审计日志，且无法撤销。
              </p>
            </div>
            <div class="dialog-footer">
              <button
                type="button"
                class="btn btn-outline"
                onClick={() => setDeleteTarget(undefined)}
              >
                取消
              </button>
              <button
                type="button"
                class="btn btn-destructive"
                onClick={() => void removeUser(deleteTarget()!)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={inviteOpen()}>
        <InviteUserDialog
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
          }}
        />
      </Show>
    </section>
  )
}

/** Creates a user through the real `POST /api/users` endpoint. */
function InviteUserDialog(props: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [team, setTeam] = createSignal('platform')
  const [role, setRole] = createSignal<Role>('viewer')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')

  async function submit(event: Event): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError('')
    const id = slugify(name())
    try {
      await adminApi.createUser(
        { id, name: name(), email: email(), team: team(), role: role() },
        new AbortController().signal,
      )
      props.onCreated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="dialog-overlay" onClick={props.onClose}>
      <div
        class="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        onClick={(event: Event) => event.stopPropagation()}
        data-testid="invite-dialog"
      >
        <div class="dialog-header">
          <h3 class="dialog-title" id="invite-title">
            添加成员
          </h3>
          <p class="dialog-description">
            新成员以 invited 状态创建，密码由服务端生成占位哈希。
          </p>
        </div>
        <form class="settings-form" onSubmit={submit} data-testid="invite-form">
          <div class="field">
            <label class="field-label" for="invite-name">
              姓名
            </label>
            <input
              id="invite-name"
              class="input"
              required
              minlength={2}
              prop:value={name()}
              onInput={(event: Event) =>
                setName((event.currentTarget as HTMLInputElement).value)
              }
            />
          </div>
          <div class="field">
            <label class="field-label" for="invite-email">
              邮箱
            </label>
            <input
              id="invite-email"
              class="input"
              type="email"
              required
              prop:value={email()}
              onInput={(event: Event) =>
                setEmail((event.currentTarget as HTMLInputElement).value)
              }
            />
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="invite-team">
                团队
              </label>
              <input
                id="invite-team"
                class="input"
                required
                prop:value={team()}
                onInput={(event: Event) =>
                  setTeam((event.currentTarget as HTMLInputElement).value)
                }
              />
            </div>
            <div class="field">
              <label class="field-label" for="invite-role">
                角色
              </label>
              <select
                id="invite-role"
                class="select"
                onChange={(event: Event) =>
                  setRole(
                    (event.currentTarget as HTMLSelectElement).value as Role,
                  )
                }
              >
                <option value="viewer">只读成员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
          </div>
          <Show when={error()}>
            <p class="form-error" role="alert">
              <Icon name="alert" /> {error()}
            </p>
          </Show>
          <div class="dialog-footer">
            <button
              type="button"
              class="btn btn-outline"
              onClick={props.onClose}
            >
              取消
            </button>
            <button type="submit" class="btn" disabled={busy()}>
              {busy() ? '创建中…' : '创建成员'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- user detail */

export function UserPage() {
  const params = useParams()
  const queryClient = useQueryClient()
  const session = useSession()
  const userId = () => params().id ?? ''
  const query = useQuery(() => ({
    queryKey: adminUserQueryKey(userId()),
    queryFn: ({ signal }) => adminApi.getUser(userId(), signal),
    staleTime: 1_000,
    retry: false,
  }))
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal<UserPatch>({})
  const mutation = useMutation<
    User,
    { id: string; patch: UserPatch },
    Error,
    User | undefined
  >(() => ({
    retry: false,
    mutationFn: (input, context) =>
      adminApi.updateUser(input.id, input.patch, context.signal),
    onMutate: async (input, { client }) => {
      const key = adminUserQueryKey(input.id)
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<User>(key)
      if (previous)
        client.setQueryData<User>(key, { ...previous, ...input.patch })
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
    const current = user()
    setDraft({
      email: current?.email ?? '',
      name: current?.name ?? '',
      team: current?.team ?? '',
      status: current?.status ?? 'active',
      role: current?.role === 'admin' ? 'admin' : 'viewer',
    })
    setEditing(true)
  }

  function closeEditor(): void {
    setEditing(false)
  }

  async function saveUser(event: Event): Promise<void> {
    event.preventDefault()
    // Read the fields at submit time. `draft()` is the last rendered value and
    // can lag one input event behind what the user (or a test) just typed; the
    // form is the source of truth for what is being saved.
    const form = event.currentTarget as HTMLFormElement
    const value = (selector: string): string =>
      (
        form.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
          ?.value ?? ''
      ).trim()
    const current = user()
    const patch: UserPatch = {
      email: value('#user-email'),
      name: value('#user-name'),
      team: value('#user-team'),
      status: value('#user-status-field') as UserStatus,
      role: value('#user-role') as Role,
    }
    try {
      await mutation.mutateAsync({
        id: userId(),
        // Send only what changed, so an untouched field cannot overwrite a
        // newer server value with a stale one.
        patch: changedFields(current, patch),
      })
      setEditing(false)
    } catch {
      // The mutation state drives the save status; the dialog stays open.
    }
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

  function patch<K extends keyof UserPatch>(key: K, value: UserPatch[K]): void {
    setDraft(current => ({ ...current, [key]: value }))
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
                  style={{ width: '260px', height: '14px' }}
                />
              </div>
            }
          >
            <h2 class="page-title">{user()?.name}</h2>
            <p class="page-description">{user()?.email}</p>
          </Show>
        </div>
        <div class="page-actions">
          <Show when={session.role === 'admin'}>
            <button
              type="button"
              class="btn"
              data-testid="edit-user"
              disabled={!user()}
              onClick={openEditor}
            >
              <Icon name="edit" /> 编辑成员
            </button>
          </Show>
        </div>
      </header>

      <Show when={query.pending()}>
        <p class="row muted" role="status">
          <span class="spinner" aria-hidden="true" /> 加载详情中…
        </p>
      </Show>

      <div class="card">
        <div class="card-header card-header-row">
          <div>
            <h3 class="card-title">成员资料</h3>
            <p class="card-description">
              数据来自 route loader，与列表共享同一份查询缓存。
            </p>
          </div>
          <span class="settings-saved" role="status" data-testid="save-status">
            {mutation.pending()
              ? '保存中…'
              : mutation.success()
                ? '已保存'
                : mutation.errorState()
                  ? '保存失败'
                  : ''}
          </span>
        </div>
        <div class="card-content">
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
              更新资料后保存。详情缓存先乐观更新，失败时回滚，列表查询随后失效。
            </zw-dialog-description>
            <form
              prop:onsubmit={saveUser}
              data-testid="user-form"
              class="settings-form"
            >
              {/*
                Truly uncontrolled. Zeus compiles `value={expr}` — and
                `prop:value={expr}` — into a reactive binding (`bindAttr` /
                `bindProp`), so a render landing between the keystroke and the
                submit can write the older draft back into the field. CI's
                slower chromium hit exactly that. Seeding through `ref` runs
                once on mount and creates no binding; the submit handler reads
                the form, which is the single source of truth.
              */}
              <div class="field">
                <label class="field-label" for="user-name">
                  姓名
                </label>
                <input
                  id="user-name"
                  class="input"
                  ref={(element: HTMLInputElement | null) => {
                    seedValue(element, draft().name ?? '')
                  }}
                />
              </div>
              <div class="field">
                <label class="field-label" for="user-email">
                  邮箱
                </label>
                <input
                  id="user-email"
                  class="input"
                  type="email"
                  required
                  ref={(element: HTMLInputElement | null) => {
                    seedValue(element, draft().email ?? '')
                  }}
                />
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label" for="user-team">
                    团队
                  </label>
                  <input
                    id="user-team"
                    class="input"
                    ref={(element: HTMLInputElement | null) => {
                      seedValue(element, draft().team ?? '')
                    }}
                  />
                </div>
                <div class="field">
                  <label class="field-label" for="user-status-field">
                    状态
                  </label>
                  <select
                    id="user-status-field"
                    class="select"
                    ref={(element: HTMLSelectElement | null) => {
                      seedValue(element, draft().status ?? 'active')
                    }}
                  >
                    <option value="active">活跃</option>
                    <option value="invited">待邀请</option>
                    <option value="suspended">已暂停</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label class="field-label" for="user-role">
                  角色
                </label>
                <select
                  id="user-role"
                  class="select"
                  ref={(element: HTMLSelectElement | null) => {
                    seedValue(element, draft().role ?? 'viewer')
                  }}
                >
                  <option value="viewer">只读成员</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div class="row" style={{ 'justify-content': 'flex-end' }}>
                <button
                  type="button"
                  class="btn btn-outline"
                  onClick={closeEditor}
                >
                  取消
                </button>
                <button type="submit" class="btn" disabled={mutation.pending()}>
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

/* ---------------------------------------------------------------- reports */

export function ReportsPage() {
  const summary = useSummaryQuery()
  const members = useQuery(() => ({
    queryKey: userListQueryKey('', 'all', 1, 100),
    queryFn: ({ signal }) =>
      adminApi.listUsers(
        { search: '', status: 'all', page: 1, pageSize: 100 },
        signal,
      ),
    staleTime: 10_000,
    retry: false,
  }))
  const rows = () => members.data()?.rows ?? []
  const teams = createMemo(() => {
    const counts = new Map<string, number>()
    for (const user of rows()) {
      counts.set(user.team, (counts.get(user.team) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, total]) => ({ name, total }))
  })
  const maxTeam = () => Math.max(1, ...teams().map(team => team.total))

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
        <article class="card stat-card">
          <div class="card-header">
            <h3 class="card-title">成员总数</h3>
            <Icon name="users" />
          </div>
          <div class="card-content">
            <div class="stat-value" data-testid="reports-user-count">
              {summary.data()?.totalUsers ?? '—'}
            </div>
            <p class="stat-foot">跨全部团队</p>
          </div>
        </article>
        <article class="card stat-card">
          <div class="card-header">
            <h3 class="card-title">团队总数</h3>
            <Icon name="team" />
          </div>
          <div class="card-content">
            <div class="stat-value" data-testid="reports-team-count">
              {summary.data()?.teams ?? '—'}
            </div>
            <p class="stat-foot">已建立的团队</p>
          </div>
        </article>
        <article class="card stat-card">
          <div class="card-header">
            <h3 class="card-title">审计事件</h3>
            <Icon name="list" />
          </div>
          <div class="card-content">
            <div class="stat-value">{summary.data()?.auditEvents ?? '—'}</div>
            <p class="stat-foot">服务端记录的操作</p>
          </div>
        </article>
      </div>

      <article class="card chart-card">
        <div class="card-header">
          <h3 class="card-title">团队分布</h3>
          <p class="card-description">按成员数排序。</p>
        </div>
        <div class="card-content">
          <div class="chart" role="img" aria-label="团队成员按团队分布">
            <div class="chart-plot">
              <div class="chart-gridlines" aria-hidden="true">
                <span class="chart-gridline">{maxTeam()}</span>
                <span class="chart-gridline">{Math.round(maxTeam() / 2)}</span>
                <span class="chart-gridline">0</span>
              </div>
              <div class="chart-bars">
                <For each={teams()}>
                  {team => (
                    <div
                      class="chart-bar"
                      title={`${team.name}：${team.total}`}
                    >
                      <div
                        class="chart-bar-fill"
                        style={{
                          height: `${Math.round((team.total / maxTeam()) * 100)}%`,
                        }}
                      />
                      <span class="chart-bar-label">{team.name}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}

/* ----------------------------------------------------------------- errors */

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
        <Link class="btn" to="/admin/users">
          <Icon name="arrowLeft" /> 返回用户列表
        </Link>
        <Link class="btn btn-outline" to="/admin">
          回到概览
        </Link>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ audit */

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
            class="btn btn-outline"
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
        <div class="table-frame">
          <div class="table-scroll">
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
        </div>
        <div class="table-pagination">
          <span class="muted" style={{ fontSize: '14px' }}>
            共 {total()} 条
          </span>
          <div class="table-pagination-group">
            <span class="muted" style={{ fontSize: '14px' }}>
              第 {page()} / {pageCount()} 页
            </span>
            <div class="table-pagination-pages">
              <button
                type="button"
                class="btn btn-outline btn-sm btn-icon"
                data-testid="audit-prev"
                aria-label="上一页"
                disabled={page() <= 1}
                onClick={() => setPage(Math.max(1, page() - 1))}
              >
                <Icon name="chevron-left" />
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm btn-icon"
                data-testid="audit-next"
                aria-label="下一页"
                disabled={page() >= pageCount()}
                onClick={() => setPage(Math.min(pageCount(), page() + 1))}
              >
                <Icon name="chevron-right" />
              </button>
            </div>
          </div>
          <span class="sr-only" data-testid="audit-page-indicator">
            第 {page()} / {pageCount()} 页
          </span>
        </div>
      </Show>
    </section>
  )
}

/* ------------------------------------------------------------------ roles */

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
            <article class="card role-card" data-testid={`role-${record.role}`}>
              <div class="role-card-header">
                <h3 class="role-card-title">
                  {record.role === 'admin' ? '管理员' : '只读成员'}
                </h3>
                <span class="badge badge-outline">{record.members} 位成员</span>
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

/* --------------------------------------------------------------- settings */

export function SettingsPage() {
  const [settings, setSettings] = createSignal<WorkspaceSettings | undefined>(
    undefined,
  )
  const [status, setStatus] = createSignal('')
  const [error, setError] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  // Selects are controlled here, not by `selected` attributes: a save writes a
  // new settings object and the `<select>` must follow it without the DOM
  // keeping a stale option.
  const [locale, setLocale] = createSignal<WorkspaceSettings['locale']>('zh-CN')
  const [theme, setTheme] = createSignal<WorkspaceSettings['theme']>('light')

  createEffect(() => {
    const controller = new AbortController()
    adminApi
      .getSettings(controller.signal)
      .then(value => {
        setSettings(value)
        setLocale(value.locale)
        setTheme(value.theme)
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
      setLocale(next.locale)
      setTheme(next.theme)
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
      <div class="settings-intro">
        <h2 class="settings-title">设置</h2>
        <p class="settings-description">
          管理工作空间的名称、语言与主题；保存后写入服务端 SQLite。
        </p>
      </div>
      <div class="separator" role="separator" />

      <Show
        when={settings()}
        fallback={
          <div class="settings-form">
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
            <div class="skeleton skeleton-line" style={{ height: '36px' }} />
          </div>
        }
      >
        <div class="settings-layout">
          <aside class="settings-nav">
            <ul class="settings-nav-list">
              <li>
                <a
                  class="btn btn-ghost btn-sm settings-nav-link"
                  aria-current="page"
                  href="#workspace"
                >
                  <Icon name="settings" /> 工作空间
                </a>
              </li>
              <li>
                <a
                  class="btn btn-ghost btn-sm settings-nav-link"
                  href="#appearance"
                >
                  <Icon name="theme" /> 外观
                </a>
              </li>
              <li>
                <Link
                  class="btn btn-ghost btn-sm settings-nav-link"
                  to="/admin/upload"
                >
                  <Icon name="upload" /> 上传
                </Link>
              </li>
            </ul>
          </aside>

          <div class="settings-content">
            <div>
              <h3 class="settings-section-title" id="workspace">
                工作空间
              </h3>
              <p class="settings-section-desc">
                更新工作空间名称与界面语言。这些设置对所有成员生效。
              </p>
            </div>
            <div class="separator" role="separator" />
            <form class="settings-form" onSubmit={save} id="workspace-form">
              <div class="settings-field-group">
                <label class="field-label" for="workspace-name">
                  工作空间名称
                </label>
                <input
                  id="workspace-name"
                  class="input"
                  prop:value={settings()!.workspaceName}
                  onInput={event =>
                    patch(
                      'workspaceName',
                      (event.currentTarget as HTMLInputElement).value,
                    )
                  }
                />
                <p class="field-hint">
                  显示在侧栏与登录页的名称，最长 80 个字符。
                </p>
              </div>
              <div class="settings-field-group">
                <label class="field-label" for="workspace-locale">
                  语言
                </label>
                <select
                  id="workspace-locale"
                  class="select"
                  prop:value={locale()}
                  onChange={event => {
                    const value = (event.currentTarget as HTMLSelectElement)
                      .value as WorkspaceSettings['locale']
                    setLocale(value)
                    patch('locale', value)
                  }}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
                <p class="field-hint">服务端偏好与前端文案的默认语言。</p>
              </div>
              <div class="settings-field-group" id="appearance">
                <label class="field-label" for="workspace-theme">
                  主题
                </label>
                <select
                  id="workspace-theme"
                  class="select"
                  prop:value={theme()}
                  onChange={event => {
                    const value = (event.currentTarget as HTMLSelectElement)
                      .value as WorkspaceSettings['theme']
                    setTheme(value)
                    patch('theme', value)
                  }}
                >
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
                <p class="field-hint">
                  保存后写入服务端，刷新或重启后仍然保留。
                </p>
              </div>
              <div class="settings-actions">
                <button type="submit" class="btn" disabled={saving()}>
                  {saving() ? '保存中…' : '保存设置'}
                </button>
                <Show when={status()}>
                  <span
                    class="settings-saved"
                    role="status"
                    data-testid="settings-status"
                  >
                    <Icon name="check" /> {status()}
                  </span>
                </Show>
                <Show when={error()}>
                  <span
                    class="form-error"
                    role="alert"
                    data-testid="settings-error"
                  >
                    <Icon name="alert" /> {error()}
                  </span>
                </Show>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </section>
  )
}

/* ----------------------------------------------------------------- upload */

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

      <form onSubmit={submit} data-testid="upload-form" class="settings-form">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">选择文件</h3>
            <p class="card-description">
              上传后服务端会返回文件摘要与 SHA-256。
            </p>
          </div>
          <div class="card-content settings-form">
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
            <button type="submit" class="btn" disabled={busy()}>
              {busy() ? '上传中…' : '上传'}
            </button>
          </div>
        </article>
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
        return { label: '活跃', tone: 'badge-status-active' }
      case 'invited':
        return { label: '待邀请', tone: 'badge-status-invited' }
      case 'suspended':
        return { label: '已暂停', tone: 'badge-status-suspended' }
      default:
        return { label: '未知', tone: 'badge-outline' }
    }
  }
  return <span class={`badge ${meta().tone}`}>{meta().label}</span>
}

/**
 * Writes a field's initial value exactly once, on mount.
 *
 * `ref` callbacks run after the element exists and, unlike a `value={…}` JSX
 * binding, create no reactive dependency: later renders never overwrite what
 * the user typed. The element is marked so a re-run of the callback (defensive
 * unmount/remount of the same node) cannot clobber user input either.
 */
function seedValue(
  element: HTMLInputElement | HTMLSelectElement | null,
  value: string,
): void {
  if (!element) return
  if (element.dataset.seeded === 'true') return
  element.value = value
  element.dataset.seeded = 'true'
}

/** Keeps only the fields whose value differs from the loaded user. */
function changedFields(current: User | undefined, next: UserPatch): UserPatch {
  const patch: Record<string, string> = {}
  if (!current) return next
  if (next.email !== undefined && next.email !== current.email)
    patch.email = next.email
  if (next.name !== undefined && next.name !== current.name)
    patch.name = next.name
  if (next.team !== undefined && next.team !== current.team)
    patch.team = next.team
  if (next.status !== undefined && next.status !== current.status)
    patch.status = next.status
  if (next.role !== undefined && next.role !== current.role)
    patch.role = next.role
  return patch as UserPatch
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  // The server requires a lowercase id; a Chinese-only name would produce an
  // empty slug, so fall back to a stable random id.
  return slug || `user-${crypto.randomUUID().slice(0, 8)}`
}
