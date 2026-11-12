/**
 * CLI for the structured build size report.
 *
 *   pnpm tsx scripts/size/build-size-report.ts            # report only
 *   pnpm tsx scripts/size/build-size-report.ts --ci       # fail on regression
 *   pnpm tsx scripts/size/build-size-report.ts --write-baseline --note "..."
 *
 * Outputs:
 *   <out>/size-report.json     machine-readable, uploaded as a CI artifact
 *   <out>/size-report.md       the job summary
 *
 * Exit codes:
 *   0  every artifact is within budget
 *   1  a regression, an unmeasured package, or an invalid budget
 *
 * `--ci` does not change the evaluation; it only decides whether a regression
 * sets the exit code. A local run should still print the finding.
 */
import { realpathSync } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  REPORT_SCHEMA,
  buildReport,
  renderMarkdown,
  toBaseline,
  type ArtifactMeasurement,
  type BudgetFile,
} from './build-size-report'
import { findWorkspacePackages } from '../shared/utils'

function readJson<T>(file: string, what: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch (error) {
    throw new Error(
      `Could not read the ${what} at ${file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export interface GateDecision {
  readonly pass: boolean
  readonly regressions: number
  readonly unbudgeted: number
  readonly unexpectedMissing: number
  readonly expectedMissing: number
}

/**
 * Decides whether the gate fails.
 *
 * Pure so the policy is testable without running a build. The three failure
 * classes are counted separately: a report is most useful when it says *why*
 * the gate stopped, and "3 problems" hides whether the fix is shrink, budget or
 * build.
 *
 * `ci` is false for a local `pnpm size:report`, which prints the same findings
 * and exits 0 so an author can read the report mid-work. CI never runs that
 * mode.
 */
export function decideGate(
  summary: { readonly regressions: number; readonly noBudget: number },
  missing: {
    readonly unexpectedMissing: number
    readonly expectedMissing: number
  },
  options: { readonly ci: boolean },
): GateDecision {
  return {
    pass:
      !options.ci ||
      (summary.regressions === 0 &&
        summary.noBudget === 0 &&
        missing.unexpectedMissing === 0),
    regressions: summary.regressions,
    unbudgeted: summary.noBudget,
    unexpectedMissing: missing.unexpectedMissing,
    expectedMissing: missing.expectedMissing,
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      ci: { type: 'boolean' },
      out: { type: 'string' },
      budget: { type: 'string' },
      baseline: { type: 'string' },
      'write-baseline': { type: 'string' },
      note: { type: 'string' },
      summary: { type: 'string' },
      quiet: { type: 'boolean' },
    },
    allowPositionals: true,
  })

  const outDir = path.resolve(values.out ?? 'temp/size')
  const budgetPath = path.resolve(
    values.budget ?? 'scripts/size/size-budget.json',
  )
  const baselinePath = path.resolve(
    values.baseline ?? 'scripts/size/baseline/2026-11-12.json',
  )

  if (!fs.existsSync(budgetPath)) {
    console.error(`size report: budget file not found at ${budgetPath}`)
    process.exitCode = 1
    return
  }
  const budget = readJson<BudgetFile>(budgetPath, 'size budget')
  if (budget.schema !== REPORT_SCHEMA) {
    console.error(
      `size report: budget schema is ${String(budget.schema)}, expected ${REPORT_SCHEMA}`,
    )
    process.exitCode = 1
    return
  }

  // A missing baseline is not an error: the first run legitimately has none,
  // and the budget file's absolute limits still apply. It does change the
  // meaning of a baseline-relative rule, which is why it is printed.
  let baseline:
    | { commit: string; artifacts: readonly ArtifactMeasurement[] }
    | undefined
  if (fs.existsSync(baselinePath)) {
    const document = readJson<{
      commit: string
      artifacts: readonly ArtifactMeasurement[]
    }>(baselinePath, 'baseline')
    baseline = { commit: document.commit, artifacts: document.artifacts }
  }

  const report = buildReport({
    packages: findWorkspacePackages(),
    budget,
    ...(baseline ? { baseline } : {}),
  })

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'size-report.json'),
    `${JSON.stringify(report, null, 1)}\n`,
  )
  const markdown = renderMarkdown(report)
  fs.writeFileSync(path.join(outDir, 'size-report.md'), markdown)

  if (values.summary) {
    fs.appendFileSync(values.summary, `\n${markdown}`)
  }

  if (values['write-baseline']) {
    const measuredAt = new Date().toISOString()
    const document = toBaseline(
      report,
      values.note ?? 'Baseline written by build-size-report.ts',
      measuredAt,
    )
    const target = path.resolve(values['write-baseline'])
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${JSON.stringify(document, null, 1)}\n`)
    console.log(
      `wrote baseline for ${report.currentSha} (${document.artifacts.length} artifacts) to ${target}`,
    )
  }

  if (!values.quiet) {
    console.log(markdown)
  }

  // Three conditions fail CI, and they are reported separately because they
  // call for different fixes:
  //
  //   REGRESSION   an artifact grew past its budget        → shrink it, or get
  //                                                          the growth reviewed
  //   NO_BUDGET    an artifact nobody has decided a budget for → add a rule
  //   UNMEASURED   a published package produced no artifact and has no declared
  //                expectation                                 → build it, or
  //                                                          declare why not
  //
  // NO_BUDGET is in this list on purpose. It used to be reported and ignored,
  // which meant a brand-new artifact shipped with no ceiling at all and the
  // gate stayed green: the exact fail-open the report exists to prevent. A new
  // file only needs a `size-budget.json` rule with a reason, which is a
  // five-minute decision — far cheaper than discovering the growth later.
  //
  // A local `pnpm size:report` (no `--ci`) still prints every finding but leaves
  // the exit code at 0, so an author can inspect a report while working.
  const decision = decideGate(
    report.summary,
    {
      unexpectedMissing: report.unexpectedMissing.length,
      expectedMissing: report.expectedMissing.length,
    },
    { ci: values.ci === true },
  )
  const regressions = decision.regressions
  const unbudgeted = decision.unbudgeted
  const unexpected = decision.unexpectedMissing

  if (regressions > 0) {
    console.error(`\nsize regression: ${regressions} artifact(s) over budget`)
    for (const artifact of report.artifacts.filter(
      item => item.result === 'REGRESSION',
    )) {
      console.error(`  - ${artifact.key}: ${artifact.detail}`)
    }
  }
  if (unbudgeted > 0) {
    console.error(
      `\nsize report: ${unbudgeted} artifact(s) have no budget rule`,
    )
    for (const artifact of report.artifacts.filter(
      item => item.result === 'NO_BUDGET',
    )) {
      console.error(
        `  - ${artifact.key} (${artifact.format}, gzip ${(artifact.gzipBytes / 1024).toFixed(2)} KiB): add a rule to scripts/size/size-budget.json with a reason`,
      )
    }
  }
  if (unexpected > 0) {
    console.error(
      `\nsize report: ${unexpected} published package(s) produced no artifact and have no declared expectation: ${report.unexpectedMissing.join(', ')}`,
    )
  }
  if (report.expectedMissing.length > 0) {
    console.error(
      `\nsize report: ${report.expectedMissing.length} package(s) are UNMEASURED by design: ${report.expectedMissing.map(entry => `${entry.package} (${entry.reason})`).join(', ')}`,
    )
  }
  if (!decision.pass) {
    console.error(
      `\nsize gate failed: ${regressions} regression(s), ${unbudgeted} without a budget, ${unexpected} unexpected missing.`,
    )
    process.exitCode = 1
  }
}

/**
 * Runs only when this file is the process entry point, so importing it from a
 * test does not execute a report.
 */
function isMain(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href
  } catch {
    return false
  }
}

if (isMain()) main()
