import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createAdminServer, type AdminServerOptions } from '../api'
import {
  openAdminDatabase,
  seedAdminDatabase,
  type AdminDatabase,
} from '../database'
import { listen } from '../http'

const ADMIN_PASSWORD = 'correct-horse-battery-staple'
const VIEWER_PASSWORD = 'viewer-horse-battery-staple'

interface Harness {
  readonly origin: string
  readonly database: AdminDatabase
  close(): Promise<void>
}

const open: Harness[] = []

afterEach(async () => {
  while (open.length > 0) await open.pop()!.close()
})

async function start(
  file = ':memory:',
  options: Partial<AdminServerOptions> = {},
): Promise<Harness> {
  const database = openAdminDatabase(file)
  seedAdminDatabase(database.raw, {
    adminEmail: 'ada@example.test',
    adminPassword: ADMIN_PASSWORD,
    viewerPassword: VIEWER_PASSWORD,
  })
  const admin = createAdminServer({ database, ...options })
  await listen(admin.server, 0, '127.0.0.1')
  const address = admin.server.address()
  if (!address || typeof address === 'string') throw new Error('No port')
  const harness: Harness = {
    origin: `http://127.0.0.1:${address.port}`,
    database,
    async close() {
      await admin.close()
      database.close()
    },
  }
  open.push(harness)
  return harness
}

function setCookies(response: Response): string[] {
  const headers = response.headers as unknown as {
    getSetCookie?: () => string[]
    get: (name: string) => string | null
  }
  const values = headers.getSetCookie?.() ?? []
  if (values.length > 0) return values
  const combined = headers.get('set-cookie')
  return combined ? [combined] : []
}

async function login(origin: string, email: string, password: string) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookies = setCookies(response).map(value => value.split(';')[0]!)
  const cookie = cookies.find(value => value.startsWith('zeus_admin_session='))
  const csrf = cookies
    .find(value => value.startsWith('zeus_admin_csrf='))
    ?.slice('zeus_admin_csrf='.length)
  return { response, cookie, csrf }
}

const mutationHeaders = (
  cookie: string | undefined,
  csrf: string | undefined,
) => ({
  'Content-Type': 'application/json',
  ...(cookie ? { Cookie: cookie } : {}),
  ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
})

describe('Zeus Admin HTTP API', () => {
  it('requires a session and rejects unauthorized mutations', async () => {
    const harness = await start()
    const anonymous = await fetch(`${harness.origin}/api/users`)
    expect(anonymous.status).toBe(401)
    const mutation = await fetch(`${harness.origin}/api/users/ada`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hijack@example.test' }),
    })
    expect(mutation.status).toBe(401)

    const viewer = await login(
      harness.origin,
      'grace@example.test',
      VIEWER_PASSWORD,
    )
    expect(viewer.response.status).toBe(200)
    const forbidden = await fetch(`${harness.origin}/api/users/ada`, {
      method: 'PATCH',
      headers: mutationHeaders(viewer.cookie, viewer.csrf),
      body: JSON.stringify({ email: 'hijack@example.test' }),
    })
    expect(forbidden.status).toBe(403)
    const audit = await fetch(`${harness.origin}/api/audit`, {
      headers: { Cookie: viewer.cookie! },
    })
    expect(audit.status).toBe(403)
  })

  it('logs in, filters users, updates and records audit events', async () => {
    const harness = await start()
    const { response, cookie, csrf } = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    expect(response.status).toBe(200)
    const session = await response.json()
    expect(session.user.role).toBe('admin')
    expect(session.user).not.toHaveProperty('password_hash')

    const filtered = await fetch(
      `${harness.origin}/api/users?search=Radia&status=active&page=1&pageSize=10`,
      { headers: { Cookie: cookie! } },
    )
    expect(filtered.status).toBe(200)
    const page = await filtered.json()
    expect(page.total).toBe(1)
    expect(page.rows[0].id).toBe('radia')

    const update = await fetch(`${harness.origin}/api/users/radia`, {
      method: 'PATCH',
      headers: mutationHeaders(cookie, csrf),
      body: JSON.stringify({ email: 'radia.updated@example.test' }),
    })
    expect(update.status).toBe(200)
    expect((await update.json()).user.email).toBe('radia.updated@example.test')

    const audit = await fetch(
      `${harness.origin}/api/audit?page=1&pageSize=20`,
      {
        headers: { Cookie: cookie! },
      },
    )
    expect(audit.status).toBe(200)
    const logs = await audit.json()
    expect(
      logs.rows.some((entry: { action: string }) => entry.action === 'login'),
    ).toBe(true)
    expect(
      logs.rows.some(
        (entry: { action: string }) => entry.action === 'user.update',
      ),
    ).toBe(true)

    const summary = await fetch(`${harness.origin}/api/summary`, {
      headers: { Cookie: cookie! },
    })
    expect((await summary.json()).auditEvents).toBeGreaterThan(0)
  })

  it('persists users and audit logs after reopening the database', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'zeus-admin-'))
    const file = path.join(directory, 'admin.sqlite')
    const first = await start(file)
    const { cookie, csrf } = await login(
      first.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const update = await fetch(`${first.origin}/api/users/ada`, {
      method: 'PATCH',
      headers: mutationHeaders(cookie, csrf),
      body: JSON.stringify({ team: '持久化团队' }),
    })
    expect(update.status).toBe(200)
    await first.close()
    open.splice(open.indexOf(first), 1)

    const second = await start(file)
    const { cookie: nextCookie } = await login(
      second.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const user = await fetch(`${second.origin}/api/users/ada`, {
      headers: { Cookie: nextCookie! },
    })
    expect((await user.json()).user.team).toBe('持久化团队')
    const audit = await fetch(`${second.origin}/api/audit`, {
      headers: { Cookie: nextCookie! },
    })
    const logs = await audit.json()
    expect(
      logs.rows.some(
        (entry: { action: string; outcome: string }) =>
          entry.action === 'login' && entry.outcome === 'success',
      ),
    ).toBe(true)
    rmSync(directory, { recursive: true, force: true })
  })

  it('validates upload type, size and filename', async () => {
    const harness = await start()
    const { cookie, csrf } = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const upload = async (body: unknown) =>
      fetch(`${harness.origin}/api/uploads`, {
        method: 'POST',
        headers: mutationHeaders(cookie, csrf),
        body: JSON.stringify(body),
      })
    expect(
      (
        await upload({
          filename: '../escape.txt',
          mediaType: 'text/plain',
          data: 'aGk=',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await upload({
          filename: 'a.exe',
          mediaType: 'application/x-msdownload',
          data: 'aGk=',
        })
      ).status,
    ).toBe(415)
    expect(
      (
        await upload({
          filename: 'a.txt',
          mediaType: 'text/plain',
          data: 'aGk=',
        })
      ).status,
    ).toBe(201)
  })

  it('persists workspace settings and rejects viewer writes', async () => {
    const harness = await start()
    const { cookie, csrf } = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const update = await fetch(`${harness.origin}/api/settings`, {
      method: 'PATCH',
      headers: mutationHeaders(cookie, csrf),
      body: JSON.stringify({
        workspaceName: 'Ops Console',
        locale: 'en',
        theme: 'dark',
      }),
    })
    expect(update.status).toBe(200)
    expect((await update.json()).settings).toEqual({
      workspaceName: 'Ops Console',
      locale: 'en',
      theme: 'dark',
    })
    const viewer = await login(
      harness.origin,
      'grace@example.test',
      VIEWER_PASSWORD,
    )
    const denied = await fetch(`${harness.origin}/api/settings`, {
      method: 'PATCH',
      headers: mutationHeaders(viewer.cookie, viewer.csrf),
      body: JSON.stringify({ theme: 'light' }),
    })
    expect(denied.status).toBe(403)
  })

  it('rejects invalid credentials and suspended accounts', async () => {
    const harness = await start()
    expect(
      (await login(harness.origin, 'ada@example.test', 'wrong-password-123'))
        .response.status,
    ).toBe(401)
    expect(
      (await login(harness.origin, 'guido@example.test', VIEWER_PASSWORD))
        .response.status,
    ).toBe(403)
  })
})

describe('Admin session, CSRF and login protection', () => {
  it('requires a CSRF token for every mutation and rejects a wrong token', async () => {
    const harness = await start()
    const { cookie, csrf } = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const body = JSON.stringify({ email: 'radia.updated@example.test' })
    const without = await fetch(`${harness.origin}/api/users/radia`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie! },
      body,
    })
    expect(without.status).toBe(403)
    const wrong = await fetch(`${harness.origin}/api/users/radia`, {
      method: 'PATCH',
      headers: mutationHeaders(cookie, 'not-the-token'),
      body,
    })
    expect(wrong.status).toBe(403)
    const valid = await fetch(`${harness.origin}/api/users/radia`, {
      method: 'PATCH',
      headers: mutationHeaders(cookie, csrf),
      body,
    })
    expect(valid.status).toBe(200)
  })

  it('sets Secure/HttpOnly/SameSite cookies without trusting X-Forwarded-Proto', async () => {
    const insecure = await start()
    const insecureLogin = await login(
      insecure.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const insecureSession = setCookies(insecureLogin.response).find(value =>
      value.startsWith('zeus_admin_session='),
    )
    expect(insecureSession).toContain('HttpOnly')
    expect(insecureSession).toContain('SameSite=Lax')
    expect(insecureSession).not.toContain('Secure')

    const secure = await start(':memory:', { secureCookies: true })
    const secureResponse = await fetch(`${secure.origin}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({
        email: 'ada@example.test',
        password: ADMIN_PASSWORD,
      }),
    })
    const secureCookies = setCookies(secureResponse)
    expect(secureCookies.every(value => value.includes('Secure'))).toBe(true)
    expect(secureCookies.every(value => value.includes('SameSite=Lax'))).toBe(
      true,
    )
  })

  it('rotates sessions, invalidates logout, and rejects expired sessions', async () => {
    const harness = await start()
    const first = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    expect(
      (
        await fetch(`${harness.origin}/api/summary`, {
          headers: { Cookie: first.cookie! },
        })
      ).status,
    ).toBe(200)
    const second = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    expect(
      (
        await fetch(`${harness.origin}/api/summary`, {
          headers: { Cookie: first.cookie! },
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await fetch(`${harness.origin}/api/summary`, {
          headers: { Cookie: second.cookie! },
        })
      ).status,
    ).toBe(200)

    const logout = await fetch(`${harness.origin}/api/auth/logout`, {
      method: 'POST',
      headers: mutationHeaders(second.cookie, second.csrf),
    })
    expect(logout.status).toBe(204)
    expect(
      (
        await fetch(`${harness.origin}/api/summary`, {
          headers: { Cookie: second.cookie! },
        })
      ).status,
    ).toBe(401)

    const expired = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    harness.database.raw
      .prepare('UPDATE sessions SET expires_at = ?')
      .run('2000-01-01T00:00:00.000Z')
    expect(
      (
        await fetch(`${harness.origin}/api/summary`, {
          headers: { Cookie: expired.cookie! },
        })
      ).status,
    ).toBe(401)
  })

  it('rate-limits per IP and account with bounded lockout recovery', async () => {
    let clock = Date.parse('2026-11-06T00:00:00.000Z')
    const harness = await start(':memory:', {
      now: () => new Date(clock),
      loginRateLimit: { maxAttempts: 2, windowMs: 60_000, lockMs: 60_000 },
    })
    const attempt = (password: string, forwarded?: string) =>
      fetch(`${harness.origin}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(forwarded ? { 'X-Forwarded-For': forwarded } : {}),
        },
        body: JSON.stringify({
          email: 'ada@example.test',
          password,
        }),
      })
    expect((await attempt('wrong-password-1')).status).toBe(401)
    expect((await attempt('wrong-password-2')).status).toBe(401)
    expect((await attempt('wrong-password-3')).status).toBe(429)
    // A spoofed forwarding header must not create a fresh limiter bucket.
    expect((await attempt(ADMIN_PASSWORD, '203.0.113.10')).status).toBe(429)
    clock += 61_000
    expect((await attempt(ADMIN_PASSWORD)).status).toBe(200)
  })

  it('revokes sessions when a role changes', async () => {
    const harness = await start()
    const admin = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const viewer = await login(
      harness.origin,
      'grace@example.test',
      VIEWER_PASSWORD,
    )
    const update = await fetch(`${harness.origin}/api/users/grace`, {
      method: 'PATCH',
      headers: mutationHeaders(admin.cookie, admin.csrf),
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(update.status).toBe(200)
    expect(
      (
        await fetch(`${harness.origin}/api/summary`, {
          headers: { Cookie: viewer.cookie! },
        })
      ).status,
    ).toBe(401)
  })
})
