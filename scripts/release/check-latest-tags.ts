/**
 * RC dist-tag policy. A release candidate must not inherit a `latest` tag that
 * points at a prerelease. Stable releases keep `latest` on the newest stable
 * version; RC prechecks fail until the polluted tags are explicitly repaired.
 *
 * Registry reads have explicit states:
 *
 * - `LATEST_ABSENT` only for an explicit 404 / empty tag response;
 * - `LATEST_STABLE` / `LATEST_PRERELEASE` for a value;
 * - `REGISTRY_QUERY_FAILED` for timeouts, 5xx, DNS, auth and unparsable data.
 *
 * A query failure is never treated as "no latest tag"; it blocks the release.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import {
  DEFAULT_ATTEMPTS,
  queryNpmJson,
  type NpmRunner,
  type QueryOptions,
} from './npm-registry'
import {
  normalizeVersion,
  resolveReleaseVersion,
  type ResolvedReleaseVersion,
} from './release-version'
import { findWorkspacePackages } from '../shared/utils'

export type LatestTagState =
  | { readonly status: 'LATEST_ABSENT' }
  | { readonly status: 'LATEST_STABLE'; readonly version: string }
  | { readonly status: 'LATEST_PRERELEASE'; readonly version: string }
  | { readonly status: 'REGISTRY_QUERY_FAILED'; readonly error: string }

export interface LatestTagRecord {
  readonly name: string
  readonly state: LatestTagState
}

export interface LatestTagEvaluation {
  readonly errors: readonly string[]
  readonly failures: readonly string[]
  readonly absent: readonly string[]
  readonly stable: readonly string[]
  readonly prerelease: readonly string[]
}

export function classifyLatestTag(
  version: string | undefined | null,
): LatestTagState {
  if (version === undefined || version === null || version === '') {
    return { status: 'LATEST_ABSENT' }
  }
  if (typeof version !== 'string') {
    return {
      status: 'REGISTRY_QUERY_FAILED',
      error: 'dist-tag value is not a string',
    }
  }
  return version.includes('-')
    ? { status: 'LATEST_PRERELEASE', version }
    : { status: 'LATEST_STABLE', version }
}

export function evaluateLatestTags(
  records: readonly LatestTagRecord[],
): LatestTagEvaluation {
  const errors: string[] = []
  const failures: string[] = []
  const absent: string[] = []
  const stable: string[] = []
  const prerelease: string[] = []
  for (const record of records) {
    switch (record.state.status) {
      case 'LATEST_PRERELEASE':
        prerelease.push(record.name)
        errors.push(
          `${record.name}: latest points at prerelease ${record.state.version}; run pnpm repair:latest-tags`,
        )
        break
      case 'REGISTRY_QUERY_FAILED':
        failures.push(record.name)
        errors.push(
          `${record.name}: registry query failed: ${record.state.error}`,
        )
        break
      case 'LATEST_ABSENT':
        absent.push(record.name)
        break
      case 'LATEST_STABLE':
        stable.push(record.name)
        break
    }
  }
  return { errors, failures, absent, stable, prerelease }
}

export interface ReadLatestOptions {
  readonly runner?: NpmRunner
  readonly registry?: string
  readonly attempts?: number
  readonly retryDelayMs?: number
  readonly sleep?: QueryOptions['sleep']
}

export async function readLatestTag(
  name: string,
  options: ReadLatestOptions = {},
): Promise<LatestTagState> {
  const args = ['view', name, 'dist-tags.latest', '--json']
  if (options.registry) args.push('--registry', options.registry)
  const result = await queryNpmJson<unknown>(args, {
    ...(options.runner ? { runner: options.runner } : {}),
    attempts: options.attempts ?? DEFAULT_ATTEMPTS,
    ...(options.retryDelayMs !== undefined
      ? { retryDelayMs: options.retryDelayMs }
      : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  })
  if (result.status === 'not-found') {
    return { status: 'LATEST_ABSENT' }
  }
  if (result.status === 'failed') {
    return { status: 'REGISTRY_QUERY_FAILED', error: result.message }
  }
  const value = result.value
  if (value === null || value === undefined || value === '') {
    return { status: 'LATEST_ABSENT' }
  }
  return classifyLatestTag(String(value))
}

export interface LatestTagReport {
  readonly schema: 'zeus.latest-tags/v2'
  readonly version: string
  readonly rc: boolean
  readonly packages: readonly LatestTagRecord[]
  readonly evaluation: LatestTagEvaluation
  readonly passed: boolean
  readonly warnings: readonly string[]
  readonly versionSources: Readonly<Record<string, string | undefined>>
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      force: { type: 'boolean', default: false },
      version: { type: 'string' },
      ref: { type: 'string' },
      registry: { type: 'string' },
      attempts: { type: 'string' },
      out: { type: 'string', default: 'temp/release/latest-tags.json' },
    },
  })

  const resolved = resolveVersion(values.version, values.ref)
  for (const warning of resolved.warnings) console.warn(`WARNING ${warning}`)
  if (resolved.errors.length > 0) {
    for (const error of resolved.errors) console.error(`BLOCKER ${error}`)
    process.exitCode = 1
    return
  }
  const version = resolved.version!
  if (process.env.ZEUS_RELEASE_CHANNEL === 'rc' && !resolved.rc) {
    console.error(
      `BLOCKER RC release channel requires an RC version, got ${version}`,
    )
    process.exitCode = 1
    return
  }
  if (!resolved.rc && values.force !== true) {
    console.log(`latest-tag policy skipped for non-RC version ${version}`)
    return
  }

  const records: LatestTagRecord[] = []
  for (const name of zeusFixedPackages) {
    records.push({
      name,
      state: await readLatestTag(name, {
        ...(values.registry ? { registry: values.registry } : {}),
        ...(values.attempts ? { attempts: Number(values.attempts) } : {}),
      }),
    })
  }
  const evaluation = evaluateLatestTags(records)
  const report: LatestTagReport = {
    schema: 'zeus.latest-tags/v2',
    version,
    rc: resolved.rc,
    packages: records,
    evaluation,
    passed: evaluation.errors.length === 0,
    warnings: resolved.warnings,
    versionSources: resolved.sources,
  }
  const output = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)

  for (const record of records) {
    const suffix =
      record.state.status === 'LATEST_STABLE' ||
      record.state.status === 'LATEST_PRERELEASE'
        ? ` ${record.state.version}`
        : record.state.status === 'REGISTRY_QUERY_FAILED'
          ? ` ${record.state.error}`
          : ''
    console.log(`${record.name}: ${record.state.status}${suffix}`)
  }
  for (const error of evaluation.errors) console.error(`BLOCKER ${error}`)
  console.log(
    `latest-tag policy ${evaluation.errors.length === 0 ? 'PASS' : 'FAIL'}: ${records.length} packages (${evaluation.stable.length} stable, ${evaluation.prerelease.length} prerelease, ${evaluation.absent.length} absent, ${evaluation.failures.length} failed)`,
  )
  if (evaluation.errors.length > 0) process.exitCode = 1
}

function resolveVersion(
  explicit: string | undefined,
  ref: string | undefined,
): ResolvedReleaseVersion {
  const zeus = findWorkspacePackages().find(pkg => pkg.name === '@zeus-js/zeus')
  const root = readPackageVersion('package.json')
  return resolveReleaseVersion({
    explicit,
    tag: ref ?? process.env.GITHUB_REF_NAME,
    env: process.env.ZEUS_RELEASE_VERSION,
    zeusPackage:
      typeof zeus?.packageJson.version === 'string'
        ? zeus.packageJson.version
        : undefined,
    rootPackage: root,
  })
}

function readPackageVersion(file: string): string | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      version?: unknown
    }
    return typeof value.version === 'string'
      ? normalizeVersion(value.version)
      : undefined
  } catch {
    return undefined
  }
}

if (process.argv[1]?.endsWith('check-latest-tags.ts')) {
  void main()
}
