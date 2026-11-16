/**
 * Rewrites the release group to a rehearsal version without touching git.
 *
 * The release version source is `@zeus-js/zeus`, not the private root
 * package. `zeusFixedPackages` plus the independently versioned
 * `@zeus-js/vite-plugin` are rewritten in place, and every exact
 * `@zeus-js/*` pin in the create-zeus templates follows the same version.
 * The caller is responsible for restoring the worktree afterwards.
 */
import { execFileSync } from 'node:child_process'
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

  /*
   * The root manifest and the Cargo workspace carry the version too.
   *
   * Measured while rehearsing 0.2.0-rc.0: this function moved all 32 published
   * packages to the target version and left the root `package.json` at
   * `0.1.1-beta.20` and `Cargo.toml`'s `[workspace.package] version` at
   * `0.1.1-beta.0`. The rehearsal then reported success, because "every version
   * it looked at" matched — it just did not look at those two.
   *
   * A release that ships 32 packages at one version while the repository claims
   * another produces artifacts nobody can trace back to a single tree.
   */
  const rootManifestFile = loadPlannedFile(
    files,
    root,
    path.join(root, 'package.json'),
  )
  const rootManifest = parseManifest(
    rootManifestFile.original,
    rootManifestFile.file,
  )
  const rootBefore =
    typeof rootManifest.version === 'string'
      ? rootManifest.version
      : '(missing)'
  if (rootBefore !== options.version) {
    rootManifest.version = options.version
    const edit: VersionRehearsalEdit = {
      file: rootManifestFile.file,
      kind: 'package-version',
      packageName: '(root)',
      before: rootBefore,
      after: options.version,
    }
    rootManifestFile.edits.push(edit)
    edits.push(edit)
    rootManifestFile.updated = serialize(
      rootManifest,
      rootManifestFile.original,
    )
  }

  /*
   * `Cargo.toml` has no JSON manifest, so it is edited as text. The version
   * lives under `[workspace.package]` and every crate inherits it through
   * `version.workspace = true`.
   *
   * The section body is bounded at the next table header. A bare
   * `[\s\S]*?` search does not stop there: when `[workspace.package]` has no
   * version line, the lazy match walks into whatever section follows and
   * rewrites that section's version instead — silently, since the rewrite
   * still counts as one edit. Measured: a `[package] version = "9.9.9"`
   * further down became the target and `[workspace.package]` was untouched.
   *
   * A malformed section is a hard failure rather than a skip. Skipping is the
   * bug this whole function exists to remove: the run then rewrites 39 files,
   * leaves Cargo behind, and reports success because every version it looked
   * at matched.
   */
  const cargoPath = path.join(root, 'Cargo.toml')
  if (fs.existsSync(cargoPath)) {
    const cargoFile = loadPlannedFile(files, root, cargoPath)
    const cargoMatch =
      /(\[workspace\.package\][^\[]*?\nversion = ")([^"]+)(")/.exec(
        cargoFile.original,
      )
    if (!cargoMatch) {
      throw new Error(
        `${cargoFile.file} has no "version" line under [workspace.package]; the workspace version cannot be moved with the packages`,
      )
    }
    const before = cargoMatch[2] as string
    if (before !== options.version) {
      cargoFile.updated = cargoFile.original.replace(
        cargoMatch[0],
        `${cargoMatch[1]}${options.version}${cargoMatch[3]}`,
      )
      const edit: VersionRehearsalEdit = {
        file: cargoFile.file,
        kind: 'package-version',
        packageName: '(cargo workspace)',
        before,
        after: options.version,
      }
      cargoFile.edits.push(edit)
      edits.push(edit)
    }
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

/** A file the write pass could not replace, and whether its original survived. */
export interface WriteFailure {
  readonly file: string
  readonly message: string
  /** Whether the original bytes were restored. */
  readonly rolledBack: boolean
}

export interface WriteOutcome {
  /** Files whose new contents are on disk. */
  readonly written: readonly string[]
  /** Files whose write failed. Empty on success. */
  readonly failures: readonly WriteFailure[]
  /**
   * True when every file either landed or was restored. `false` means the tree
   * is in a mixed state and a human must look at it.
   */
  readonly rolledBack: boolean
}

/**
 * Writes every planned file, or none of them.
 *
 * The previous version looped `writeFileSync` over the plan. A failure partway
 * through left the tree half-bumped: some packages at the new version, others
 * at the old, with nothing recording which. That is worse than not starting,
 * because the tree still builds and the mismatch surfaces much later.
 *
 * Three properties, each of which the loop did not have:
 *
 * 1. **Stage before writing.** Every new payload is written to a sibling
 *    temporary file first. A failure while staging touches no target file.
 * 2. **Rename, not truncate.** `rename` is atomic within a filesystem, so a
 *    reader never sees a partial file. The original bytes are kept in memory
 *    so a later failure can put them back.
 * 3. **Roll back on failure, and say so when the rollback itself fails.**
 *    A silent restore attempt is how a half-written tree gets reported as
 *    clean; `rolledBack: false` is a state the caller must surface.
 */
/**
 * The filesystem operations the write pass uses.
 *
 * Narrow on purpose: the pass needs exactly these three, and a seam this small
 * is what lets the rollback paths be tested by making a real operation fail
 * instead of asserting on a mock's call count.
 */
export interface RehearsalFileSystem {
  writeFileSync(file: string, data: string): void
  renameSync(from: string, to: string): void
  rmSync(file: string): void
}

const nodeFileSystem: RehearsalFileSystem = {
  writeFileSync: (file, data) => fs.writeFileSync(file, data),
  renameSync: (from, to) => fs.renameSync(from, to),
  rmSync: file => fs.rmSync(file, { force: true }),
}

export function writeVersionRehearsalPlan(
  plan: VersionRehearsalPlan,
  io: RehearsalFileSystem = nodeFileSystem,
): WriteOutcome {
  const staged: { file: PlannedFile; temporary: string }[] = []
  const written: string[] = []
  const failures: WriteFailure[] = []

  /*
   * Stage everything first. A staging failure costs nothing to undo: the
   * targets are untouched, so the only cleanup is removing temporaries.
   */
  for (const file of plan.files) {
    const temporary = `${file.absoluteFile}.zeus-rehearsal-${
      typeof process.pid === 'number' ? process.pid : 'tmp'
    }.tmp`
    try {
      io.writeFileSync(temporary, file.updated)
      staged.push({ file, temporary })
    } catch (error) {
      for (const entry of staged) {
        try {
          io.rmSync(entry.temporary)
        } catch {
          // A leftover temporary file is not a version change; it is noise in
          // a directory listing, and reporting it would bury the real error.
        }
      }
      return {
        written: [],
        failures: [
          {
            file: file.file,
            message: `could not stage: ${error instanceof Error ? error.message : String(error)}`,
            rolledBack: true,
          },
        ],
        rolledBack: true,
      }
    }
  }

  /*
   * Promote. From here a failure leaves earlier files already replaced, so the
   * originals kept in `Plan` are the only way back.
   */
  for (const entry of staged) {
    try {
      io.renameSync(entry.temporary, entry.file.absoluteFile)
      written.push(entry.file.file)
    } catch (error) {
      failures.push({
        file: entry.file.file,
        message: error instanceof Error ? error.message : String(error),
        rolledBack: false,
      })
      break
    }
  }

  if (failures.length === 0) {
    return { written, failures: [], rolledBack: false }
  }

  /*
   * Roll back what landed. `written` names the files whose new contents are on
   * disk; their originals are still on the plan.
   */
  const restored: string[] = []
  const unrestored: WriteFailure[] = []
  for (const name of written) {
    const entry = staged.find(item => item.file.file === name)
    if (!entry) continue
    try {
      io.writeFileSync(entry.file.absoluteFile, entry.file.original)
      restored.push(name)
    } catch (error) {
      unrestored.push({
        file: name,
        message: `rollback failed: ${error instanceof Error ? error.message : String(error)}`,
        rolledBack: false,
      })
    }
  }

  /* Temporaries for entries that never landed are still on disk. */
  for (const entry of staged) {
    if (written.includes(entry.file.file)) continue
    try {
      io.rmSync(entry.temporary)
    } catch {
      // Same reasoning as above: a stray temp file does not change a version.
    }
  }

  const rolledBack = unrestored.length === 0
  return {
    written: restored,
    failures: [
      ...failures.map(failure => ({
        ...failure,
        rolledBack: restored.includes(failure.file),
      })),
      ...unrestored,
    ],
    rolledBack,
  }
}

/**
 * Applies the planned rewrites and returns the report payload.
 *
 * Throws rather than returning a partial report. A caller that cannot tell
 * "wrote everything" from "wrote some of it" will treat both as success.
 */
export function applyVersionRehearsal(
  options: VersionRehearsalOptions,
): VersionRehearsalReport {
  const plan = collectVersionRehearsal(options)
  const outcome = writeVersionRehearsalPlan(plan)
  if (outcome.failures.length > 0) {
    const detail = outcome.failures
      .map(failure => `${failure.file}: ${failure.message}`)
      .join('; ')
    const state = outcome.rolledBack
      ? 'every file was restored'
      : 'the tree is in a MIXED state and needs manual repair'
    throw new Error(`version rehearsal write failed (${state}): ${detail}`)
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

/**
 * Why `--apply` is refused, or `undefined` when it may proceed.
 *
 * The CLI used to write unconditionally, which is how a rehearsal run against
 * the wrong directory rewrote a real `main` checkout. Three guards, each
 * closing a different way of being in the wrong place:
 *
 * - the root must be a git repository, so "the tree I am about to change" is
 *   something a person can inspect and revert;
 * - the branch must not be `main`, because a version bump belongs on a
 *   candidate branch and a detached HEAD on `main` is exactly the state a
 *   release rehearsal starts from;
 * - the worktree must be clean, so the write is attributable and revertible.
 *
 * A dry run skips all three: it writes nothing, and refusing to *show* a plan
 * because the tree is dirty would make the safe mode the one that cannot be
 * used while iterating.
 */
export function reviewApplyGuard(root: string): string | undefined {
  const run = (args: string[]): string | undefined => {
    try {
      return execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    } catch {
      return undefined
    }
  }
  const inside = run(['rev-parse', '--is-inside-work-tree'])
  if (inside !== 'true') {
    return `${root} is not a git worktree; a version switch must be revertible with git`
  }
  /*
   * `--abbrev-ref HEAD` prints the literal string `HEAD` on a detached
   * checkout, which is not a branch name and compares equal to nothing — so a
   * detached worktree pointing at a `main` commit passed the guard. That is
   * precisely the state a rehearsal starts from (`git checkout <sha>`), and
   * it is the one where "which branch am I on" has no answer to trust.
   *
   * A detached HEAD is refused outright: a version bump must land on a named
   * branch, or the commit that carries it has nowhere to go.
   */
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === undefined) {
    return `cannot determine the branch of ${root}`
  }
  if (branch === 'HEAD') {
    return `the worktree at ${root} has a detached HEAD; a version switch must land on a named branch`
  }
  if (branch === 'main' || branch === 'master') {
    return `refusing to rewrite versions on ${branch}; run the rehearsal on a candidate branch`
  }
  const status = run(['status', '--porcelain'])
  if (status === undefined) {
    return `cannot read the worktree status of ${root}`
  }
  if (status.length > 0) {
    return `the worktree at ${root} has uncommitted changes; a version switch on top of them could not be attributed or reverted`
  }
  return undefined
}

function main(): void {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      root: { type: 'string' },
      out: { type: 'string', default: 'temp/release/version-rehearsal.json' },
      /**
       * Write the plan. Absent means dry run, which is the default because a
       * rehearsal that writes by default is one mistyped path away from
       * bumping the wrong tree.
       */
      apply: { type: 'boolean', default: false },
      /**
       * Skip the git guards. Only for a directory that is not a checkout but
       * is still disposable, such as an extracted archive in a scratch dir.
       */
      'allow-non-git': { type: 'boolean', default: false },
    },
  })
  if (!values.version) {
    console.error(
      'usage: tsx scripts/release/version-rehearsal.ts --version <X.Y.Z-rc.N> [--root <path>] [--out <file>] [--apply]',
    )
    process.exitCode = 2
    return
  }
  try {
    const root = path.resolve(values.root ?? process.cwd())
    if (!values.apply) {
      /*
       * Dry run: collect the plan, print it, write nothing. The report file is
       * still written because it is evidence of what *would* change, and it is
       * outside the tree being rehearsed when `--out` points elsewhere.
       */
      const plan = collectVersionRehearsal({ root, version: values.version })
      const outFile = path.resolve(root, values.out!)
      writeVersionRehearsalReport(
        {
          schema: VERSION_REHEARSAL_SCHEMA,
          version: plan.version,
          root,
          generatedAt: new Date().toISOString(),
          edits: plan.edits,
          modifiedFiles: plan.modifiedFiles,
          skippedPins: plan.skippedPins,
        },
        outFile,
      )
      console.log(
        `dry run: would rewrite ${plan.modifiedFiles.length} file(s) to ${plan.version}: ${plan.edits.length} edit(s)`,
      )
      for (const file of plan.modifiedFiles) {
        console.log(`  ${file.file} (${file.edits})`)
      }
      for (const edit of plan.edits) {
        console.log(
          `  ${edit.file}${edit.field ? `:${edit.field}` : ''} ${edit.packageName}: ${edit.before} -> ${edit.after}`,
        )
      }
      if (plan.skippedPins.length > 0) {
        console.log(
          `left ${plan.skippedPins.length} non-exact pin(s) unchanged`,
        )
      }
      console.log(`\nnothing was written to ${root}. Re-run with --apply.`)
      return
    }

    if (!values['allow-non-git']) {
      const refusal = reviewApplyGuard(root)
      if (refusal) {
        console.error(`refusing --apply: ${refusal}`)
        process.exitCode = 1
        return
      }
    }

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
