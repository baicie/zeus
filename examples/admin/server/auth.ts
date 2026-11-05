import type { DatabaseSync } from 'node:sqlite'

import { randomToken, tokenHash } from './security'

export type AdminRole = 'admin' | 'viewer'

export interface SessionUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: AdminRole
}

export interface SessionRecord {
  readonly token: string
  readonly user: SessionUser
  readonly expiresAt: string
}

export const SESSION_COOKIE = 'zeus_admin_session'
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export function createSession(db: DatabaseSync, userId: string): SessionRecord {
  const token = randomToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    randomToken(12),
    userId,
    tokenHash(token),
    expiresAt.toISOString(),
    now.toISOString(),
  )
  const row = db
    .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
    .get(userId) as unknown as SessionUser
  return { token, user: row, expiresAt: expiresAt.toISOString() }
}

export function readSession(
  db: DatabaseSync,
  token: string | undefined,
): SessionUser | undefined {
  if (!token) return undefined
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash(token), new Date().toISOString()) as unknown as
    | SessionUser
    | undefined
  return row
}

export function deleteSession(
  db: DatabaseSync,
  token: string | undefined,
): void {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
}

export function purgeExpiredSessions(db: DatabaseSync): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(
    new Date().toISOString(),
  )
}
