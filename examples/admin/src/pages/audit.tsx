/**
 * AuditPage: one Admin page, in its own module so the router can load it on
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
import { OutcomeBadge, errorMessage } from './shared'

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
