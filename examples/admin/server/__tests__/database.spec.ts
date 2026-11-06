import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  backupAdminDatabase,
  checkAdminDatabase,
  openAdminDatabase,
  restoreAdminDatabase,
  seedAdminDatabase,
  verifyAdminDatabase,
} from '../database'

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop()!, { recursive: true, force: true })
  }
})

function workspace(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'zeus-admin-db-'))
  directories.push(directory)
  return directory
}

describe('Admin database backup and recovery', () => {
  it('creates a consistent backup and restores the same user data', () => {
    const directory = workspace()
    const source = path.join(directory, 'admin.sqlite')
    const backup = path.join(directory, 'backup.sqlite')
    const restored = path.join(directory, 'restored.sqlite')
    const database = openAdminDatabase(source)
    seedAdminDatabase(database.raw, {
      adminEmail: 'ops@example.test',
      adminPassword: 'admin-password-is-long',
      viewerPassword: 'viewer-password-is-long',
    })
    database.raw
      .prepare("UPDATE users SET team = 'recovery' WHERE id = 'ada'")
      .run()
    backupAdminDatabase(database.raw, backup)
    database.close()

    expect(verifyAdminDatabase(backup).ok).toBe(true)
    restoreAdminDatabase(backup, restored)
    const reopened = openAdminDatabase(restored)
    try {
      expect(checkAdminDatabase(reopened.raw).ok).toBe(true)
      const user = reopened.raw
        .prepare('SELECT team FROM users WHERE id = ?')
        .get('ada') as { team: string }
      expect(user.team).toBe('recovery')
    } finally {
      reopened.close()
    }
  })

  it('bootstraps only the admin when demo users are disabled', () => {
    const directory = workspace()
    const database = openAdminDatabase(path.join(directory, 'admin.sqlite'))
    try {
      seedAdminDatabase(database.raw, {
        adminEmail: 'ops@example.test',
        adminPassword: 'admin-password-is-long',
        viewerPassword: '',
        demoUsers: false,
      })
      const count = database.raw
        .prepare('SELECT COUNT(*) AS count FROM users')
        .get() as { count: number }
      expect(count.count).toBe(1)
      const admin = database.raw
        .prepare('SELECT role, email FROM users')
        .get() as { role: string; email: string }
      expect(admin).toEqual({ role: 'admin', email: 'ops@example.test' })
    } finally {
      database.close()
    }
  })

  it('fails startup for a corrupted database instead of serving partial data', () => {
    const directory = workspace()
    const corrupted = path.join(directory, 'corrupt.sqlite')
    writeFileSync(corrupted, 'not a sqlite database')
    expect(() => openAdminDatabase(corrupted)).toThrow()
  })
})
