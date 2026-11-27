/**
 * Pure helpers for the create-zeus candidate tarball gate.
 *
 * The gate must prove that a user can install every template from isolated
 * tarballs, not from workspace links or the registry beta. pnpm applies a
 * `pnpm.overrides` entry to direct and transitive edges alike, so one override
 * map keeps every copy of a candidate package on the same tarball while the
 * template keeps its realistic version pins.
 */
import fs from 'node:fs'
import path from 'node:path'

export interface CandidateTemplate {
  readonly name: string
  /** Build outputs that must exist after `vite build`; `*` is a wildcard. */
  readonly outputs: readonly string[]
}

export const COMPONENT_LIBRARY_OUTPUTS = [
  'dist/custom-elements.json',
  'dist/zeus.components.json',
  'dist/wc/auto.js',
  'dist/wc/index.js',
  'dist/wc/z-greeting.entry.js',
  'dist/react/index.js',
  'dist/vue/index.js',
] as const

const APPLICATION_OUTPUTS = [
  'dist/index.html',
  'dist/assets/index-*.js',
] as const

export const CANDIDATE_TEMPLATES: readonly CandidateTemplate[] = [
  { name: 'basic-ts', outputs: APPLICATION_OUTPUTS },
  { name: 'application-ts', outputs: APPLICATION_OUTPUTS },
  { name: 'admin-ts', outputs: APPLICATION_OUTPUTS },
  { name: 'web-component-ts', outputs: APPLICATION_OUTPUTS },
  {
    name: 'component-library-ts',
    outputs: [...COMPONENT_LIBRARY_OUTPUTS, 'dist/assets/index-*.js'],
  },
  { name: 'webc-consumer-ts', outputs: APPLICATION_OUTPUTS },
]

export interface WorkspacePackage {
  readonly name: string
  readonly version: string
  readonly directory: string
  readonly manifest: PackageManifest
}

export interface PackageManifest {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  overrides?: Record<string, string>
  scripts?: Record<string, string>
  [key: string]: unknown
}

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'temp',
  'templates',
  '.git',
  '.turbo',
])

/** Converts an absolute archive path to a portable npm `file:` spec. */
export function toFileSpec(file: string): string {
  const normalized = path.resolve(file).replace(/\\/g, '/')
  return `file:${normalized}`
}

/**
 * Discovers every package.json under `<root>/packages`.
 *
 * Duplicate package names are rejected: the override map is keyed by name, so
 * a duplicate would silently gate the wrong directory.
 */
export function discoverWorkspacePackages(
  root: string,
): Map<string, WorkspacePackage> {
  const packages = new Map<string, WorkspacePackage>()
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue
        visit(path.join(directory, entry.name))
        continue
      }
      if (entry.name !== 'package.json') continue
      const manifest = JSON.parse(
        fs.readFileSync(path.join(directory, entry.name), 'utf8'),
      ) as PackageManifest
      if (!manifest.name) continue
      if (packages.has(manifest.name)) {
        throw new Error(
          `duplicate workspace package ${manifest.name}: ${packages.get(manifest.name)!.directory} and ${directory}`,
        )
      }
      packages.set(manifest.name, {
        name: manifest.name,
        version: manifest.version ?? '0.0.0',
        directory,
        manifest,
      })
    }
  }
  visit(path.join(root, 'packages'))
  return packages
}

/**
 * Returns `roots` and their transitive workspace dependencies, deduplicated
 * and sorted by name. Dependencies that are not in `packages` (for example a
 * Core package referenced from a UI checkout) are ignored.
 */
export function collectWorkspaceClosure(
  packages: Map<string, WorkspacePackage>,
  roots: readonly string[],
): WorkspacePackage[] {
  const selected = new Map<string, WorkspacePackage>()
  const visit = (name: string): void => {
    if (selected.has(name)) return
    const workspacePackage = packages.get(name)
    if (!workspacePackage) return
    selected.set(name, workspacePackage)
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const) {
      for (const dependency of Object.keys(
        workspacePackage.manifest[field] ?? {},
      )) {
        visit(dependency)
      }
    }
  }
  for (const root of roots) visit(root)
  return [...selected.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export interface PinMismatch {
  readonly name: string
  readonly actual: string
  readonly expected: string
}

/**
 * Compares every direct template dependency against the candidate version map.
 * Dependencies not present in the map are ignored; the caller decides whether
 * an unknown Core package is an error.
 */
export function templatePinMismatches(
  manifest: PackageManifest,
  expected: ReadonlyMap<string, string>,
): PinMismatch[] {
  const mismatches: PinMismatch[] = []
  for (const field of ['dependencies', 'devDependencies'] as const) {
    for (const [name, actual] of Object.entries(manifest[field] ?? {})) {
      const candidate = expected.get(name)
      if (candidate && actual !== candidate) {
        mismatches.push({ name, actual, expected: candidate })
      }
    }
  }
  return mismatches
}

/**
 * Puts every candidate package in `pnpm.overrides`, including packages that
 * are direct template dependencies. pnpm applies an override to both the
 * direct edge and every transitive edge, so the template keeps its realistic
 * version pins while the install resolves every copy to the same tarball.
 * (npm refuses this shape with EOVERRIDE; the gate uses pnpm deliberately.)
 *
 * Returns a new manifest; the input is not mutated.
 */
export function applyCandidateManifest(
  manifest: PackageManifest,
  candidates: Map<string, string>,
): {
  manifest: PackageManifest
  direct: string[]
  overrides: Record<string, string>
} {
  const next = structuredClone(manifest)
  const direct = Object.keys({
    ...(next.dependencies ?? {}),
    ...(next.devDependencies ?? {}),
  })
    .filter(name => candidates.has(name))
    .sort()
  const existingPnpm = isRecord(next.pnpm) ? next.pnpm : {}
  const existingOverrides = isRecord(existingPnpm.overrides)
    ? (existingPnpm.overrides as Record<string, string>)
    : {}
  const overrides: Record<string, string> = {
    ...existingOverrides,
    ...Object.fromEntries(candidates),
  }
  next.pnpm = { ...existingPnpm, overrides }

  return { manifest: next, direct, overrides }
}

/**
 * What the declared candidate archives must satisfy before anything is packed.
 *
 * Three separate facts, and each failure mode produces a different wrong
 * answer downstream:
 *
 * - a missing archive means the release would publish a package nobody built;
 * - a digest mismatch means the bytes being verified are not the bytes the
 *   record describes, so every later statement about this candidate is about a
 *   different artifact;
 * - a version mismatch means the tag, the manifest, and the tarball disagree,
 *   and the one users install is whichever npm happens to pick.
 *
 * Returning the problems rather than throwing keeps the decision inspectable;
 * the caller turns them into the failure it wants.
 */
export function candidateArchiveProblems(
  expected: ReadonlyMap<string, string>,
  entries: ReadonlyMap<
    string,
    { sha256?: string; version?: string; exists: boolean }
  >,
  digests: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = []
  for (const [name, version] of expected) {
    const entry = entries.get(name)
    if (!entry?.sha256 || !entry.exists) {
      problems.push(`candidate archive is missing for ${name}`)
      continue
    }
    const digest = digests.get(name)
    if (digest !== entry.sha256) {
      problems.push(`candidate archive digest mismatch for ${name}`)
    }
    if (entry.version !== version) {
      problems.push(`candidate archive version mismatch for ${name}`)
    }
  }
  return problems
}

/**
 * Gives a template a concrete edge to every peer its candidates declare.
 *
 * An override rewrites an edge that already exists. A *peer* is resolved by the
 * dependent, not by the package that declares it, and the template never names
 * it — so `pnpm.overrides` cannot point it anywhere.
 *
 * `@zeus-web/button` peers on `@zeus-js/zeus`, which at candidate time is
 * deliberately unpublished. Without an edge the install asks the registry for
 * it and fails with ERR_PNPM_NO_MATCHING_VERSION, and the template is blamed for
 * a dependency it never declared. Adding the candidate as a direct dependency
 * gives the peer a version it can satisfy — from the tarball, not the registry —
 * and leaves every pin the template does declare untouched.
 *
 * Only peers that are themselves candidates are added, so this cannot pull in a
 * package the release is not building.
 */
export function addPeerEdges(
  manifest: PackageManifest,
  candidates: ReadonlyMap<string, string>,
  peerNames: Iterable<string>,
): PackageManifest {
  const missing = [...peerNames].filter(
    name =>
      candidates.has(name) &&
      !manifest.dependencies?.[name] &&
      !manifest.devDependencies?.[name],
  )
  if (missing.length === 0) return manifest
  return {
    ...manifest,
    dependencies: {
      ...(manifest.dependencies ?? {}),
      ...Object.fromEntries(missing.map(name => [name, candidates.get(name)!])),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Tests an exact output path or a `prefix-*suffix` pattern. */
export function templateOutputExists(target: string, output: string): boolean {
  if (!output.includes('*')) {
    return fs.existsSync(path.join(target, output))
  }
  const directory = path.dirname(output)
  const [prefix, suffix] = path.basename(output).split('*')
  const absolute = path.join(target, directory)
  return (
    fs.existsSync(absolute) &&
    fs
      .readdirSync(absolute)
      .some(
        file => file.startsWith(prefix ?? '') && file.endsWith(suffix ?? ''),
      )
  )
}

/** Asserts that files the candidate packages need exist before `pnpm pack`. */
export function assertCandidateInputsBuilt(
  coreRoot: string,
  uiRoot?: string,
): void {
  const required = [
    path.join(coreRoot, 'packages/core/zeus/dist/zeus.esm-bundler.js'),
    path.join(coreRoot, 'packages/core/zeus/dist/zeus.d.ts'),
    path.join(
      coreRoot,
      'packages/tooling/vite-plugin/dist/vite-plugin.esm-bundler.js',
    ),
    path.join(coreRoot, 'packages/tooling/vite-plugin/dist/vite-plugin.d.ts'),
    ...(uiRoot
      ? [
          path.join(uiRoot, 'packages/primitives/button/dist/wc/index.js'),
          path.join(uiRoot, 'packages/primitives/button/dist/wc/index.d.ts'),
          path.join(uiRoot, 'packages/zeus-compat/dist/index.js'),
          path.join(uiRoot, 'packages/zeus-compat/dist/index.d.ts'),
        ]
      : []),
  ]
  const missing = required.filter(file => !fs.existsSync(file))
  if (missing.length > 0) {
    throw new Error(
      `candidate inputs are not built; run Core pnpm build && pnpm build-dts and UI build button first:\n${missing.join('\n')}`,
    )
  }

  assertBuiltArtifactsMatchTheirManifests(coreRoot, uiRoot)
}

/**
 * The built files must belong to the versions their manifests now declare.
 *
 * "The file exists" is not the claim the candidate matrix makes. It packs
 * whatever is in `dist/`, so a tree whose version was bumped after its last
 * build produces tarballs named `0.2.0-rc.7` containing `0.2.0-rc.6` code —
 * measured exactly that on this repository: a version switch ran at 17:44 and
 * every `dist/*.esm-bundler.js` still carried the `v0.2.0-rc.6` banner from a
 * 15:50 build.
 *
 * The failure it caused was expensive to read: the candidate gate verified the
 * pair, the templates installed, built, and then failed at run time with
 * "Cannot track a reactive value with a different Zeus signal engine", because
 * a stale bundle carried a second copy of the signal engine. Every symptom
 * pointed at the templates.
 *
 * Only the version banner is checked. Comparing whole files would need a build
 * to compare against; the banner is written from the manifest at build time, so
 * a mismatch means the artifact predates the bump.
 */
export function assertBuiltArtifactsMatchTheirManifests(
  coreRoot: string,
  uiRoot?: string,
): void {
  const checks: Array<{ label: string; manifest: string; artifact: string }> = [
    {
      label: '@zeus-js/zeus',
      manifest: path.join(coreRoot, 'packages/core/zeus/package.json'),
      artifact: path.join(
        coreRoot,
        'packages/core/zeus/dist/zeus.esm-bundler.js',
      ),
    },
    {
      label: '@zeus-js/signal',
      manifest: path.join(coreRoot, 'packages/core/signal/package.json'),
      artifact: path.join(
        coreRoot,
        'packages/core/signal/dist/signal.esm-bundler.js',
      ),
    },
    {
      label: '@zeus-js/runtime-dom',
      manifest: path.join(coreRoot, 'packages/core/runtime-dom/package.json'),
      artifact: path.join(
        coreRoot,
        'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
      ),
    },
  ]

  const stale: string[] = []
  for (const check of checks) {
    if (!fs.existsSync(check.manifest) || !fs.existsSync(check.artifact))
      continue
    const version = (
      JSON.parse(fs.readFileSync(check.manifest, 'utf8')) as {
        version?: string
      }
    ).version
    if (!version) continue
    /*
     * The banner is the first block of the file. Reading a fixed prefix keeps
     * this cheap — the bundles are megabytes and the banner is 200 bytes.
     */
    const head = fs.readFileSync(check.artifact, 'utf8').slice(0, 512)
    if (!head.includes(`v${version}`)) {
      const found =
        /v\d+\.\d+\.\d+[0-9A-Za-z.-]*/.exec(head)?.[0] ?? 'no version banner'
      stale.push(
        `${check.label}: manifest says ${version}, the built file says ${found}`,
      )
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `candidate inputs are stale; rebuild before packing them:\n${stale.join('\n')}`,
    )
  }
}

/** Fails unless the host platform package contains a native binary. */
export function assertCurrentNativeBinary(coreRoot: string): void {
  const platformPackage =
    process.platform === 'darwin'
      ? `compiler-native-darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
      : process.platform === 'win32'
        ? `compiler-native-win32-${process.arch === 'arm64' ? 'arm64' : 'x64'}-msvc`
        : `compiler-native-linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}-gnu`
  const directory = path.join(coreRoot, 'packages/compiler', platformPackage)
  const binaries = fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.node'))
  if (binaries.length === 0) {
    throw new Error(
      `native binary for ${process.platform}/${process.arch} is missing from ${directory}; build it with native:build:platform`,
    )
  }
}

/** Returns the expected build outputs for a template. */
export function templateOutputs(
  template: string,
  templates: readonly CandidateTemplate[] = CANDIDATE_TEMPLATES,
): readonly string[] {
  const entry = templates.find(item => item.name === template)
  if (!entry) throw new Error(`unknown create-zeus template: ${template}`)
  return entry.outputs
}
