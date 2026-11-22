/**
 * Audits what the registry actually holds for a release group (R22 TASK 41).
 *
 * Read-only: `npm view` only. It never publishes, tags or promotes. It answers
 * three questions that get confused with each other:
 *
 *   1. is the version published at all;
 *   2. does every package in the group have it (a partial publish is the state
 *      rc.3 is in, and which packages landed decides whether anything works);
 *   3. which dist-tags point at it — `latest` included, because a first publish
 *      binds `latest` whether or not `--tag` said otherwise.
 *
 * It does not judge. It prints counts and a per-package table, and exits
 * non-zero only for a partial publish, which is the one state that needs a
 * decision rather than a note.
 *
 * ## Two failures this had to stop swallowing
 *
 * `npm dist-tags --json <name>` prints plain text and ignores `--json`
 * (`beta: 0.1.1-beta.20`), so the parse threw and an empty `catch` turned every
 * package into "no tags at all". `latest` is read from that field, so the audit
 * was blind to exactly the thing it exists to find. The `npm view <name>
 * dist-tags --json` form returns JSON.
 *
 * And a rate-limited or offline `npm view` reads identically to "not published"
 * if the error is swallowed. `queryNpmJson` separates an explicit `E404` from
 * every other failure, so a network problem is reported as `status: 'failed'`
 * and does not masquerade as 25 unpublished packages.
 *
 * ## Usage
 *
 * ```text
 * pnpm release:audit-group --version 0.2.0-rc.3
 * pnpm release:audit-group --version 0.2.0-rc.3 --registry http://127.0.0.1:4873
 * pnpm release:audit-group --version 0.2.0-rc.3 --json
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import { queryNpmJson, type QueryOptions } from './npm-registry'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/release')

export interface PackageState {
  readonly name: string
  readonly published: boolean
  readonly latest?: string
  /** Every tag pointing at the audited version. Empty means none does. */
  readonly tags?: string[]
  /** Set when the package is published but its dist-tags could not be read. */
  readonly tagsError?: string
  readonly integrity?: string
  /** The tarball the registry would hand a consumer. */
  readonly tarball?: string
  /** Unpacked size, when the registry reports it. */
  readonly unpackedSize?: number
  /**
   * When this package's query finished, ISO-8601.
   *
   * Per package rather than per report: the loop is sequential and a
   * 32-package audit against a slow registry takes minutes, so a single
   * timestamp at the top would misdate most of the rows.
   */
  readonly queriedAt?: string
  /**
   * How the query ended when it did not produce an answer.
   *
   * `not-found` is the registry saying the version does not exist — a real
   * finding. `failed` is the registry not answering — no finding at all, and
   * the audit must not report it as unpublished. Keeping them apart is the
   * whole point of this field.
   */
  readonly query?:
    | { readonly outcome: 'ok' }
    | { readonly outcome: 'not-found'; readonly message: string }
    | {
        readonly outcome: 'failed'
        readonly message: string
        readonly attempts?: number
      }
  /** Set when the query itself failed — not the same as "not published". */
  readonly error?: string
}

/**
 * Queries one package's state.
 *
 * Exported for tests: the interesting behaviour is what it does with a registry
 * failure versus an explicit 404, and that is not observable from the CLI
 * without a registry.
 */
export async function inspectPackage(
  name: string,
  version: string,
  registry: string,
  options: QueryOptions = {},
): Promise<PackageState> {
  const queriedAt = new Date().toISOString()
  const manifest = await queryNpmJson<{
    version?: string
    dist?: {
      integrity?: string
      tarball?: string
      unpackedSize?: number
    }
  }>(['view', `${name}@${version}`, '--json', '--registry', registry], options)
  if (manifest.status === 'not-found') {
    return {
      name,
      published: false,
      queriedAt,
      query: { outcome: 'not-found', message: manifest.message },
    }
  }
  if (manifest.status === 'failed') {
    return {
      name,
      published: false,
      queriedAt,
      query: {
        outcome: 'failed',
        message: manifest.message,
        attempts: manifest.attempts,
      },
      error: manifest.message,
    }
  }
  // `npm view <name> dist-tags --json` is the form that returns JSON; see the
  // module comment. A failure here is recorded, not left blank.
  const tags = await queryNpmJson<Record<string, string>>(
    ['view', name, 'dist-tags', '--json', '--registry', registry],
    options,
  )
  const state: PackageState = {
    name,
    published: manifest.value.version === version,
    queriedAt,
    query: { outcome: 'ok' },
    integrity: manifest.value.dist?.integrity,
    tarball: manifest.value.dist?.tarball,
    unpackedSize: manifest.value.dist?.unpackedSize,
  }
  if (tags.status === 'ok') {
    return {
      ...state,
      latest: tags.value.latest,
      tags: Object.entries(tags.value)
        .filter(([, target]) => target === version)
        .map(([tag]) => tag)
        .sort(),
    }
  }
  return {
    ...state,
    tagsError: tags.status === 'not-found' ? tags.message : tags.message,
  }
}

/**
 * The packages without which the framework does not exist (R23 TASK 16).
 *
 * A release that publishes 27 of 32 packages and misses `runtime-dom` has
 * published nothing a consumer can use. Counting is the wrong acceptance test,
 * and rc.3 is the case that proves it: seven packages, none of them the runtime.
 *
 * Kept as a type rather than a comment so the audit can name what is missing
 * from this set specifically, and so adding a package to the framework means
 * editing one list.
 */
export const FRAMEWORK_PACKAGES = [
  '@zeus-js/shared',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/zeus',
] as const

export interface FrameworkCheckpoint {
  /** Every package a consumer needs before any app can be built. */
  readonly required: readonly string[]
  readonly present: readonly string[]
  readonly missing: readonly string[]
  /**
   * True only when every required package is published.
   *
   * Deliberately not "most of them": a partial runtime is not a usable one,
   * and a percentage would make 4 of 5 look like progress.
   */
  readonly complete: boolean
  /** One line a release report can quote without interpretation. */
  readonly verdict: string
}

/** Evaluates the framework checkpoint from an audit's results. */
export function frameworkCheckpoint(
  packages: readonly PackageState[],
): FrameworkCheckpoint {
  const published = new Set(
    packages.filter(state => state.published).map(state => state.name),
  )
  const present = FRAMEWORK_PACKAGES.filter(name => published.has(name))
  const missing = FRAMEWORK_PACKAGES.filter(name => !published.has(name))
  return {
    required: FRAMEWORK_PACKAGES,
    present,
    missing,
    complete: missing.length === 0,
    verdict:
      missing.length === 0
        ? 'the framework is complete: every required runtime package is published'
        : `the framework is NOT usable: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} unpublished`,
  }
}

export interface GroupAudit {
  readonly measuredAt: string
  readonly version: string
  readonly registry: string
  readonly group: number
  readonly published: number
  readonly missing: number
  readonly partial: boolean
  /** Packages the query could not answer for. Non-zero makes the audit invalid. */
  readonly failed: number
  readonly latestBoundTo: string[]
  /** R23 TASK 16: the packages a consumer needs before anything works. */
  readonly framework: FrameworkCheckpoint
  readonly packages: PackageState[]
}

export async function auditGroup(
  version: string,
  registry: string,
  group: readonly string[] = zeusFixedPackages,
  options: QueryOptions = {},
): Promise<GroupAudit> {
  const packages: PackageState[] = []
  // Sequential on purpose: a burst of parallel `npm view` calls trips the
  // registry's rate limiter, and a rate-limited answer used to read as
  // "not published".
  for (const name of group) {
    packages.push(await inspectPackage(name, version, registry, options))
  }

  const published = packages.filter(state => state.published)
  const missing = packages.filter(state => !state.published && !state.error)
  const failed = packages.filter(state => state.error)
  return {
    measuredAt: new Date().toISOString(),
    version,
    registry,
    group: group.length,
    published: published.length,
    missing: missing.length,
    // A query failure makes the whole audit inconclusive, so partial is only
    // claimed when every package was actually answered for.
    partial: published.length > 0 && missing.length > 0 && failed.length === 0,
    failed: failed.length,
    latestBoundTo: packages
      .filter(state => state.latest === version)
      .map(state => state.name),
    framework: frameworkCheckpoint(packages),
    packages,
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      registry: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  })

  const version = values.version
  if (!version)
    throw new Error('Usage: release:audit-group --version <version>')
  const registry = values.registry ?? 'https://registry.npmjs.org'

  const report = await auditGroup(version, registry)

  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(
    path.join(output, `group-audit-${version}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  )

  if (values.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    console.log(`version ${version} on ${registry}`)
    console.log(`  group     ${report.group}`)
    console.log(`  published ${report.published}`)
    console.log(`  missing   ${report.missing}`)
    if (report.failed > 0) {
      console.log(`  UNANSWERED ${report.failed} — the audit is inconclusive:`)
      for (const state of report.packages.filter(s => s.error)) {
        console.log(`    ${state.name}: ${state.error}`)
      }
    }
    console.log(
      `\n  framework ${report.framework.complete ? 'COMPLETE' : 'INCOMPLETE'}: ${report.framework.verdict}`,
    )
    if (report.latestBoundTo.length > 0) {
      console.log(
        `  latest points at this version for: ${report.latestBoundTo.join(', ')}`,
      )
    }
    const missing = report.packages.filter(s => !s.published && !s.error)
    if (missing.length > 0) {
      console.log('\nmissing:')
      for (const state of missing) console.log(`  ${state.name}`)
    }
  }

  // Unanswered is worse than partial: it cannot be acted on at all.
  if (report.failed > 0) process.exitCode = 2
  else if (report.partial) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
