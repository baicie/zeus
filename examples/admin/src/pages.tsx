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
  type Role,
  type SessionUser,
  type User,
  type UserPatch,
  type UserStatus,
} from './routes'
import type { WorkspaceSettings } from './api'
import { adminApi, isDemoBuild } from './admin-api'
import { Icon } from './shell/icon'
import { decorateUserGrid } from './shell/grid-decorations'
import { changePersonalLocale, i18n, t, type Locale } from './i18n'
import type { AdminMessageKey } from './locales/en'
import { useSession } from './session'

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
          <h2 class="page-title">{t('overview.title')}</h2>
          <p class="page-description">{t('overview.description')}</p>
        </div>
        <div class="page-actions">
          <Link class="btn" to="/admin/reports">
            {t('overview.viewReports')}
          </Link>
        </div>
      </header>

      <div
        class="tabs-list"
        role="tablist"
        aria-label={t('overview.viewLabel')}
      >
        <button
          type="button"
          role="tab"
          class="tab"
          aria-selected={tab() === 'overview'}
          onClick={() => setTab('overview')}
        >
          {t('overview.tabOverview')}
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          aria-selected={tab() === 'members'}
          onClick={() => setTab('members')}
        >
          {t('overview.tabMembers')}
        </button>
      </div>

      <Show when={tab() === 'overview'}>
        <div class="stat-grid">
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">{t('overview.totalMembers')}</h3>
              <Icon name="users" />
            </div>
            <div class="card-content">
              <div class="stat-value" data-testid="summary-user-count">
                {summary.data()?.totalUsers ?? '—'}
              </div>
              <p class="stat-foot">{t('overview.totalMembersHint')}</p>
            </div>
          </article>
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">{t('overview.totalTeams')}</h3>
              <Icon name="team" />
            </div>
            <div class="card-content">
              <div class="stat-value" data-testid="summary-team-count">
                {summary.data()?.teams ?? '—'}
              </div>
              <p class="stat-foot">{t('overview.totalTeamsHint')}</p>
            </div>
          </article>
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">{t('overview.activeMembers')}</h3>
              <Icon name="check" />
            </div>
            <div class="card-content">
              <div class="stat-value">{activeCount() || '—'}</div>
              <p class="stat-foot">{t('overview.activeMembersHint')}</p>
            </div>
          </article>
          <article class="card stat-card">
            <div class="card-header">
              <h3 class="card-title">
                {session.role === 'admin'
                  ? t('overview.auditEvents')
                  : t('overview.pendingInvites')}
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
                  ? t('overview.auditEventsHint')
                  : t('overview.pendingInvitesHint')}
              </p>
            </div>
          </article>
        </div>

        <div class="dashboard-grid">
          <article class="card chart-card span-4">
            <div class="card-header">
              <h3 class="card-title">{t('overview.teamDistribution')}</h3>
              <p class="card-description">
                {t('overview.teamDistributionHint')}
              </p>
            </div>
            <div class="card-content">
              <Show
                when={teams().length > 0}
                fallback={
                  <div class="state-block">
                    <Icon name="inbox" />
                    <p class="state-title">{t('overview.noTeamData')}</p>
                  </div>
                }
              >
                <div
                  class="chart"
                  role="img"
                  aria-label={t('overview.teamChartLabel')}
                >
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
              <h3 class="card-title">{t('overview.recentMembers')}</h3>
              <p class="card-description">{t('overview.recentMembersHint')}</p>
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
                  <p class="muted">{t('overview.emptyDirectory')}</p>
                </Show>
              </div>
            </div>
          </article>
        </div>
      </Show>

      <Show when={tab() === 'members'}>
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">{t('overview.tabMembers')}</h3>
            <p class="card-description">{t('overview.allMembersHint')}</p>
          </div>
          <div class="card-content" style={{ padding: '0 24px' }}>
            <div class="table-frame">
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('overview.colName')}</th>
                      <th scope="col">{t('overview.colEmail')}</th>
                      <th scope="col">{t('overview.colTeam')}</th>
                      <th scope="col">{t('overview.colStatus')}</th>
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
      // Recomputed on each decorate() call, so a language switch re-labels the
      // rows the observer touches next without rebuilding the grid.
      statusLabels: () => ({
        active: t('status.active'),
        invited: t('status.invited'),
        suspended: t('status.suspended'),
      }),
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
          <h2 class="page-title">{t('users.title')}</h2>
          <p class="page-description">{t('users.description')}</p>
        </div>
        <div class="page-actions">
          <button
            type="button"
            class="btn btn-outline"
            data-testid="open-selected-user"
            disabled={!selectedUser()}
            onClick={openSelectedUser}
          >
            {t('users.viewDetails')}
          </button>
          <Show when={session.role === 'admin'}>
            <Link class="btn btn-outline" to="/admin/users/error">
              {t('users.loadFailed')}
            </Link>
            <button
              type="button"
              class="btn"
              data-testid="invite-user"
              onClick={() => setInviteOpen(true)}
            >
              {t('users.addMember')}
              <Icon name="user-plus" />
            </button>
          </Show>
        </div>
      </header>

      <div class="users-toolbar">
        <div class="users-toolbar-filters">
          <zw-input
            id="user-search"
            aria-label={t('users.searchLabel')}
            placeholder={t('users.searchPlaceholder')}
            prop:value={search()}
            ref={bindSearchInput}
            data-testid="user-search"
            class="users-search"
          />
          <select
            id="user-status"
            class="select users-filter"
            aria-label={t('users.filterLabel')}
            data-testid="user-status"
            prop:onchange={updateStatus}
          >
            <option value="all">{t('users.statusFilter')}</option>
            <option value="active">{t('users.statusActive')}</option>
            <option value="invited">{t('users.statusInvited')}</option>
            <option value="suspended">{t('users.statusSuspended')}</option>
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
              {t('users.reset')}
              <Icon name="x" />
            </button>
          </Show>
          <Show when={query.pending()}>
            <span class="users-toolbar-status" role="status">
              <span class="spinner" aria-hidden="true" /> {t('users.loading')}
            </span>
          </Show>
        </div>
        <span class="users-toolbar-status" data-testid="selection-status">
          {selectedUser()
            ? t('users.selected', { name: selectedUser()?.name ?? '' })
            : t('users.memberCount', { count: result()?.total ?? 0 })}
        </span>
      </div>

      <Show when={query.errorState()}>
        <div class="state-block state-block-error" role="alert">
          <Icon name="alert" />
          <p class="state-title">{t('users.directoryUnavailable')}</p>
          <p class="state-description">{String(query.error())}</p>
        </div>
      </Show>

      <div class="table-frame">
        <zw-data-grid
          data-testid="user-grid"
          aria-label={t('users.membersLabel')}
          selection-mode="single"
          row-height="48"
          prop:columns={[
            {
              id: 'name',
              header: t('users.colName'),
              field: 'name',
              width: 220,
              sortable: true,
            },
            {
              id: 'email',
              header: t('users.colEmail'),
              field: 'email',
              width: 260,
              sortable: true,
            },
            {
              id: 'team',
              header: t('users.colTeam'),
              field: 'team',
              width: 160,
              sortable: true,
            },
            {
              id: 'status',
              header: t('users.colStatus'),
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
          {t('users.memberCount', { count: result()?.total ?? 0 })}
        </span>
        <div class="table-pagination-group">
          <span class="muted" style={{ fontSize: '14px' }}>
            {t('users.pageOf', { page: page(), count: pageCount() })}
          </span>
          <div class="table-pagination-pages">
            <button
              type="button"
              class="btn btn-outline btn-sm btn-icon"
              data-testid="page-prev"
              aria-label={t('users.prevPage')}
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
                  aria-label={t('users.goToPage', { number })}
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
              aria-label={t('users.nextPage')}
              disabled={page() >= pageCount()}
              onClick={() => setPage(Math.min(pageCount(), page() + 1))}
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </div>
        <span class="sr-only" data-testid="page-indicator">
          {t('users.pageOf', { page: page(), count: pageCount() })}
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
            <Icon name="edit" /> {t('users.viewDetails')}
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
              <Icon name="trash" /> {t('users.deleteMember')}
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
                {t('users.deleteTitle')}
              </h3>
              <p class="dialog-description">
                {t('users.deleteBody', {
                  name: deleteTarget()?.name ?? '',
                  email: deleteTarget()?.email ?? '',
                })}
              </p>
            </div>
            <div class="dialog-footer">
              <button
                type="button"
                class="btn btn-outline"
                onClick={() => setDeleteTarget(undefined)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                class="btn btn-destructive"
                onClick={() => void removeUser(deleteTarget()!)}
              >
                {t('common.delete')}
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
            {t('users.addMember')}
          </h3>
          <p class="dialog-description">{t('users.inviteHint')}</p>
        </div>
        <form class="settings-form" onSubmit={submit} data-testid="invite-form">
          <div class="field">
            <label class="field-label" for="invite-name">
              {t('users.colName')}
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
              {t('users.colEmail')}
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
                {t('users.colTeam')}
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
                {t('users.role')}
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
                <option value="viewer">{t('users.roleViewer')}</option>
                <option value="admin">{t('users.roleAdmin')}</option>
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
              {t('common.cancel')}
            </button>
            <button type="submit" class="btn" disabled={busy()}>
              {busy() ? t('users.creating') : t('users.createMember')}
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
        <Icon name="arrowLeft" /> {t('users.backToList')}
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
              <Icon name="edit" /> {t('users.editMember')}
            </button>
          </Show>
        </div>
      </header>

      <Show when={query.pending()}>
        <p class="row muted" role="status">
          <span class="spinner" aria-hidden="true" />{' '}
          {t('users.loadingDetails')}
        </p>
      </Show>

      <div class="card">
        <div class="card-header card-header-row">
          <div>
            <h3 class="card-title">{t('users.profile')}</h3>
            <p class="card-description">{t('users.profileHint')}</p>
          </div>
          <span class="settings-saved" role="status" data-testid="save-status">
            {mutation.pending()
              ? t('users.saving')
              : mutation.success()
                ? t('users.saved')
                : mutation.errorState()
                  ? t('users.saveFailed')
                  : ''}
          </span>
        </div>
        <div class="card-content">
          <dl class="detail-grid">
            <div>
              <dt>{t('users.userId')}</dt>
              <dd class="mono" data-testid="detail-id">
                {params().id}
              </dd>
            </div>
            <div>
              <dt>{t('users.colEmail')}</dt>
              <dd>{user()?.email ?? ''}</dd>
            </div>
            <div>
              <dt>{t('users.colTeam')}</dt>
              <dd>{user()?.team ?? ''}</dd>
            </div>
            <div>
              <dt>{t('users.colStatus')}</dt>
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
            <zw-dialog-title>{t('users.editMember')}</zw-dialog-title>
            <zw-dialog-description>{t('users.editHint')}</zw-dialog-description>
            <form
              prop:onsubmit={saveUser}
              data-testid="user-form"
              class="settings-form"
            >
              {/*
                Seeded, not bound. Zeus compiles `value={expr}` — and
                `prop:value={expr}` — into a reactive binding (`bindAttr` /
                `bindProp`), so a render landing between the keystroke and the
                submit can write an older value back into the field. Writing
                the DOM from `ref` runs once on mount and creates no binding.

                The draft is still updated on every keystroke, and that part is
                not optional. A `ref`-seeded field holds the user's text in the
                DOM only; if this subtree is ever rebuilt — the dialog's `Show`
                toggling, a remount — the field is recreated from `draft()`,
                which would still be the value the form opened with. That is
                exactly what happened on CI: the PATCH went out as `{}` because
                `changedFields` compared the new text against a draft that had
                never received it. Keeping the draft current makes a rebuild
                harmless, and `saveUser` still reads the form so a stale draft
                can never beat what is on screen.
              */}
              <div class="field">
                <label class="field-label" for="user-name">
                  {t('users.colName')}
                </label>
                <input
                  id="user-name"
                  class="input"
                  ref={(element: HTMLInputElement | null) => {
                    seedValue(element, draft().name ?? '')
                  }}
                  onInput={(event: Event) =>
                    patch(
                      'name',
                      (event.currentTarget as HTMLInputElement).value,
                    )
                  }
                />
              </div>
              <div class="field">
                <label class="field-label" for="user-email">
                  {t('users.colEmail')}
                </label>
                <input
                  id="user-email"
                  class="input"
                  type="email"
                  required
                  ref={(element: HTMLInputElement | null) => {
                    seedValue(element, draft().email ?? '')
                  }}
                  onInput={(event: Event) =>
                    patch(
                      'email',
                      (event.currentTarget as HTMLInputElement).value,
                    )
                  }
                />
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label" for="user-team">
                    {t('users.colTeam')}
                  </label>
                  <input
                    id="user-team"
                    class="input"
                    ref={(element: HTMLInputElement | null) => {
                      seedValue(element, draft().team ?? '')
                    }}
                    onInput={(event: Event) =>
                      patch(
                        'team',
                        (event.currentTarget as HTMLInputElement).value,
                      )
                    }
                  />
                </div>
                <div class="field">
                  <label class="field-label" for="user-status-field">
                    {t('users.colStatus')}
                  </label>
                  <select
                    id="user-status-field"
                    class="select"
                    ref={(element: HTMLSelectElement | null) => {
                      seedValue(element, draft().status ?? 'active')
                    }}
                    onChange={(event: Event) =>
                      patch(
                        'status',
                        (event.currentTarget as HTMLSelectElement)
                          .value as UserStatus,
                      )
                    }
                  >
                    <option value="active">{t('status.active')}</option>
                    <option value="invited">{t('status.invited')}</option>
                    <option value="suspended">{t('status.suspended')}</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label class="field-label" for="user-role">
                  {t('users.role')}
                </label>
                <select
                  id="user-role"
                  class="select"
                  ref={(element: HTMLSelectElement | null) => {
                    seedValue(element, draft().role ?? 'viewer')
                  }}
                  onChange={(event: Event) =>
                    patch(
                      'role',
                      (event.currentTarget as HTMLSelectElement).value as Role,
                    )
                  }
                >
                  <option value="viewer">{t('users.roleViewer')}</option>
                  <option value="admin">{t('users.roleAdmin')}</option>
                </select>
              </div>
              <div class="row" style={{ 'justify-content': 'flex-end' }}>
                <button
                  type="button"
                  class="btn btn-outline"
                  onClick={closeEditor}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" class="btn" disabled={mutation.pending()}>
                  {mutation.pending() ? t('users.saving') : t('common.save')}
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
          <h2 class="page-title">{t('reports.title')}</h2>
          <p class="page-description">{t('reports.description')}</p>
        </div>
      </header>

      <div class="stat-grid">
        <article class="card stat-card">
          <div class="card-header">
            <h3 class="card-title">{t('reports.totalMembers')}</h3>
            <Icon name="users" />
          </div>
          <div class="card-content">
            <div class="stat-value" data-testid="reports-user-count">
              {summary.data()?.totalUsers ?? '—'}
            </div>
            <p class="stat-foot">{t('reports.acrossTeams')}</p>
          </div>
        </article>
        <article class="card stat-card">
          <div class="card-header">
            <h3 class="card-title">{t('reports.totalTeams')}</h3>
            <Icon name="team" />
          </div>
          <div class="card-content">
            <div class="stat-value" data-testid="reports-team-count">
              {summary.data()?.teams ?? '—'}
            </div>
            <p class="stat-foot">{t('reports.establishedTeams')}</p>
          </div>
        </article>
        <article class="card stat-card">
          <div class="card-header">
            <h3 class="card-title">{t('reports.auditEvents')}</h3>
            <Icon name="list" />
          </div>
          <div class="card-content">
            <div class="stat-value">{summary.data()?.auditEvents ?? '—'}</div>
            <p class="stat-foot">{t('reports.serverRecorded')}</p>
          </div>
        </article>
      </div>

      <article class="card chart-card">
        <div class="card-header">
          <h3 class="card-title">{t('reports.teamDistribution')}</h3>
          <p class="card-description">{t('reports.teamDistributionHint')}</p>
        </div>
        <div class="card-content">
          <div
            class="chart"
            role="img"
            aria-label={t('reports.teamChartLabel')}
          >
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
          <Icon name="arrowLeft" /> {t('users.backToList')}
        </Link>
        <Link class="btn btn-outline" to="/admin">
          {t('reports.backToOverview')}
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
          <h2 class="page-title">{t('audit.title')}</h2>
          <p class="page-description">{t('audit.description')}</p>
        </div>
        <div class="page-actions">
          <button
            type="button"
            class="btn btn-outline"
            data-testid="audit-refresh"
            onClick={() => setAuditVersion(v => v + 1)}
          >
            <Icon name="refresh" /> {t('audit.refresh')}
          </button>
        </div>
      </header>

      <Show when={auditError()}>
        <div class="state-block state-block-error" role="alert">
          <Icon name="alert" />
          <p class="state-title">{t('audit.unavailable')}</p>
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
                  <th scope="col">{t('audit.colTime')}</th>
                  <th scope="col">{t('audit.colAction')}</th>
                  <th scope="col">{t('audit.colTarget')}</th>
                  <th scope="col">{t('audit.colOutcome')}</th>
                </tr>
              </thead>
              <tbody>
                <For each={events()}>
                  {event => (
                    <tr>
                      <td class="audit-time">
                        {formatAuditTime(event.created_at, i18n.locale())}
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
                <p class="state-title">{t('audit.empty')}</p>
                <p class="state-description">{t('audit.emptyHint')}</p>
              </div>
            </Show>
          </div>
        </div>
        <div class="table-pagination">
          <span class="muted" style={{ fontSize: '14px' }}>
            {t('audit.total', { count: total() })}
          </span>
          <div class="table-pagination-group">
            <span class="muted" style={{ fontSize: '14px' }}>
              {t('users.pageOf', { page: page(), count: pageCount() })}
            </span>
            <div class="table-pagination-pages">
              <button
                type="button"
                class="btn btn-outline btn-sm btn-icon"
                data-testid="audit-prev"
                aria-label={t('users.prevPage')}
                disabled={page() <= 1}
                onClick={() => setPage(Math.max(1, page() - 1))}
              >
                <Icon name="chevron-left" />
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm btn-icon"
                data-testid="audit-next"
                aria-label={t('users.nextPage')}
                disabled={page() >= pageCount()}
                onClick={() => setPage(Math.min(pageCount(), page() + 1))}
              >
                <Icon name="chevron-right" />
              </button>
            </div>
          </div>
          <span class="sr-only" data-testid="audit-page-indicator">
            {t('users.pageOf', { page: page(), count: pageCount() })}
          </span>
        </div>
      </Show>
    </section>
  )
}

/* ------------------------------------------------------------------ roles */

/**
 * Roles & permissions.
 *
 * The reference has no roles page, so this follows its *patterns* instead: a
 * matrix you can read at a glance, real member counts from the directory, and
 * an action that actually changes a member's role (the same PATCH the user
 * detail page uses) rather than a decorative toggle.
 *
 * Member counts used to be literals (`1` and `7`). They are now aggregated from
 * `/api/users`, so the page cannot claim a role has members it does not have.
 */
export function RolesPage() {
  const session = useSession()
  const queryClient = useQueryClient()
  const directory = useQuery(() => ({
    queryKey: userListQueryKey('', 'all', 1, 100),
    queryFn: ({ signal }) =>
      adminApi.listUsers(
        { search: '', status: 'all', page: 1, pageSize: 100 },
        signal,
      ),
    staleTime: 10_000,
    retry: false,
  }))
  const [assignRole, setAssignRole] = createSignal<Role>('viewer')
  const [assignee, setAssignee] = createSignal('')
  const [assignStatus, setAssignStatus] = createSignal('')
  const [assignError, setAssignError] = createSignal('')

  const members = () => directory.data()?.rows ?? []
  const byRole = (role: Role) =>
    members().filter(user => (user.role ?? 'viewer') === role)

  /**
   * Capabilities are a fixed matrix, not prose: one row per capability, one
   * column per role, so "can a viewer do X" is answered by a cell.
   */
  // Keys are literals so a missing translation is a type error, not a raw key
  // rendered into the table.
  const capabilities = [
    {
      key: 'users.read',
      label: 'roles.capability.users.read',
      admin: true,
      viewer: true,
    },
    {
      key: 'users.write',
      label: 'roles.capability.users.write',
      admin: true,
      viewer: false,
    },
    {
      key: 'users.delete',
      label: 'roles.capability.users.delete',
      admin: true,
      viewer: false,
    },
    {
      key: 'reports.read',
      label: 'roles.capability.reports.read',
      admin: true,
      viewer: true,
    },
    {
      key: 'audit.read',
      label: 'roles.capability.audit.read',
      admin: true,
      viewer: false,
    },
    {
      key: 'settings.read',
      label: 'roles.capability.settings.read',
      admin: true,
      viewer: true,
    },
    {
      key: 'settings.write',
      label: 'roles.capability.settings.write',
      admin: true,
      viewer: false,
    },
    {
      key: 'uploads.write',
      label: 'roles.capability.uploads.write',
      admin: true,
      viewer: false,
    },
  ] as const satisfies readonly {
    key: string
    label: AdminMessageKey
    admin: boolean
    viewer: boolean
  }[]

  const assignMutation = useMutation<
    User,
    { id: string; role: Role },
    Error,
    undefined
  >(() => ({
    retry: false,
    mutationFn: (input, context) =>
      adminApi.updateUser(input.id, { role: input.role }, context.signal),
    onSuccess: (user, input, _context, { client }) => {
      setAssignStatus(
        t('roles.assigned', {
          name: user?.name ?? input.id,
          role:
            input.role === 'admin'
              ? t('users.roleAdmin')
              : t('users.roleViewer'),
        }),
      )
      setAssignError('')
      void client
        .invalidateQueries({ queryKey: ['admin-users'] })
        .catch(() => undefined)
    },
    onError: (error: Error) => {
      setAssignError(error.message)
      setAssignStatus('')
    },
  }))

  function submitAssignment(event: Event): void {
    event.preventDefault()
    const id = assignee()
    if (!id) {
      setAssignError(t('roles.pickMember'))
      return
    }
    setAssignStatus('')
    setAssignError('')
    assignMutation.mutate({ id, role: assignRole() })
  }

  return (
    <section class="page" data-testid="roles-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">{t('roles.title')}</h2>
          <p class="page-description">{t('roles.description')}</p>
        </div>
      </header>

      <div class="role-grid">
        <For each={['admin', 'viewer'] as const}>
          {role => (
            <article class="card role-card" data-testid={`role-${role}`}>
              <div class="role-card-header">
                <h3 class="role-card-title">
                  {role === 'admin'
                    ? t('users.roleAdmin')
                    : t('users.roleViewer')}
                </h3>
                <span
                  class="badge badge-outline"
                  data-testid={`role-${role}-count`}
                >
                  {t('users.memberCount', { count: byRole(role).length })}
                </span>
              </div>
              <p class="role-card-description">
                {role === 'admin'
                  ? t('roles.adminDescription')
                  : t('roles.viewerDescription')}
              </p>
              <ul class="role-member-list">
                <For each={byRole(role).slice(0, 4)}>
                  {user => (
                    <li class="role-member">
                      <span class="role-member-avatar" aria-hidden="true">
                        {user.name.slice(0, 1)}
                      </span>
                      <span class="role-member-name">{user.name}</span>
                      <span class="muted role-member-team">{user.team}</span>
                    </li>
                  )}
                </For>
                <Show when={byRole(role).length === 0}>
                  <li class="muted">{t('roles.noMembers')}</li>
                </Show>
              </ul>
            </article>
          )}
        </For>
      </div>

      <section class="card role-matrix-card">
        <div class="card-header">
          <h3 class="card-title">{t('roles.matrixTitle')}</h3>
          <p class="card-description">{t('roles.matrixHint')}</p>
        </div>
        <div class="table-frame">
          <table class="table" data-testid="role-matrix">
            <thead>
              <tr>
                <th scope="col">{t('roles.capability')}</th>
                <th scope="col">{t('users.roleAdmin')}</th>
                <th scope="col">{t('users.roleViewer')}</th>
              </tr>
            </thead>
            <tbody>
              <For each={capabilities}>
                {row => (
                  <tr data-testid={`capability-${row.key}`}>
                    <th scope="row">{t(row.label)}</th>
                    <td>
                      <span
                        class={row.admin ? 'capability-yes' : 'capability-no'}
                        aria-label={
                          row.admin ? t('roles.allowed') : t('roles.denied')
                        }
                      >
                        {row.admin ? <Icon name="check" /> : <Icon name="x" />}
                      </span>
                    </td>
                    <td>
                      <span
                        class={row.viewer ? 'capability-yes' : 'capability-no'}
                        aria-label={
                          row.viewer ? t('roles.allowed') : t('roles.denied')
                        }
                      >
                        {row.viewer ? <Icon name="check" /> : <Icon name="x" />}
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card role-assign-card">
        <div class="card-header">
          <h3 class="card-title">{t('roles.assignTitle')}</h3>
          <p class="card-description">
            {session.role === 'admin'
              ? t('roles.assignHint')
              : t('roles.adminOnly')}
          </p>
        </div>
        <Show
          when={session.role === 'admin'}
          fallback={
            <p class="muted" role="status" data-testid="roles-readonly">
              {t('roles.adminOnly')}
            </p>
          }
        >
          <form class="role-assign-form" onSubmit={submitAssignment}>
            <label class="field-label" for="role-assignee">
              {t('roles.member')}
            </label>
            <select
              id="role-assignee"
              class="select"
              data-testid="role-assignee"
              value={assignee()}
              onChange={(event: Event) =>
                setAssignee((event.currentTarget as HTMLSelectElement).value)
              }
            >
              <option value="">{t('roles.pickMember')}</option>
              <For each={members()}>
                {user => (
                  <option value={user.id}>
                    {user.name} · {user.team}
                  </option>
                )}
              </For>
            </select>
            <label class="field-label" for="role-target">
              {t('roles.role')}
            </label>
            <select
              id="role-target"
              class="select"
              data-testid="role-target"
              value={assignRole()}
              onChange={(event: Event) =>
                setAssignRole(
                  (event.currentTarget as HTMLSelectElement).value as Role,
                )
              }
            >
              <option value="viewer">{t('users.roleViewer')}</option>
              <option value="admin">{t('users.roleAdmin')}</option>
            </select>
            <button
              type="submit"
              class="btn"
              data-testid="role-assign"
              disabled={assignMutation.pending()}
            >
              {assignMutation.pending()
                ? t('roles.assigning')
                : t('roles.assign')}
            </button>
          </form>
          <Show when={assignStatus()}>
            <p
              class="settings-saved"
              role="status"
              data-testid="role-assign-status"
            >
              {assignStatus()}
            </p>
          </Show>
          <Show when={assignError()}>
            <p class="form-error" role="alert" data-testid="role-assign-error">
              {assignError()}
            </p>
          </Show>
        </Show>
      </section>
    </section>
  )
}

/**
 * Audit timestamps follow the page's language.
 *
 * They used to be formatted with a hard-coded `'zh-CN'`, so an English console
 * showed Chinese dates — a visible i18n leak in exactly the page a reviewer
 * opens to check who did what.
 */
function formatAuditTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* --------------------------------------------------------------- settings */

export function SettingsPage() {
  const session = useSession()
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
      setStatus(t('settings.saved'))
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
        <h2 class="settings-title">{t('settings.title')}</h2>
        <p class="settings-description">{t('settings.description')}</p>
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
                  <Icon name="settings" /> {t('settings.sectionWorkspace')}
                </a>
              </li>
              <li>
                <a
                  class="btn btn-ghost btn-sm settings-nav-link"
                  href="#appearance"
                >
                  <Icon name="theme" /> {t('settings.sectionAppearance')}
                </a>
              </li>
              <li>
                <Link
                  class="btn btn-ghost btn-sm settings-nav-link"
                  to="/admin/upload"
                >
                  <Icon name="upload" /> {t('settings.sectionUpload')}
                </Link>
              </li>
            </ul>
          </aside>

          <div class="settings-content">
            <div>
              <h3 class="settings-section-title" id="workspace">
                {t('settings.sectionWorkspace')}
              </h3>
              <p class="settings-section-desc">{t('settings.allMembers')}</p>
            </div>
            <div class="separator" role="separator" />
            <form class="settings-form" onSubmit={save} id="workspace-form">
              <div class="settings-field-group">
                <label class="field-label" for="workspace-name">
                  {t('settings.workspaceName')}
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
                <p class="field-hint">{t('settings.workspaceNameHint')}</p>
              </div>
              <div class="settings-field-group">
                <label class="field-label" for="personal-locale">
                  {t('settings.personalLanguage')}
                </label>
                <select
                  id="personal-locale"
                  class="select"
                  data-testid="personal-locale"
                  prop:value={i18n.locale()}
                  onChange={event => {
                    const value = (event.currentTarget as HTMLSelectElement)
                      .value as Locale
                    // Personal only: this must never reach
                    // `adminApi.updateSettings`, or a private display choice
                    // would silently change what every member sees.
                    void changePersonalLocale(
                      session.user?.id ?? 'anonymous',
                      value,
                    )
                  }}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
                <p class="field-hint">{t('settings.personalLanguageHint')}</p>
              </div>
              <div class="settings-field-group">
                <label class="field-label" for="workspace-locale">
                  {t('settings.workspaceLanguage')}
                </label>
                <select
                  id="workspace-locale"
                  class="select"
                  data-testid="workspace-locale"
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
                <p class="field-hint">{t('settings.workspaceLanguageHint')}</p>
              </div>
              <div class="settings-field-group" id="appearance">
                <label class="field-label" for="workspace-theme">
                  {t('settings.theme')}
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
                  <option value="light">{t('settings.themeLight')}</option>
                  <option value="dark">{t('settings.themeDark')}</option>
                </select>
                <p class="field-hint">{t('settings.themeHint')}</p>
              </div>
              <div class="settings-actions">
                <button type="submit" class="btn" disabled={saving()}>
                  {saving() ? t('users.saving') : t('settings.saveSettings')}
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
      setError(t('upload.noFile'))
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
          <h2 class="page-title">{t('upload.title')}</h2>
          <p class="page-description">{t('upload.description')}</p>
        </div>
      </header>

      <form onSubmit={submit} data-testid="upload-form" class="settings-form">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">{t('upload.chooseFile')}</h3>
            <p class="card-description">{t('upload.chooseFileHint')}</p>
          </div>
          <div class="card-content settings-form">
            <div class="field">
              <label class="field-label" for="upload-file">
                {t('upload.file')}
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
                  <Icon name="check" /> {t('upload.success')}
                </p>
                <dl class="detail-grid">
                  <div>
                    <dt>{t('upload.file')}</dt>
                    <dd>{upload()!.filename}</dd>
                  </div>
                  <div>
                    <dt>{t('upload.size')}</dt>
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
              {busy() ? t('upload.uploading') : t('upload.submit')}
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
  return t('error.loadFailed')
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'data' in error)
    return String(error.data)
  return t('error.loadFailedHint')
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
      return t('error.forbidden')
    case '404':
      return t('error.notFound')
    case '500':
      return t('error.serverError')
    default:
      return t('error.loadFailed')
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
        return { label: t('status.active'), tone: 'badge-status-active' }
      case 'invited':
        return { label: t('status.invited'), tone: 'badge-status-invited' }
      case 'suspended':
        return { label: t('status.suspended'), tone: 'badge-status-suspended' }
      default:
        return { label: t('status.unknown'), tone: 'badge-outline' }
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
