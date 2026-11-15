/**
 * Verifies a built `build-info.json` against the repository it was built from.
 *
 * `verifyUiSources` existed but had no caller outside its own tests: the strict
 * checks were written and never run against a real artifact. This is that
 * caller — it reads a `build-info.json`, a `package.json` and `pnpm-lock.yaml`,
 * and fails the process rather than printing a report nobody reads.
 *
 * It also has to *read* what it verifies. The document is written inside a
 * Docker build with no network, so it records `sourceCommit: UNVERIFIED` for
 * every registry package — honest there, but `UNVERIFIED` also used to satisfy
 * strict mode, which made the gate green for a document that bound nothing.
 * `--read-attestations` fetches each package's SLSA attestation, has Sigstore
 * verify its signature, and binds the statement's subject to the bytes the
 * lockfile says will be installed.
 *
 * It deliberately re-reads the lockfile instead of trusting one recorded in the
 * document. Verifying a build against a lockfile other than the one it was
 * built from would pass a document whose bytes came from somewhere else.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import {
  attestationUrl,
  findSlsaBundle,
  verifyAttestation,
  type AttestationFailure,
  type VerifiedAttestation,
} from './ui-attestation'
import {
  lockfileIntegrity,
  verifyUiSources,
  type UiSources,
} from './ui-sources'

export interface VerifyUiProvenanceInput {
  readonly buildInfo: unknown
  readonly manifestPath: string
  readonly lockfile: string
  readonly root: string
  readonly level?: 'legacy-compatible' | 'release-strict'
  /** Commits read from SLSA attestations, keyed `name@version`. */
  readonly attestationSources?: Readonly<
    Record<string, { readonly commit: string }>
  >
}

export interface VerifyUiProvenanceResult {
  readonly errors: readonly string[]
  readonly ok: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** How a package's provenance lookup ended. */
export type ProvenanceStatus =
  | { readonly state: 'verified'; readonly attestation: VerifiedAttestation }
  | { readonly state: 'missing'; readonly detail: string }
  | { readonly state: 'invalid'; readonly failure: AttestationFailure }
  | { readonly state: 'retryable'; readonly detail: string }
  | { readonly state: 'infrastructure'; readonly detail: string }

/**
 * Checks the document's own consistency before the deeper comparison.
 *
 * These are the ways a `build-info.json` can be internally wrong even when its
 * `uiSources` block is well formed.
 */
function checkDocumentShape(
  buildInfo: unknown,
  level: 'legacy-compatible' | 'release-strict',
): string[] {
  const errors: string[] = []
  if (!isRecord(buildInfo)) return ['build-info must be a JSON object']
  if (!isRecord(buildInfo.uiSources)) {
    errors.push('build-info has no uiSources block')
    return errors
  }
  const uiCommit = buildInfo.uiCommit
  if (typeof uiCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(uiCommit)) {
    errors.push('build-info.uiCommit must be a full 40-character commit')
  }
  const sources = buildInfo.uiSources as unknown as UiSources
  if (sources.declaredPairingCommit !== uiCommit) {
    errors.push(
      `uiSources.declaredPairingCommit ${String(sources.declaredPairingCommit)} does not match build-info.uiCommit ${String(uiCommit)}`,
    )
  }
  if (level === 'release-strict') {
    const recorded = Array.isArray(sources.sources) ? sources.sources : []
    if (recorded.length === 0) {
      /*
       * Empty is legitimate only for a product that installs nothing from the
       * UI — Playground. The relationship flags decide which case this is, so
       * the check is that the two agree, not that sources is non-empty.
       */
      const relationship = sources.relationship
      if (!relationship || relationship.usesWebPackages) {
        errors.push(
          'release-strict: uiSources.sources is empty but relationship.usesWebPackages is true or missing',
        )
      }
    }
  }
  return errors
}

export function verifyUiProvenance(
  input: VerifyUiProvenanceInput,
): VerifyUiProvenanceResult {
  const level = input.level ?? 'release-strict'
  /*
   * `checkDocumentShape` reports a malformed document as an error, but the cast
   * below then reads `buildInfo.uiSources`. For `null`, `undefined` or a
   * non-object, that read throws a TypeError out of a function whose contract
   * is to return errors — so a caller validating a corrupt artifact crashed
   * with a stack trace instead of a structured failure. Bail out first.
   */
  const errors = checkDocumentShape(input.buildInfo, level)
  if (!isRecord(input.buildInfo)) return { errors, ok: false }
  const buildInfo = input.buildInfo as {
    uiSources?: UiSources
    uiCommit?: string
  }
  if (!isRecord(buildInfo.uiSources)) return { errors, ok: false }

  const result = verifyUiSources({
    sources: buildInfo.uiSources,
    manifestPath: input.manifestPath,
    root: input.root,
    lockfile: input.lockfile,
    ...(typeof buildInfo.uiCommit === 'string'
      ? { expectedPairingCommit: buildInfo.uiCommit }
      : {}),
    ...(input.attestationSources
      ? { attestationSources: input.attestationSources }
      : {}),
    level,
  })
  errors.push(...result.errors)
  return { errors, ok: errors.length === 0 }
}

/** Per-request and whole-run budgets, so a hung registry cannot stall CI. */
export interface NetworkBudget {
  readonly requestTimeoutMs?: number
  readonly totalTimeoutMs?: number
  readonly concurrency?: number
  readonly attempts?: number
  readonly baseDelayMs?: number
}

const DEFAULT_BUDGET: Required<NetworkBudget> = {
  requestTimeoutMs: 10_000,
  totalTimeoutMs: 180_000,
  concurrency: 4,
  attempts: 3,
  baseDelayMs: 300,
}

export interface FetchAttestationOptions extends NetworkBudget {
  readonly packages: readonly {
    readonly name: string
    readonly version: string
    /** The tarball's integrity from the lockfile, to bind the subject to bytes. */
    readonly integrity?: string
    /** The ref the release was cut from, when it is known. */
    readonly expectedRef?: string
  }[]
  readonly fetch?: typeof globalThis.fetch
  readonly registry?: string
  /** How to verify one bundle; injectable so tests need no network. */
  readonly verify?: typeof verifyAttestation
  /** Called for each package as it settles, for an auditable report. */
  readonly onResult?: (name: string, detail: string) => void
  /** Time source, injectable so the budget is testable. */
  readonly now?: () => number
}

export interface FetchedAttestations {
  /** Only packages whose full chain verified. */
  readonly verified: Record<string, VerifiedAttestation>
  /** Everything else, keyed by `name@version`, with why it was not trusted. */
  readonly failures: Record<string, ProvenanceStatus>
}

/**
 * Fetches and verifies provenance for each package, within a budget.
 *
 * Concurrency is bounded and every request is individually time-limited: 25
 * packages at 10s each, serialised, is four minutes of a CI job that would
 * otherwise take one. The total budget is a hard stop so a registry that
 * accepts connections and never answers fails the gate instead of hanging it.
 *
 * Status is deliberately four-way rather than a boolean. "Not published with
 * provenance", "published but the signature is wrong", "the registry is down"
 * and "the network died" need different responses from a human, and collapsing
 * them into `undefined` is what made the previous version unable to say which
 * had happened.
 */
export async function fetchAttestationSources(
  options: FetchAttestationOptions,
): Promise<FetchedAttestations> {
  const budget = { ...DEFAULT_BUDGET, ...stripUndefined(options) }
  const doFetch = options.fetch ?? globalThis.fetch
  const registry = options.registry ?? 'https://registry.npmjs.org'
  const verify = options.verify ?? verifyAttestation
  const now = options.now ?? Date.now
  const deadline = now() + budget.totalTimeoutMs

  const verified: Record<string, VerifiedAttestation> = {}
  const failures: Record<string, ProvenanceStatus> = {}

  const record = (
    key: string,
    status: ProvenanceStatus,
    detail: string,
  ): void => {
    if (status.state === 'verified') {
      verified[key] = status.attestation
    } else {
      failures[key] = status
    }
    options.onResult?.(key, `${status.state}: ${detail}`)
  }

  const settle = async (
    entry: FetchAttestationOptions['packages'][number],
  ): Promise<void> => {
    const key = `${entry.name}@${entry.version}`
    const url = attestationUrl(entry.name, entry.version, registry)
    let lastDetail = 'no attempt completed'

    for (let attempt = 1; attempt <= budget.attempts; attempt += 1) {
      if (now() >= deadline) {
        record(
          key,
          { state: 'infrastructure', detail: 'total budget exhausted' },
          'total budget exhausted before this package settled',
        )
        return
      }
      const remaining = Math.max(
        1,
        Math.min(budget.requestTimeoutMs, deadline - now()),
      )
      let response: Response
      try {
        response = await doFetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(remaining),
        })
      } catch (error) {
        const name = (error as Error).name
        lastDetail = `${name}: ${String((error as Error).message).slice(0, 120)}`
        /*
         * A timeout or a dropped connection says nothing about the package. It
         * is not the same as "no attestation", and the gate must not report it
         * as one — a maintainer who sees "unattested" reaches for loosening the
         * check, when the right response to an outage is to rerun.
         */
        if (attempt === budget.attempts) {
          record(
            key,
            { state: 'infrastructure', detail: lastDetail },
            lastDetail,
          )
          return
        }
        await sleep(backoff(budget.baseDelayMs, attempt))
        continue
      }

      if (response.status === 404) {
        record(
          key,
          { state: 'missing', detail: 'registry has no attestation' },
          'registry returned 404: this version carries no attestation',
        )
        return
      }
      if (response.status === 429 || response.status >= 500) {
        lastDetail = `HTTP ${response.status}`
        if (attempt === budget.attempts) {
          record(key, { state: 'retryable', detail: lastDetail }, lastDetail)
          return
        }
        /*
         * Honour `Retry-After` when the registry sends one; a 429 from npm
         * carries the delay it wants and ignoring it earns another 429.
         */
        const retryAfter = Number(response.headers.get('retry-after'))
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5_000)
            : backoff(budget.baseDelayMs, attempt)
        await sleep(delay)
        continue
      }
      if (!response.ok) {
        record(
          key,
          { state: 'infrastructure', detail: `HTTP ${response.status}` },
          `unexpected HTTP ${response.status}`,
        )
        return
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        lastDetail = 'response was not JSON'
        if (attempt === budget.attempts) {
          record(key, { state: 'retryable', detail: lastDetail }, lastDetail)
          return
        }
        await sleep(backoff(budget.baseDelayMs, attempt))
        continue
      }

      const bundle = findSlsaBundle(body)
      if (bundle === undefined) {
        record(
          key,
          { state: 'missing', detail: 'no SLSA v1 attestation' },
          'attestation list carries no slsa.dev/provenance/v1 entry',
        )
        return
      }

      const result = await verify(bundle, {
        name: entry.name,
        version: entry.version,
        ...(entry.expectedRef ? { expectedRef: entry.expectedRef } : {}),
        ...(entry.integrity ? { expectedSha512: entry.integrity } : {}),
      })
      if (result.ok) {
        record(
          key,
          { state: 'verified', attestation: result.attestation },
          `commit ${result.attestation.commit} by ${result.attestation.signerIdentity}`,
        )
      } else {
        record(
          key,
          { state: 'invalid', failure: result.failure },
          result.failure.detail,
        )
      }
      return
    }
  }

  /*
   * Bounded concurrency: a simple worker pool over a shared cursor. Unbounded
   * `Promise.all` over 25 packages would open 25 sockets and invite a 429.
   */
  let cursor = 0
  const workers = Array.from(
    {
      length: Math.max(
        1,
        Math.min(budget.concurrency, options.packages.length),
      ),
    },
    async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        const entry = options.packages[index]
        if (!entry) return
        await settle(entry)
      }
    },
  )
  await Promise.all(workers)
  return { verified, failures }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry
  }
  return out as Partial<T>
}

/** Exponential backoff with full jitter, so retries do not synchronise. */
function backoff(baseMs: number, attempt: number): number {
  const ceiling = baseMs * 2 ** (attempt - 1)
  return Math.floor(Math.random() * ceiling)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'build-info': { type: 'string' },
      manifest: { type: 'string' },
      lockfile: { type: 'string' },
      level: { type: 'string', default: 'release-strict' },
      'read-attestations': { type: 'boolean', default: false },
      'expected-ref': { type: 'string' },
      'request-timeout-ms': { type: 'string' },
      'total-timeout-ms': { type: 'string' },
      concurrency: { type: 'string' },
    },
  })
  if (!values['build-info']) throw new Error('--build-info is required')
  if (!values.manifest) throw new Error('--manifest is required')

  const root = process.cwd()
  const buildInfoPath = path.resolve(values['build-info'])
  if (!fs.existsSync(buildInfoPath)) {
    console.error(`ui provenance: no build-info at ${buildInfoPath}`)
    process.exit(1)
  }
  const lockfilePath = path.resolve(values.lockfile ?? 'pnpm-lock.yaml')
  if (!fs.existsSync(lockfilePath)) {
    console.error(`ui provenance: no lockfile at ${lockfilePath}`)
    process.exit(1)
  }
  const level =
    values.level === 'legacy-compatible'
      ? 'legacy-compatible'
      : 'release-strict'
  const buildInfo = JSON.parse(
    fs.readFileSync(buildInfoPath, 'utf8'),
  ) as unknown
  /*
   * Narrowed before the async closure. Keeping `values.manifest` inside it
   * loses the check above, because the closure can run after `values` is no
   * longer narrowed.
   */
  const manifestPath = path.resolve(values.manifest)
  const lockfile = fs.readFileSync(lockfilePath, 'utf8')

  void (async () => {
    let attestationSources: Record<string, { commit: string }> | undefined
    if (values['read-attestations']) {
      const sources = (buildInfo as { uiSources?: UiSources }).uiSources
      const registryPackages = (sources?.sources ?? []).filter(
        source => source.kind === 'registry',
      )
      const { verified, failures } = await fetchAttestationSources({
        packages: registryPackages.map(source => {
          const integrity =
            source.kind === 'registry'
              ? lockfileIntegrity(lockfile, source.package, source.version)
              : null
          return {
            name: source.package,
            version: source.version,
            ...(integrity ? { integrity } : {}),
            ...(values['expected-ref']
              ? { expectedRef: values['expected-ref'] }
              : {}),
          }
        }),
        ...(values['request-timeout-ms']
          ? { requestTimeoutMs: Number(values['request-timeout-ms']) }
          : {}),
        ...(values['total-timeout-ms']
          ? { totalTimeoutMs: Number(values['total-timeout-ms']) }
          : {}),
        ...(values.concurrency
          ? { concurrency: Number(values.concurrency) }
          : {}),
        onResult: (name, detail) => console.error(`  ${name}: ${detail}`),
      })
      attestationSources = Object.fromEntries(
        Object.entries(verified).map(([key, entry]) => [
          key,
          { commit: entry.commit },
        ]),
      )
      const counts = new Map<string, number>()
      for (const status of Object.values(failures)) {
        counts.set(status.state, (counts.get(status.state) ?? 0) + 1)
      }
      console.error(
        `ui provenance: verified ${Object.keys(verified).length}/${registryPackages.length}` +
          (counts.size
            ? ` (${[...counts].map(([k, v]) => `${k}: ${v}`).join(', ')})`
            : ''),
      )
    }

    const result = verifyUiProvenance({
      buildInfo,
      manifestPath,
      lockfile,
      root,
      level,
      ...(attestationSources ? { attestationSources } : {}),
    })
    if (!result.ok) {
      console.error(`ui provenance (${level}) FAILED:`)
      for (const error of result.errors.slice(0, 20))
        console.error(`  ${error}`)
      if (result.errors.length > 20) {
        console.error(`  … ${result.errors.length - 20} more`)
      }
      process.exit(1)
    }
    console.log(
      `ui provenance (${level}) ok: ${path.relative(root, buildInfoPath)}`,
    )
  })()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
