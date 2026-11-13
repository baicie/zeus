/**
 * Decides which CI jobs a change actually needs.
 *
 * The rule this file exists to enforce is that a skip must be *proven*
 * unnecessary, not assumed. Two consequences shape the design:
 *
 * - Anything unrecognised expands coverage. A file that matches no known area,
 *   a diff that could not be fetched, a deleted or renamed path, an oversized
 *   PR, a change to a shared build script — all of them select every area. The
 *   cost of over-running is a few runner minutes; the cost of under-running is
 *   a merge that passed because nothing looked.
 * - The mapping is by workspace dependency, not by filename prefix. Editing
 *   `packages/core/runtime-dom` must reach the applications that ship it and
 *   the browser gates that exercise it, because those are its reverse
 *   dependencies. A prefix rule would miss them.
 *
 * The output is consumed by `.github/workflows/ci.yml` through job-level `if:`
 * conditions, and by `ci-gate`, which knows which skips are legitimate.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

/** Areas a change can touch. Every job maps to one or more of these. */
export const AREAS = [
  'docs',
  'tooling',
  'core-runtime',
  'compiler',
  'wasm',
  'native',
  'admin',
  'playground',
  'framework-adapters',
  'consumers',
  'release',
  'security',
  'shared-infrastructure',
] as const

export type Area = (typeof AREAS)[number]

/**
 * Path rules, checked in order against every changed file.
 *
 * The first match wins, so a narrow rule must come before the broad rule for
 * its directory. `packages/core/compiler-wasm` is listed before the general
 * `packages/core/` rule for exactly that reason.
 */
export interface PathRule {
  readonly pattern: RegExp
  readonly areas: readonly Area[]
  /** Shown in the job summary; explains why this rule exists. */
  readonly reason: string
}

export const PATH_RULES: readonly PathRule[] = [
  {
    pattern: /^docs\//,
    areas: ['docs'],
    reason: 'documentation site',
  },
  {
    pattern: /^\.changeset\//,
    areas: ['release'],
    reason: 'release notes determine what gets published',
  },
  {
    // Narrower than the general packages/core rule below.
    pattern: /^packages\/core\/compiler-wasm\//,
    areas: ['compiler', 'wasm', 'consumers'],
    reason: 'WASM compiler is built and exercised in the browser gates',
  },
  {
    pattern: /^packages\/core\/compiler-native(-[a-z0-9-]+)?\//,
    areas: ['compiler', 'native', 'consumers'],
    reason: 'native compiler bindings',
  },
  {
    pattern: /^packages\/core\/compiler\//,
    areas: ['compiler', 'wasm', 'consumers'],
    reason:
      'compiler affects codegen, the WASM build and every packed consumer',
  },
  {
    pattern: /^crates\//,
    areas: ['compiler', 'native'],
    reason: 'Rust workspace',
  },
  {
    pattern:
      /^packages\/core\/(signal|runtime-dom|web-c-runtime|router|resource|query|zeus|i18n)\//,
    areas: ['core-runtime', 'consumers', 'framework-adapters'],
    reason: 'runtime packages are shipped by every application and adapter',
  },
  {
    pattern: /^packages\/web-c\//,
    areas: ['core-runtime', 'consumers', 'framework-adapters'],
    reason: 'custom element runtime and output targets',
  },
  {
    pattern:
      /^packages\/(ai-core|ai-adapters|ai-wc|ai-primitives|ai-react|ai-vue)\//,
    areas: ['consumers', 'framework-adapters'],
    reason: 'AI packages are consumed by the Workbench and both adapters',
  },
  {
    pattern: /^packages\//,
    areas: ['core-runtime', 'consumers', 'framework-adapters'],
    reason: 'any workspace package may be depended on by an application',
  },
  {
    pattern: /^examples\/admin\//,
    areas: ['admin', 'consumers'],
    reason: 'Admin application',
  },
  {
    pattern: /^examples\/playground/,
    areas: ['playground', 'consumers'],
    reason: 'Playground',
  },
  {
    pattern: /^examples\/ai-/,
    areas: ['consumers', 'framework-adapters'],
    reason: 'AI shell examples',
  },
  {
    pattern: /^examples\/(react|vue|registry|headless|next-boundary)/,
    areas: ['framework-adapters', 'consumers'],
    reason: 'framework adapter examples',
  },
  {
    pattern: /^examples\//,
    areas: ['consumers'],
    reason: 'any example is a packed consumer',
  },
  {
    pattern: /^scripts\/check\//,
    areas: ['tooling', 'consumers'],
    reason: 'gate scripts define what CI verifies',
  },
  {
    pattern: /^scripts\/release\//,
    areas: ['release', 'tooling'],
    reason: 'release tooling',
  },
  {
    pattern: /^scripts\//,
    areas: ['tooling', 'shared-infrastructure'],
    reason: 'build and tooling scripts are shared by every job',
  },
  {
    pattern: /^\.github\//,
    areas: ['shared-infrastructure', 'tooling'],
    reason: 'CI configuration itself',
  },
  {
    pattern: /^(Cargo\.toml|Cargo\.lock|rust-toolchain)/,
    areas: ['compiler', 'native', 'shared-infrastructure'],
    reason: 'Rust workspace manifest',
  },
  {
    pattern:
      /^(package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml|\.node-version)$/,
    areas: ['shared-infrastructure'],
    reason: 'dependency or toolchain change affects every job',
  },
  {
    pattern: /^(tsconfig[^/]*\.json|tsconfig\.build\.json)$/,
    areas: ['tooling', 'shared-infrastructure'],
    reason: 'shared TypeScript configuration',
  },
  {
    pattern: /^(SECURITY|LICENSE|CODEOWNERS)/,
    areas: ['security'],
    reason: 'security and ownership metadata',
  },
  {
    // Toolchain pins. `.nvmrc` selects the Node version the whole suite runs
    // on — the same class of fact as `.node-version`, which escalates above.
    // `.babelrc` / `.swcrc` / `babel.config.*` configure the transform every
    // package is built through.
    //
    // Must come before the `rc` rule below: that one matches
    // `^\.[a-z]+rc$`, which is true for `.nvmrc`, and classified it as
    // `tooling` — no Rust build, and the browser gates still ran. Found by
    // running the verification matrix, not by reading the regex.
    pattern: /^(\.nvmrc|\.babelrc(\.json)?|\.swcrc|babel\.config\.[cm]?[jt]s)$/,
    areas: ['shared-infrastructure'],
    reason: 'toolchain or transform configuration affects every job',
  },
  {
    pattern: /^\.[a-z]+rc(\.|$)|^\.prettierignore$|^eslint\.config/,
    areas: ['tooling'],
    reason: 'lint and format configuration',
  },
]

/**
 * Areas that force the complete suite when touched.
 *
 * `shared-infrastructure` is the honest catch-all: a lockfile change can alter
 * any dependency graph in the repository, so it cannot be reasoned about from
 * filenames.
 */
export const FULL_SUITE_AREAS: readonly Area[] = ['shared-infrastructure']

export interface ClassifyInput {
  readonly changedFiles: readonly string[]
  /** Paths GitHub reports as removed. Their dependents must still be checked. */
  readonly deletedFiles?: readonly string[]
  /** Paths with a rename; a rename changes both endpoints. */
  readonly renamedFiles?: readonly string[]
  /** True when the diff was truncated or could not be fetched. */
  readonly diffIncomplete?: boolean
  /** Changed file count above which the analysis stops trying to be clever. */
  readonly maxFilesForPartialRun?: number
}

export interface Classification {
  readonly areas: readonly Area[]
  readonly fullSuite: boolean
  readonly reasons: readonly string[]
  /** Why partial analysis was abandoned, if it was. */
  readonly escalated: readonly string[]
}

const DEFAULT_MAX_FILES_FOR_PARTIAL_RUN = 200

/**
 * Maps changed files onto areas.
 *
 * Fails safe in every direction: unknown files select every area, a deleted
 * file is treated as touching its old path's area, and an incomplete diff
 * abandons partial analysis entirely.
 */
export function classifyChanges(input: ClassifyInput): Classification {
  const escalated: string[] = []
  const reasons: string[] = []

  if (input.diffIncomplete === true) {
    escalated.push('diff could not be fetched in full; assuming every area')
    return {
      areas: [...AREAS],
      fullSuite: true,
      reasons,
      escalated,
    }
  }

  if (input.changedFiles.length === 0) {
    // An empty diff on a push is possible (a merge commit); it does not mean
    // "nothing to check", it means the analysis has nothing to work with.
    escalated.push('no changed files reported; assuming every area')
    return { areas: [...AREAS], fullSuite: true, reasons, escalated }
  }

  const limit = input.maxFilesForPartialRun ?? DEFAULT_MAX_FILES_FOR_PARTIAL_RUN
  if (input.changedFiles.length > limit) {
    escalated.push(
      `${input.changedFiles.length} files changed (limit ${limit}); assuming every area`,
    )
    return { areas: [...AREAS], fullSuite: true, reasons, escalated }
  }

  const areas = new Set<Area>()
  const unmatched: string[] = []

  // Deletions are classified by the path they removed, because the dependents
  // of a deleted module still need to build.
  const paths = [
    ...input.changedFiles,
    ...(input.deletedFiles ?? []),
    ...(input.renamedFiles ?? []),
  ]

  for (const file of paths) {
    const rule = PATH_RULES.find(entry => entry.pattern.test(file))
    if (!rule) {
      unmatched.push(file)
      continue
    }
    for (const area of rule.areas) areas.add(area)
    reasons.push(`${file} → ${rule.areas.join(', ')} (${rule.reason})`)
  }

  if (unmatched.length > 0) {
    // A file nobody classified is the dangerous case: it might be exactly the
    // one that matters. Expand rather than guess.
    escalated.push(
      `unrecognised path(s): ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? ` and ${unmatched.length - 5} more` : ''}; assuming every area`,
    )
    return { areas: [...AREAS], fullSuite: true, reasons, escalated }
  }

  const fullSuite = FULL_SUITE_AREAS.some(area => areas.has(area))
  if (fullSuite) {
    // A full suite is expressed as every area, so that `areas` always tells
    // the truth about what will be checked. Reporting only the trigger
    // (`shared-infrastructure`) while every job runs would make the summary
    // read as if the change were narrow.
    escalated.push(
      `changed area(s) ${[...areas].join(', ')} require the full suite`,
    )
    return { areas: [...AREAS].sort(), fullSuite, reasons, escalated }
  }
  return { areas: [...areas].sort(), fullSuite, reasons, escalated }
}

/** Jobs in `ci.yml`, and the areas each one is required for. */
export interface JobNeed {
  readonly name: string
  readonly areas: readonly Area[]
  /** Jobs that must run regardless once any code changes. */
  readonly alwaysForCode?: boolean
}

/**
 * The dependency of every `ci.yml` job on the classification.
 *
 * `lint-and-check`, `build`, `test` and `packed-consumers` cover code that any
 * package change can break, so they list the areas that imply code. They are
 * deliberately broad: the goal is to skip them only for genuinely inert
 * changes, not to find the narrowest possible set.
 */
export const JOB_NEEDS: readonly JobNeed[] = [
  {
    name: 'lint-and-check',
    areas: [
      'core-runtime',
      'compiler',
      'wasm',
      'native',
      'admin',
      'playground',
      'framework-adapters',
      'consumers',
      'release',
      'tooling',
      'security',
      'shared-infrastructure',
    ],
  },
  {
    name: 'rust-compiler',
    areas: ['compiler', 'native', 'shared-infrastructure'],
  },
  {
    name: 'build',
    areas: [
      'core-runtime',
      'compiler',
      'wasm',
      'native',
      'admin',
      'playground',
      'framework-adapters',
      'consumers',
      'release',
      'tooling',
      'shared-infrastructure',
    ],
  },
  {
    name: 'test',
    areas: [
      'core-runtime',
      'compiler',
      'wasm',
      'admin',
      'playground',
      'framework-adapters',
      'consumers',
      'tooling',
      'shared-infrastructure',
    ],
  },
  {
    name: 'packed-consumers',
    areas: [
      'core-runtime',
      'compiler',
      'wasm',
      'admin',
      'playground',
      'framework-adapters',
      'consumers',
      'tooling',
      'shared-infrastructure',
    ],
  },
  {
    name: 'create-zeus-candidates',
    areas: [
      'core-runtime',
      'compiler',
      'release',
      'tooling',
      'shared-infrastructure',
    ],
  },
  {
    name: 'docs-build',
    areas: ['docs'],
  },
]

export interface JobDecision {
  readonly name: string
  readonly run: boolean
  readonly reason: string
}

export interface PlanInput {
  readonly classification: Classification
  /** True for events where everything must run (main push, workflow_dispatch). */
  readonly fullRun?: boolean
}

export interface Plan {
  readonly jobs: readonly JobDecision[]
  readonly areas: readonly Area[]
  readonly fullSuite: boolean
  readonly escalated: readonly string[]
}

/**
 * Decides each job's fate.
 *
 * `docs-build` is the only job that runs on a docs-only change; every other
 * job is skipped, which is the case the whole analysis exists for. On any
 * escalation everything runs.
 */
export function planJobs(input: PlanInput): Plan {
  const { classification } = input
  const fullRun = input.fullRun === true || classification.fullSuite
  const jobs = JOB_NEEDS.map(need => {
    if (fullRun) {
      return {
        name: need.name,
        run: true,
        reason:
          input.fullRun === true ? 'full run' : 'classification escalated',
      }
    }
    const matched = need.areas.filter(area =>
      classification.areas.includes(area),
    )
    if (matched.length === 0) {
      return {
        name: need.name,
        run: false,
        reason: `no changed area in [${need.areas.join(', ')}]`,
      }
    }
    return {
      name: need.name,
      run: true,
      reason: `changed area(s): ${matched.join(', ')}`,
    }
  })
  return {
    jobs,
    areas: classification.areas,
    fullSuite: classification.fullSuite,
    escalated: classification.escalated,
  }
}

/** Files changed between two commits, from `git diff --name-status`. */
export interface DiffResult {
  readonly files: readonly string[]
  readonly deleted: readonly string[]
  readonly renamed: readonly string[]
  readonly incomplete: boolean
}

/**
 * Parses `git diff --name-status` output.
 *
 * Rename and copy entries carry two paths (`R100<TAB>old<TAB>new`); both
 * endpoints are returned because a rename removes one module and adds another.
 * A truncated diff marks the result incomplete so the caller escalates.
 */
export function parseNameStatus(
  output: string,
  incomplete = false,
): DiffResult {
  const files: string[] = []
  const deleted: string[] = []
  const renamed: string[] = []
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const status = parts[0] ?? ''
    if (status.startsWith('R') || status.startsWith('C')) {
      const from = parts[1]
      const to = parts[2]
      if (from) renamed.push(from)
      if (to) files.push(to)
      continue
    }
    const file = parts[1]
    if (!file) continue
    if (status.startsWith('D')) deleted.push(file)
    files.push(file)
  }
  return { files, deleted, renamed, incomplete }
}

/**
 * Events allowed to run partial analysis.
 *
 * Exactly one. Written as an allow list rather than "everything except push
 * and workflow_dispatch", because the negated form silently gave the narrow
 * path to any event added later — `merge_group`, `schedule`, `release`, a
 * repository_dispatch. An event nobody reasoned about is not evidence that
 * the change is small.
 */
export const PARTIAL_ANALYSIS_EVENTS: readonly string[] = ['pull_request']

/**
 * Whether this run must validate everything.
 *
 * Default is yes. `pull_request` is the only event that opts into the narrow
 * path, and even then the classification can escalate on its own.
 */
export function requiresFullRun(input: {
  readonly event: string
  readonly forced?: boolean
}): boolean {
  return input.forced === true || !PARTIAL_ANALYSIS_EVENTS.includes(input.event)
}

function main(): void {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      head: { type: 'string', default: 'HEAD' },
      json: { type: 'string' },
      'full-run': { type: 'boolean', default: false },
      event: { type: 'string' },
    },
  })

  // Only `pull_request` gets partial analysis. A push, a manual run and any
  // event this file has never heard of validate everything, because those are
  // the runs release evidence and merges depend on.
  const event = values.event ?? process.env.GITHUB_EVENT_NAME ?? ''
  const fullRun = requiresFullRun({
    event,
    forced: values['full-run'] === true,
  })

  let diff: DiffResult = {
    files: [],
    deleted: [],
    renamed: [],
    incomplete: true,
  }
  if (!fullRun) {
    diff = readDiff(values.base ?? '', values.head ?? 'HEAD')
  }

  const classification = classifyChanges({
    changedFiles: diff.files,
    deletedFiles: diff.deleted,
    renamedFiles: diff.renamed,
    diffIncomplete: fullRun ? false : diff.incomplete,
  })
  const plan = planJobs({ classification, fullRun })

  const summary = {
    event,
    fullRun,
    areas: plan.areas,
    fullSuite: plan.fullSuite,
    escalated: plan.escalated,
    jobs: plan.jobs,
    reasons: classification.reasons,
  }
  const text = `${JSON.stringify(summary, null, 2)}\n`
  if (values.json) {
    mkdirSync(path.dirname(values.json), { recursive: true })
    writeFileSync(values.json, text)
  }
  process.stdout.write(text)
}

function readDiff(base: string, head: string): DiffResult {
  if (!base) return { files: [], deleted: [], renamed: [], incomplete: true }
  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-status', '--find-renames', `${base}...${head}`],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
    return parseNameStatus(output)
  } catch {
    // A diff that cannot be computed is not "no changes".
    return { files: [], deleted: [], renamed: [], incomplete: true }
  }
}

function isMain(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(entry).href
  } catch {
    return false
  }
}

if (isMain() && existsSync(path.resolve(process.cwd(), '.git'))) {
  main()
}
