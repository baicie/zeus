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
  readonly csrfToken: string
  readonly user: SessionUser
  readonly expiresAt: string
}

export interface SessionAuth {
  readonly user: SessionUser
  readonly csrfHash: string
}

export const SESSION_COOKIE = 'zeus_admin_session'
export const CSRF_COOKIE = 'zeus_admin_csrf'
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export function createSession(
  db: DatabaseSync,
  userId: string,
  now = new Date(),
): SessionRecord {
  const token = randomToken()
  const csrfToken = randomToken()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, csrf_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    randomToken(12),
    userId,
    tokenHash(token),
    tokenHash(csrfToken),
    expiresAt.toISOString(),
    now.toISOString(),
  )
  const row = db
    .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
    .get(userId) as unknown as SessionUser
  return {
    token,
    csrfToken,
    user: row,
    expiresAt: expiresAt.toISOString(),
  }
}

export function readSessionAuth(
  db: DatabaseSync,
  token: string | undefined,
): SessionAuth | undefined {
  if (!token) return undefined
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, s.csrf_hash
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.expires_at > ?
         AND s.csrf_hash IS NOT NULL`,
    )
    .get(tokenHash(token), new Date().toISOString()) as unknown as
    | (SessionUser & { csrf_hash: string })
    | undefined
  if (!row) return undefined
  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
    },
    csrfHash: row.csrf_hash,
  }
}

export function readSession(
  db: DatabaseSync,
  token: string | undefined,
): SessionUser | undefined {
  return readSessionAuth(db, token)?.user
}

export function deleteSession(
  db: DatabaseSync,
  token: string | undefined,
): void {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
}

export function deleteUserSessions(db: DatabaseSync, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function purgeExpiredSessions(db: DatabaseSync): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(
    new Date().toISOString(),
  )
}
