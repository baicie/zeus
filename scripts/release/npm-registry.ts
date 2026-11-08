/**
 * Registry access with explicit failure states.
 *
 * The dist-tag gates used to treat every `npm view` error as "no latest tag",
 * which turned timeouts, 500s, DNS failures and missing credentials into a
 * silent pass. This module distinguishes an explicit `E404` (package or tag
 * really does not exist) from every other failure, which must block the
 * release. Retries are bounded and injectable so tests never sleep.
 */
import { execFileSync } from 'node:child_process'

export type RegistryQueryResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'not-found'; readonly message: string }
  | {
      readonly status: 'failed'
      readonly message: string
      readonly attempts: number
    }

export interface NpmCommandResult {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
}

export type NpmRunner = (args: readonly string[]) => NpmCommandResult

export const defaultNpmRunner: NpmRunner = args => {
  try {
    const output = execFileSync('npm', [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout: output, stderr: '' }
  } catch (error) {
    const failure = error as {
      status?: number | null
      stdout?: string | Buffer
      stderr?: string | Buffer
      message?: string
    }
    return {
      status: typeof failure.status === 'number' ? failure.status : 1,
      stdout: String(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? failure.message ?? ''),
    }
  }
}

export interface QueryOptions {
  readonly runner?: NpmRunner
  readonly attempts?: number
  readonly retryDelayMs?: number
  readonly sleep?: (ms: number) => Promise<void> | void
}

export const DEFAULT_ATTEMPTS = 3
export const DEFAULT_RETRY_DELAY_MS = 500

/**
 * npm retries 5xx responses with a 10s/100s backoff by default. The release
 * gate owns its own bounded retry policy, so npm's retries are disabled and
 * each attempt has a hard timeout. Otherwise a single DNS/registry outage can
 * stall the precheck for minutes per package.
 */
export const NPM_FETCH_FLAGS = [
  '--fetch-retries=0',
  '--fetch-timeout=10000',
] as const

/**
 * `npm view` returns an explicit E404 for a package that does not exist.
 * Everything else - auth, network, registry 5xx, invalid JSON - is a query
 * failure and must fail closed.
 */
export function classifyNpmFailure(
  result: NpmCommandResult,
): 'not-found' | 'failed' {
  const text = `${result.stderr}\n${result.stdout}`
  if (/\bE404\b/.test(text) || /404 Not Found/.test(text)) return 'not-found'
  return 'failed'
}

export async function queryNpmJson<T>(
  args: readonly string[],
  options: QueryOptions = {},
): Promise<RegistryQueryResult<T>> {
  const runner = options.runner ?? defaultNpmRunner
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS)
  const delay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>(resolve => {
        setTimeout(resolve, ms)
      }))
  let lastMessage = ''

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = runner([...args, ...NPM_FETCH_FLAGS])
    if (result.status === 0) {
      const output = result.stdout.trim()
      if (!output) {
        return { status: 'not-found', message: 'npm view returned no data' }
      }
      try {
        return { status: 'ok', value: JSON.parse(output) as T }
      } catch {
        lastMessage = 'npm view returned invalid JSON'
      }
    } else if (classifyNpmFailure(result) === 'not-found') {
      return {
        status: 'not-found',
        message: result.stderr.trim() || 'npm view returned 404',
      }
    } else {
      lastMessage =
        result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`
    }
    if (attempt < attempts) await sleep(delay * attempt)
  }

  return { status: 'failed', message: lastMessage, attempts }
}
