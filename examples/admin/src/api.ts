import type {
  AdminApi,
  AdminAuditEvent,
  AdminSummary,
  Role,
  SessionUser,
  User,
  UserListResult,
  UserQuery,
  UserStatus,
} from './routes'

export interface AdminHttpApi extends AdminApi {
  login(email: string, password: string): Promise<SessionUser>
  session(signal: AbortSignal): Promise<SessionUser>
  logout(signal: AbortSignal): Promise<void>
  listAudit(
    page: number,
    pageSize: number,
    signal: AbortSignal,
  ): Promise<{ rows: readonly AdminAuditEvent[]; total: number }>
  getSettings(signal: AbortSignal): Promise<WorkspaceSettings>
  updateSettings(
    settings: Partial<WorkspaceSettings>,
    signal: AbortSignal,
  ): Promise<WorkspaceSettings>
  uploadFile(
    file: File,
    signal: AbortSignal,
  ): Promise<{ id: string; filename: string; bytes: number; sha256: string }>
}

export interface WorkspaceSettings {
  readonly workspaceName: string
  readonly locale: 'en' | 'zh-CN'
  readonly theme: 'dark' | 'light'
}

interface ApiErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string }
}

export function createHttpAdminApi(baseUrl = ''): AdminHttpApi {
  const root = baseUrl.replace(/\/$/, '')

  async function request<T>(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted) throw signal.reason
    const response = await fetch(`${root}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.method && !['GET', 'HEAD'].includes(init.method)
          ? { 'X-CSRF-Token': readCsrfToken() }
          : {}),
        ...init.headers,
      },
      signal,
    })
    if (response.status === 204) return undefined as T
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T
    if (!response.ok) {
      const error = body.error
      throw new ApiFailure(
        response.status,
        error?.code ?? 'ZEUS_ADMIN_REQUEST',
        error?.message ?? `Request failed with status ${response.status}.`,
      )
    }
    return body
  }

  return {
    async login(email, password) {
      const controller = new AbortController()
      const body = await request<{ user: SessionUser }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
        controller.signal,
      )
      return body.user
    },
    async session(signal) {
      const body = await request<{ user: SessionUser }>(
        '/api/auth/session',
        {},
        signal,
      )
      return body.user
    },
    async logout(signal) {
      await request<void>('/api/auth/logout', { method: 'POST' }, signal)
    },
    getSummary: signal => request<AdminSummary>('/api/summary', {}, signal),
    listUsers: (query, signal) =>
      request<UserListResult>(
        `/api/users?${userQueryParams(query).toString()}`,
        {},
        signal,
      ),
    getUser: async (id, signal) => {
      const body = await request<{ user: User }>(
        `/api/users/${encodeURIComponent(id)}`,
        {},
        signal,
      )
      return body.user
    },
    updateUser: async (id, patch, signal) => {
      const body = await request<{ user: User }>(
        `/api/users/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        signal,
      )
      return body.user
    },
    async listAudit(page, pageSize, signal) {
      return request(
        '/api/audit?' +
          new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
          }),
        {},
        signal,
      )
    },
    async getSettings(signal) {
      const body = await request<{ settings: WorkspaceSettings }>(
        '/api/settings',
        {},
        signal,
      )
      return body.settings
    },
    async updateSettings(settings, signal) {
      const body = await request<{ settings: WorkspaceSettings }>(
        '/api/settings',
        { method: 'PATCH', body: JSON.stringify(settings) },
        signal,
      )
      return body.settings
    },
    async uploadFile(file, signal) {
      const data = await readBase64(file)
      const body = await request<{
        upload: { id: string; filename: string; bytes: number; sha256: string }
      }>(
        '/api/uploads',
        {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            mediaType: file.type || 'text/plain',
            data,
          }),
        },
        signal,
      )
      return body.upload
    },
  }
}

function readCsrfToken(): string {
  for (const pair of document.cookie.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key === 'zeus_admin_csrf') return decodeURIComponent(rest.join('='))
  }
  return ''
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.slice(result.indexOf(',') + 1))
    })
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

export class ApiFailure extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiFailure'
    this.status = status
    this.code = code
  }
}

function userQueryParams(query: UserQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.status !== 'all') params.set('status', query.status)
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  return params
}

export type { AdminApi, AdminSummary, Role, SessionUser, User, UserStatus }
