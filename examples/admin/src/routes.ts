export type Role = 'viewer' | 'admin'
export type UserStatus = 'active' | 'invited' | 'suspended'

export interface User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly team: string
  readonly status: UserStatus
  /** Present on API payloads; kept optional so fixtures stay small. */
  readonly role?: Role
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
  readonly auditEvents: number
}

export interface SessionUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: Role
}

export interface AdminAuditEvent {
  readonly id: number
  readonly actor_id: string | null
  readonly action: string
  readonly target: string | null
  readonly outcome: string
  readonly detail: string | null
  readonly created_at: string
}

export interface AdminRoleRecord {
  readonly role: Role
  readonly description: string
  readonly members: number
  readonly capabilities: readonly string[]
}

export interface AdminApi {
  getSummary(signal: AbortSignal): Promise<AdminSummary>
  listUsers(query: UserQuery, signal: AbortSignal): Promise<UserListResult>
  getUser(id: string, signal: AbortSignal): Promise<User>
  updateUser(id: string, patch: UserPatch, signal: AbortSignal): Promise<User>
}

/** Every field the server accepts on `PATCH /api/users/:id`. */
export interface UserPatch {
  readonly email?: string
  readonly name?: string
  readonly team?: string
  readonly status?: UserStatus
  readonly role?: Role
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
  pageSize: number = USER_PAGE_SIZE,
): readonly unknown[] {
  return ['admin-users', search, status, page, pageSize]
}

export function adminUserQueryKey(id: string): readonly unknown[] {
  return ['admin-user', id]
}

export const adminSummaryQueryKey = ['admin-summary'] as const
