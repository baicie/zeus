import http, { type IncomingMessage, type ServerResponse } from 'node:http'

export interface ApiRequest {
  readonly method: string
  readonly url: URL
  readonly headers: IncomingMessage['headers']
  readonly body: unknown
}

export interface ApiResponse {
  readonly status: number
  readonly body?: unknown
  readonly headers?: Record<string, string | string[]>
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const MAX_BODY_BYTES = 2 * 1024 * 1024

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type'] ?? ''
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      415,
      'ZEUS_ADMIN_JSON_REQUIRED',
      'Content-Type must be application/json.',
    )
  }
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) {
      throw new ApiError(
        413,
        'ZEUS_ADMIN_BODY_TOO_LARGE',
        'Request body is too large.',
      )
    }
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiError(
      400,
      'ZEUS_ADMIN_INVALID_JSON',
      'Request body is not valid JSON.',
    )
  }
}

export function sendJson(response: ServerResponse, result: ApiResponse): void {
  const body = result.body === undefined ? '' : JSON.stringify(result.body)
  response.writeHead(result.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...result.headers,
  })
  response.end(body)
}

export function methodNotAllowed(
  response: ServerResponse,
  allowed: readonly string[],
): void {
  sendJson(response, {
    status: 405,
    body: {
      error: { code: 'ZEUS_ADMIN_METHOD', message: 'Method not allowed.' },
    },
    headers: { Allow: allowed.join(', ') },
  })
}

export function listen(
  server: http.Server,
  port: number,
  host: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}
