/**
 * Release configuration consistency, without the test runner.
 *
 * `zeusFixedPackages` and the Changesets `fixed` group must name the same
 * packages in the same order. They are two hand-maintained copies of one
 * decision, and when they drift the symptom is a package that versions in one
 * tool and not the other.
 *
 * `scripts/release/__tests__/release-config.spec.ts` already asserts this, and
 * this script exists because that test cannot run in the `lint-and-check` job:
 * the shared vitest config imports `compile-test-views.ts` at module scope,
 * which loads the native compiler — a Rust build product the lint job does not
 * produce.
 *
 * The fixed list is read out of `release.config.ts` as text rather than
 * imported. Importing it pulls in `@baicie/release`, whose transitive
 * `conventional-changelog` has no ESM entry point; that chain is unavailable
 * here for the same reason the vitest suite is. Parsing the array literal is
 * boring, and `scripts/ci/__tests__/check-release-config.spec.ts` fails if the
 * literal ever stops being a flat list of string literals.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export interface ReleaseConfigProblem {
  readonly message: string
}

export interface ReleaseConfigCheckResult {
  readonly ok: boolean
  readonly problems: readonly ReleaseConfigProblem[]
}

interface ChangesetConfig {
  readonly fixed?: readonly (readonly string[])[]
  readonly ignore?: readonly string[]
}

/** Reads `.changeset/config.json` from `root`. Throws on a missing file. */
export function readChangesetConfig(root: string): ChangesetConfig {
  const file = path.join(root, '.changeset/config.json')
  if (!existsSync(file)) {
    throw new Error(`missing ${file}`)
  }
  return JSON.parse(readFileSync(file, 'utf8')) as ChangesetConfig
}

/**
 * Extracts the `zeusFixedPackages` array literal from `release.config.ts`.
 *
 * Deliberately narrow: it reads the block from `zeusFixedPackages = [` to the
 * matching `]`, and accepts only quoted names and whitespace between them.
 * Anything else throws, so a refactor that turns this into a computed
 * expression fails loudly instead of silently comparing against a partial
 * list.
 */
export function parseFixedPackages(source: string): string[] {
  const start = source.indexOf('zeusFixedPackages = [')
  if (start === -1) {
    throw new Error('release.config.ts has no `zeusFixedPackages = [` literal')
  }
  const open = source.indexOf('[', start)
  const close = source.indexOf(']', open)
  if (open === -1 || close === -1) {
    throw new Error('release.config.ts has an unterminated zeusFixedPackages')
  }
  const body = source.slice(open + 1, close)
  const names: string[] = []
  for (const raw of body.split(',')) {
    const entry = raw.trim()
    if (entry === '') continue
    const match = /^'(@zeus-js\/[a-z0-9-]+)'$/.exec(entry)
    if (!match) {
      throw new Error(
        `release.config.ts zeusFixedPackages contains a non-literal entry: ${entry}`,
      )
    }
    names.push(match[1]!)
  }
  return names
}

/** Reads the fixed package list from `release.config.ts` under `root`. */
export function readFixedPackages(root: string): string[] {
  const file = path.join(root, 'scripts/release.config.ts')
  if (!existsSync(file)) throw new Error(`missing ${file}`)
  return parseFixedPackages(readFileSync(file, 'utf8'))
}

/**
 * Compares the two lists.
 *
 * Order matters: the lists are compared literally in the test, and a
 * reordering that only touches one file is exactly the kind of drift this
 * check is for. Comparing as sets would hide it.
 */
export function checkReleaseConfig(
  fixedPackages: readonly string[],
  changeset: ChangesetConfig,
): ReleaseConfigCheckResult {
  const problems: ReleaseConfigProblem[] = []
  const groups = changeset.fixed ?? []

  if (groups.length === 0) {
    problems.push({
      message:
        '.changeset/config.json has no `fixed` group; every @zeus-js package would version independently',
    })
    return { ok: false, problems }
  }
  if (groups.length > 1) {
    // Zeus uses exactly one fixed group. A second one would be a deliberate
    // restructuring, and this check should not guess what it meant.
    problems.push({
      message: `.changeset/config.json declares ${groups.length} fixed groups; this check expects exactly one`,
    })
    return { ok: false, problems }
  }

  const group = groups[0] ?? []
  const inConfig = new Set(group)
  const inReleaseConfig = new Set(fixedPackages)

  for (const name of fixedPackages) {
    if (!inConfig.has(name)) {
      problems.push({
        message: `${name} is in zeusFixedPackages but missing from .changeset/config.json fixed`,
      })
    }
  }
  for (const name of group) {
    if (!inReleaseConfig.has(name)) {
      problems.push({
        message: `${name} is in .changeset/config.json fixed but not in zeusFixedPackages`,
      })
    }
  }

  if (
    problems.length === 0 &&
    group.join('\u0000') !== fixedPackages.join('\u0000')
  ) {
    problems.push({
      message:
        'the two lists contain the same packages in a different order; compare them side by side before deciding which is right',
    })
  }

  const ignored = new Set(changeset.ignore ?? [])
  for (const name of fixedPackages) {
    if (ignored.has(name)) {
      problems.push({
        message: `${name} is both a fixed package and in the Changesets ignore list`,
      })
    }
  }

  return { ok: problems.length === 0, problems }
}

function main(): void {
  const root = process.cwd()
  const fixedPackages = readFixedPackages(root)
  const result = checkReleaseConfig(fixedPackages, readChangesetConfig(root))
  if (!result.ok) {
    console.error('[zeus] release config is inconsistent.')
    for (const problem of result.problems)
      console.error(`  - ${problem.message}`)
    process.exitCode = 1
    return
  }
  console.log(
    `[zeus] release config is consistent: ${fixedPackages.length} fixed packages`,
  )
}

function isMain(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href
  } catch {
    return false
  }
}

if (isMain()) main()
