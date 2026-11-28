/**
 * The UI acceptance and preflight reports a pairing amendment is accepted on.
 *
 * ## Why these are derived rather than written
 *
 * Three of the bundle's five reports used to be hand-written JSON committed
 * during the release: a six-line file saying "6 of 6 templates passed" with a
 * whole-second timestamp. Nothing produced them, so nothing could contradict
 * them, and a reader had no way to tell an acceptance from an assertion.
 *
 * Each one is now computed from something that already exists:
 *
 * - **template acceptance** from the candidate report the joint gate wrote.
 *   That report carries a per-template `passed` and `pinMatch`; counting them
 *   here is arithmetic on a document another command produced.
 * - **browser acceptance** from the same report's `loadProbe` results. A
 *   template with no `dist/index.html` has no probe and is not counted; a
 *   probe that was `blocked` (no browser on the machine) is not counted as a
 *   pass either.
 * - **registry preflight** from the publish preflight, which queries the
 *   registry per package.
 *
 * ## What it refuses
 *
 * It will not summarise a report that failed. A candidate report with
 * `passed: false`, a template that failed, a probe that failed — each is a
 * refusal naming the template, not a smaller number in a summary.
 *
 * Usage:
 *
 * ```text
 * tsx scripts/release/ui-acceptance-reports.ts \
 *   --version 0.2.0-rc.8 \
 *   --ui-commit <sha> \
 *   --candidate-report temp/create-zeus-candidate/report.json \
 *   --preflight temp/release/publish-preflight.json \
 *   --out-dir temp/release
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const TEMPLATE_ACCEPTANCE_SCHEMA = 'zeus.template-acceptance/v1'
export const BROWSER_ACCEPTANCE_SCHEMA = 'zeus.browser-acceptance/v1'

/** The subset of the candidate report this reads. */
export interface CandidateReportLike {
  readonly passed?: boolean
  readonly coreVersion?: string
  readonly uiVersion?: string
  /**
   * Where the Core artifacts came from.
   *
   * `registry` means the candidate was verified against the published Core —
   * the artifact a user installs — rather than a fresh build of the same tree.
   * The distinction is the difference between "this will work" and "this tree
   * works", so it is recorded rather than inferred.
   */
  readonly coreSource?: string
  readonly templates?: ReadonlyArray<{
    readonly template?: string
    readonly passed?: boolean
    readonly pinMatch?: boolean
    readonly loadProbe?: { readonly status?: string; readonly detail?: string }
  }>
}

export interface TemplateAcceptanceReport {
  readonly schema: typeof TEMPLATE_ACCEPTANCE_SCHEMA
  readonly version: string
  readonly uiCommit: string
  readonly templates: number
  readonly passed: number
  readonly coreVersion: string | null
  readonly coreSource: 'registry' | 'workspace' | 'unknown'
  readonly verifiedAt: string
}

export interface BrowserAcceptanceReport {
  readonly schema: typeof BROWSER_ACCEPTANCE_SCHEMA
  readonly version: string
  readonly uiCommit: string
  readonly probes: number
  readonly passed: number
  /** Templates with no `dist/index.html` to open. */
  readonly skipped: readonly string[]
  readonly verifiedAt: string
}

/**
 * Counts the templates the candidate gate accepted.
 *
 * The count is the number of entries in the report, not a constant: a run that
 * covered four templates and passed all four would otherwise read as "4 of 4"
 * while claiming to be the same acceptance as a six-template run.
 */
export function templateAcceptance(
  version: string,
  uiCommit: string,
  candidate: CandidateReportLike,
): TemplateAcceptanceReport {
  const templates = candidate.templates ?? []
  if (templates.length === 0) {
    throw new Error(
      'the candidate report carries no templates; there is nothing to accept',
    )
  }
  if (candidate.passed !== true) {
    const failed = templates
      .filter(entry => entry.passed !== true)
      .map(entry => entry.template ?? '(unnamed)')
    throw new Error(
      `the candidate report did not pass (failed: ${failed.join(', ') || 'unspecified'}); an acceptance report cannot summarise a failure`,
    )
  }
  for (const entry of templates) {
    if (entry.pinMatch !== true) {
      throw new Error(
        `template ${entry.template ?? '(unnamed)'} did not match its pins; the joint gate did not accept it`,
      )
    }
  }
  return {
    schema: TEMPLATE_ACCEPTANCE_SCHEMA,
    version,
    uiCommit: uiCommit.toLowerCase(),
    templates: templates.length,
    passed: templates.length,
    coreVersion: candidate.coreVersion ?? null,
    coreSource:
      candidate.coreSource === 'registry'
        ? 'registry'
        : candidate.coreSource === 'workspace'
          ? 'workspace'
          : 'unknown',
    verifiedAt: new Date().toISOString(),
  }
}

/**
 * Counts the browser probes that rendered.
 *
 * A probe that was `blocked` is neither a pass nor a failure: the build was
 * accepted but this machine had no browser. Counting it as a pass would claim
 * a render nobody saw; counting it as a failure would report a defect in the
 * template. It is excluded and named in `skipped` so the number has a
 * denominator a reader can reconstruct.
 */
export function browserAcceptance(
  version: string,
  uiCommit: string,
  candidate: CandidateReportLike,
): BrowserAcceptanceReport {
  const templates = candidate.templates ?? []
  const skipped: string[] = []
  let probes = 0
  let passed = 0

  for (const entry of templates) {
    const name = entry.template ?? '(unnamed)'
    const probe = entry.loadProbe
    if (!probe) {
      /* No `dist/index.html`, so there is no page to open. */
      skipped.push(name)
      continue
    }
    if (probe.status === 'blocked') {
      skipped.push(name)
      continue
    }
    probes += 1
    if (probe.status === 'passed') {
      passed += 1
    } else {
      throw new Error(
        `the browser probe for ${name} ${probe.status ?? 'did not finish'}: ${probe.detail ?? 'no detail'}`,
      )
    }
  }

  if (probes === 0) {
    throw new Error(
      'no template produced a page a browser could open; there is no browser acceptance to report',
    )
  }

  return {
    schema: BROWSER_ACCEPTANCE_SCHEMA,
    version,
    uiCommit: uiCommit.toLowerCase(),
    probes,
    passed,
    skipped,
    verifiedAt: new Date().toISOString(),
  }
}

/** Reads a JSON file, naming the flag when it is absent. */
function readJson(file: string, flag: string): unknown {
  if (!fs.existsSync(file)) {
    throw new Error(`--${flag} ${file} does not exist`)
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      'ui-commit': { type: 'string' },
      'candidate-report': { type: 'string' },
      preflight: { type: 'string' },
      'out-dir': { type: 'string', default: 'temp/release' },
    },
  })

  const version = values.version
  const uiCommit = values['ui-commit']
  if (!version) throw new Error('--version is required')
  if (!uiCommit || !/^[0-9a-f]{40}$/i.test(uiCommit)) {
    throw new Error('--ui-commit must be a full 40-character SHA')
  }
  const candidateFile = values['candidate-report']
  const preflightFile = values.preflight
  if (!candidateFile) throw new Error('--candidate-report is required')
  if (!preflightFile) throw new Error('--preflight is required')

  const candidate = readJson(
    candidateFile,
    'candidate-report',
  ) as CandidateReportLike

  const templates = templateAcceptance(version, uiCommit, candidate)
  const browser = browserAcceptance(version, uiCommit, candidate)

  fs.mkdirSync(values['out-dir']!, { recursive: true })
  fs.writeFileSync(
    path.join(values['out-dir']!, 'template-acceptance.json'),
    `${JSON.stringify(templates, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(values['out-dir']!, 'browser-acceptance.json'),
    `${JSON.stringify(browser, null, 2)}\n`,
  )

  /*
   * The preflight is copied to the name the bundle expects rather than
   * re-implemented here. It is already a real query — one registry request per
   * package — and duplicating that logic would create a second definition of
   * "unpublished" that could drift from the one the publish order uses.
   */
  const preflight = readJson(preflightFile, 'preflight')
  fs.writeFileSync(
    path.join(values['out-dir']!, 'ui-registry-preflight.json'),
    `${JSON.stringify(preflight, null, 2)}\n`,
  )

  console.log(
    `template acceptance: ${templates.passed}/${templates.templates} (core ${templates.coreSource})`,
  )
  console.log(
    `browser acceptance: ${browser.passed}/${browser.probes} probes` +
      (browser.skipped.length > 0
        ? `, skipped ${browser.skipped.join(', ')}`
        : ''),
  )
  console.log(`wrote reports to ${values['out-dir']}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
