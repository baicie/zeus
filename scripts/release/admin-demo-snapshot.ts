/**
 * Records the Admin demo snapshot from the real server.
 *
 * The published demo runs on GitHub Pages, which has no Node process. Rather
 * than hand-write fixture data — which would let the demo show values the real
 * API never returns — this boots `startAdminServer` against a throwaway SQLite
 * database, calls its HTTP endpoints exactly as the browser would, and writes
 * the responses to a JSON file the demo build ships.
 *
 * Seeding uses the server's own demo users and a few audit events produced by
 * real requests, so the snapshot exercises the same code path production does.
 *
 * Usage:
 *   node --import tsx scripts/release/admin-demo-snapshot.ts --out <file>
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { startAdminServer } from '../../examples/admin/server/index'

import type { WorkspaceSettings } from '../../examples/admin/src/api'
import type {
  AdminAuditEvent,
  AdminSummary,
  SessionUser,
  User,
} from '../../examples/admin/src/routes'

interface Snapshot {
  readonly schema: 'zeus.admin-demo/v1'
  readonly generatedAt: string
  readonly coreCommit: string
  readonly session: SessionUser
  readonly summary: AdminSummary
  readonly users: readonly User[]
  readonly audit: readonly AdminAuditEvent[]
  readonly settings: WorkspaceSettings
}

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    'core-commit': { type: 'string', default: 'unknown' },
  },
})

if (!values.out) throw new Error('--out is required')

const scratch = mkdtempSync(path.join(tmpdir(), 'zeus-admin-demo-'))
const databaseFile = path.join(scratch, 'demo.sqlite')
const adminEmail = 'ada@example.test'
const adminPassword = 'demo-snapshot-password'

const server = await startAdminServer({
  port: 0,
  host: '127.0.0.1',
  databaseFile,
  adminEmail,
  adminPassword,
  seedDemoUsers: true,
  viewerPassword: 'demo-viewer-password',
  bootstrap: true,
  secureCookies: false,
})

/** A cookie jar is enough: login sets the session and CSRF cookies. */
const cookies = new Map<string, string>()

function cookieHeader(): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

function captureCookies(response: Response): void {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    if (!pair) continue
    const index = pair.indexOf('=')
    if (index <= 0) continue
    cookies.set(pair.slice(0, index), pair.slice(index + 1))
  }
}

async function call<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${server.origin}${pathname}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookies.size > 0 ? { Cookie: cookieHeader() } : {}),
      ...init.headers,
    },
  })
  captureCookies(response)
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${pathname} -> ${response.status}: ${await response.text()}`,
    )
  }
  return (await response.json()) as T
}

try {
  const login = await call<{ user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  })

  const summary = await call<AdminSummary>('/api/summary')
  // pageSize large enough to hold every seeded row: the demo filters locally.
  const users = await call<{ rows: User[]; total: number }>(
    '/api/users?page=1&pageSize=100',
  )

  // Produce a few real audit entries so the audit page is not empty. These go
  // through the same PATCH handler production uses.
  const target = users.rows.find(user => user.role !== 'admin')
  if (target) {
    const csrf = cookies.get('zeus_admin_csrf') ?? ''
    await call(`/api/users/${encodeURIComponent(target.id)}`, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': decodeURIComponent(csrf) },
      body: JSON.stringify({ status: target.status }),
    })
  }

  const audit = await call<{ rows: AdminAuditEvent[]; total: number }>(
    '/api/audit?page=1&pageSize=50',
  )
  const settingsBody = await call<{ settings: WorkspaceSettings }>(
    '/api/settings',
  )

  const snapshot: Snapshot = {
    schema: 'zeus.admin-demo/v1',
    generatedAt: new Date().toISOString(),
    coreCommit: values['core-commit'] ?? 'unknown',
    session: login.user,
    summary: summary,
    users: users.rows,
    audit: audit.rows,
    settings: settingsBody.settings,
  }

  writeFileSync(values.out, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.info(
    `admin demo snapshot: ${snapshot.users.length} users, ${snapshot.audit.length} audit events -> ${values.out}`,
  )
} finally {
  await server.close()
  rmSync(scratch, { recursive: true, force: true })
}
