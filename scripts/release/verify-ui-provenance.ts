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
 * `--read-attestations` fetches the SLSA v1 commit for each package so the
 * strict check has evidence to compare rather than a record of ignorance.
 *
 * It deliberately re-reads the lockfile instead of trusting one recorded in the
 * document. Verifying a build against a lockfile other than the one it was
 * built from would pass a document whose bytes came from somewhere else.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { readAttestationSource, type AttestationSource } from './ui-attestation'
import { verifyUiSources, type UiSources } from './ui-sources'

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
    if (!Array.isArray(sources.sources) || sources.sources.length === 0) {
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
  const errors = checkDocumentShape(input.buildInfo, level)
  const buildInfo = input.buildInfo as {
    uiSources?: UiSources
    uiCommit?: string
  }
  if (!buildInfo.uiSources) return { errors, ok: false }

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

/**
 * Reads the SLSA source commit for every registry package the document names.
 *
 * Without this the strict check has nothing to compare against, and the only
 * document the pipeline can produce records `UNVERIFIED` for every package.
 * A missing or unreadable attestation is not an error here — the package simply
 * has no answer, and strict mode reports that as a failed check rather than
 * pretending the commit was verified.
 */
export async function fetchAttestationSources(options: {
  readonly packages: readonly {
    readonly name: string
    readonly version: string
  }[]
  readonly fetch?: typeof globalThis.fetch
  readonly registry?: string
}): Promise<Record<string, { commit: string; repository: string }>> {
  const doFetch = options.fetch ?? globalThis.fetch
  const registry = options.registry ?? 'https://registry.npmjs.org'
  const found: Record<string, { commit: string; repository: string }> = {}
  for (const { name, version } of options.packages) {
    /*
     * The registry route wants the scope slash encoded (`@scope%2fpkg`) but the
     * `@` between package and version left alone. Encoding the whole
     * `name@version` turns that `@` into `%40`, which the registry does not
     * route — the request 404s and every package looks unattested.
     */
    const url = `${registry}/-/npm/v1/attestations/${encodeURIComponent(
      name,
    ).replace('%40', '@')}@${version}`
    /*
     * A registry that returns 5xx or drops the connection is a different fact
     * from a package that was published without provenance: the first says
     * nothing about the package, the second says it is unattested. Retrying
     * keeps a transient outage from failing a gate over a package whose
     * attestation is present and correct.
     */
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await doFetch(url, {
          headers: { accept: 'application/json' },
        })
        // A 404 is an answer: this version has no attestation to read.
        if (response.status === 404) break
        if (!response.ok) {
          if (attempt === 3) break
          continue
        }
        const source: AttestationSource | undefined = readAttestationSource(
          (await response.json()) as unknown,
        )
        if (source) {
          found[`${name}@${version}`] = {
            commit: source.commit,
            repository: source.repository,
          }
        }
        break
      } catch {
        /*
         * Left unattested after the final attempt. Strict mode turns that into
         * a named failure; it must not be swallowed here into a green run,
         * which is why the caller passes this result through rather than
         * defaulting it.
         */
        if (attempt === 3) break
      }
    }
  }
  return found
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'build-info': { type: 'string' },
      manifest: { type: 'string' },
      lockfile: { type: 'string' },
      level: { type: 'string', default: 'release-strict' },
      'read-attestations': { type: 'boolean', default: false },
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

  void (async () => {
    /*
     * Strict mode requires an attested commit for every registry package. The
     * only way to have one is to read it, so the flag exists rather than the
     * check silently passing on a document that never looked.
     */
    let attestationSources:
      | Record<string, { commit: string; repository: string }>
      | undefined
    if (values['read-attestations']) {
      const sources = (buildInfo as { uiSources?: UiSources }).uiSources
      const registry = (sources?.sources ?? []).filter(
        source => source.kind === 'registry',
      )
      attestationSources = await fetchAttestationSources({
        packages: registry.map(source => ({
          name: source.package,
          version: source.version,
        })),
      })
      console.error(
        `ui provenance: read ${Object.keys(attestationSources).length}/${registry.length} attestations`,
      )
    }

    const result = verifyUiProvenance({
      buildInfo,
      manifestPath,
      lockfile: fs.readFileSync(lockfilePath, 'utf8'),
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
