import { existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import pico from 'picocolors'

import { validateCycloneDxSchema } from './sbom-schema'
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

export interface SbomDependencyNode {
  readonly ref: string
  readonly dependsOn: readonly string[]
}

/**
 * The version recorded for a workspace package that declares none.
 *
 * Several `examples/*` manifests carry a name and no version. The SBOM still
 * has to record something, and both the generator and the readiness gate must
 * agree on what — a validator expecting an empty string while the generator
 * writes `0.0.0` fails every run for a difference that means nothing.
 */
export const DEFAULT_WORKSPACE_VERSION = '0.0.0'

export interface SbomComponent {
  readonly type: 'library'
  readonly scope?: 'required' | 'optional' | 'excluded'
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
    properties?: readonly { name: string; value: string }[]
  }
  components: readonly SbomComponent[]
  /**
   * The dependency graph, in CycloneDX form.
   *
   * Each entry names a component by `ref` and lists the `dependsOn` refs it
   * requires. The published packages appear here with an edge to every
   * third-party library they install, which is what makes the document a graph
   * rather than a list.
   */
  dependencies?: readonly SbomDependencyNode[]
}> {
  const timestamp =
    process.env.SOURCE_DATE_EPOCH === undefined
      ? new Date(0).toISOString()
      : new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()

  const workspaceComponents: SbomComponent[] = packages.map(pkg => ({
    type: 'library' as const,
    name: pkg.name,
    version: String(pkg.packageJson.version ?? DEFAULT_WORKSPACE_VERSION),
    'bom-ref': `${pkg.name}@${String(pkg.packageJson.version ?? DEFAULT_WORKSPACE_VERSION)}`,
    ...(pkg.packageJson.license === 'MIT'
      ? { licenses: [{ license: { id: 'MIT' as const } }] }
      : {}),
  }))

  /*
   * Third-party libraries become real components.
   *
   * They used to live in a custom top-level key, which the 1.5 schema rejects
   * as an additional property — the document could not be read by anything
   * that actually consumes the standard. A library a consumer will install
   * belongs in `components` alongside the packages this repository publishes.
   */
  const thirdParty = new Map<string, SbomComponent>()
  for (const dependency of runtimeDependencies) {
    const ref = `${dependency.name}@${dependency.version}`
    if (thirdParty.has(ref)) continue
    thirdParty.set(ref, {
      type: 'library' as const,
      name: dependency.name,
      version: dependency.version,
      'bom-ref': ref,
      scope: 'required' as const,
    })
  }

  // A ref collision between a workspace package and a third-party library
  // would make the graph ambiguous; the identity includes the version, so this
  // can only happen if a workspace package shares a name with a registry one.
  for (const ref of thirdParty.keys()) {
    if (workspaceComponents.some(component => component['bom-ref'] === ref)) {
      throw new Error(
        `bom-ref collision: ${ref} is both a workspace package and a registry dependency`,
      )
    }
  }

  const components = [...workspaceComponents, ...thirdParty.values()].sort(
    (left, right) => left['bom-ref'].localeCompare(right['bom-ref']),
  )

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp,
      tools: [{ vendor: 'Zeus', name: 'check-sbom', version: '1' }],
      /*
       * What this document covers, stated in the document.
       *
       * It lists every workspace package and the third-party libraries those
       * packages depend on *directly*. Transitive dependencies are not
       * modelled: the lockfile resolves roughly 490 package names for this
       * repository and this document carries about 83. A reader who assumes a
       * CycloneDX file is a complete bill of materials would be wrong here, and
       * the file has to say so rather than leave it to a code comment.
       *
       * `metadata.properties` is part of the 1.5 schema, so this does not
       * reintroduce the custom-key problem the old `zeus:runtimeDependencies`
       * field had.
       */
      properties: [
        {
          name: 'zeus:sbom:coverage',
          value: 'workspace-and-direct-runtime',
        },
        {
          name: 'zeus:sbom:transitive-dependencies',
          value: 'not-modelled',
        },
      ],
    },
    components,
    ...(runtimeDependencies.length > 0
      ? {
          dependencies: buildDependencyGraph(
            workspaceComponents,
            runtimeDependencies,
          ),
        }
      : {}),
  }
}

/**
 * CycloneDX `dependencies`: one node per component that has edges.
 *
 * A published package gets an edge to every library it installs. Each library
 * gets a node with no `dependsOn` — transitive edges are not modelled, which is
 * stated as a coverage limit rather than implied to be complete.
 */
export function buildDependencyGraph(
  workspaceComponents: readonly SbomComponent[],
  runtimeDependencies: readonly SbomRuntimeDependency[],
): SbomDependencyNode[] {
  const byPackage = new Map<string, string[]>()
  const libraryRefs = new Set<string>()
  for (const dependency of runtimeDependencies) {
    const ref = `${dependency.name}@${dependency.version}`
    libraryRefs.add(ref)
    for (const owner of dependency.requiredBy) {
      const list = byPackage.get(owner) ?? []
      list.push(ref)
      byPackage.set(owner, list)
    }
  }

  const nodes: SbomDependencyNode[] = []
  for (const component of workspaceComponents) {
    const dependsOn = byPackage.get(component.name)
    if (!dependsOn) continue
    nodes.push({
      ref: component['bom-ref'],
      dependsOn: [...new Set(dependsOn)].sort(),
    })
  }
  for (const ref of [...libraryRefs].sort()) {
    nodes.push({ ref, dependsOn: [] })
  }
  return nodes.sort((left, right) => (left.ref < right.ref ? -1 : 1))
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
  /*
   * Keyed by `name@version`, not by name.
   *
   * Two published packages can depend on different versions of the same
   * library. Keying by name merges them: one component is reported where there
   * are two, which hides a version — the direction of error that matters for a
   * bill of materials.
   */
  const byIdentity = new Map<
    string,
    { name: string; version: string; requiredBy: Set<string> }
  >()
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
      const identity = `${currentDependency}@${version}`
      const existing = byIdentity.get(identity) ?? {
        name: currentDependency,
        version,
        requiredBy: new Set<string>(),
      }
      existing.requiredBy.add(importerName)
      byIdentity.set(identity, existing)
    }
    currentDependency = undefined
  }
  return [...byIdentity.values()].map(entry => ({
    name: entry.name,
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
/**
 * Compares a document's dependency graph with the one the lockfile implies.
 *
 * The previous version compared only `name@version` from a custom field. That
 * left three things unverifiable:
 *
 * - **who requires what.** Moving a dependency from one published package to
 *   another kept the same `name@version` set and passed, even though the graph
 *   had changed.
 * - **duplicate refs.** Two components with one `bom-ref` make the graph
 *   ambiguous and were counted as one entry.
 * - **edges naming a component that is not in the document.** A `dependsOn`
 *   pointing at a missing ref is a dangling edge, and nothing checked it.
 *
 * Returns the list of problems rather than a boolean so a failure says what is
 * wrong instead of only that something is.
 */
export function dependencyGraphProblems(
  existing: unknown,
  expected: readonly SbomRuntimeDependency[],
  workspaceNames: readonly string[],
): string[] {
  const problems: string[] = []
  if (!isRecord(existing)) return ['document must be an object']
  const components = Array.isArray(existing.components)
    ? existing.components
    : []
  const dependencies = Array.isArray(existing.dependencies)
    ? existing.dependencies
    : []

  // 1. Every bom-ref is unique and well formed.
  const refs = new Map<string, number>()
  for (const component of components) {
    if (!isRecord(component)) continue
    const ref = component['bom-ref']
    if (typeof ref !== 'string' || ref === '') {
      problems.push('a component has no bom-ref')
      continue
    }
    refs.set(ref, (refs.get(ref) ?? 0) + 1)
  }
  for (const [ref, count] of refs) {
    if (count > 1) problems.push(`duplicate bom-ref: ${ref}`)
  }

  // 2. The dependency set matches the lockfile, by identity.
  const expectedRefs = new Set(
    expected.map(entry => `${entry.name}@${entry.version}`),
  )
  for (const ref of expectedRefs) {
    if (!refs.has(ref)) {
      problems.push(`missing component for a locked dependency: ${ref}`)
    }
  }
  /*
   * A workspace package is not "implied by the lockfile" — it is one of the
   * things the lockfile describes. Deciding by name prefix would miss
   * `create-zeus` and `zeus-ui`, which are workspace packages without the
   * `@zeus-*` scope.
   */
  const workspaceSet = new Set(workspaceNames)
  for (const ref of refs.keys()) {
    if (workspaceSet.has(ref.slice(0, ref.lastIndexOf('@')))) continue
    if (!expectedRefs.has(ref)) {
      problems.push(`component not implied by the lockfile: ${ref}`)
    }
  }

  // 3. Ownership: every published package's edges are exactly what the
  //    lockfile says it requires.
  const edges = new Map<string, Set<string>>()
  for (const node of dependencies) {
    if (!isRecord(node) || typeof node.ref !== 'string') continue
    const dependsOn = Array.isArray(node.dependsOn)
      ? node.dependsOn.filter(
          (value): value is string => typeof value === 'string',
        )
      : []
    edges.set(node.ref, new Set(dependsOn))
  }
  const expectedEdges = new Map<string, Set<string>>()
  for (const entry of expected) {
    const ref = `${entry.name}@${entry.version}`
    for (const owner of entry.requiredBy) {
      const set = expectedEdges.get(owner) ?? new Set<string>()
      set.add(ref)
      expectedEdges.set(owner, set)
    }
  }
  for (const name of workspaceNames) {
    const want = expectedEdges.get(name) ?? new Set<string>()
    if (want.size === 0) continue
    const found = [...edges.entries()].find(([ref]) =>
      ref.startsWith(`${name}@`),
    )
    if (!found) {
      problems.push(`${name} has no dependency node`)
      continue
    }
    const actual = found[1]
    for (const ref of want) {
      if (!actual.has(ref)) {
        problems.push(`${name} is missing an edge to ${ref}`)
      }
    }
    for (const ref of actual) {
      if (!want.has(ref)) {
        problems.push(
          `${name} has an edge to ${ref} that the lockfile does not imply`,
        )
      }
    }
  }

  // 4. No dangling edges: every dependsOn must name a component present here.
  for (const [ref, targets] of edges) {
    if (!refs.has(ref)) {
      problems.push(`dependency node names a missing component: ${ref}`)
    }
    for (const target of targets) {
      if (!refs.has(target)) {
        problems.push(`dangling edge: ${ref} -> ${target}`)
      }
    }
  }

  return problems
}

/** Backwards-compatible boolean wrapper over `dependencyGraphProblems`. */
export function runtimeDependenciesMatch(
  existing: unknown,
  expected: readonly SbomRuntimeDependency[],
  workspaceNames: readonly string[] = [],
): boolean {
  return (
    dependencyGraphProblems(existing, expected, workspaceNames).length === 0
  )
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

  /*
   * The document the generator just produced must satisfy the official schema.
   * Without this, `check:sbom` verified that the committed file matched what
   * the generator emits — useful, but it says nothing about whether either one
   * is a valid CycloneDX document. A generator bug that emitted a malformed
   * file would have been checked in and reported current.
   */
  const generatedSchema = validateCycloneDxSchema(
    JSON.parse(JSON.stringify(sbom)),
  )
  if (!generatedSchema.valid) {
    throw new Error(
      `generated SBOM does not validate against CycloneDX 1.5: ${generatedSchema.errors
        .slice(0, 5)
        .join('; ')}`,
    )
  }

  if (check) {
    const existing = JSON.parse(await fs.readFile(output, 'utf8')) as unknown
    /*
     * And the committed one, through the same validator `check:rc-readiness`
     * uses. Two entry points disagreeing about whether a file is valid is how
     * a gate stops meaning anything.
     */
    const committedSchema = validateCycloneDxSchema(existing)
    if (!committedSchema.valid) {
      throw new Error(
        `committed SBOM does not validate against CycloneDX 1.5: ${committedSchema.errors
          .slice(0, 5)
          .join('; ')}`,
      )
    }
    if (!sbomComponentsMatch(existing, sbom)) {
      throw new Error('SBOM is stale; run `pnpm check:sbom:write`.')
    }
    /*
     * The full workspace list, not just the published subset: `components`
     * contains every workspace package, and the "not implied by the lockfile"
     * rule must not flag the ones this repository merely builds.
     */
    const graphProblems = dependencyGraphProblems(
      existing,
      runtimeDependencies,
      findWorkspacePackages().map(pkg => pkg.name),
    )
    if (graphProblems.length > 0) {
      throw new Error(
        `SBOM dependency graph is stale; run \`pnpm check:sbom:write\`.\n  ${graphProblems.slice(0, 10).join('\n  ')}`,
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
