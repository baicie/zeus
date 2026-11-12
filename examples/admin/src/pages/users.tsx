/**
 * UsersPage: one Admin page, in its own module so the router can load it on
 * demand. Split out of `pages.tsx` without changing the page body.
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
} from '../routes'
import type { WorkspaceSettings } from '../api'
import { adminApi, isDemoBuild } from '../admin-api'
import { Icon } from '../shell/icon'
import { decorateUserGrid } from '../shell/grid-decorations'
import { changePersonalLocale, i18n, t, type Locale } from '../i18n'
import { useSession } from '../session'
import { slugify } from './shared'

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
