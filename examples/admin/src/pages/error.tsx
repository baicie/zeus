/**
 * ErrorPage: one Admin page, in its own module so the router can load it on
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
import { errorHeading, errorMessage, errorStatus } from './shared'

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
