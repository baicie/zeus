import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createAdminServer } from '../api'
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

async function start(file = ':memory:'): Promise<Harness> {
  const database = openAdminDatabase(file)
  seedAdminDatabase(database.raw, {
    adminEmail: 'ada@example.test',
    adminPassword: ADMIN_PASSWORD,
    viewerPassword: VIEWER_PASSWORD,
  })
  const admin = createAdminServer({ database })
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

async function login(origin: string, email: string, password: string) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  return { response, cookie }
}

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
      headers: { 'Content-Type': 'application/json', Cookie: viewer.cookie! },
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
    const { response, cookie } = await login(
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
      headers: { 'Content-Type': 'application/json', Cookie: cookie! },
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
    const { cookie } = await login(
      first.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const update = await fetch(`${first.origin}/api/users/ada`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie! },
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
    const { cookie } = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const upload = async (body: unknown) =>
      fetch(`${harness.origin}/api/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie! },
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
    const { cookie } = await login(
      harness.origin,
      'ada@example.test',
      ADMIN_PASSWORD,
    )
    const update = await fetch(`${harness.origin}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie! },
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
      headers: { 'Content-Type': 'application/json', Cookie: viewer.cookie! },
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
