export const PUBLISHED_PACKAGE_VISIBILITY_DELAYS_MS = [
  0, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 180_000, 240_000,
  240_000,
] as const

interface WaitForPublishedPackageOptions {
  packageName: string
  expectedVersion: string
  queryVersion: () => Promise<string>
  delays?: readonly number[]
  wait?: (ms: number) => Promise<void>
}

export function isRetryablePublishedPackageError(error: unknown): boolean {
  const candidate = error as {
    message?: unknown
    stderr?: unknown
    stdout?: unknown
  }
  const output = [candidate?.message, candidate?.stderr, candidate?.stdout]
    .filter(value => value !== undefined)
    .map(String)
    .join('\n')

  return /E404|EAI_AGAIN|ECONNRESET|ENETUNREACH|ETIMEDOUT|ERR_SOCKET_TIMEOUT|(?:^|\D)(?:429|502|503|504)(?:\D|$)/i.test(
    output,
  )
}

export async function waitForPublishedPackageVisibility(
  options: WaitForPublishedPackageOptions,
): Promise<void> {
  const delays = options.delays ?? PUBLISHED_PACKAGE_VISIBILITY_DELAYS_MS
  const wait = options.wait ?? defaultWait
  let lastError: unknown

  for (let index = 0; index < delays.length; index += 1) {
    const delay = delays[index] ?? 0
    if (index > 0 && delay > 0) await wait(delay)

    try {
      const version = await options.queryVersion()
      if (version === options.expectedVersion) return
      throw new Error(`npm returned version ${version}`)
    } catch (error) {
      if (!isRetryablePublishedPackageError(error)) throw error
      lastError = error
    }
  }

  throw new Error(
    `${options.packageName}@${options.expectedVersion} was not visible after ${delays.length} registry checks: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

function defaultWait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
