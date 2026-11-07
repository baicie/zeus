import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
      bootstrap: true,
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
        bootstrap: true,
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

  it('never verifies or restores a missing backup file', () => {
    const directory = workspace()
    const missing = path.join(directory, 'missing-backup.sqlite')
    expect(verifyAdminDatabase(missing)).toEqual({
      ok: false,
      messages: ['database file does not exist'],
    })
    expect(existsSync(missing)).toBe(false)
    const target = path.join(directory, 'production.sqlite')
    const database = openAdminDatabase(target)
    seedAdminDatabase(database.raw, {
      adminEmail: 'ops@example.test',
      adminPassword: 'admin-password-is-long',
      viewerPassword: '',
      demoUsers: false,
      bootstrap: true,
    })
    database.close()
    expect(() => restoreAdminDatabase(missing, target)).toThrow(
      'Backup integrity check failed',
    )
    expect(verifyAdminDatabase(target).ok).toBe(true)
  })

  it('takes a pre-restore copy and refuses an invalid source', () => {
    const directory = workspace()
    const source = path.join(directory, 'admin.sqlite')
    const backup = path.join(directory, 'backup.sqlite')
    const database = openAdminDatabase(source)
    seedAdminDatabase(database.raw, {
      adminEmail: 'ops@example.test',
      adminPassword: 'admin-password-is-long',
      viewerPassword: '',
      demoUsers: false,
      bootstrap: true,
    })
    backupAdminDatabase(database.raw, backup)
    database.raw
      .prepare("UPDATE users SET team = 'changed' WHERE id = 'ada'")
      .run()
    database.close()

    restoreAdminDatabase(backup, source)
    const reopened = openAdminDatabase(source)
    try {
      expect(
        (
          reopened.raw
            .prepare('SELECT team FROM users WHERE id = ?')
            .get('ada') as { team: string }
        ).team,
      ).toBe('platform')
    } finally {
      reopened.close()
    }
  })

  it('requires an explicit bootstrap for a zero-user database', () => {
    const directory = workspace()
    const file = path.join(directory, 'empty.sqlite')
    const database = openAdminDatabase(file)
    try {
      expect(() =>
        seedAdminDatabase(database.raw, {
          adminEmail: 'ops@example.test',
          adminPassword: 'admin-password-is-long',
          viewerPassword: '',
          demoUsers: false,
        }),
      ).toThrow('explicit first bootstrap')
    } finally {
      database.close()
    }
  })

  it('seeds a least-privilege acceptance viewer without touching the admin', () => {
    const directory = workspace()
    const file = path.join(directory, 'admin.sqlite')
    const database = openAdminDatabase(file)
    try {
      seedAdminDatabase(database.raw, {
        adminEmail: 'ops@example.test',
        adminPassword: 'admin-password-is-long',
        viewerPassword: '',
        demoUsers: false,
        bootstrap: true,
        acceptance: {
          email: 'acceptance@example.test',
          password: 'acceptance-password-123',
          userId: 'acceptance',
        },
      })
      const admin = database.raw
        .prepare('SELECT role, status, password_hash FROM users WHERE id = ?')
        .get('ada') as { role: string; status: string; password_hash: string }
      expect(admin.role).toBe('admin')
      expect(admin.status).toBe('active')
      const acceptance = database.raw
        .prepare('SELECT role, status FROM users WHERE id = ?')
        .get('acceptance') as { role: string; status: string }
      expect(acceptance).toEqual({ role: 'viewer', status: 'active' })

      const before = admin.password_hash
      seedAdminDatabase(database.raw, {
        adminEmail: 'ops@example.test',
        adminPassword: 'admin-password-is-long',
        viewerPassword: '',
        demoUsers: false,
        acceptance: {
          email: 'acceptance@example.test',
          password: 'acceptance-password-456',
          userId: 'acceptance',
        },
      })
      const after = database.raw
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get('ada') as { password_hash: string }
      expect(after.password_hash).toBe(before)
    } finally {
      database.close()
    }
  })

  it('refuses an acceptance id that collides with a privileged account', () => {
    const directory = workspace()
    const database = openAdminDatabase(path.join(directory, 'admin.sqlite'))
    try {
      expect(() =>
        seedAdminDatabase(database.raw, {
          adminEmail: 'ops@example.test',
          adminPassword: 'admin-password-is-long',
          viewerPassword: '',
          demoUsers: false,
          bootstrap: true,
          acceptance: {
            email: 'ops@example.test',
            password: 'acceptance-password-123',
            userId: 'ada',
          },
        }),
      ).toThrow('acceptance user id')
      const count = database.raw
        .prepare('SELECT COUNT(*) AS count FROM users')
        .get() as { count: number }
      expect(count.count).toBe(0)
    } finally {
      database.close()
    }
  })
})
