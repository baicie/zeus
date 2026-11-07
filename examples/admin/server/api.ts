import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import path from 'node:path'

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  createSession,
  deleteSession,
  deleteUserSessions,
  purgeExpiredSessions,
  readSessionAuth,
  type AdminRole,
  type SessionAuth,
  type SessionUser,
} from './auth'
import type { AdminDatabase } from './database'
import { ApiError, methodNotAllowed, readJsonBody, sendJson } from './http'
import {
  escapeLike,
  hashPassword,
  normalizeEmail,
  randomToken,
  tokenHash,
  verifyPassword,
} from './security'
import { AttemptLimiter, type AttemptLimiterOptions } from './rate-limit'

export interface AdminServerOptions {
  readonly database: AdminDatabase
  readonly allowedOrigins?: readonly string[]
  readonly maxUploadBytes?: number
  readonly staticDir?: string
  readonly now?: () => Date
  readonly secureCookies?: boolean
  readonly trustProxy?: boolean
  readonly loginRateLimit?: AttemptLimiterOptions
}

export interface AdminServer {
  readonly server: Server
  close(): Promise<void>
}

interface UserRow {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly team: string
  readonly status: 'active' | 'invited' | 'suspended'
  readonly role: 'admin' | 'viewer'
  readonly created_at: string
  readonly updated_at: string
}

const DEFAULT_UPLOAD_BYTES = 64 * 1024
const DUMMY_PASSWORD_HASH = hashPassword(randomToken())
const UPLOAD_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'image/png',
])

export function createAdminServer(options: AdminServerOptions): AdminServer {
  const { database } = options
  const db = database.raw
  const maxUploadBytes = options.maxUploadBytes ?? DEFAULT_UPLOAD_BYTES
  const allowedOrigins = new Set(options.allowedOrigins ?? [])
  const secureCookies = options.secureCookies ?? false
  const trustProxy = options.trustProxy ?? false
  const limiter = new AttemptLimiter({
    ...options.loginRateLimit,
    now: () => (options.now?.() ?? new Date()).getTime(),
  })
  const now = (): Date => options.now?.() ?? new Date()

  const server = http.createServer((request, response) => {
    void handle(request, response).catch(error => {
      const status = error instanceof ApiError ? error.status : 500
      const code =
        error instanceof ApiError ? error.code : 'ZEUS_ADMIN_INTERNAL'
      const message =
        error instanceof ApiError
          ? error.message
          : 'The admin API failed to handle the request.'
      if (!(error instanceof ApiError)) console.error(error)
      sendJson(response, { status, body: { error: { code, message } } })
    })
  })

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const method = request.method ?? 'GET'
    const url = new URL(request.url ?? '/', 'http://localhost')
    const origin = request.headers.origin
    const headers: Record<string, string> = {}
    if (origin && allowedOrigins.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Credentials'] = 'true'
      headers['Vary'] = 'Origin'
    } else if (origin && allowedOrigins.size > 0) {
      throw new ApiError(
        403,
        'ZEUS_ADMIN_ORIGIN',
        'Cross-origin request is not allowed.',
      )
    }
    if (method === 'OPTIONS') {
      response.writeHead(204, {
        ...headers,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
        'Access-Control-Max-Age': '600',
      })
      response.end()
      return
    }

    if (options.staticDir && !url.pathname.startsWith('/api/')) {
      await serveStatic(response, options.staticDir, url.pathname)
      return
    }

    purgeExpiredSessions(db)
    const token = cookieValue(request.headers.cookie, SESSION_COOKIE)
    const sessionAuth = readSessionAuth(db, token)
    const user = sessionAuth?.user

    if (url.pathname === '/api/health' && method === 'GET') {
      sendJson(response, { status: 200, body: { ok: true }, headers })
      return
    }
    if (url.pathname === '/api/auth/login') {
      if (method !== 'POST') return methodNotAllowed(response, ['POST'])
      const body = await readJsonBody(request)
      const email = normalizeEmail(readString(body, 'email'))
      const password = readString(body, 'password')
      const ip = clientAddress(request, trustProxy)
      const keys = [`ip:${ip}`, `account:${email}`]
      const decision = limiter.check(keys)
      if (!decision.allowed) {
        audit(undefined, 'login', email, 'denied', 'rate limited')
        sendRateLimited(response, headers, decision.retryAfterMs)
        return
      }
      const row = db
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(email) as (UserRow & { password_hash: string }) | undefined
      const passwordValid =
        password.length > 0 &&
        password.length <= 1024 &&
        row !== undefined &&
        verifyPassword(password, row.password_hash)
      if (!passwordValid) {
        // Always run a scrypt verification so unknown-email and wrong-password
        // responses have comparable cost and do not enumerate accounts.
        if (!row) verifyPassword(password, DUMMY_PASSWORD_HASH)
        limiter.recordFailure(keys)
        audit(undefined, 'login', email, 'denied', 'invalid credentials')
        throw new ApiError(
          401,
          'ZEUS_ADMIN_INVALID_CREDENTIALS',
          'Email or password is incorrect.',
        )
      }
      if (row.status === 'suspended') {
        limiter.recordFailure(keys)
        audit(row.id, 'login', row.id, 'denied', 'suspended account')
        throw new ApiError(
          403,
          'ZEUS_ADMIN_SIGN_IN_UNAVAILABLE',
          'Sign-in is not available for this account.',
        )
      }
      limiter.reset(keys)
      // Rotate on every successful sign-in: all older sessions are invalid.
      deleteUserSessions(db, row.id)
      const session = createSession(db, row.id, now())
      audit(row.id, 'login', row.id, 'success', undefined)
      sendJson(response, {
        status: 200,
        body: { user: publicUser(row), expiresAt: session.expiresAt },
        headers: {
          ...headers,
          'Set-Cookie': [
            createSessionCookie(
              session.token,
              session.expiresAt,
              secureCookies,
            ),
            createCsrfCookie(
              session.csrfToken,
              session.expiresAt,
              secureCookies,
            ),
          ],
        },
      })
      return
    }
    if (url.pathname === '/api/auth/session' && method === 'GET') {
      if (!user)
        throw new ApiError(
          401,
          'ZEUS_ADMIN_AUTH_REQUIRED',
          'Sign in to continue.',
        )
      sendJson(response, { status: 200, body: { user }, headers })
      return
    }
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      if (user) requireCsrf(request, sessionAuth)
      deleteSession(db, token)
      if (user) audit(user.id, 'logout', user.id, 'success', undefined)
      sendJson(response, {
        status: 204,
        headers: {
          ...headers,
          'Set-Cookie': clearAuthCookies(secureCookies),
        },
      })
      return
    }

    if (!user)
      throw new ApiError(
        401,
        'ZEUS_ADMIN_AUTH_REQUIRED',
        'Sign in to continue.',
      )
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      requireCsrf(request, sessionAuth)
    }

    if (url.pathname === '/api/summary' && method === 'GET') {
      requireRole(user, 'viewer')
      const users = db.prepare('SELECT COUNT(*) AS total FROM users').get() as {
        total: number
      }
      const teams = db
        .prepare('SELECT COUNT(DISTINCT team) AS total FROM users')
        .get() as {
        total: number
      }
      const audits = db
        .prepare('SELECT COUNT(*) AS total FROM audit_logs')
        .get() as {
        total: number
      }
      sendJson(response, {
        status: 200,
        body: {
          totalUsers: users.total,
          teams: teams.total,
          auditEvents: audits.total,
        },
        headers,
      })
      return
    }
    if (url.pathname === '/api/settings' && method === 'GET') {
      requireRole(user, 'viewer')
      const row = db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('workspace') as { value: string } | undefined
      sendJson(response, {
        status: 200,
        body: { settings: row ? JSON.parse(row.value) : defaultSettings() },
        headers,
      })
      return
    }
    if (url.pathname === '/api/settings' && method === 'PATCH') {
      requireRole(user, 'admin')
      const body = await readJsonBody(request)
      const current = db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('workspace') as { value: string } | undefined
      const previous = current ? JSON.parse(current.value) : defaultSettings()
      const record =
        body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : {}
      const next = {
        workspaceName:
          'workspaceName' in record
            ? requiredText(body, 'workspaceName', 1, 80)
            : previous.workspaceName,
        locale:
          'locale' in record
            ? parseLocale(readString(body, 'locale'))
            : previous.locale,
        theme:
          'theme' in record
            ? parseTheme(readString(body, 'theme'))
            : previous.theme,
      }
      db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      ).run('workspace', JSON.stringify(next), timestamp())
      audit(
        user.id,
        'settings.update',
        'workspace',
        'success',
        JSON.stringify(next),
      )
      sendJson(response, { status: 200, body: { settings: next }, headers })
      return
    }
    if (url.pathname === '/api/users' && method === 'GET') {
      requireRole(user, 'viewer')
      const search = normalizeSearch(url.searchParams.get('search') ?? '')
      const status = url.searchParams.get('status') ?? 'all'
      if (!['all', 'active', 'invited', 'suspended'].includes(status)) {
        throw new ApiError(
          400,
          'ZEUS_ADMIN_INVALID_STATUS',
          'Unknown user status filter.',
        )
      }
      const page = parsePositiveInt(url.searchParams.get('page'), 1, 10_000)
      const pageSize = parsePositiveInt(
        url.searchParams.get('pageSize'),
        10,
        100,
      )
      const where: string[] = []
      const params: Array<string | number> = []
      if (search) {
        where.push(
          "(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR team LIKE ? ESCAPE '\\')",
        )
        const pattern = `%${escapeLike(search)}%`
        params.push(pattern, pattern, pattern)
      }
      if (status !== 'all') {
        where.push('status = ?')
        params.push(status)
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const total = (
        db
          .prepare(`SELECT COUNT(*) AS total FROM users ${clause}`)
          .get(...params) as {
          total: number
        }
      ).total
      const rows = db
        .prepare(
          `SELECT * FROM users ${clause} ORDER BY name, id LIMIT ? OFFSET ?`,
        )
        .all(...params, pageSize, (page - 1) * pageSize) as unknown as UserRow[]
      sendJson(response, {
        status: 200,
        body: { rows: rows.map(publicUser), total, page, pageSize },
        headers,
      })
      return
    }
    if (url.pathname === '/api/users' && method === 'POST') {
      requireRole(user, 'admin')
      const body = await readJsonBody(request)
      const id = normalizeId(readString(body, 'id'))
      const name = requiredText(body, 'name', 2, 80)
      const email = normalizeEmail(readString(body, 'email'))
      const team = requiredText(body, 'team', 1, 40)
      const role = readRole(body)
      validateEmail(email)
      const now = timestamp()
      try {
        db.prepare(
          `INSERT INTO users (id, name, email, team, status, role, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'invited', ?, ?, ?, ?)`,
        ).run(id, name, email, team, role, hashInvitePassword(), now, now)
      } catch (error) {
        if (String(error).includes('UNIQUE')) {
          throw new ApiError(
            409,
            'ZEUS_ADMIN_USER_EXISTS',
            'A user with that id or email already exists.',
          )
        }
        throw error
      }
      audit(
        user.id,
        'user.create',
        id,
        'success',
        JSON.stringify({ email, role }),
      )
      sendJson(response, { status: 201, body: { user: readUser(id) }, headers })
      return
    }

    const userMatch = /^\/api\/users\/([^/]+)$/.exec(url.pathname)
    if (userMatch) {
      const id = decodeURIComponent(userMatch[1]!)
      if (method === 'GET') {
        requireRole(user, 'viewer')
        sendJson(response, {
          status: 200,
          body: { user: readUser(id) },
          headers,
        })
        return
      }
      if (method === 'PATCH') {
        requireRole(user, 'admin')
        const body = await readJsonBody(request)
        const existing = readUser(id)
        const record =
          body && typeof body === 'object'
            ? (body as Record<string, unknown>)
            : {}
        const email =
          'email' in record
            ? normalizeEmail(readString(body, 'email'))
            : existing.email
        validateEmail(email)
        const name =
          'name' in record ? requiredText(body, 'name', 2, 80) : existing.name
        const team =
          'team' in record ? requiredText(body, 'team', 1, 40) : existing.team
        const status =
          'status' in record
            ? parseStatus(readString(body, 'status'))
            : existing.status
        const role = 'role' in record ? readRole(body) : existing.role
        if (id === user.id && (role !== 'admin' || status !== 'active')) {
          throw new ApiError(
            409,
            'ZEUS_ADMIN_SELF_LOCKOUT',
            'You cannot remove your own admin access.',
          )
        }
        try {
          db.prepare(
            'UPDATE users SET name = ?, email = ?, team = ?, status = ?, role = ?, updated_at = ? WHERE id = ?',
          ).run(name, email, team, status, role, timestamp(), id)
        } catch (error) {
          if (String(error).includes('UNIQUE')) {
            throw new ApiError(
              409,
              'ZEUS_ADMIN_EMAIL_EXISTS',
              'That email is already in use.',
            )
          }
          throw error
        }
        if (status !== 'active' || role !== existing.role)
          deleteUserSessions(db, id)
        audit(
          user.id,
          'user.update',
          id,
          'success',
          JSON.stringify({ email, role, status }),
        )
        sendJson(response, {
          status: 200,
          body: { user: readUser(id) },
          headers,
        })
        return
      }
      if (method === 'DELETE') {
        requireRole(user, 'admin')
        if (id === user.id) {
          throw new ApiError(
            409,
            'ZEUS_ADMIN_SELF_DELETE',
            'You cannot delete your own account.',
          )
        }
        const result = db.prepare('DELETE FROM users WHERE id = ?').run(id)
        if (result.changes === 0)
          throw new ApiError(
            404,
            'ZEUS_ADMIN_USER_NOT_FOUND',
            'User not found.',
          )
        audit(user.id, 'user.delete', id, 'success', undefined)
        sendJson(response, { status: 204, headers })
        return
      }
      return methodNotAllowed(response, ['GET', 'PATCH', 'DELETE'])
    }

    if (url.pathname === '/api/audit' && method === 'GET') {
      requireRole(user, 'admin')
      const page = parsePositiveInt(url.searchParams.get('page'), 1, 10_000)
      const pageSize = parsePositiveInt(
        url.searchParams.get('pageSize'),
        10,
        100,
      )
      const total = (
        db.prepare('SELECT COUNT(*) AS total FROM audit_logs').get() as {
          total: number
        }
      ).total
      const rows = db
        .prepare(
          `SELECT id, actor_id, action, target, outcome, detail, created_at
           FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?`,
        )
        .all(pageSize, (page - 1) * pageSize)
      sendJson(response, {
        status: 200,
        body: { rows, total, page, pageSize },
        headers,
      })
      return
    }
    if (url.pathname === '/api/uploads') {
      if (method !== 'POST') return methodNotAllowed(response, ['POST'])
      requireRole(user, 'admin')
      const body = await readJsonBody(request)
      const filename = requiredText(body, 'filename', 1, 120)
      if (/[/\\\0]/.test(filename) || filename.startsWith('.')) {
        throw new ApiError(
          400,
          'ZEUS_ADMIN_UPLOAD_NAME',
          'Upload filename must be a basename.',
        )
      }
      const mediaType = readString(body, 'mediaType')
      if (!UPLOAD_TYPES.has(mediaType)) {
        throw new ApiError(
          415,
          'ZEUS_ADMIN_UPLOAD_TYPE',
          'Unsupported upload media type.',
        )
      }
      const data = readString(body, 'data')
      const bytes = Buffer.from(data, 'base64')
      if (bytes.byteLength === 0 || bytes.byteLength > maxUploadBytes) {
        throw new ApiError(
          413,
          'ZEUS_ADMIN_UPLOAD_SIZE',
          `Upload must be between 1 and ${maxUploadBytes} bytes.`,
        )
      }
      const id = randomUUID()
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      db.prepare(
        `INSERT INTO uploads (id, owner_id, filename, media_type, bytes, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        user.id,
        filename,
        mediaType,
        bytes.byteLength,
        sha256,
        timestamp(),
      )
      audit(
        user.id,
        'upload.create',
        id,
        'success',
        JSON.stringify({ filename, bytes: bytes.byteLength }),
      )
      sendJson(response, {
        status: 201,
        body: {
          upload: { id, filename, mediaType, bytes: bytes.byteLength, sha256 },
        },
        headers,
      })
      return
    }

    if (url.pathname.startsWith('/api/')) {
      throw new ApiError(404, 'ZEUS_ADMIN_NOT_FOUND', 'API route not found.')
    }
    throw new ApiError(404, 'ZEUS_ADMIN_NOT_FOUND', 'Not found.')
  }

  function readUser(id: string): UserRow {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | UserRow
      | undefined
    if (!row)
      throw new ApiError(404, 'ZEUS_ADMIN_USER_NOT_FOUND', 'User not found.')
    return row
  }

  function audit(
    actorId: string | undefined,
    action: string,
    target: string | undefined,
    outcome: string,
    detail: string | undefined,
  ): void {
    db.prepare(
      'INSERT INTO audit_logs (actor_id, action, target, outcome, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      actorId ?? null,
      action,
      target ?? null,
      outcome,
      detail ?? null,
      timestamp(),
    )
  }

  function timestamp(): string {
    return (options.now?.() ?? new Date()).toISOString()
  }

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      ),
  }
}

async function serveStatic(
  response: ServerResponse,
  directory: string,
  pathname: string,
): Promise<void> {
  const requestPath = pathname === '/' ? '/index.html' : pathname
  const file = path.resolve(directory, `.${decodeURIComponent(requestPath)}`)
  if (!file.startsWith(`${directory}${path.sep}`)) {
    sendJson(response, {
      status: 403,
      body: {
        error: {
          code: 'ZEUS_ADMIN_PATH',
          message: 'Path is outside the static root.',
        },
      },
    })
    return
  }
  const headers = {
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }
  try {
    const body = await readFile(file)
    response.writeHead(200, {
      ...headers,
      'Content-Type': staticContentType(path.extname(file)),
    })
    response.end(body)
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== 'ENOENT' ||
      path.extname(requestPath)
    ) {
      response.writeHead(404, headers)
      response.end('Not found')
      return
    }
    response.writeHead(200, {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
    })
    response.end(await readFile(path.join(directory, 'index.html')))
  }
}

function staticContentType(extension: string): string {
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.js') return 'text/javascript; charset=utf-8'
  if (extension === '.css') return 'text/css; charset=utf-8'
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.png') return 'image/png'
  if (extension === '.woff2') return 'font/woff2'
  return 'application/octet-stream'
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    team: row.team,
    status: row.status,
    role: row.role,
  }
}

function defaultSettings() {
  return { workspaceName: 'Zeus Admin', locale: 'zh-CN', theme: 'light' }
}

function parseLocale(value: string): 'zh-CN' | 'en' {
  if (value === 'zh-CN' || value === 'en') return value
  throw new ApiError(400, 'ZEUS_ADMIN_LOCALE', 'Locale must be zh-CN or en.')
}

function parseTheme(value: string): 'light' | 'dark' {
  if (value === 'light' || value === 'dark') return value
  throw new ApiError(400, 'ZEUS_ADMIN_THEME', 'Theme must be light or dark.')
}

function requireRole(user: SessionUser, role: AdminRole): void {
  if (role === 'admin' && user.role !== 'admin') {
    throw new ApiError(
      403,
      'ZEUS_ADMIN_FORBIDDEN',
      'This action requires an administrator.',
    )
  }
}

function cookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

function createSessionCookie(
  token: string,
  expiresAt: string,
  secure: boolean,
): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure ? '; Secure' : ''}`
}

function createCsrfCookie(
  token: string,
  expiresAt: string,
  secure: boolean,
): string {
  return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure ? '; Secure' : ''}`
}

function clearAuthCookies(secure: boolean): string[] {
  const suffix = secure ? '; Secure' : ''
  return [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${suffix}`,
    `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${suffix}`,
  ]
}

function requireCsrf(
  request: IncomingMessage,
  session: SessionAuth | undefined,
): void {
  const header = request.headers['x-csrf-token']
  const value = Array.isArray(header) ? header[0] : header
  if (!session || typeof value !== 'string' || value.length === 0) {
    throw new ApiError(
      403,
      'ZEUS_ADMIN_CSRF',
      'A valid CSRF token is required.',
    )
  }
  const expected = Buffer.from(session.csrfHash, 'hex')
  const actual = Buffer.from(tokenHash(value), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError(
      403,
      'ZEUS_ADMIN_CSRF',
      'A valid CSRF token is required.',
    )
  }
}

function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for']
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
    const first = value?.split(',')[0]?.trim()
    if (first && net.isIP(first) !== 0) return first
  }
  return request.socket.remoteAddress ?? 'unknown'
}

function sendRateLimited(
  response: ServerResponse,
  headers: Record<string, string>,
  retryAfterMs: number,
): void {
  sendJson(response, {
    status: 429,
    body: {
      error: {
        code: 'ZEUS_ADMIN_RATE_LIMITED',
        message: 'Too many sign-in attempts. Try again later.',
      },
    },
    headers: {
      ...headers,
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1_000))),
    },
  })
}

function readString(body: unknown, key: string): string {
  if (!body || typeof body !== 'object' || !(key in body)) {
    throw new ApiError(
      400,
      'ZEUS_ADMIN_FIELD_REQUIRED',
      `Field "${key}" is required.`,
    )
  }
  const value = (body as Record<string, unknown>)[key]
  if (typeof value !== 'string') {
    throw new ApiError(
      400,
      'ZEUS_ADMIN_FIELD_TYPE',
      `Field "${key}" must be a string.`,
    )
  }
  return value
}

function requiredText(
  body: unknown,
  key: string,
  min: number,
  max: number,
): string {
  const value = readString(body, key).trim()
  if (value.length < min || value.length > max) {
    throw new ApiError(
      400,
      'ZEUS_ADMIN_FIELD_LENGTH',
      `Field "${key}" must be ${min}-${max} characters.`,
    )
  }
  return value
}

function readRole(body: unknown): AdminRole {
  const role = readString(body, 'role')
  if (role !== 'admin' && role !== 'viewer') {
    throw new ApiError(
      400,
      'ZEUS_ADMIN_ROLE',
      'Role must be "admin" or "viewer".',
    )
  }
  return role
}

function parseStatus(value: string): UserRow['status'] {
  if (value === 'active' || value === 'invited' || value === 'suspended')
    return value
  throw new ApiError(400, 'ZEUS_ADMIN_INVALID_STATUS', 'Invalid user status.')
}

function normalizeId(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new ApiError(
      400,
      'ZEUS_ADMIN_USER_ID',
      'User id must be lowercase letters, digits and dashes.',
    )
  }
  return value
}

function validateEmail(value: string): void {
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ApiError(400, 'ZEUS_ADMIN_EMAIL', 'A valid email is required.')
  }
}

function normalizeSearch(value: string): string {
  return value.trim().slice(0, 120)
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  if (value === null) return fallback
  if (!/^\d+$/.test(value))
    throw new ApiError(400, 'ZEUS_ADMIN_QUERY', 'Expected a positive integer.')
  const parsed = Number(value)
  if (parsed < 1 || parsed > max)
    throw new ApiError(400, 'ZEUS_ADMIN_QUERY', 'Query value is out of range.')
  return parsed
}

function hashInvitePassword(): string {
  return hashPassword(randomToken())
}
