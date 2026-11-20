/**
 * The staged publication contract: what a canary run must have produced.
 *
 * Two contracts exist during a release and they are easy to confuse:
 *
 * - **Source contract** — the committed tree: package set, versions, paths.
 *   `package-table.spec.ts` owns it, and it reads `HEAD` so a staging rewrite
 *   cannot move the ground it stands on.
 * - **Staged publication contract** — the working tree *after*
 *   `release:version-packages` has rewritten the fixed group to a canary
 *   version. This module owns it.
 *
 * They must not stand in for each other. When the source check ran against the
 * staged tree it reported 32 "mismatches" that were the release working as
 * designed; when the staged check is skipped, a half-rewritten tree publishes
 * under a tag that claims otherwise.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface Manifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export interface StagedProblem {
  readonly package: string
  readonly problem: string
}

/** Reads the fixed release group's manifests from the working tree. */
export function readStagedManifests(
  root: string,
  fixedPackages: readonly string[],
): { manifests: Map<string, Manifest>; missing: string[] } {
  const manifests = new Map<string, Manifest>()
  const missing: string[] = []

  const packagesDir = path.join(root, 'packages')
  for (const domain of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!domain.isDirectory() || domain.name === 'node_modules') continue
    const domainDir = path.join(packagesDir, domain.name)
    for (const pkg of fs.readdirSync(domainDir, { withFileTypes: true })) {
      if (!pkg.isDirectory() || pkg.name === 'node_modules') continue
      const manifestPath = path.join(domainDir, pkg.name, 'package.json')
      if (!fs.existsSync(manifestPath)) continue
      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8'),
      ) as Manifest
      if (manifest.name && fixedPackages.includes(manifest.name)) {
        manifests.set(manifest.name, manifest)
      }
    }
  }

  for (const name of fixedPackages) {
    if (!manifests.has(name)) missing.push(name)
  }
  return { manifests, missing }
}

/** The version `release:version-packages` was asked to produce. */
export function expectedStagedVersion(
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const version = environment.ZEUS_CANARY_VERSION ?? environment.CANARY_VERSION
  return version && version.length > 0 ? version : undefined
}

/**
 * Every way the staged tree can disagree with the version it claims.
 *
 * Returns problems rather than throwing so a caller can print all of them: a
 * half-rewritten tree usually has more than one.
 */
export function checkStagedContract(
  manifests: ReadonlyMap<string, Manifest>,
  missing: readonly string[],
  fixedPackages: readonly string[],
  expectedVersion: string,
): StagedProblem[] {
  const problems: StagedProblem[] = []

  for (const name of missing) {
    problems.push({
      package: name,
      problem: 'manifest is missing from the tree',
    })
  }

  for (const name of fixedPackages) {
    const manifest = manifests.get(name)
    if (!manifest) continue

    if (manifest.version !== expectedVersion) {
      problems.push({
        package: name,
        problem: `version is ${manifest.version}, expected ${expectedVersion}`,
      })
    }
  }

  return problems
}

/**
 * Internal dependencies that still name a concrete version rather than the
 * workspace protocol.
 *
 * A workspace-protocol range resolves to whatever the manifest says, so it is
 * correct in a staged tree by construction. A pinned version is a copy that
 * the rewrite has to update, and is where a half-finished rewrite shows up.
 */
export function pinnedInternalDependencies(
  manifests: ReadonlyMap<string, Manifest>,
  fixedPackages: readonly string[],
  expectedVersion: string,
): StagedProblem[] {
  const problems: StagedProblem[] = []

  for (const [name, manifest] of manifests) {
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const) {
      for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
        if (!fixedPackages.includes(dependency)) continue
        if (range.startsWith('workspace:')) continue
        const pinned = range.replace(/^[~^]/, '')
        if (pinned !== expectedVersion) {
          problems.push({
            package: name,
            problem: `${field}.${dependency} pins ${range}, expected ${expectedVersion}`,
          })
        }
      }
    }
  }

  return problems
}

/** Whether the working tree differs from `HEAD` for any tracked file. */
export function workingTreeIsDirty(root: string): boolean {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf-8',
  })
  return status.trim().length > 0
}
