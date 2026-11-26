/**
 * Admin SQLite backup, verification and restore helper. Paths are passed as
 * arguments; no password, session or user content is printed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

/*
 * The database helpers now come from the application that ships.
 *
 * This imported `examples/admin/server/database` until that app was removed.
 * The migrated Admin keeps the same four functions in
 * `apps/admin/server/database.ts`; this script stays here because it is the CLI
 * entry point for backup and restore, and the ecosystem has none of its own.
 *
 * The path crosses repository boundaries and is absent in a bare clone of
 * `zeus`. That is acceptable for an operator tool — it runs from a developer
 * checkout where both repositories sit side by side — and it fails loudly with
 * a missing-module error rather than silently doing nothing.
 */
/*
 * Imported dynamically, through the path as a string.
 *
 * A static import of `../../zeus-ecosystem/...` does not typecheck: that
 * repository is outside this one's program, so TypeScript reports the module
 * as missing even when the file is present. Naming the path as a value keeps
 * `tsc` clean and moves the resolution to run time, where an absent sibling
 * checkout produces a clear error instead of a compile error for everyone who
 * only has this repository.
 */
const DATABASE_MODULE = '../../zeus-ecosystem/apps/admin/server/database.ts'

function timestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
}

async function main(): Promise<void> {
  const {
    backupAdminDatabase,
    openAdminDatabase,
    restoreAdminDatabase,
    verifyAdminDatabase,
  } = await import(new URL(DATABASE_MODULE, import.meta.url).href)
  const { values } = parseArgs({
    options: {
      database: { type: 'string' },
      backup: { type: 'string' },
      'restore-from': { type: 'string' },
      verify: { type: 'string' },
      force: { type: 'boolean', default: false },
      isolated: { type: 'boolean', default: false },
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
    if (!values.isolated) {
      throw new Error(
        'restore is only allowed into an isolated target; pass --isolated for a temporary or drill database',
      )
    }
    const target = path.resolve(values.database)
    const liveDatabase = process.env.ZEUS_ADMIN_DB
      ? path.resolve(process.env.ZEUS_ADMIN_DB)
      : undefined
    if (
      liveDatabase === target ||
      target === '/data/admin.sqlite' ||
      target.startsWith('/data/')
    ) {
      throw new Error(
        'refusing to restore into the live production Admin database',
      )
    }
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
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
