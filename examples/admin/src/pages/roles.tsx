/**
 * RolesPage: one Admin page, in its own module so the router can load it on
 * demand. Split out of `pages.tsx` without changing the page body.
 */

import { useMutation, useQuery, useQueryClient } from '@zeus-js/query'
import { createSignal, For, Show } from '@zeus-js/zeus'

import { userListQueryKey, type Role, type User } from '../routes'
import { adminApi } from '../admin-api'
import { Icon } from '../shell/icon'
import { t } from '../i18n'
import type { AdminMessageKey } from '../locales/en'
import { useSession } from '../session'

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
