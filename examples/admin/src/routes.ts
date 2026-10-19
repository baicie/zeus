import {
  createRouter,
  type LoaderFunctionArgs,
  type ZeusRouter,
} from '@zeus-js/router'
import type { Accessor } from '@zeus-js/zeus'

export type Role = 'viewer' | 'admin'

export interface User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly team: string
}

const users: readonly User[] = [
  { id: 'ada', name: 'Ada Lovelace', email: 'ada@example.test', team: '平台' },
  {
    id: 'grace',
    name: 'Grace Hopper',
    email: 'grace@example.test',
    team: '编译器',
  },
  {
    id: 'linus',
    name: 'Linus Torvalds',
    email: 'linus@example.test',
    team: '基础设施',
  },
]

// Deterministic local data keeps this navigation example deployable as static
// files. Real authentication and a remote data service belong to the full Admin.
async function loadUsers({
  request,
}: LoaderFunctionArgs): Promise<readonly User[]> {
  await waitForData(request.signal)
  return users
}

async function loadUser({
  params,
  request,
}: LoaderFunctionArgs): Promise<User> {
  await waitForData(request.signal)
  if (params.id === 'error') {
    throw new Response('用户服务暂时不可用，请返回列表。', { status: 500 })
  }
  const user = users.find(item => item.id === params.id)
  if (!user) throw new Response('找不到该用户。', { status: 404 })
  return user
}

export function createAdminRouter(role: Accessor<Role>): ZeusRouter {
  return createRouter({
    routes: [
      {
        id: 'root',
        path: '/',
        hasErrorBoundary: true,
        children: [
          { id: 'start', index: true },
          {
            id: 'admin',
            path: 'admin',
            children: [
              { id: 'overview', index: true },
              {
                id: 'users',
                path: 'users',
                loader: loadUsers,
                hasErrorBoundary: true,
              },
              {
                id: 'user',
                path: 'users/:id',
                loader: loadUser,
                hasErrorBoundary: true,
              },
              {
                id: 'reports',
                path: 'reports',
                hasErrorBoundary: true,
                loader: async ({ request }) => {
                  await waitForData(request.signal)
                  if (role() !== 'admin') {
                    throw new Response('此页面需要管理员权限。', {
                      status: 403,
                    })
                  }
                  return { totalUsers: users.length, teams: users.length }
                },
              },
            ],
          },
          {
            id: 'not-found',
            path: '*',
            loader: () => {
              throw new Response('该页面不存在。', { status: 404 })
            },
          },
        ],
      },
    ],
  })
}

function waitForData(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, 40)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
