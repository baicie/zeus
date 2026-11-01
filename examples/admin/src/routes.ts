export type Role = 'viewer' | 'admin'
export type UserStatus = 'active' | 'invited' | 'suspended'

export interface User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly team: string
  readonly status: UserStatus
}

export interface UserQuery {
  readonly search: string
  readonly status: UserStatus | 'all'
  readonly page: number
  readonly pageSize: number
}

export interface UserListResult {
  readonly rows: readonly User[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
}

export interface AdminSummary {
  readonly totalUsers: number
  readonly teams: number
}

export interface AdminApi {
  getSummary(signal: AbortSignal): Promise<AdminSummary>
  listUsers(query: UserQuery, signal: AbortSignal): Promise<UserListResult>
  getUser(id: string, signal: AbortSignal): Promise<User>
  updateUser(
    id: string,
    patch: { email: string },
    signal: AbortSignal,
  ): Promise<User>
}

const records: User[] = [
  {
    id: 'ada',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    team: '平台',
    status: 'active',
  },
  {
    id: 'grace',
    name: 'Grace Hopper',
    email: 'grace@example.test',
    team: '编译器',
    status: 'active',
  },
  {
    id: 'linus',
    name: 'Linus Torvalds',
    email: 'linus@example.test',
    team: '基础设施',
    status: 'active',
  },
  {
    id: 'margaret',
    name: 'Margaret Hamilton',
    email: 'margaret@example.test',
    team: '平台',
    status: 'invited',
  },
  {
    id: 'guido',
    name: 'Guido van Rossum',
    email: 'guido@example.test',
    team: '工具链',
    status: 'suspended',
  },
  {
    id: 'radia',
    name: 'Radia Perlman',
    email: 'radia@example.test',
    team: '基础设施',
    status: 'active',
  },
  {
    id: 'yukihiro',
    name: 'Yukihiro Matsumoto',
    email: 'ruby@example.test',
    team: '工具链',
    status: 'invited',
  },
  {
    id: 'dennis',
    name: 'Dennis Ritchie',
    email: 'dennis@example.test',
    team: '运行时',
    status: 'suspended',
  },
]

/**
 * The example uses a cancellable transport-shaped adapter so the same query
 * and resource code can be pointed at a real HTTP client without changing UI.
 */
export const adminApi: AdminApi = {
  getSummary: signal =>
    request(signal, () => ({
      totalUsers: records.length,
      teams: new Set(records.map(user => user.team)).size,
    })),
  listUsers: (query, signal) =>
    request(signal, () => {
      const needle = query.search.trim().toLowerCase()
      const filtered = records.filter(user => {
        const matchesSearch =
          !needle ||
          `${user.name} ${user.email} ${user.team}`
            .toLowerCase()
            .includes(needle)
        const matchesStatus =
          query.status === 'all' || user.status === query.status
        return matchesSearch && matchesStatus
      })
      const start = Math.max(0, (query.page - 1) * query.pageSize)
      return {
        rows: filtered.slice(start, start + query.pageSize),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
      }
    }),
  getUser: (id, signal) =>
    request(signal, () => {
      if (id === 'error')
        throw new Response('用户服务暂时不可用，请返回列表。', { status: 500 })
      const user = records.find(item => item.id === id)
      if (!user) throw new Response('找不到该用户。', { status: 404 })
      return { ...user }
    }),
  updateUser: (id, patch, signal) =>
    request(signal, () => {
      const index = records.findIndex(item => item.id === id)
      if (index < 0) throw new Response('找不到该用户。', { status: 404 })
      const email = patch.email.trim()
      if (!email.includes('@')) throw new Error('请输入有效的邮箱地址。')
      records[index] = { ...records[index], email }
      return { ...records[index] }
    }),
}

/** Rows per users page; shared by the route loader and the page query. */
export const USER_PAGE_SIZE = 3

/**
 * The users list refetches in the background after this window. It is short on
 * purpose: the browser check holds a row across a stale notification to prove
 * status updates keep the same DOM node (and therefore the pointer target).
 */
export const USER_LIST_STALE_TIME = 500

/**
 * Query keys are the single cache identity for a request. Route loaders and
 * components build the same key, so loader prefetching fills the cache the
 * component observes instead of introducing a second cache.
 */
export function userListQueryKey(
  search: string,
  status: UserStatus | 'all',
  page: number,
): readonly unknown[] {
  return ['admin-users', search, status, page, USER_PAGE_SIZE]
}

export function adminUserQueryKey(id: string): readonly unknown[] {
  return ['admin-user', id]
}

export const adminSummaryQueryKey = ['admin-summary'] as const

function request<T>(signal: AbortSignal, resolve: () => T): Promise<T> {
  return new Promise((accept, reject) => {
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
      try {
        accept(resolve())
      } catch (error) {
        reject(error)
      }
    }, 40)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function waitForData(signal: AbortSignal): Promise<void> {
  return request(signal, () => undefined)
}
