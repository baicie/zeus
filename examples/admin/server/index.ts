import { existsSync } from 'node:fs'
import path from 'node:path'

import { createAdminServer } from './api'
import type { AttemptLimiterOptions } from './rate-limit'
import { openAdminDatabase, seedAdminDatabase } from './database'
import { listen } from './http'

export interface StartAdminServerOptions {
  readonly port?: number
  readonly host?: string
  readonly databaseFile?: string
  readonly adminEmail?: string
  readonly adminPassword?: string
  readonly viewerPassword?: string
  readonly seed?: boolean
  readonly seedDemoUsers?: boolean
  readonly allowedOrigins?: readonly string[]
  readonly staticDir?: string
  readonly secureCookies?: boolean
  readonly trustProxy?: boolean
  readonly loginRateLimit?: AttemptLimiterOptions
}

export interface StartedAdminServer {
  readonly port: number
  readonly origin: string
  close(): Promise<void>
}

const DEFAULT_ADMIN_EMAIL = 'ada@example.test'

export async function startAdminServer(
  options: StartAdminServerOptions = {},
): Promise<StartedAdminServer> {
  const databaseFile =
    options.databaseFile ??
    process.env.ZEUS_ADMIN_DB ??
    path.resolve(import.meta.dirname, '../.data/admin.sqlite')
  const adminPassword = options.adminPassword ?? process.env.ZEUS_ADMIN_PASSWORD
  const viewerPassword =
    options.viewerPassword ?? process.env.ZEUS_ADMIN_VIEWER_PASSWORD
  const seedDemoUsers =
    options.seedDemoUsers ?? process.env.ZEUS_ADMIN_SEED_DEMO !== 'false'
  if (!adminPassword) {
    throw new Error(
      'ZEUS_ADMIN_PASSWORD is required. Use server/demo-env.example for local runs.',
    )
  }
  if (seedDemoUsers && !viewerPassword) {
    throw new Error(
      'ZEUS_ADMIN_VIEWER_PASSWORD is required when demo users are seeded.',
    )
  }
  if (
    adminPassword.length < 12 ||
    (seedDemoUsers && (viewerPassword?.length ?? 0) < 12)
  ) {
    throw new Error(
      'Admin and viewer demo passwords must be at least 12 characters.',
    )
  }
  const database = openAdminDatabase(databaseFile)
  if (options.seed !== false) {
    seedAdminDatabase(database.raw, {
      adminEmail:
        options.adminEmail ??
        process.env.ZEUS_ADMIN_EMAIL ??
        DEFAULT_ADMIN_EMAIL,
      adminPassword,
      viewerPassword: viewerPassword ?? '',
      demoUsers: seedDemoUsers,
    })
  }
  const host = options.host ?? process.env.ZEUS_ADMIN_HOST ?? '127.0.0.1'
  const port = options.port ?? Number(process.env.PORT ?? 8787)
  const origins = options.allowedOrigins ?? allowedOriginsFromEnvironment()
  const staticDir =
    options.staticDir ??
    (existsSync(path.resolve(import.meta.dirname, '../dist'))
      ? path.resolve(import.meta.dirname, '../dist')
      : undefined)
  const admin = createAdminServer({
    database,
    allowedOrigins: origins,
    maxUploadBytes: Number(process.env.ZEUS_ADMIN_UPLOAD_BYTES ?? 64 * 1024),
    staticDir,
    secureCookies:
      options.secureCookies ??
      (process.env.ZEUS_ADMIN_SECURE_COOKIES === 'true' ||
        process.env.NODE_ENV === 'production'),
    trustProxy:
      options.trustProxy ?? process.env.ZEUS_ADMIN_TRUST_PROXY === 'true',
    ...(options.loginRateLimit
      ? { loginRateLimit: options.loginRateLimit }
      : {}),
  })
  await listen(admin.server, port, host)
  const address = admin.server.address()
  if (!address || typeof address === 'string') {
    await admin.close()
    database.close()
    throw new Error('The admin server did not bind a TCP port.')
  }
  return {
    port: address.port,
    origin: `http://${host}:${address.port}`,
    async close() {
      await admin.close()
      database.close()
    },
  }
}

function allowedOriginsFromEnvironment(): readonly string[] {
  const value = process.env.ZEUS_ADMIN_ORIGINS
  if (!value) return []
  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = await startAdminServer()
  console.info(`Zeus Admin API listening on ${started.origin}`)
}
