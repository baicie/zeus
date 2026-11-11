/**
 * Static, read-only Admin API for the published demo.
 *
 * The demo is hosted on GitHub Pages, which cannot run `examples/admin/server`.
 * Rather than let the UI fail every request — or fake responses at request
 * time, which would make "the demo works" meaningless — this reads a snapshot
 * that the real server produced at build time:
 *
 *   node --import tsx scripts/release/admin-demo-snapshot.ts --out <file>
 *
 * That script boots the real server against a throwaway SQLite database seeded
 * with the same rows production seeds, then records the exact JSON its endpoints
 * return. So every value the demo shows came out of the actual API, and the
 * demo cannot drift into showing data the real product would not return.
 *
 * Only reads are implemented. Mutations reject with a message instead of
 * pretending to succeed — a read-only surface that silently accepts writes
 * would be the dishonest option.
 */
import type { AdminHttpApi, WorkspaceSettings } from './api'
import type {
  AdminAuditEvent,
  AdminSummary,
  SessionUser,
  User,
  UserListResult,
  UserQuery,
} from './routes'

export interface AdminDemoSnapshot {
  readonly schema: 'zeus.admin-demo/v1'
  readonly generatedAt: string
  readonly coreCommit: string
  readonly session: SessionUser
  readonly summary: AdminSummary
  readonly users: readonly User[]
  readonly audit: readonly AdminAuditEvent[]
  readonly settings: WorkspaceSettings
}

export function isAdminDemoSnapshot(
  value: unknown,
): value is AdminDemoSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AdminDemoSnapshot>
  return (
    candidate.schema === 'zeus.admin-demo/v1' &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.audit)
  )
}

const READ_ONLY =
  '只读演示：这是构建时的数据快照，不能修改。需要完整功能请使用 Docker 部署版本。'

export function createStaticAdminApi(
  snapshot: AdminDemoSnapshot,
): AdminHttpApi {
  /**
   * The same filter semantics the server applies, so search, status and paging
   * behave in the demo exactly as they do against the real API.
   */
  function select(query: UserQuery): User[] {
    const search = query.search.trim().toLowerCase()
    const status = query.status ?? 'all'
    return snapshot.users.filter(user => {
      if (status !== 'all' && user.status !== status) return false
      if (!search) return true
      return (
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        user.team.toLowerCase().includes(search)
      )
    })
  }

  function findUser(id: string): User {
    const user = snapshot.users.find(entry => entry.id === id)
    if (!user) throw new Error(`用户 ${id} 不在演示快照中。`)
    return user
  }

  function reject(): never {
    throw new Error(READ_ONLY)
  }

  return {
    getSummary: async () => snapshot.summary,
    listUsers: async (query: UserQuery): Promise<UserListResult> => {
      const rows = select(query)
      const page = Math.max(1, query.page ?? 1)
      const pageSize = Math.max(1, query.pageSize ?? rows.length)
      const start = (page - 1) * pageSize
      return {
        rows: rows.slice(start, start + pageSize),
        total: rows.length,
        page,
        pageSize,
      }
    },
    getUser: async (id: string) => findUser(id),
    updateUser: async () => reject(),
    login: async () => snapshot.session,
    session: async () => snapshot.session,
    logout: async () => {},
    createUser: async () => reject(),
    deleteUser: async () => reject(),
    listAudit: async (
      page: number,
      pageSize: number,
    ): Promise<{ rows: readonly AdminAuditEvent[]; total: number }> => {
      const start = (Math.max(1, page) - 1) * pageSize
      return {
        rows: snapshot.audit.slice(start, start + pageSize),
        total: snapshot.audit.length,
      }
    },
    getSettings: async () => snapshot.settings,
    updateSettings: async () => reject(),
    uploadFile: async () => reject(),
  }
}
