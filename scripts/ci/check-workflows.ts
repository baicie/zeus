/**
 * Structural validation of every workflow file, as a gate.
 *
 * ## The defect this exists for
 *
 * #292 added `administration: read` to a job's `permissions` block. That is not
 * a GitHub Actions permission key, and an invented key makes GitHub reject the
 * entire workflow file — not the job, the file. The result:
 *
 *   - the run concluded `failure` in 0 seconds;
 *   - it created zero jobs;
 *   - it appeared in the runs list under `.github/workflows/ci.yml` rather than
 *     under the workflow's `name`;
 *   - and `gh pr checks` did not report it as a failing check at all, because
 *     no check run was ever created.
 *
 * The branch showed as `BLOCKED` with every visible check green. YAML parsing
 * passes on that file — the YAML is valid; the Actions schema is not.
 *
 * ## What this gate is
 *
 * `actionlint` checks workflow structure against GitHub's own schema, which is
 * the only part a parser cannot see. It runs locally and in CI, so the class of
 * defect above fails before a push rather than after.
 *
 * ## What it deliberately is not
 *
 * Not a shellcheck pass. `actionlint` also runs shellcheck over every `run:`
 * block, and this repository has three findings there (SC2016 and two SC2034)
 * that predate the gate. Reporting them would make the gate red on the first
 * run and invite it being turned off — which is how a gate stops existing. The
 * three are listed below by file and rule so they stay visible, and shell
 * findings are otherwise ignored.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/** Shellcheck findings that predate this gate, and are not schema defects. */
/**
 * actionlint findings that are verified false positives, with the evidence.
 *
 * Kept separate from shell findings because the reason is different: these are
 * schema checks the tool gets wrong for this repository's usage, not a class we
 * chose not to enforce.
 */
export const KNOWN_SCHEMA_FALSE_POSITIVES = [
  {
    file: '.github/workflows/release-canary.yml',
    kind: 'syntax-check',
    messageIncludes: 'unexpected key "queue"',
    reason:
      'GitHub accepts concurrency.queue: this workflow uses it and runs to success with 12 jobs',
  },
  {
    file: '.github/workflows/release.yml',
    kind: 'syntax-check',
    messageIncludes: 'unexpected key "queue"',
    reason: 'same key, same behaviour',
  },
  {
    file: '.github/workflows/repair-dist-tags.yml',
    kind: 'syntax-check',
    messageIncludes: 'unexpected key "queue"',
    reason: 'same key, same behaviour',
  },
  {
    file: '.github/workflows/repair-native-latest.yml',
    kind: 'syntax-check',
    messageIncludes: 'unexpected key "queue"',
    reason: 'same key, same behaviour',
  },
] as const

export const KNOWN_SHELL_FINDINGS = [
  {
    file: '.github/workflows/demos-pages.yml',
    rule: 'SC2016',
    reason: 'single quotes are intentional; the expression is expanded later',
  },
  {
    file: '.github/workflows/product-acceptance.yml',
    rule: 'SC2034',
    reason: 'VERSION is read by the following step through GITHUB_ENV',
  },
] as const

export interface WorkflowProblem {
  readonly file: string
  readonly line?: number
  readonly column?: number
  readonly kind: string
  readonly message: string
}

export interface WorkflowCheckResult {
  readonly ok: boolean
  readonly problems: readonly WorkflowProblem[]
  /** Findings that were recognised and deliberately not failed on. */
  readonly suppressed: readonly WorkflowProblem[]
}

/**
 * Parses actionlint's output.
 *
 * Its default format is `path:line:col: message [kind]`. Anything that does not
 * match is kept as an unclassified problem rather than dropped — a gate that
 * silently ignores output it did not understand is a gate that can be defeated
 * by changing the tool's log format.
 */
export function parseActionlintOutput(output: string): WorkflowProblem[] {
  const problems: WorkflowProblem[] = []
  for (const line of output.split('\n')) {
    const match =
      /^(\.github\/workflows\/[^:]+):(\d+):(\d+): (.+?)(?: \[([a-z-]+)\])?$/.exec(
        line.trim(),
      )
    if (!match) {
      /*
       * actionlint prints a context block under each finding:
       *
       *   path:39:3: unexpected key ...
       *      |
       *   39 |   queue: max
       *      |   ^~~~~
       *
       * Those lines are indented or start with `|`/caret runs. A bare
       * unindented line that is not part of a context block is output this
       * parser does not understand — keeping it as a problem means a change in
       * the tool's log format cannot silently pass the gate.
       */
      const trimmed = line.trim()
      if (!trimmed) continue
      const isContext =
        /^\s/.test(line) ||
        /^[|^~]+$/.test(trimmed) ||
        /^\d+ \|/.test(trimmed) ||
        trimmed.startsWith('|')
      if (isContext) continue
      problems.push({
        file: '(unknown)',
        kind: 'unparsed',
        message: trimmed,
      })
      continue
    }
    problems.push({
      file: match[1] as string,
      line: Number(match[2]),
      column: Number(match[3]),
      kind: match[5] ?? 'unknown',
      message: match[4] as string,
    })
  }
  return problems
}

/**
 * Whether a finding is a known shellcheck issue rather than a schema defect.
 *
 * Schema findings are what this gate is for; a shell finding in a `run:` block
 * is a different class of problem with its own owners.
 */
export function isKnownShellFinding(problem: WorkflowProblem): boolean {
  if (problem.kind !== 'shellcheck') return false
  return KNOWN_SHELL_FINDINGS.some(
    known =>
      known.file === problem.file && problem.message.includes(known.rule),
  )
}

/**
 * Whether a finding is a verified false positive of the tool itself.
 *
 * Each entry carries the observation that disproves it, so the suppression is
 * auditable: `queue: max` is accepted by GitHub because the workflow runs,
 * whereas an invented `permissions` key makes the same file fail before any job
 * is created.
 */
export function isKnownSchemaFalsePositive(problem: WorkflowProblem): boolean {
  return KNOWN_SCHEMA_FALSE_POSITIVES.some(
    known =>
      known.file === problem.file &&
      known.kind === problem.kind &&
      problem.message.includes(known.messageIncludes),
  )
}

export function evaluateWorkflowProblems(
  problems: readonly WorkflowProblem[],
): WorkflowCheckResult {
  const blocking: WorkflowProblem[] = []
  const suppressed: WorkflowProblem[] = []
  for (const problem of problems) {
    if (isKnownShellFinding(problem) || isKnownSchemaFalsePositive(problem)) {
      suppressed.push(problem)
      continue
    }
    blocking.push(problem)
  }
  return {
    ok: blocking.length === 0,
    problems: blocking,
    suppressed,
  }
}

/** Runs actionlint and returns its parsed findings. */
export function runActionlint(root: string): WorkflowProblem[] {
  let output = ''
  try {
    output = execFileSync('actionlint', ['-no-color'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    /*
     * actionlint exits non-zero when it finds problems; its findings are on
     * stdout. A missing binary is a different failure and must not be read as
     * "no problems".
     */
    const failure = error as { stdout?: string; code?: unknown }
    if ((failure.code as string) === 'ENOENT') {
      throw new Error(
        'actionlint is not installed; see CONTRIBUTING for the install step',
      )
    }
    output = failure.stdout ?? ''
  }
  return parseActionlintOutput(output)
}

function main(): void {
  const root = process.cwd()
  const workflows = path.join(root, '.github/workflows')
  if (!fs.existsSync(workflows)) {
    console.error('no .github/workflows directory; nothing to check')
    process.exitCode = 1
    return
  }
  const result = evaluateWorkflowProblems(runActionlint(root))
  for (const problem of result.suppressed) {
    console.log(
      `suppressed ${problem.kind} ${problem.file}:${problem.line ?? '?'} — ${problem.message.slice(0, 80)}`,
    )
  }
  if (result.ok) {
    console.log(
      `workflows: ${fs.readdirSync(workflows).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).length} files, structural check passed`,
    )
    return
  }
  console.error('workflow structure problems:')
  for (const problem of result.problems) {
    console.error(
      `  ${problem.file}:${problem.line ?? '?'}:${problem.column ?? '?'} [${problem.kind}] ${problem.message}`,
    )
  }
  process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
