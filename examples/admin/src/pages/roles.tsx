/**
 * RolesPage: one Admin page, in its own module so the router can load it on
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

export function RolesPage() {
  const roles: readonly AdminRoleRecord[] = [
    {
      role: 'admin',
      description: t('roles.adminDescription'),
      members: 1,
      capabilities: [t('roles.adminCapabilities')],
    },
    {
      role: 'viewer',
      description: t('roles.viewerDescription'),
      members: 7,
      capabilities: [t('roles.viewerCapabilities')],
    },
  ]

  return (
    <section class="page" data-testid="roles-page">
      <header class="page-header">
        <div class="page-heading">
          <h2 class="page-title">{t('roles.title')}</h2>
          <p class="page-description">{t('roles.description')}</p>
        </div>
      </header>
      <div class="role-grid">
        <For each={roles}>
          {record => (
            <article class="card role-card" data-testid={`role-${record.role}`}>
              <div class="role-card-header">
                <h3 class="role-card-title">
                  {record.role === 'admin'
                    ? t('users.roleAdmin')
                    : t('users.roleViewer')}
                </h3>
                <span class="badge badge-outline">
                  {t('users.memberCount', { count: record.members })}
                </span>
              </div>
              <p class="role-card-description">{record.description}</p>
              <div>
                <p class="field-label" style={{ 'margin-bottom': '8px' }}>
                  {t('roles.capabilities')}
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
