/**
 * The root directory is the first thing a contributor or agent sees, and it
 * had no contract at all.
 *
 * `check-structure` governs `packages/`: which domain a package belongs to,
 * which direction it may depend on, which paths may not return. Nothing
 * governed the root itself, so the only rule was convention — and convention
 * does not fail a build.
 *
 * Each check below exists because a real mistake happened or nearly did:
 *
 * - `artifacts/` collected 64 screenshots at the root with no consumer.
 * - `docs/` mixed ten CI history reports with live specifications.
 * - `vendor/` once reached CI with a manifest and no code, because an
 *   ignore-file exception was ordered above the rule it was excepting.
 * - a document described a module layout that two refactors had invalidated.
 *
 * The checks are deliberately narrow. They do not enumerate every file at the
 * root — a new script or config should not require editing this file. They
 * pin the things whose silent drift has already cost time.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export interface Finding {
  readonly rule: string
  readonly detail: string
}

/** Root directories a contributor may create without asking. */
export const ALLOWED_ROOT_DIRECTORIES = [
  '.agents',
  '.changeset',
  '.claude',
  '.github',
  '.husky',
  '.pnpm-store',
  '.vscode',
  'artifacts',
  'benchmarks',
  'crates',
  'deploy',
  'docs',
  'examples',
  'node_modules',
  'packages',
  'release-pairing',
  'release-policy',
  'scripts',
  'target',
  'temp',
  'tests',
  'vendor',
] as const

/**
 * Directories whose removal or relocation would break a release.
 *
 * Each entry names what depends on the path, so a future reader who wants to
 * move one knows what else must change in the same commit.
 */
export const PINNED_ROOT_DIRECTORIES: Readonly<Record<string, string>> = {
  'release-pairing':
    'write-pair-attestation.ts reads it through the GitHub contents API by path',
  'release-policy':
    'historical-latest.ts exports its path as a constant a test asserts',
  vendor: '.gitignore and .dockerignore order exceptions around it',
  deploy: 'deployment-layout.ts enforces it as a path-safety prefix',
  tests: 'check-golden-components.ts resolves tests/contracts by path',
  crates: 'Cargo.toml workspace members and both Dockerfiles',
}

/** Files that must not be committed at the root. */
const FORBIDDEN_ROOT_PATTERNS: ReadonlyArray<{ pattern: RegExp; why: string }> =
  [
    {
      pattern: /\.(png|jpe?g|gif|webp|svg)$/i,
      why: 'images belong under docs/ or an asset directory, not the root',
    },
    {
      pattern: /\.(log|tmp|bak|orig)$/i,
      why: 'build and debug output must not be committed',
    },
    {
      pattern: /^(npm-debug|pnpm-debug|yarn-error)/,
      why: 'package-manager error logs are ignored by .gitignore',
    },
    {
      pattern: /\.(tgz|zip|tar|gz)$/i,
      why: 'archives belong in a release artifact, not the source tree',
    },
  ]

/** Root-level documents whose subject has moved elsewhere. */
export const RELOCATED_DOCS: Readonly<Record<string, string>> = {
  'docs/ci-optimization-baseline.md': 'docs/ci/optimization-baseline.md',
  'docs/ci-optimization-phase1.md': 'docs/ci/optimization-phase1.md',
  'docs/ci-optimization-phase2.md': 'docs/ci/optimization-phase2.md',
  'docs/ci-optimization-phase3-report.md':
    'docs/ci/optimization-phase3-report.md',
  'docs/ci-optimization-phase3a.md': 'docs/ci/optimization-phase3a.md',
  'docs/ci-optimization-phase3b.md': 'docs/ci/optimization-phase3b.md',
  'docs/ci-optimization-phase3c.md': 'docs/ci/optimization-phase3c.md',
  'docs/ci-optimization-report.md': 'docs/ci/optimization-report.md',
  'docs/ci-native-matrix-dedup-rfc.md': 'docs/ci/native-matrix-dedup-rfc.md',
  'docs/ci-wasm-parity-gallery-conflict.md':
    'docs/ci/wasm-parity-gallery-conflict.md',
  'artifacts/design-acceptance': 'docs/acceptance/design',
}

/**
 * A retired compiler-structure claim may appear only on a line that says it is
 * history.
 *
 * `current-pipeline.md` was titled "Current" while describing `649e2f60`, and
 * the line numbers it cited had all been invalidated by two refactors. An
 * agent reading it would plan against a module layout that no longer exists.
 */
const HISTORY_MARKERS = [
  '历史快照',
  '不再代表',
  '本文是历史',
  'Historical snapshot',
  'historical snapshot',
  'no longer represent',
]

export function checkRootDirectories(entries: readonly string[]): Finding[] {
  const findings: Finding[] = []
  const allowed = new Set<string>(ALLOWED_ROOT_DIRECTORIES)

  for (const entry of entries) {
    // `.git` and friends are the version-control machinery, not the project's
    // own layout. Enumerating them would also mean this file changes whenever a
    // working tree gains a worktree-specific directory.
    if (entry.startsWith('.git')) continue
    if (allowed.has(entry)) continue
    findings.push({
      rule: 'unknown-root-directory',
      detail:
        `"${entry}" is not a known root directory. Add it to ` +
        `ALLOWED_ROOT_DIRECTORIES in scripts/check/check-root-structure.ts if it is ` +
        `intentional, or put it under an existing directory.`,
    })
  }
  return findings
}

export function checkForbiddenRootFiles(files: readonly string[]): Finding[] {
  const findings: Finding[] = []
  for (const file of files) {
    if (file.includes('/')) continue
    for (const { pattern, why } of FORBIDDEN_ROOT_PATTERNS) {
      if (pattern.test(file)) {
        findings.push({
          rule: 'forbidden-root-file',
          detail: `"${file}" must not sit at the root: ${why}`,
        })
      }
    }
  }
  return findings
}

export function checkPinnedDirectories(entries: readonly string[]): Finding[] {
  const findings: Finding[] = []
  const present = new Set(entries)

  for (const [directory, reason] of Object.entries(PINNED_ROOT_DIRECTORIES)) {
    if (present.has(directory)) continue
    findings.push({
      rule: 'pinned-directory-missing',
      detail:
        `"${directory}/" is missing. It is pinned because ${reason}. ` +
        `Restoring it or changing every consumer belongs in one reviewed commit.`,
    })
  }
  return findings
}

export function checkRelocatedPaths(
  exists: (relative: string) => boolean,
): Finding[] {
  const findings: Finding[] = []
  for (const [oldPath, newPath] of Object.entries(RELOCATED_DOCS)) {
    if (!exists(oldPath)) continue
    findings.push({
      rule: 'relocated-path-returned',
      detail: `"${oldPath}" came back; it moved to "${newPath}" and both must not exist`,
    })
  }
  return findings
}

/**
 * The ignore-file ordering trap, made checkable.
 *
 * `.gitignore` and `.dockerignore` both need an exception for
 * `vendor/zeus-web-dialog/dist` that comes *after* the rule excluding `dist`.
 * Git applies the last matching pattern, so an exception placed above is
 * silently ignored — which is how a vendored package once reached CI with a
 * manifest and no code.
 */
export function checkIgnoreExceptionOrder(
  readFile: (relative: string) => string | null,
): Finding[] {
  const findings: Finding[] = []
  const rules: ReadonlyArray<{ file: string; exclusion: RegExp }> = [
    { file: '.gitignore', exclusion: /^dist$/ },
    { file: '.dockerignore', exclusion: /^\*\*\/dist$/ },
  ]

  for (const { file, exclusion } of rules) {
    const text = readFile(file)
    if (text === null) continue
    const lines = text.split(/\r?\n/)
    const exclusionIndex = lines.findIndex(line => exclusion.test(line.trim()))
    const exceptionIndex = lines.findIndex(line =>
      line.trim().startsWith('!vendor/zeus-web-dialog/dist'),
    )
    if (exceptionIndex === -1) {
      findings.push({
        rule: 'vendor-exception-missing',
        detail: `${file} must keep the !vendor/zeus-web-dialog/dist exception`,
      })
      continue
    }
    if (exclusionIndex !== -1 && exceptionIndex < exclusionIndex) {
      findings.push({
        rule: 'vendor-exception-order',
        detail:
          `${file}: the vendor exception at line ${exceptionIndex + 1} comes before ` +
          `the exclusion at line ${exclusionIndex + 1}. Git applies the last matching ` +
          `pattern, so the exception is ignored and the vendored build is dropped.`,
      })
    }
  }
  return findings
}

/**
 * Documents that describe the current compiler must not contradict the code.
 *
 * This is the weakest of the checks by design: it cannot read the code and
 * compare it to prose. What it can do is refuse the specific stale claim that
 * already misled a reader — a document presenting pre-R17 structure as current.
 */
export function checkPipelineDocIsMarkedHistorical(
  readFile: (relative: string) => string | null,
): Finding[] {
  const file = 'docs/architecture/compiler/current-pipeline.md'
  const text = readFile(file)
  if (text === null) return []

  const head = text.split(/\r?\n/).slice(0, 25).join('\n')
  if (HISTORY_MARKERS.some(marker => head.includes(marker))) return []

  return [
    {
      rule: 'pipeline-doc-unmarked',
      detail:
        `${file} describes the pipeline before R17.0 and its line numbers no longer ` +
        `apply, but its opening does not say so. A reader takes it for the current ` +
        `structure. Mark it historical and point at pipeline.md.`,
    },
  ]
}

/** The current-structure document must exist and be reachable. */
export function checkCurrentPipelineEntry(
  exists: (relative: string) => boolean,
): Finding[] {
  const file = 'docs/architecture/compiler/pipeline.md'
  if (exists(file)) return []
  return [
    {
      rule: 'pipeline-entry-missing',
      detail:
        `${file} is the entry point for the current compiler structure. ` +
        `Without it the only pipeline document describes a layout two refactors ago.`,
    },
  ]
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readRootEntries(): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

function readRootFiles(): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
}

function readIfExists(relative: string): string | null {
  const absolute = path.join(root, relative)
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf-8') : null
}

export function runAllChecks(): Finding[] {
  const directories = readRootEntries()
  const files = readRootFiles()
  return [
    ...checkRootDirectories(directories),
    ...checkForbiddenRootFiles(files),
    ...checkPinnedDirectories(directories),
    ...checkRelocatedPaths(relative =>
      fs.existsSync(path.join(root, relative)),
    ),
    ...checkIgnoreExceptionOrder(readIfExists),
    ...checkPipelineDocIsMarkedHistorical(readIfExists),
    ...checkCurrentPipelineEntry(relative =>
      fs.existsSync(path.join(root, relative)),
    ),
  ]
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const findings = runAllChecks()
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`[${finding.rule}] ${finding.detail}`)
    }
    console.error(
      `\ncheck-root-structure failed: ${findings.length} finding(s)`,
    )
    process.exit(1)
  }
  console.log('check-root-structure passed.')
}
