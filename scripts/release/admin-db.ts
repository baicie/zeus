/**
 * Admin SQLite backup, verification and restore helper. Paths are passed as
 * arguments; no password, session or user content is printed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  backupAdminDatabase,
  openAdminDatabase,
  restoreAdminDatabase,
  verifyAdminDatabase,
} from '../../examples/admin/server/database'

function timestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
}

function main(): void {
  const { values } = parseArgs({
    options: {
      database: { type: 'string' },
      backup: { type: 'string' },
      'restore-from': { type: 'string' },
      verify: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
  })
  if (values.verify) {
    const result = verifyAdminDatabase(path.resolve(values.verify))
    console.log(
      `${result.ok ? 'OK' : 'FAILED'}: ${path.resolve(values.verify)}${result.ok ? '' : ` (${result.messages.join('; ')})`}`,
    )
    if (!result.ok) process.exitCode = 1
    return
  }
  if (values['restore-from']) {
    if (!values.database)
      throw new Error('--database is required with --restore-from')
    const target = path.resolve(values.database)
    if (fs.existsSync(target) && !values.force) {
      throw new Error(
        `refusing to overwrite ${target}; pass --force after taking a pre-restore backup`,
      )
    }
    restoreAdminDatabase(path.resolve(values['restore-from']), target)
    console.log(`RESTORED: ${target}`)
    return
  }
  if (!values.database) throw new Error('--database is required')
  const databaseFile = path.resolve(values.database)
  if (!fs.existsSync(databaseFile)) {
    throw new Error(`database does not exist: ${databaseFile}`)
  }
  const destination = path.resolve(
    values.backup ?? `${databaseFile}.backup-${timestamp()}.sqlite`,
  )
  if (fs.existsSync(destination)) {
    throw new Error(`backup destination already exists: ${destination}`)
  }
  const database = openAdminDatabase(databaseFile)
  try {
    backupAdminDatabase(database.raw, destination)
  } finally {
    database.close()
  }
  const verified = verifyAdminDatabase(destination)
  if (!verified.ok) {
    throw new Error(
      `backup verification failed: ${verified.messages.join('; ')}`,
    )
  }
  console.log(`BACKUP: ${destination}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
