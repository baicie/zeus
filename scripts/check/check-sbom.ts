import { existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

/**
 * A dependency a published package will install from a registry.
 *
 * The `components` array lists this repository's own packages — what the build
 * produced. It says nothing about what a consumer's `npm install` will pull in,
 * which is the other half of a bill of materials. These entries record that
 * half: every `@zeus-js/*` package's non-workspace dependency, at the version
 * the lockfile resolved.
 */
export interface SbomRuntimeDependency {
  readonly name: string
  readonly version: string
  /** The published packages that depend on it. */
  readonly requiredBy: readonly string[]
}

export interface SbomComponent {
  readonly type: 'library'
  readonly name: string
  readonly version: string
  readonly 'bom-ref': string
  readonly licenses?: readonly { readonly license: { readonly id: string } }[]
}

export async function createSbom(
  packages: Awaited<ReturnType<typeof findWorkspacePackages>>,
  runtimeDependencies: readonly SbomRuntimeDependency[] = [],
): Promise<{
  bomFormat: 'CycloneDX'
  specVersion: '1.5'
  version: 1
  metadata: {
    timestamp: string
    tools: readonly { vendor: string; name: string; version: string }[]
  }
  components: readonly SbomComponent[]
  /**
   * Registry dependencies of the published packages.
   *
   * Absent means the document only describes what this repository built.
   * `check:sbom` rejects a document whose list does not match the lockfile, so
   * a stale or hand-edited set fails rather than being trusted.
   */
  'zeus:runtimeDependencies'?: readonly SbomRuntimeDependency[]
}> {
  const timestamp =
    process.env.SOURCE_DATE_EPOCH === undefined
      ? new Date(0).toISOString()
      : new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp,
      tools: [{ vendor: 'Zeus', name: 'check-sbom', version: '1' }],
    },
    components: packages
      .map(pkg => ({
        type: 'library' as const,
        name: pkg.name,
        version: String(pkg.packageJson.version ?? '0.0.0'),
        'bom-ref': `${pkg.name}@${String(pkg.packageJson.version ?? '0.0.0')}`,
        ...(pkg.packageJson.license === 'MIT'
          ? { licenses: [{ license: { id: 'MIT' as const } }] }
          : {}),
      }))
      .sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref'])),
    ...(runtimeDependencies.length > 0
      ? {
          'zeus:runtimeDependencies': [...runtimeDependencies].sort(
            (left, right) => (left.name < right.name ? -1 : 1),
          ),
        }
      : {}),
  }
}

/**
 * Collects the registry dependencies of the published packages.
 *
 * Read from the lockfile rather than the manifests: the manifest carries a
 * range (`^1.2.3`), the lockfile carries the version that will actually be
 * installed, and a bill of materials is about the latter.
 */
export function collectRuntimeDependencies(
  lockfile: string,
  /**
   * Map from lockfile importer path (e.g. `packages/core/zeus`) to package
   * name. The lockfile keys importers by directory, not by package name.
   */
  publishedByPath: Readonly<Record<string, string>>,
): SbomRuntimeDependency[] {
  const byName = new Map<string, { version: string; requiredBy: Set<string> }>()
  // `importers:` entries are two-space indented keys ending in a colon.
  const lines = lockfile.split('\n')
  let inImporters = false
  let currentImporter: string | undefined
  let currentSection: string | undefined
  let currentDependency: string | undefined
  for (const line of lines) {
    if (/^importers:\s*$/.test(line)) {
      inImporters = true
      continue
    }
    if (inImporters && /^\S/.test(line) && !/^importers:/.test(line)) {
      inImporters = false
    }
    if (!inImporters) continue
    const importer = /^ {2}(\S.*):\s*$/.exec(line)
    if (importer) {
      currentImporter = importer[1]
      currentSection = undefined
      currentDependency = undefined
      continue
    }
    /*
     * Runtime only. A consumer's install pulls `dependencies` and
     * `optionalDependencies`; `devDependencies` never leave this repository,
     * and listing them would claim a supply-chain surface the published
     * package does not have.
     */
    const section = /^ {4}(dependencies|optionalDependencies):\s*$/.exec(line)
    if (section) {
      currentSection = section[1]
      currentDependency = undefined
      continue
    }
    // Any other section (devDependencies included) ends dependency collection.
    if (/^ {4}\S.*:\s*$/.test(line)) {
      currentSection = undefined
      currentDependency = undefined
      continue
    }
    // A dependency name can be quoted or bare.
    const dependency = /^ {6}'?([^':]+)'?:\s*$/.exec(line)
    if (dependency && currentSection) {
      currentDependency = dependency[1]
      continue
    }
    if (!currentDependency || !currentSection || !currentImporter) continue
    const resolved = /^ {8}version:\s*(.+)$/.exec(line)
    if (!resolved) continue
    // Only record dependencies of packages this repository publishes.
    const importerPath = currentImporter.replace(/^\.\//, '')
    const importerName = publishedByPath[importerPath]
    if (importerName && !currentDependency.startsWith('@zeus-js/')) {
      const version = (resolved[1] ?? '').trim().replace(/\(.*\)$/, '')
      const existing = byName.get(currentDependency) ?? {
        version,
        requiredBy: new Set<string>(),
      }
      existing.requiredBy.add(importerName)
      byName.set(currentDependency, existing)
    }
    currentDependency = undefined
  }
  return [...byName.entries()].map(([name, entry]) => ({
    name,
    version: entry.version,
    requiredBy: [...entry.requiredBy].sort(),
  }))
}

export function sbomComponentsMatch(
  existing: unknown,
  expected: { readonly components: readonly Pick<SbomComponent, 'bom-ref'>[] },
): boolean {
  if (!isRecord(existing) || !Array.isArray(existing.components)) return false

  const actualRefs: string[] = []
  for (const component of existing.components) {
    if (!isRecord(component) || typeof component['bom-ref'] !== 'string') {
      return false
    }
    actualRefs.push(component['bom-ref'])
  }
  if (actualRefs.length === 0) return false

  const expectedRefs = expected.components
    .map(component => component['bom-ref'])
    .sort()
  actualRefs.sort()
  return (
    actualRefs.length === expectedRefs.length &&
    actualRefs.every((ref, index) => ref === expectedRefs[index])
  )
}

/**
 * Whether a document's recorded runtime dependencies match the lockfile.
 *
 * Separate from the component check because the two answer different
 * questions: components are what this repository built, runtime dependencies
 * are what a consumer will install. A document can be right about one and
 * stale about the other.
 */
export function runtimeDependenciesMatch(
  existing: unknown,
  expected: readonly SbomRuntimeDependency[],
): boolean {
  if (!isRecord(existing)) return false
  const recorded = existing['zeus:runtimeDependencies']
  if (!Array.isArray(recorded)) return expected.length === 0
  if (recorded.length !== expected.length) return false
  const key = (entry: { name: string; version: string }): string =>
    `${entry.name}@${entry.version}`
  const actual = recorded
    .map(entry =>
      isRecord(entry) && typeof entry.name === 'string'
        ? `${entry.name}@${String(entry.version)}`
        : '',
    )
    .sort()
  const want = expected.map(key).sort()
  return actual.every((value, index) => value === want[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The locked versions of every package this repository publishes, keyed by the
 * importer path the lockfile uses.
 */
function publishedImporters(): Record<string, string> {
  const lockfile = readFileSync(path.resolve('pnpm-lock.yaml'), 'utf8')
  const config = readFileSync(path.resolve('scripts/release.config.ts'), 'utf8')
  const block = /export const zeusFixedPackages = \[([\s\S]*?)\]/.exec(config)
  const names = new Set(
    [...(block?.[1] ?? '').matchAll(/@(zeus-js\/[a-z0-9-]+)/g)].map(
      match => `@${match[1]}`,
    ),
  )
  const importers: Record<string, string> = {}
  // Every importer path under `packages/` that the release set publishes.
  for (const match of lockfile.matchAll(/^ {2}(packages\/[^:]+):\s*$/gm)) {
    const relative = match[1] as string
    const manifestPath = path.resolve(relative, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string
    }
    if (manifest.name && names.has(manifest.name)) {
      importers[relative] = manifest.name
    }
  }
  return importers
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const output = path.resolve('temp/sbom/zeus.cdx.json')
  const importers = publishedImporters()
  const runtimeDependencies = collectRuntimeDependencies(
    readFileSync(path.resolve('pnpm-lock.yaml'), 'utf8'),
    importers,
  )
  const sbom = await createSbom(findWorkspacePackages(), runtimeDependencies)
  if (check) {
    const existing = JSON.parse(await fs.readFile(output, 'utf8')) as unknown
    if (!sbomComponentsMatch(existing, sbom)) {
      throw new Error('SBOM is stale; run `pnpm check:sbom:write`.')
    }
    if (!runtimeDependenciesMatch(existing, runtimeDependencies)) {
      throw new Error(
        'SBOM runtime dependencies are stale; run `pnpm check:sbom:write`.',
      )
    }
    console.log(
      pico.green(
        `SBOM is current (${sbom.components.length} components, ${runtimeDependencies.length} runtime dependencies).`,
      ),
    )
    return
  }
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(sbom, null, 2)}\n`)
  console.log(
    pico.green(`SBOM written to ${path.relative(process.cwd(), output)}.`),
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(
      pico.red(error instanceof Error ? error.message : String(error)),
    )
    process.exitCode = 1
  })
}
