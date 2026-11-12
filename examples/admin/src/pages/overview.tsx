/**
 * OverviewPage: one Admin page, in its own module so the router can load it on
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
import { StatusBadge, initials, useSummaryQuery } from './shared'

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
