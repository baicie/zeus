/**
 * ReportsPage: one Admin page, in its own module so the router can load it on
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
import { useSummaryQuery } from './shared'

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
