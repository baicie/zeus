/**
 * Verifies a built `build-info.json` against the repository it was built from.
 *
 * `verifyUiSources` existed but had no caller outside its own tests: the strict
 * checks were written and never run against a real artifact. This is that
 * caller — it reads a `build-info.json`, a `package.json` and `pnpm-lock.yaml`,
 * and fails the process rather than printing a report nobody reads.
 *
 * It deliberately re-reads the lockfile instead of trusting one recorded in the
 * document. Verifying a build against a lockfile other than the one it was
 * built from would pass a document whose bytes came from somewhere else.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { verifyUiSources, type UiSources } from './ui-sources'

export interface VerifyUiProvenanceInput {
  readonly buildInfo: unknown
  readonly manifestPath: string
  readonly lockfile: string
  readonly root: string
  readonly level?: 'legacy-compatible' | 'release-strict'
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
    level,
  })
  errors.push(...result.errors)
  return { errors, ok: errors.length === 0 }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'build-info': { type: 'string' },
      manifest: { type: 'string' },
      lockfile: { type: 'string' },
      level: { type: 'string', default: 'release-strict' },
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

  const result = verifyUiProvenance({
    buildInfo: JSON.parse(fs.readFileSync(buildInfoPath, 'utf8')) as unknown,
    manifestPath: path.resolve(values.manifest),
    lockfile: fs.readFileSync(lockfilePath, 'utf8'),
    root,
    level,
  })
  if (!result.ok) {
    console.error(`ui provenance (${level}) FAILED:`)
    for (const error of result.errors.slice(0, 20)) console.error(`  ${error}`)
    if (result.errors.length > 20) {
      console.error(`  … ${result.errors.length - 20} more`)
    }
    process.exit(1)
  }
  console.log(
    `ui provenance (${level}) ok: ${path.relative(root, buildInfoPath)}`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
