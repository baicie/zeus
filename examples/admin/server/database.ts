import { mkdirSync } from 'node:fs'
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
]

export function openAdminDatabase(file: string): AdminDatabase {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const raw = new DatabaseSync(file)
  raw.exec('PRAGMA foreign_keys = ON')
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL')
  migrate(raw)
  return {
    raw,
    close: () => raw.close(),
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
    db.prepare(
      "INSERT INTO audit_logs (actor_id, action, target, outcome, detail, created_at) VALUES (NULL, 'seed', 'database', 'success', 'initial demo data', ?)",
    ).run(now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
