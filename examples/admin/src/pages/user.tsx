/**
 * UserPage: one Admin page, in its own module so the router can load it on
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
import { StatusBadge, changedFields, seedValue } from './shared'

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
