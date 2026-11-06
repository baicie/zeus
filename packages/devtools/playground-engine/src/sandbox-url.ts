/**
 * Sandbox URL and parent-origin policy shared by the playground host and the
 * opaque sandbox document.
 *
 * The host build may use either a complete sandbox URL (preferred) or the
 * legacy origin-only variable. A complete URL keeps path prefixes, ports,
 * queries and fragments; the session id is carried in a query parameter so it
 * never overwrites a configured fragment.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const SANDBOX_SESSION_PARAM = 'zeus-sandbox-session'

export interface SandboxUrlOptions {
  /** The document URL of the playground host. */
  readonly hostUrl: string
  /** Complete sandbox document URL, including optional path/query/hash. */
  readonly sandboxUrl?: string | undefined
  /** Legacy origin-only configuration. Its path, query and hash are discarded. */
  readonly sandboxOrigin?: string | undefined
}

export interface SandboxParentPolicyOptions {
  /** Local development may use loopback hosts without an explicit allowlist. */
  readonly allowLoopback?: boolean
}

export interface SandboxLocationLike {
  readonly search: string
  readonly hash: string
}

/**
 * Resolves and validates the iframe URL used by the playground host.
 *
 * - A complete `sandboxUrl` is preferred and preserves path/query/hash.
 * - A legacy `sandboxOrigin` keeps the existing `/sandbox.html` behaviour.
 * - Without either value, loopback hosts use the alternate loopback origin.
 */
export function resolveSandboxUrl(options: SandboxUrlOptions): string {
  const host = parseHttpUrl(options.hostUrl, 'hostUrl')
  let sandbox: URL

  if (options.sandboxUrl?.trim()) {
    sandbox = parseHttpUrl(options.sandboxUrl.trim(), 'sandboxUrl')
  } else if (options.sandboxOrigin?.trim()) {
    const origin = parseHttpUrl(options.sandboxOrigin.trim(), 'sandboxOrigin')
    sandbox = new URL('/sandbox.html', origin.origin)
  } else {
    sandbox = new URL('/sandbox.html', alternateLoopbackOrigin(host))
  }

  if (sandbox.pathname.endsWith('/')) {
    sandbox.pathname = `${sandbox.pathname}sandbox.html`
  }
  if (sandbox.origin === host.origin) {
    throw new Error(
      'VITE_ZEUS_SANDBOX_URL must use a different origin from the playground host.',
    )
  }
  if (sandbox.protocol !== 'https:' && !isLoopbackUrl(sandbox)) {
    throw new Error(
      'VITE_ZEUS_SANDBOX_URL must use HTTPS outside loopback development.',
    )
  }
  return sandbox.href
}

/** Adds the per-frame session id without dropping configured query or hash. */
export function withSandboxSession(url: string, sessionId: string): string {
  if (!/^[A-Za-z0-9._:-]+$/.test(sessionId)) {
    throw new Error('Sandbox session id contains unsupported characters.')
  }
  const next = new URL(url)
  next.searchParams.set(SANDBOX_SESSION_PARAM, sessionId)
  return next.href
}

/** Reads the session id from the sandbox document URL. */
export function sandboxSessionFromLocation(
  location: SandboxLocationLike,
): string {
  const value = new URLSearchParams(location.search).get(SANDBOX_SESSION_PARAM)
  if (value) return value
  // Compatibility with the pre-R4.1 fragment transport.
  try {
    return decodeURIComponent(location.hash.slice(1))
  } catch {
    return ''
  }
}

/**
 * Parses a comma/whitespace separated list of trusted parent origins.
 * Invalid entries fail closed instead of silently widening the allowlist.
 */
export function parseSandboxParentOrigins(
  value: string | undefined | null,
): string[] {
  if (!value) return []
  const origins = new Set<string>()
  for (const item of value.split(/[,\s]+/)) {
    if (!item) continue
    const url = parseHttpUrl(item, 'sandbox parent origin')
    if (url.protocol !== 'https:' && !isLoopbackUrl(url)) {
      throw new Error('sandbox parent origin must use HTTPS')
    }
    origins.add(url.origin)
  }
  return [...origins]
}

/** Exact-origin trust check; loopback is only admitted when explicitly allowed. */
export function isTrustedSandboxParentOrigin(
  origin: string,
  allowedOrigins: readonly string[],
  options: SandboxParentPolicyOptions = {},
): boolean {
  if (!origin) return false
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (allowedOrigins.includes(parsed.origin)) return true
  return options.allowLoopback === true && isLoopbackUrl(parsed)
}

export function isLoopbackSandboxHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())
}

function alternateLoopbackOrigin(host: URL): string {
  const hostname = host.hostname.toLowerCase()
  const alternate =
    hostname === '127.0.0.1'
      ? 'localhost'
      : hostname === 'localhost'
        ? '127.0.0.1'
        : undefined
  if (!alternate) {
    throw new Error(
      'Set VITE_ZEUS_SANDBOX_URL to a distinct sandbox origin before building this example.',
    )
  }
  return `${host.protocol}//${alternate}${host.port ? `:${host.port}` : ''}`
}

function parseHttpUrl(value: string, label: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is not a valid URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use HTTP or HTTPS.`)
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials.`)
  }
  return url
}

function isLoopbackUrl(url: URL): boolean {
  return isLoopbackSandboxHostname(url.hostname)
}
