import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { hashPassword, normalizeEmail } from './security'

export interface AdminDatabase {
  readonly raw: DatabaseSync
  close(): void
}

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    team TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
    role TEXT NOT NULL CHECK (role IN ('viewer', 'admin')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    action TEXT NOT NULL,
    target TEXT,
    outcome TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `ALTER TABLE sessions ADD COLUMN csrf_hash TEXT;`,
]

export function openAdminDatabase(file: string): AdminDatabase {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const raw = new DatabaseSync(file)
  raw.exec('PRAGMA foreign_keys = ON')
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL')
  raw.exec('PRAGMA busy_timeout = 5000')
  try {
    migrate(raw)
    assertDatabaseIntegrity(raw)
  } catch (error) {
    raw.close()
    throw error
  }
  return {
    raw,
    close: () => raw.close(),
  }
}

export interface DatabaseIntegrity {
  readonly ok: boolean
  readonly messages: readonly string[]
}

/** Runs SQLite's quick check without modifying the database. */
export function checkAdminDatabase(db: DatabaseSync): DatabaseIntegrity {
  const rows = db.prepare('PRAGMA quick_check').all() as Array<
    Record<string, unknown>
  >
  const messages = rows
    .flatMap(row => Object.values(row))
    .filter((value): value is string => typeof value === 'string')
  return {
    ok: messages.length === 1 && messages[0] === 'ok',
    messages,
  }
}

export function assertDatabaseIntegrity(db: DatabaseSync): void {
  const result = checkAdminDatabase(db)
  if (!result.ok) {
    throw new Error(
      `Admin database integrity check failed: ${result.messages.join('; ') || 'unknown error'}`,
    )
  }
}

/**
 * Produces a consistent snapshot with SQLite's VACUUM INTO. The destination
 * must not already exist; callers choose a timestamped path.
 */
export function backupAdminDatabase(
  db: DatabaseSync,
  destination: string,
): void {
  mkdirSync(path.dirname(destination), { recursive: true })
  const escaped = destination.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escaped}'`)
  const backup = new DatabaseSync(destination)
  try {
    assertDatabaseIntegrity(backup)
  } finally {
    backup.close()
  }
}

/** Verifies a database file can be opened and passes quick_check. */
export function verifyAdminDatabase(file: string): DatabaseIntegrity {
  const db = new DatabaseSync(file)
  try {
    return checkAdminDatabase(db)
  } finally {
    db.close()
  }
}

/**
 * Restores a verified backup to a target path. The target is never copied
 * over an open database; callers must close their AdminDatabase first.
 */
export function restoreAdminDatabase(source: string, target: string): void {
  const result = verifyAdminDatabase(source)
  if (!result.ok) {
    throw new Error(
      `Backup integrity check failed: ${result.messages.join('; ') || 'unknown error'}`,
    )
  }
  mkdirSync(path.dirname(target), { recursive: true })
  rmSync(`${target}-wal`, { force: true })
  rmSync(`${target}-shm`, { force: true })
  copyFileSync(source, target)
  const restored = verifyAdminDatabase(target)
  if (!restored.ok) {
    throw new Error(
      `Restored database integrity check failed: ${restored.messages.join('; ')}`,
    )
  }
}

function migrate(db: DatabaseSync): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  )
  const applied = new Set(
    (
      db.prepare('SELECT version FROM schema_migrations').all() as Array<{
        version: number
      }>
    ).map(row => row.version),
  )
  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1
    if (applied.has(version)) continue
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      ).run(version, new Date().toISOString())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

export interface SeedOptions {
  readonly adminEmail: string
  readonly adminPassword: string
  readonly viewerPassword: string
  /** Set false in acceptance/production bootstrap: create only the admin. */
  readonly demoUsers?: boolean
}

const SEED_USERS = [
  ['ada', 'Ada Lovelace', 'ada@example.test', '平台', 'active', 'admin'],
  ['grace', 'Grace Hopper', 'grace@example.test', '编译器', 'active', 'viewer'],
  [
    'linus',
    'Linus Torvalds',
    'linus@example.test',
    '基础设施',
    'active',
    'viewer',
  ],
  [
    'margaret',
    'Margaret Hamilton',
    'margaret@example.test',
    '平台',
    'invited',
    'viewer',
  ],
  [
    'guido',
    'Guido van Rossum',
    'guido@example.test',
    '工具链',
    'suspended',
    'viewer',
  ],
  [
    'radia',
    'Radia Perlman',
    'radia@example.test',
    '基础设施',
    'active',
    'viewer',
  ],
  [
    'yukihiro',
    'Yukihiro Matsumoto',
    'ruby@example.test',
    '工具链',
    'invited',
    'viewer',
  ],
  [
    'dennis',
    'Dennis Ritchie',
    'dennis@example.test',
    '运行时',
    'suspended',
    'viewer',
  ],
] as const

export function seedAdminDatabase(
  db: DatabaseSync,
  options: SeedOptions,
): void {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get() as {
    count: number
  }
  if (existing.count > 0) return
  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT INTO users (id, name, email, team, status, role, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  db.exec('BEGIN')
  try {
    if (options.demoUsers !== false) {
      for (const [id, name, email, team, status, role] of SEED_USERS) {
        insert.run(
          id,
          name,
          normalizeEmail(email),
          team,
          status,
          role,
          hashPassword(options.viewerPassword),
          now,
          now,
        )
      }
      db.prepare(
        'UPDATE users SET email = ?, password_hash = ?, role = ? WHERE id = ?',
      ).run(
        normalizeEmail(options.adminEmail),
        hashPassword(options.adminPassword),
        'admin',
        'ada',
      )
    } else {
      db.prepare(
        `INSERT INTO users (id, name, email, team, status, role, password_hash, created_at, updated_at)
         VALUES ('ada', 'Administrator', ?, 'platform', 'active', 'admin', ?, ?, ?)`,
      ).run(
        normalizeEmail(options.adminEmail),
        hashPassword(options.adminPassword),
        now,
        now,
      )
    }
    db.prepare(
      "INSERT INTO audit_logs (actor_id, action, target, outcome, detail, created_at) VALUES (NULL, 'seed', 'database', 'success', ?, ?)",
    ).run(
      options.demoUsers === false
        ? 'bootstrap admin only'
        : 'initial demo data',
      now,
    )
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
