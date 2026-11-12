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
import fs from 'node:fs'
import path from 'node:path'
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

  const fail =
    report.summary.regressions > 0 ||
    (values.ci === true && report.unexpectedMissing.length > 0)
  if (report.summary.regressions > 0) {
    console.error(
      `\nsize regression: ${report.summary.regressions} artifact(s) over budget`,
    )
    for (const artifact of report.artifacts.filter(
      item => item.result === 'REGRESSION',
    )) {
      console.error(`  - ${artifact.key}: ${artifact.detail}`)
    }
  }
  if (values.ci === true && report.unexpectedMissing.length > 0) {
    console.error(
      `\nsize report: ${report.unexpectedMissing.length} published package(s) produced no artifact and have no declared expectation: ${report.unexpectedMissing.join(', ')}`,
    )
  }
  if (report.expectedMissing.length > 0) {
    console.error(
      `\nsize report: ${report.expectedMissing.length} package(s) are UNMEASURED by design: ${report.expectedMissing.map(entry => `${entry.package} (${entry.reason})`).join(', ')}`,
    )
  }
  if (fail) process.exitCode = 1
}

main()
