/**
 * The Core registry verification report a pairing amendment is accepted on.
 *
 * ## Why this exists
 *
 * The amendment's evidence bundle carries five reports, and one of them says
 * "the Core release this UI is paired with is really on the registry: every
 * package in the group, at the exact version, tagged `rc`, with integrity and
 * a platform binary for every target". That claim has to come from a command a
 * reader can rerun, not from a JSON file someone wrote by hand.
 *
 * The first version of the evidence was exactly that: five digests pointing at
 * files produced by ad-hoc shell commands during the release. A digest of a
 * file nobody can regenerate proves the author had it once. This turns the
 * claim into a query.
 *
 * ## What it refuses to do
 *
 * It does not report a rate-limited or offline registry as "not published".
 * `inspectPackage` already separates a 404 from every other failure, and this
 * script fails outright on any `failed` package rather than counting it as
 * missing — a count of 31 with one unanswered package is not a finding.
 *
 * Usage:
 *
 * ```text
 * tsx scripts/release/core-registry-verification.ts \
 *   --version 0.2.0-rc.8 \
 *   [--registry https://registry.npmjs.org] \
 *   [--out temp/release/core-registry-verification.json]
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import { auditGroup, type PackageState } from './audit-release-group'
import { attestationUrl } from './ui-attestation'

export const CORE_REGISTRY_REPORT_SCHEMA = 'zeus.core-registry-verification/v1'

export interface CoreRegistryReport {
  readonly schema: typeof CORE_REGISTRY_REPORT_SCHEMA
  readonly version: string
  readonly registry: string
  /** Packages in the fixed release group. */
  readonly checked: number
  /** Of those, how many resolve to exactly this version. */
  readonly exactVersion: number
  /** Of those, how many carry an `rc` dist-tag pointing at this version. */
  readonly rcTag: number
  /** Native platform packages that published a binary. */
  readonly platformBinaries: number
  /**
   * How many packages have a prerelease `latest`.
   *
   * Recorded, not asserted: it is the historical baseline (`latest` must not
   * follow an rc publish), and the number changing between two runs is the
   * signal that a publish polluted it.
   */
  readonly prereleaseLatestCount: number
  /** Packages whose registry metadata carries a dist integrity digest. */
  readonly integrityRecorded: number
  /** Where the SLSA attestation for each package lives. */
  readonly provenance: ReadonlyArray<{
    readonly name: string
    readonly url: string
  }>
  readonly verifiedAt: string
}

/** Which of the group's packages are native platform binaries. */
export function platformPackageNames(
  packages: readonly PackageState[],
): readonly string[] {
  return packages
    .filter(entry => /compiler-native-(?:darwin|linux|win32)-/.test(entry.name))
    .filter(entry => entry.published)
    .map(entry => entry.name)
}

/**
 * Builds the report from an audit.
 *
 * Pure, so the counting rules are testable without a registry. Each number is
 * derived from the same per-package state, and `checked` is the group size —
 * not the number of successful queries — so a query that failed cannot make the
 * other counts look complete.
 */
export function buildCoreRegistryReport(
  version: string,
  registry: string,
  packages: readonly PackageState[],
  groupSize: number,
): CoreRegistryReport {
  const published = packages.filter(entry => entry.published)
  return {
    schema: CORE_REGISTRY_REPORT_SCHEMA,
    version,
    registry,
    checked: groupSize,
    exactVersion: published.length,
    rcTag: published.filter(entry => entry.tags?.includes('rc')).length,
    platformBinaries: platformPackageNames(packages).length,
    prereleaseLatestCount: packages.filter(
      entry => entry.latest?.includes('-') === true,
    ).length,
    integrityRecorded: published.filter(
      entry =>
        typeof entry.integrity === 'string' && entry.integrity.length > 0,
    ).length,
    provenance: packages.map(entry => ({
      name: entry.name,
      url: attestationUrl(entry.name, version, registry),
    })),
    verifiedAt: new Date().toISOString(),
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      registry: { type: 'string' },
      out: { type: 'string' },
    },
  })

  const version = values.version
  if (!version) {
    throw new Error(
      'usage: core-registry-verification --version <v> [--registry <url>] [--out <path>]',
    )
  }
  const registry = values.registry ?? 'https://registry.npmjs.org'

  const audit = await auditGroup(version, registry)

  /*
   * A failed query is not a missing package. Counting it as one would report
   * "31 of 32 published" for a release that is fine and a registry that is
   * busy, and the reader would go looking for the wrong problem.
   */
  if (audit.failed > 0) {
    const failed = audit.packages
      .filter(entry => entry.error)
      .map(entry => `${entry.name}: ${entry.error}`)
    throw new Error(
      `the registry could not answer for ${failed.length} package(s); this is not a finding about the release:\n${failed.join('\n')}`,
    )
  }

  const report = buildCoreRegistryReport(
    version,
    registry,
    audit.packages,
    zeusFixedPackages.length,
  )

  const out =
    values.out ??
    path.join(
      path.resolve(import.meta.dirname, '../..'),
      'temp/release',
      'core-registry-verification.json',
    )
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)

  console.log(
    `core registry ${version}: ${report.exactVersion}/${report.checked} exact, ` +
      `${report.rcTag}/${report.checked} rc-tagged, ${report.platformBinaries} platform binaries, ` +
      `${report.integrityRecorded}/${report.checked} with integrity`,
  )
  console.log(`wrote ${out}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
