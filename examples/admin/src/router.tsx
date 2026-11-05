import {
  createRouter,
  type ZeusRouteObject,
  type ZeusRouter,
} from '@zeus-js/router'
import type { ZeusQueryClient } from '@zeus-js/query'
import type { Accessor } from '@zeus-js/zeus'
import type { SessionUser } from './routes'

import {
  AdminShell,
  AuditPage,
  ErrorPage,
  OverviewPage,
  ReportsPage,
  RolesPage,
  SettingsPage,
  UploadPage,
  UserPage,
  UsersPage,
} from './pages'
import {
  adminSummaryQueryKey,
  adminUserQueryKey,
  USER_LIST_STALE_TIME,
  USER_PAGE_SIZE,
  userListQueryKey,
  type AdminApi,
  type AdminSummary,
  type Role,
  type User,
  type UserListResult,
} from './routes'
import { adminApi } from './pages'

export interface AdminRouterOptions {
  /** Shared cache: route loaders and components use the same client. */
  queryClient: ZeusQueryClient
  /** Session role read by the reports loader. */
  role: Accessor<Role>
  /** Updates the session role; the shell re-navigates to apply it. */
  onRoleChange: (role: Role) => void
  session?: Accessor<SessionUser | undefined>
  onLogin?: (user: SessionUser) => void
  onLogout?: () => Promise<void>
  api?: AdminApi
}

/**
 * Declarative route tree. Loaders coordinate with the query cache through the
 * same keys the components observe: a prefetched loader result is reused by
 * `useQuery` instead of issuing a second request, and a cancelled navigation
 * aborts the underlying query through `request.signal`.
 */
export function createAdminRouter(options: AdminRouterOptions): ZeusRouter {
  const api = options.api ?? adminApi
  const queryClient = options.queryClient

  const routes: ZeusRouteObject[] = [
    {
      id: 'root',
      path: '/',
      element: () => (
        <AdminShell
          role={options.role}
          onRoleChange={options.onRoleChange}
          session={options.session}
          onLogout={options.onLogout}
        />
      ),
      children: [
        {
          id: 'start',
          index: true,
          loader: () => redirect('/admin'),
        },
        {
          id: 'admin',
          path: 'admin',
          errorElement: () => <ErrorPage />,
          children: [
            {
              id: 'upload',
              path: 'upload',
              loader: () => {
                if (options.role() !== 'admin') {
                  throw new Response('此页面需要管理员权限。', { status: 403 })
                }
                return null
              },
              element: () => <UploadPage />,
              errorElement: () => <ErrorPage />,
            },
            {
              id: 'roles',
              path: 'roles',
              loader: () => {
                if (options.role() !== 'admin') {
                  throw new Response('此页面需要管理员权限。', { status: 403 })
                }
                return null
              },
              element: () => <RolesPage />,
              errorElement: () => <ErrorPage />,
            },
            {
              id: 'settings',
              path: 'settings',
              element: () => <SettingsPage />,
              errorElement: () => <ErrorPage />,
            },
            {
              id: 'audit',
              path: 'audit',
              loader: () => {
                if (options.role() !== 'admin') {
                  throw new Response('此页面需要管理员权限。', { status: 403 })
                }
                return null
              },
              element: () => <AuditPage />,
              errorElement: () => <ErrorPage />,
            },
            {
              id: 'overview',
              index: true,
              element: () => <OverviewPage />,
            },
            {
              id: 'users',
              path: 'users',
              loader: ({ request }) =>
                queryClient.query<UserListResult>({
                  queryKey: userListQueryKey('', 'all', 1),
                  queryFn: () =>
                    api.listUsers(
                      {
                        search: '',
                        status: 'all',
                        page: 1,
                        pageSize: USER_PAGE_SIZE,
                      },
                      request.signal,
                    ),
                  staleTime: USER_LIST_STALE_TIME,
                  signal: request.signal,
                }),
              element: () => <UsersPage />,
              errorElement: () => <ErrorPage />,
            },
            {
              id: 'user',
              path: 'users/:id',
              loader: ({ params, request }) =>
                queryClient.query<User>({
                  queryKey: adminUserQueryKey(params.id ?? ''),
                  queryFn: () => api.getUser(params.id ?? '', request.signal),
                  staleTime: 1_000,
                  signal: request.signal,
                }),
              element: () => <UserPage />,
              errorElement: () => <ErrorPage />,
            },
            {
              id: 'reports',
              path: 'reports',
              loader: async ({ request }) => {
                if (options.role() !== 'admin') {
                  throw new Response('此页面需要管理员权限。', { status: 403 })
                }
                return queryClient.query<AdminSummary>({
                  queryKey: adminSummaryQueryKey,
                  queryFn: () => api.getSummary(request.signal),
                  staleTime: 5_000,
                  signal: request.signal,
                })
              },
              element: () => <ReportsPage />,
              errorElement: () => <ErrorPage />,
            },
          ],
        },
        {
          id: 'not-found',
          path: '*',
          loader: () => {
            throw new Response('该页面不存在。', { status: 404 })
          },
          errorElement: () => <ErrorPage />,
        },
      ],
    },
  ]

  return createRouter({ routes })
}

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } })
}
