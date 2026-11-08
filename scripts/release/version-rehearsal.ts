/**
 * Rewrites the release group to a rehearsal version without touching git.
 *
 * The release version source is `@zeus-js/zeus`, not the private root
 * package. `zeusFixedPackages` plus the independently versioned
 * `@zeus-js/vite-plugin` are rewritten in place, and every exact
 * `@zeus-js/*` pin in the create-zeus templates follows the same version.
 * The caller is responsible for restoring the worktree afterwards.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'

export const VERSION_REHEARSAL_SCHEMA = 'zeus.version-rehearsal/v1'

const VITE_PLUGIN_PACKAGE = '@zeus-js/vite-plugin'
const DEFAULT_PACKAGE_ROOT = 'packages'
const DEFAULT_TEMPLATES_ROOT = path.join(
  'packages',
  'devtools',
  'create-zeus',
  'templates',
)
const TEMPLATE_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'temp',
  'templates',
])
const RC_VERSION_PATTERN = /^\d+\.\d+\.\d+-rc\.[0-9]+$/
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

export type VersionRehearsalEditKind = 'package-version' | 'template-pin'

export interface VersionRehearsalEdit {
  readonly file: string
  readonly kind: VersionRehearsalEditKind
  readonly packageName: string
  readonly field?: string
  readonly before: string
  readonly after: string
}

export interface SkippedTemplatePin {
  readonly file: string
  readonly packageName: string
  readonly field: string
  readonly before: string
  readonly reason: string
}

export interface VersionRehearsalFileChange {
  readonly file: string
  readonly edits: number
}

export interface VersionRehearsalReport {
  readonly schema: typeof VERSION_REHEARSAL_SCHEMA
  readonly version: string
  readonly root: string
  readonly generatedAt: string
  readonly edits: VersionRehearsalEdit[]
  readonly modifiedFiles: VersionRehearsalFileChange[]
  readonly skippedPins: SkippedTemplatePin[]
}

export interface VersionRehearsalOptions {
  readonly root: string
  readonly version: string
  /** Defaults to the fixed release group from `scripts/release.config.ts`. */
  readonly fixedPackages?: readonly string[]
  /** Defaults to `<root>/packages`. */
  readonly packageRoot?: string
  /** Defaults to `<root>/packages/devtools/create-zeus/templates`. */
  readonly templatesRoot?: string
}

interface PlannedFile {
  readonly absoluteFile: string
  readonly file: string
  readonly original: string
  updated: string
  edits: VersionRehearsalEdit[]
}

interface WorkspacePackage {
  readonly name: string
  readonly directory: string
  readonly file: string
}

export interface VersionRehearsalPlan {
  readonly version: string
  readonly files: PlannedFile[]
  readonly edits: VersionRehearsalEdit[]
  readonly modifiedFiles: VersionRehearsalFileChange[]
  readonly skippedPins: SkippedTemplatePin[]
}

/** Fails closed unless the version is a concrete RC (`X.Y.Z-rc.N`). */
export function assertRcVersion(version: string): void {
  if (!RC_VERSION_PATTERN.test(version)) {
    throw new Error(
      `rehearsal version must be an RC version matching X.Y.Z-rc.N, received: ${JSON.stringify(version)}`,
    )
  }
}

/**
 * Plans every rewrite and validates the whole workspace before touching disk.
 * Missing or duplicate release packages abort the plan.
 */
export function collectVersionRehearsal(
  options: VersionRehearsalOptions,
): VersionRehearsalPlan {
  assertRcVersion(options.version)

  const root = path.resolve(options.root)
  const fixedPackages = collectTargetPackages(
    options.fixedPackages ?? zeusFixedPackages,
  )
  const packageRoot = options.packageRoot ?? DEFAULT_PACKAGE_ROOT
  const templatesRoot =
    options.templatesRoot ?? path.join(root, DEFAULT_TEMPLATES_ROOT)
  const packages = discoverWorkspacePackages(path.join(root, packageRoot), root)

  const missing = fixedPackages.filter(name => !packages.has(name))
  if (missing.length > 0) {
    throw new Error(
      `fixed release packages are missing from the workspace: ${missing.join(', ')}`,
    )
  }

  const files = new Map<string, PlannedFile>()
  const edits: VersionRehearsalEdit[] = []
  const skippedPins: SkippedTemplatePin[] = []

  for (const packageName of fixedPackages) {
    const workspacePackage = packages.get(packageName)!
    const planned = loadPlannedFile(files, root, workspacePackage.file)
    const manifest = parseManifest(planned.original, planned.file)
    const before =
      typeof manifest.version === 'string' ? manifest.version : '(missing)'
    if (before === options.version) continue
    manifest.version = options.version
    const edit: VersionRehearsalEdit = {
      file: planned.file,
      kind: 'package-version',
      packageName,
      before,
      after: options.version,
    }
    planned.edits.push(edit)
    edits.push(edit)
    planned.updated = serialize(manifest, planned.original)
  }

  for (const templateFile of templateFiles(templatesRoot)) {
    const planned = loadPlannedFile(files, root, templateFile)
    const manifest = parseManifest(planned.original, planned.file)
    let changed = false
    for (const field of TEMPLATE_DEPENDENCY_FIELDS) {
      const dependencies = manifest[field]
      if (!isRecord(dependencies)) continue
      for (const [packageName, raw] of Object.entries(dependencies)) {
        if (!packageName.startsWith('@zeus-js/')) continue
        if (typeof raw !== 'string') continue
        const displayField = `${field}.${packageName}`
        if (!EXACT_VERSION_PATTERN.test(raw)) {
          skippedPins.push({
            file: planned.file,
            packageName,
            field,
            before: raw,
            reason: 'not an exact version pin; left unchanged',
          })
          continue
        }
        if (raw === options.version) continue
        dependencies[packageName] = options.version
        const edit: VersionRehearsalEdit = {
          file: planned.file,
          kind: 'template-pin',
          packageName,
          field: displayField,
          before: raw,
          after: options.version,
        }
        planned.edits.push(edit)
        edits.push(edit)
        changed = true
      }
    }
    if (changed) planned.updated = serialize(manifest, planned.original)
  }

  const changedFiles = [...files.values()].filter(
    planned => planned.edits.length > 0,
  )
  changedFiles.sort((a, b) => a.file.localeCompare(b.file))
  edits.sort(compareEdits)

  return {
    version: options.version,
    files: changedFiles,
    edits,
    modifiedFiles: changedFiles.map(planned => ({
      file: planned.file,
      edits: planned.edits.length,
    })),
    skippedPins: skippedPins.sort((a, b) =>
      `${a.file}:${a.field}:${a.packageName}`.localeCompare(
        `${b.file}:${b.field}:${b.packageName}`,
      ),
    ),
  }
}

/** Applies the planned rewrites and returns the report payload. */
export function applyVersionRehearsal(
  options: VersionRehearsalOptions,
): VersionRehearsalReport {
  const plan = collectVersionRehearsal(options)
  for (const file of plan.files) {
    fs.writeFileSync(file.absoluteFile, file.updated)
  }
  return {
    schema: VERSION_REHEARSAL_SCHEMA,
    version: plan.version,
    root: path.resolve(options.root),
    generatedAt: new Date().toISOString(),
    edits: plan.edits,
    modifiedFiles: plan.modifiedFiles,
    skippedPins: plan.skippedPins,
  }
}

export function writeVersionRehearsalReport(
  report: VersionRehearsalReport,
  file: string,
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
}

function collectTargetPackages(
  fixedPackages: readonly string[],
): readonly string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const name of [...fixedPackages, VITE_PLUGIN_PACKAGE]) {
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

function discoverWorkspacePackages(
  packageRoot: string,
  root: string,
): Map<string, WorkspacePackage> {
  if (!fs.existsSync(packageRoot)) {
    throw new Error(`workspace package root does not exist: ${packageRoot}`)
  }

  const packages = new Map<string, WorkspacePackage>()
  const seenDirectories = new Map<string, string>()

  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue
        visit(absolute)
        continue
      }
      if (entry.name !== 'package.json') continue
      const manifest = JSON.parse(fs.readFileSync(absolute, 'utf8')) as {
        name?: unknown
      }
      if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
        continue
      }
      const previous = seenDirectories.get(manifest.name)
      if (previous) {
        throw new Error(
          `duplicate workspace package ${manifest.name}: ${toPosix(path.relative(root, previous))} and ${toPosix(path.relative(root, absolute))}`,
        )
      }
      seenDirectories.set(manifest.name, absolute)
      packages.set(manifest.name, {
        name: manifest.name,
        directory,
        file: absolute,
      })
    }
  }

  visit(packageRoot)
  return packages
}

function loadPlannedFile(
  files: Map<string, PlannedFile>,
  root: string,
  absoluteFile: string,
): PlannedFile {
  const file = toPosix(path.relative(root, absoluteFile))
  const existing = files.get(file)
  if (existing) return existing
  const original = fs.readFileSync(absoluteFile, 'utf8')
  const planned: PlannedFile = {
    absoluteFile,
    file,
    original,
    updated: original,
    edits: [],
  }
  files.set(file, planned)
  return planned
}

function parseManifest(source: string, file: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error(
      `cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!isRecord(parsed)) {
    throw new Error(`expected ${file} to contain a JSON object`)
  }
  return parsed
}

function serialize(value: unknown, original: string): string {
  const indentation = original.match(/^[\t ]+"/m)
  const indent = indentation ? indentation[0].slice(0, -1) : '  '
  const trailingNewline = original.endsWith('\n') ? '\n' : ''
  return `${JSON.stringify(value, null, indent)}${trailingNewline}`
}

function templateFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    throw new Error(`create-zeus templates directory is missing: ${root}`)
  }
  const files: string[] = []
  const visit = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && entry.name === 'package.json')
        files.push(absolute)
    }
  }
  visit(root)
  return files.sort()
}

function compareEdits(
  a: VersionRehearsalEdit,
  b: VersionRehearsalEdit,
): number {
  return (
    a.file.localeCompare(b.file) ||
    (a.field ?? '').localeCompare(b.field ?? '') ||
    a.packageName.localeCompare(b.packageName)
  )
}

function toPosix(file: string): string {
  return file.split(path.sep).join('/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function main(): void {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      root: { type: 'string' },
      out: { type: 'string', default: 'temp/release/version-rehearsal.json' },
    },
  })
  if (!values.version) {
    console.error(
      'usage: tsx scripts/release/version-rehearsal.ts --version <X.Y.Z-rc.N> [--root <path>] [--out <file>]',
    )
    process.exitCode = 2
    return
  }
  try {
    const root = path.resolve(values.root ?? process.cwd())
    const report = applyVersionRehearsal({
      root,
      version: values.version,
    })
    writeVersionRehearsalReport(report, path.resolve(root, values.out!))
    console.log(
      `rewrote ${report.modifiedFiles.length} file(s) to ${report.version}: ${report.edits.length} edit(s)`,
    )
    for (const file of report.modifiedFiles) {
      console.log(`  ${file.file} (${file.edits})`)
    }
    if (report.skippedPins.length > 0) {
      console.log(
        `left ${report.skippedPins.length} non-exact pin(s) unchanged`,
      )
    }
  } catch (error) {
    console.error(
      `version rehearsal failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
