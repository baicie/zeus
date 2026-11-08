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
  /** Build output that must exist after `vite build`. */
  readonly output: string
}

export const CANDIDATE_TEMPLATES: readonly CandidateTemplate[] = [
  { name: 'basic-ts', output: 'dist/index.html' },
  { name: 'application-ts', output: 'dist/index.html' },
  { name: 'admin-ts', output: 'dist/index.html' },
  { name: 'web-component-ts', output: 'dist/index.html' },
  { name: 'component-library-ts', output: 'dist/assets/index-*.js' },
  { name: 'webc-consumer-ts', output: 'dist/index.html' },
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

/**
 * Puts every candidate package in `pnpm.overrides`, including packages that
 * are direct template dependencies. pnpm applies an override to both the
 * direct edge and every transitive edge, so the template keeps its realistic
 * version pins while the install resolves every copy to the same tarball.
 * (npm refuses this shape with EOVERRIDE; the gate uses pnpm deliberately.)
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
      'packages/devtools/vite-plugin/dist/vite-plugin.esm-bundler.js',
    ),
    path.join(coreRoot, 'packages/devtools/vite-plugin/dist/vite-plugin.d.ts'),
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
}

/** Fails unless the host platform package contains a native binary. */
export function assertCurrentNativeBinary(coreRoot: string): void {
  const platformPackage =
    process.platform === 'darwin'
      ? `compiler-native-darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`
      : process.platform === 'win32'
        ? `compiler-native-win32-${process.arch === 'arm64' ? 'arm64' : 'x64'}-msvc`
        : `compiler-native-linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}-gnu`
  const directory = path.join(coreRoot, 'packages/core', platformPackage)
  const binaries = fs
    .readdirSync(directory)
    .filter(file => file.endsWith('.node'))
  if (binaries.length === 0) {
    throw new Error(
      `native binary for ${process.platform}/${process.arch} is missing from ${directory}; build it with native:build:platform`,
    )
  }
}

/** Returns the expected build output for a template. */
export function templateOutput(
  template: string,
  templates: readonly CandidateTemplate[] = CANDIDATE_TEMPLATES,
): string {
  const entry = templates.find(item => item.name === template)
  if (!entry) throw new Error(`unknown create-zeus template: ${template}`)
  return entry.output
}
