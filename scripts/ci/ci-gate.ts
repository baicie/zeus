/**
 * The aggregate CI gate.
 *
 * One job a branch protection rule can require, instead of nine. It reads the
 * `needs` result map that GitHub hands a downstream job and fails unless every
 * dependency either succeeded or was explicitly allowed to skip.
 *
 * The design rule is that the *default* is failure. A result this script does
 * not recognise — `cancelled`, `failure`, a `skipped` that is not on the allow
 * list — fails. That is deliberate: a gate whose unknown cases pass is a gate
 * that stops checking the day someone adds a job and forgets this file.
 *
 * Usage (in the workflow):
 *
 *   env:
 *     NEEDS: ${{ toJSON(needs) }}
 *     ALLOWED_SKIPS: "cross-platform-evidence"
 *   run: pnpm exec tsx scripts/ci/ci-gate.ts
 */
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

/** Jobs whose skip is expected and explained. Anything else must succeed. */
const DEFAULT_ALLOWED_SKIPS = ['cross-platform-evidence']

/**
 * Dependencies this gate requires to be present in `needs`.
 *
 * Kept here rather than derived so that a workflow edit which drops a job from
 * the `needs` block fails loudly instead of quietly narrowing the gate. The
 * two lists — this one and `jobs.ci-gate.needs` — must agree, and
 * `scripts/ci/__tests__/ci-gate-workflow.spec.ts` checks the workflow file.
 */
export const REQUIRED_DEPENDENCIES = [
  'impact',
  'lint-and-check',
  'rust-compiler',
  'build',
  'test',
  'packed-consumers',
  'browser-web-components',
  'browser-playground',
  'create-zeus-candidates',
  'cross-platform-evidence',
  'docs-build',
] as const

/**
 * Jobs whose skip is legitimate only when impact analysis planned it.
 *
 * These are the jobs carrying their own `if:` guard. `impact` and
 * `cross-platform-evidence` are handled separately: `impact` must succeed,
 * and evidence is skipped on pull requests by design.
 *
 * The two browser jobs are guarded by `packed-consumers`' output, so their
 * skips are planned skips in exactly the same sense — impact analysis decided
 * they were unnecessary, not the job itself.
 */
export const PLANNED_SKIP_JOBS = [
  'lint-and-check',
  'rust-compiler',
  'build',
  'test',
  'packed-consumers',
  'browser-web-components',
  'browser-playground',
  'create-zeus-candidates',
  'docs-build',
] as const

export interface NeedsEntry {
  /**
   * The dependency's conclusion. Optional because the caller can hand us any
   * JSON: an entry with no `result` is a real state (the job never reported),
   * and it must be treated as a failure rather than a type error.
   */
  readonly result?: string
}

export interface GateEvaluation {
  readonly ok: boolean
  readonly rows: readonly string[]
  readonly problems: readonly string[]
}

/**
 * Decides whether the gate passes.
 *
 * A job that carries its own `if:` may skip — but only when impact analysis
 * planned that skip, which is what `plannedSkips` carries from the `impact`
 * job. A skip outside that set is a job that decided on its own not to run,
 * and that is exactly the case the gate exists to catch.
 *
 * A missing dependency is always a problem: it means the workflow stopped
 * waiting for something the gate claims to cover.
 */
export function evaluateGate(
  needs: Readonly<Record<string, NeedsEntry>>,
  options: {
    readonly allowedSkips?: readonly string[]
    readonly plannedSkips?: readonly string[]
    readonly required?: readonly string[]
  } = {},
): GateEvaluation {
  const allowed = new Set(options.allowedSkips ?? DEFAULT_ALLOWED_SKIPS)
  const planned = new Set(options.plannedSkips ?? [])
  const required = options.required ?? REQUIRED_DEPENDENCIES
  const rows: string[] = []
  const problems: string[] = []

  // The analysis itself cannot be skipped, and a failed analysis is reported
  // with its own wording so the operator sees the cause rather than a list of
  // unexplained skips.
  const impact = needs['impact']
  const impactFailed = impact !== undefined && impact.result !== 'success'
  if (impactFailed) {
    problems.push(
      `impact: ${String(impact?.result ?? 'unknown')} — impact analysis did not run, so no skip is justified`,
    )
  }

  for (const [name, job] of Object.entries(needs)) {
    const result = String(job?.result ?? 'unknown')
    rows.push(`${result.padEnd(10)} ${name}`)
    if (result === 'success') continue
    // A skip is acceptable only when it was planned. This is stricter than an
    // allow list of job names: the same job skipping for its own reasons is a
    // failure.
    if (result === 'skipped' && planned.has(name)) continue
    // Evidence collection is absent on pull requests by design; it is not
    // governed by the impact plan.
    if (result === 'skipped' && allowed.has(name)) continue
    // `impact` already reported above; do not report it twice.
    if (name === 'impact' && impactFailed) continue
    problems.push(
      result === 'skipped'
        ? `${name}: skipped, but the impact plan did not skip it`
        : `${name}: ${result}`,
    )
  }

  for (const name of required) {
    if (!(name in needs)) problems.push(`${name}: not in needs`)
  }

  return { ok: problems.length === 0, rows, problems }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      json: { type: 'string' },
      required: { type: 'string' },
    },
  })

  const raw = values.json ?? process.env.NEEDS ?? '{}'
  let needs: Record<string, NeedsEntry>
  try {
    needs = JSON.parse(raw) as Record<string, NeedsEntry>
  } catch (cause) {
    // An unparseable result map is not a pass. Fail closed.
    console.error(
      `ci-gate: NEEDS is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    process.exitCode = 1
    return
  }

  const allowedSkips = (process.env.ALLOWED_SKIPS ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
  const plannedSkips = (process.env.PLANNED_SKIPS ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
  const required = (values.required ?? '').split(/[\s,]+/).filter(Boolean)

  const evaluation = evaluateGate(needs, {
    ...(allowedSkips.length > 0 ? { allowedSkips } : {}),
    ...(plannedSkips.length > 0 ? { plannedSkips } : {}),
    ...(required.length > 0 ? { required } : {}),
  })

  console.log(evaluation.rows.join('\n'))
  console.log('')
  if (!evaluation.ok) {
    console.error('CI gate FAILED:')
    for (const problem of evaluation.problems) console.error(`  - ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(
    'CI gate passed: every dependency succeeded or was allowed to skip.',
  )
}

/** True when this module is the process entry point, not an import. */
function isMain(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href
  } catch {
    return false
  }
}

if (isMain()) {
  main()
}
