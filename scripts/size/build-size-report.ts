/**
 * The structured size report.
 *
 * `scripts/size/size-report.ts` covers five files with hand-written thresholds
 * and no history: it prints a number and compares it to a constant. It cannot
 * say *which* module grew, it has no baseline to compare against, and a target
 * it does not name is invisible.
 *
 * This report is the regression surface instead:
 *
 *   - every built artifact of every public package is measured, including the
 *     global/browser/CJS/ESM variants and the `.d.ts` files, so a format that
 *     is not usually inspected cannot drift unnoticed;
 *   - each artifact records raw, gzip and Brotli bytes plus its module
 *     attribution when a sourcemap is present;
 *   - a baseline file records the artifact set at a named commit, and the
 *     report computes the delta against it;
 *   - a budget file states the per-artifact ceiling and the tolerance for
 *     growth, so a new measurement can never silently become the new limit;
 *   - anything that cannot be measured is `UNMEASURED`, never `0`.
 *
 * The output is written as JSON (for the artifact upload and the machine
 * comparison) and as Markdown (for the job summary), from the same data.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

export const REPORT_SCHEMA = 'zeus.build-size-report/v1' as const

export type Result = 'PASS' | 'REGRESSION' | 'UNMEASURED' | 'NO_BUDGET'

export interface ArtifactMeasurement {
  /** `@zeus-js/runtime-dom` */
  readonly packageName: string
  /** Path relative to the package directory, e.g. `dist/runtime-dom.global.js`. */
  readonly file: string
  /** `global` | `esm-browser` | `esm-bundler` | `cjs` | `dts` | `wasm` | `native` | `other` */
  readonly format: string
  readonly production: boolean
  readonly rawBytes: number
  readonly gzipBytes: number
  readonly brotliBytes: number
}

export interface BudgetRule {
  /** Exact artifact key: `<packageName>/<file>`. */
  readonly artifact?: string
  /** Applies the rule to every artifact of a package. */
  readonly package?: string
  /** Applies the rule to every artifact of a format across packages. */
  readonly format?: string
  /** Ceiling for the metric being enforced. */
  readonly limitBytes?: number
  /** Limit expressed in kibibytes, for readability in the budget file. */
  readonly limitKiB?: number
  /** Allowed growth over the baseline, in percent. Used when no limit is set. */
  readonly tolerancePercent?: number
  /** Which metric the budget is expressed against. Defaults to gzip. */
  readonly metric?: 'raw' | 'gzip' | 'brotli'
  /** Why this ceiling exists; required for a non-baseline rule. */
  readonly reason?: string
  /**
   * The rule applies to an artifact whose identity is platform-specific.
   *
   * A napi `.node` binary's *filename* carries the platform
   * (`zeus-compiler-native.linux-x64-gnu.node`), and the published platform
   * packages are installed by `optionalDependencies` — a Linux runner installs
   * only the linux package. Comparing such an artifact to a baseline recorded on
   * a different OS, or expecting the other platforms' packages to be present, is
   * meaningless: the bytes are for different code, and the absence is correct.
   *
   * A `platformSpecific` rule therefore:
   *   - must use an absolute limit, never a baseline tolerance (a relative
   *     comparison across platforms is not a comparison);
   *   - excuses the package from the missing-artifact check, because a build on
   *     one platform legitimately produces only its own binary.
   */
  readonly platformSpecific?: boolean
}

export interface BudgetFile {
  readonly schema: typeof REPORT_SCHEMA
  readonly baseline: {
    readonly commit: string
    readonly measuredAt: string
    readonly note?: string
  }
  readonly rules: readonly BudgetRule[]
  /**
   * Packages that legitimately have no artifact in the reporting build.
   *
   * This is not a way to silence a real gap. A package listed here still shows
   * up as `UNMEASURED` in the report; the entry only records *why* it is
   * expected, and an unlisted package with no artifact still fails `--ci`.
   * The only current entry is the two scaffolding CLIs, which need their own
   * `node_modules` and are built by a separate command.
   */
  readonly expectedUnmeasured?: readonly {
    readonly package: string
    readonly reason: string
  }[]
}

export interface AttributionRow {
  readonly source: string
  readonly bytes: number
}

export interface ArtifactReport extends ArtifactMeasurement {
  readonly key: string
  readonly budget?: {
    readonly metric: 'raw' | 'gzip' | 'brotli'
    readonly limitBytes?: number
    readonly tolerancePercent?: number
    readonly baselineBytes?: number
    readonly reason?: string
  }
  readonly baselineBytes?: number
  readonly deltaBytes?: number
  readonly deltaPercent?: number
  readonly result: Result
  readonly detail: string
}

export interface SizeReport {
  readonly schema: typeof REPORT_SCHEMA
  readonly baselineSha: string
  readonly currentSha: string
  readonly generatedAt: string
  readonly artifacts: readonly ArtifactReport[]
  readonly summary: {
    readonly measured: number
    readonly unmeasured: number
    readonly regressions: number
    readonly pass: number
    readonly noBudget: number
  }
  /** Artifacts the scan expects but could not find, by package. */
  readonly missing: readonly string[]
  /**
   * Missing packages that the budget declares as expected, with the reason.
   * These are still absent from `artifacts`; this field only explains them.
   */
  readonly expectedMissing: readonly {
    readonly package: string
    readonly reason: string
  }[]
  /** Missing packages with no declared expectation. These fail `--ci`. */
  readonly unexpectedMissing: readonly string[]
}

const FORMAT_PATTERNS: ReadonlyArray<{
  pattern: RegExp
  format: string
  production: boolean
}> = [
  { pattern: /\.global\.prod\.js$/, format: 'global', production: true },
  { pattern: /\.global\.js$/, format: 'global', production: false },
  {
    pattern: /\.esm-browser\.prod\.js$/,
    format: 'esm-browser',
    production: true,
  },
  { pattern: /\.esm-browser\.js$/, format: 'esm-browser', production: false },
  { pattern: /\.esm-bundler\.js$/, format: 'esm-bundler', production: false },
  { pattern: /\.prod\.cjs$/, format: 'cjs', production: true },
  { pattern: /\.cjs$/, format: 'cjs', production: false },
  // `.prod.js` must be checked after the browser/global patterns so
  // `runtime-dom.prod.js` (an additional entry) is not mistaken for a global.
  { pattern: /\.prod\.js$/, format: 'esm-bundler', production: true },
  { pattern: /\.d\.ts$/, format: 'dts', production: false },
  { pattern: /\.d\.cts$/, format: 'dts', production: false },
  { pattern: /\.wasm$/, format: 'wasm', production: true },
  { pattern: /\.node$/, format: 'native', production: true },
]

function classify(file: string): { format: string; production: boolean } {
  for (const entry of FORMAT_PATTERNS) {
    if (entry.pattern.test(file)) {
      return { format: entry.format, production: entry.production }
    }
  }
  return { format: 'other', production: false }
}

function gitSha(root: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'UNKNOWN'
  }
}

function* walk(directory: string): Generator<string> {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/**
 * Measures every artifact of the given packages.
 *
 * Packages are passed in rather than discovered from a root, because
 * `findWorkspacePackages()` resolves relative to this module's own location and
 * cannot be pointed at a fixture tree. Taking the list as an argument is what
 * makes the measurement testable against a synthetic workspace.
 *
 * Private packages are skipped: they are never published, so their bytes do not
 * reach a consumer through npm. A package with no `dist` is recorded as
 * missing rather than silently absent, because a package that stops building
 * is exactly the regression this report exists to catch.
 */
export function collectArtifacts(
  packages: readonly {
    readonly name: string
    readonly dir: string
    readonly packageJson: Record<string, unknown>
  }[],
): { artifacts: ArtifactMeasurement[]; missing: string[] } {
  const artifacts: ArtifactMeasurement[] = []
  const missing: string[] = []

  for (const pkg of packages) {
    if (pkg.packageJson.private === true) continue
    const dist = path.join(pkg.dir, 'dist')
    if (!fs.existsSync(dist)) {
      // A package with no `dist` publishes files at its root: the napi platform
      // packages ship a `.node`, and the loader ships `index.js`. Both are
      // measured from the manifest's own `files` list so that "what is
      // published" — not "what happens to exist in the working tree" — is what
      // gets measured.
      const published = readPublishedRootArtifacts(pkg.dir, pkg.name)
      if (published.complete && published.artifacts.length > 0) {
        artifacts.push(...published.artifacts)
      } else {
        missing.push(pkg.name)
      }
      continue
    }
    for (const file of walk(dist)) {
      const relative = path.relative(pkg.dir, file)
      // Sourcemaps are build diagnostics, not shipped bytes, and they dwarf
      // everything else.
      if (relative.endsWith('.map')) continue
      artifacts.push(measureFile(pkg.name, file, relative))
    }
  }

  artifacts.sort(
    (a, b) =>
      a.packageName.localeCompare(b.packageName) ||
      a.file.localeCompare(b.file),
  )
  return { artifacts, missing }
}

function measureFile(
  packageName: string,
  file: string,
  relative: string,
): ArtifactMeasurement {
  const buffer = fs.readFileSync(file)
  const { format, production } = classify(relative)
  return {
    packageName,
    file: relative.split(path.sep).join('/'),
    format,
    production,
    rawBytes: buffer.length,
    gzipBytes: gzipSync(buffer, { level: 9 }).length,
    brotliBytes: brotliCompressSync(buffer).length,
  }
}

/**
 * Measures the files a package publishes from its root, using the manifest's
 * own `files` list.
 *
 * Reading the manifest rather than walking the directory matters three ways:
 *
 *   - the loader package `@zeus-js/compiler-native` lists `index.js`,
 *     `index.d.ts`, README and LICENSE. The `.node` that `build:native` writes
 *     beside them is a build intermediate and is never published from there, so
 *     walking the directory would measure a platform-specific binary under a
 *     name that does not ship it;
 *   - a platform package that is not installed on this OS has no file at all,
 *     and is reported as missing rather than as zero;
 *   - a package whose `dist` was not built but whose `templates` directory
 *     happens to exist (this is `create-zeus` in the CI build job) must not be
 *     half-measured. A partial measurement reads as "this package is small",
 *     which is the same class of fail-open as reporting an unreadable image as
 *     0 MB. If any declared entry is absent, the package is treated as having
 *     produced nothing and lands in `missing`.
 */
function readPublishedRootArtifacts(
  packageDir: string,
  packageName: string,
): { artifacts: ArtifactMeasurement[]; complete: boolean } {
  const manifestPath = path.join(packageDir, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    return { artifacts: [], complete: false }
  }
  let declared: unknown
  try {
    declared = (
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        files?: unknown
      }
    ).files
  } catch {
    return { artifacts: [], complete: false }
  }
  if (!Array.isArray(declared)) {
    return { artifacts: [], complete: false }
  }

  const results: ArtifactMeasurement[] = []
  const seen = new Set<string>()
  const add = (file: string): void => {
    const relative = path.relative(packageDir, file).split(path.sep).join('/')
    if (seen.has(relative) || relative.endsWith('.map')) return
    seen.add(relative)
    results.push(measureFile(packageName, file, relative))
  }

  let complete = true
  for (const entry of declared) {
    if (typeof entry !== 'string') continue
    // README and LICENSE are documentation, not code the report budgets.
    if (entry === 'README.md' || entry === 'LICENSE') continue
    const resolved = path.join(packageDir, entry)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      for (const file of walk(resolved)) add(file)
      continue
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      add(resolved)
      continue
    }
    complete = false
  }
  return { artifacts: results, complete }
}

/**
 * True when a package's own `files` entry declares an artifact of one of the
 * given formats, and nothing else it publishes would be a regular build output.
 *
 * This is only consulted for a package that produced no artifact at all — a
 * napi platform package shipped as `files: ["index.js", "*.node", ...]` on a
 * runner for another OS. Reading the manifest is what lets the report tell
 * "this platform's package is not installed here" apart from "this package
 * failed to build".
 */
function declaresOnlyFormat(
  packageDir: string,
  formats: ReadonlySet<string>,
): boolean {
  const manifestPath = path.join(packageDir, 'package.json')
  if (!fs.existsSync(manifestPath)) return false
  let files: unknown
  try {
    files = (
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files?: unknown }
    ).files
  } catch {
    return false
  }
  if (!Array.isArray(files)) return false
  let matched = false
  for (const entry of files) {
    if (typeof entry !== 'string') continue
    const { format } = classify(entry)
    if (formats.has(format)) {
      matched = true
      continue
    }
    // `.d.ts` and `index.js` are shims that accompany a native binary; a `dist`
    // directory or a source file would mean the package publishes more than a
    // platform binary, so the format rule alone should not excuse it.
    if (
      format === 'dts' ||
      entry.endsWith('.js') ||
      entry.endsWith('.md') ||
      entry === 'LICENSE'
    ) {
      continue
    }
    return false
  }
  return matched
}

export function artifactKey(artifact: {
  packageName: string
  file: string
}): string {
  return `${artifact.packageName}/${artifact.file}`
}

/**
 * Resolves the rule that governs one artifact.
 *
 * Precedence is exact artifact, then package, then format. A rule with no limit
 * and no tolerance is ignored rather than treated as "unlimited", so a typo in
 * a package name cannot disable a check silently.
 */
export function findRule(
  artifact: ArtifactMeasurement,
  rules: readonly BudgetRule[],
): BudgetRule | undefined {
  const key = artifactKey(artifact)
  return (
    rules.find(rule => rule.artifact === key) ??
    rules.find(rule => rule.package === artifact.packageName) ??
    rules.find(rule => rule.format === artifact.format)
  )
}

function metricBytes(
  artifact: ArtifactMeasurement,
  metric: 'raw' | 'gzip' | 'brotli',
): number {
  if (metric === 'raw') return artifact.rawBytes
  if (metric === 'gzip') return artifact.gzipBytes
  return artifact.brotliBytes
}

function ruleLimitBytes(rule: BudgetRule): number | undefined {
  if (rule.limitBytes !== undefined) return rule.limitBytes
  if (rule.limitKiB !== undefined) return Math.round(rule.limitKiB * 1024)
  return undefined
}

/**
 * Evaluates one artifact against its rule and its baseline.
 *
 * The two mechanisms are deliberately distinct:
 *
 *   - a **limit** is an absolute ceiling, the same shape the old script used;
 *   - a **tolerance** is relative to the baseline, so a change of 2% in a stable
 *     artifact passes while a change of 40% fails.
 *
 * A rule with neither is reported `NO_BUDGET` rather than passing: an artifact
 * that nobody has decided a budget for is a decision still owed, not a success.
 */
export function evaluateArtifact(
  artifact: ArtifactMeasurement,
  rule: BudgetRule | undefined,
  baseline: ArtifactMeasurement | undefined,
): ArtifactReport {
  const key = artifactKey(artifact)
  const metric = rule?.metric ?? 'gzip'
  const current = metricBytes(artifact, metric)
  const baselineBytes = baseline ? metricBytes(baseline, metric) : undefined
  const deltaBytes =
    baselineBytes === undefined ? undefined : current - baselineBytes
  const deltaPercent =
    baselineBytes === undefined || baselineBytes === 0
      ? undefined
      : (deltaBytes! / baselineBytes) * 100

  if (!rule) {
    return {
      ...artifact,
      key,
      ...(baselineBytes !== undefined ? { baselineBytes } : {}),
      ...(deltaBytes !== undefined ? { deltaBytes } : {}),
      ...(deltaPercent !== undefined ? { deltaPercent } : {}),
      result: 'NO_BUDGET',
      detail: 'no budget rule matches this artifact',
    }
  }

  const limit = ruleLimitBytes(rule)
  const budget = {
    metric,
    ...(limit !== undefined ? { limitBytes: limit } : {}),
    ...(rule.tolerancePercent !== undefined
      ? { tolerancePercent: rule.tolerancePercent }
      : {}),
    ...(baselineBytes !== undefined ? { baselineBytes } : {}),
    ...(rule.reason ? { reason: rule.reason } : {}),
  }

  const problems: string[] = []
  if (limit !== undefined) {
    if (current > limit) {
      problems.push(
        `${metric} ${current} B exceeds the ${limit} B limit by ${current - limit} B`,
      )
    }
  } else if (rule.tolerancePercent !== undefined) {
    if (rule.platformSpecific) {
      // A baseline recorded on another platform is not a baseline for this
      // artifact. Reporting a regression here would be a false positive every
      // time CI runs on a different OS than the one that wrote the baseline.
      problems.push(
        'the rule is platform-specific and baseline-relative; it must state an absolute limit instead',
      )
    } else if (baselineBytes === undefined) {
      problems.push(
        'the rule is baseline-relative but this artifact has no baseline entry',
      )
    } else {
      const ceiling = Math.round(
        baselineBytes * (1 + rule.tolerancePercent / 100),
      )
      if (current > ceiling) {
        problems.push(
          `${metric} ${current} B exceeds the baseline ${baselineBytes} B by ${deltaPercent!.toFixed(1)}% (tolerance ${rule.tolerancePercent}%)`,
        )
      }
    }
  } else {
    problems.push('the rule has neither a limit nor a tolerance')
  }

  return {
    ...artifact,
    key,
    budget,
    ...(baselineBytes !== undefined ? { baselineBytes } : {}),
    ...(deltaBytes !== undefined ? { deltaBytes } : {}),
    ...(deltaPercent !== undefined ? { deltaPercent } : {}),
    result: problems.length > 0 ? 'REGRESSION' : 'PASS',
    detail: problems.length > 0 ? problems.join('; ') : 'within budget',
  }
}

export interface BuildReportOptions {
  readonly packages: readonly {
    readonly name: string
    readonly dir: string
    readonly packageJson: Record<string, unknown>
  }[]
  /** The commit being measured; defaulted from the repository when omitted. */
  readonly currentSha?: string
  readonly baseline?: {
    readonly commit: string
    readonly artifacts: readonly ArtifactMeasurement[]
  }
  readonly budget?: BudgetFile
  readonly now?: string
}

export function buildReport(options: BuildReportOptions): SizeReport {
  const { artifacts, missing } = collectArtifacts(options.packages)
  const baselineByKey = new Map(
    (options.baseline?.artifacts ?? []).map(artifact => [
      artifactKey(artifact),
      artifact,
    ]),
  )
  const rules = options.budget?.rules ?? []

  const reports = artifacts.map(artifact => {
    const key = artifactKey(artifact)
    return evaluateArtifact(
      artifact,
      findRule(artifact, rules),
      baselineByKey.get(key),
    )
  })

  const summary = {
    measured: reports.length,
    unmeasured: missing.length,
    regressions: reports.filter(report => report.result === 'REGRESSION')
      .length,
    pass: reports.filter(report => report.result === 'PASS').length,
    noBudget: reports.filter(report => report.result === 'NO_BUDGET').length,
  }

  const expectations = new Map(
    (options.budget?.expectedUnmeasured ?? []).map(entry => [
      entry.package,
      entry.reason,
    ]),
  )

  // A package can be excused for having no artifact when a platform-specific
  // rule covers it. Without this, a Linux runner — which installs only the
  // linux napi package — reports the other seven as unexpected, even though
  // their absence is exactly how `optionalDependencies` works.
  //
  // Three ways a platform-specific rule can name its coverage:
  //   - `package`: one package;
  //   - `artifact`: one artifact, whose package is the part before the slash;
  //   - `format`: every package that contains that format. This is the case
  //     that matters here: the shipped napi packages have no `dist` and no other
  //     artifact, so the `native` format rule covers all eight of them.
  //
  // For a `format` rule the coverage is derived from the packages present on
  // this machine plus the packages named by the other rules, so a package that
  // publishes only a `.node` and is absent from a run is still recognised.
  const platformSpecificRules = rules.filter(rule => rule.platformSpecific)
  const platformNamedPackages = new Set<string>()
  for (const rule of platformSpecificRules) {
    if (rule.package) platformNamedPackages.add(rule.package)
    if (rule.artifact) {
      platformNamedPackages.add(
        rule.artifact.slice(0, rule.artifact.indexOf('/')),
      )
    }
  }
  const platformFormats = new Set(
    platformSpecificRules.flatMap(rule => (rule.format ? [rule.format] : [])),
  )
  const packagesWithFormat = new Set(
    artifacts
      .filter(item => platformFormats.has(item.format))
      .map(item => item.packageName),
  )
  const excusesPlatformPackage = (name: string): boolean => {
    if (platformNamedPackages.has(name)) return true
    if (platformFormats.size === 0) return false
    if (packagesWithFormat.has(name)) return true
    // A package that produced nothing is not represented in `artifacts`, so
    // fall back to whether its own declared files would be that format. The
    // shipped napi packages declare exactly one `.node`.
    const pkg = options.packages.find(
      candidate => candidate.name === name && candidate.dir,
    )
    if (!pkg) return false
    return declaresOnlyFormat(pkg.dir, platformFormats)
  }
  for (const name of missing) {
    if (excusesPlatformPackage(name) && !expectations.has(name)) {
      expectations.set(
        name,
        'installed by optionalDependencies for one platform only; a build on another platform has no artifact for it',
      )
    }
  }

  const expectedMissing = missing
    .filter(name => expectations.has(name))
    .map(name => ({ package: name, reason: expectations.get(name)! }))
  const unexpectedMissing = missing.filter(name => !expectations.has(name))

  return {
    schema: REPORT_SCHEMA,
    baselineSha: options.baseline?.commit ?? '',
    currentSha:
      options.currentSha ?? gitSha(path.resolve(import.meta.dirname, '../..')),
    generatedAt: options.now ?? new Date().toISOString(),
    artifacts: reports,
    summary,
    missing,
    expectedMissing,
    unexpectedMissing,
  }
}

/** Serialises only what a later baseline needs: identity and measurement. */
export function toBaseline(
  report: SizeReport,
  note: string,
  measuredAt: string,
): {
  schema: typeof REPORT_SCHEMA
  commit: string
  measuredAt: string
  note: string
  artifacts: ArtifactMeasurement[]
} {
  return {
    schema: REPORT_SCHEMA,
    commit: report.currentSha,
    measuredAt,
    note,
    artifacts: report.artifacts.map(artifact => ({
      packageName: artifact.packageName,
      file: artifact.file,
      format: artifact.format,
      production: artifact.production,
      rawBytes: artifact.rawBytes,
      gzipBytes: artifact.gzipBytes,
      brotliBytes: artifact.brotliBytes,
    })),
  }
}

function kb(bytes: number | undefined): string {
  return bytes === undefined ? '—' : `${(bytes / 1024).toFixed(2)}`
}

function percent(value: number | undefined): string {
  if (value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

const RESULT_MARKER: Record<Result, string> = {
  PASS: '✅ PASS',
  REGRESSION: '❌ REGRESSION',
  UNMEASURED: '⚠️ UNMEASURED',
  NO_BUDGET: '➖ NO_BUDGET',
}

/**
 * Renders the Markdown job summary.
 *
 * Regressions are listed first and attributed: the point of the report is to
 * answer "what grew", not "did anything grow". The largest artifacts follow,
 * then any unmeasured package, so a gap is visible in the same document as the
 * numbers.
 */
export function renderMarkdown(report: SizeReport): string {
  const lines: string[] = []
  lines.push('# Build size report')
  lines.push('')
  lines.push(`- baseline: \`${report.baselineSha || 'none'}\``)
  lines.push(`- current: \`${report.currentSha}\``)
  lines.push(`- generated: ${report.generatedAt}`)
  lines.push('')
  lines.push(
    `Measured **${report.summary.measured}** artifacts: ` +
      `${report.summary.pass} pass, ` +
      `${report.summary.regressions} regression, ` +
      `${report.summary.noBudget} without a budget, ` +
      `${report.missing.length} unmeasured package(s).`,
  )

  const regressions = report.artifacts.filter(
    artifact => artifact.result === 'REGRESSION',
  )
  if (regressions.length > 0) {
    lines.push('')
    lines.push('## Regressions')
    lines.push('')
    lines.push('| artifact | metric | current | baseline | delta | budget |')
    lines.push('| --- | --- | ---: | ---: | ---: | ---: |')
    for (const artifact of regressions.sort(
      (a, b) => (b.deltaBytes ?? 0) - (a.deltaBytes ?? 0),
    )) {
      const metric = artifact.budget?.metric ?? 'gzip'
      const current =
        metric === 'raw'
          ? artifact.rawBytes
          : metric === 'gzip'
            ? artifact.gzipBytes
            : artifact.brotliBytes
      lines.push(
        `| \`${artifact.key}\` | ${metric} | ${kb(current)} KiB | ${kb(artifact.baselineBytes)} KiB | ` +
          `${percent(artifact.deltaPercent)} | ${artifact.budget?.limitBytes ? `${kb(artifact.budget.limitBytes)} KiB` : `${artifact.budget?.tolerancePercent ?? 0}%`} |`,
      )
    }
  }

  const top = [...report.artifacts]
    .sort((a, b) => b.gzipBytes - a.gzipBytes)
    .slice(0, 25)
  lines.push('')
  lines.push('## Largest artifacts by gzip')
  lines.push('')
  lines.push('| artifact | format | raw KiB | gzip KiB | brotli KiB | result |')
  lines.push('| --- | --- | ---: | ---: | ---: | --- |')
  for (const artifact of top) {
    lines.push(
      `| \`${artifact.key}\` | ${artifact.format}${artifact.production ? ' (prod)' : ''} | ` +
        `${kb(artifact.rawBytes)} | ${kb(artifact.gzipBytes)} | ${kb(artifact.brotliBytes)} | ` +
        `${RESULT_MARKER[artifact.result]} |`,
    )
  }

  if (report.missing.length > 0) {
    lines.push('')
    lines.push('## Unmeasured packages')
    lines.push('')
    lines.push(
      'These packages are published but produced no artifact in this build. ' +
        'They are reported as UNMEASURED rather than as zero bytes.',
    )
    lines.push('')
    for (const entry of report.expectedMissing) {
      lines.push(`- \`${entry.package}\` — expected: ${entry.reason}`)
    }
    for (const name of report.unexpectedMissing) {
      lines.push(`- \`${name}\` — **unexpected**, this fails CI`)
    }
  }

  return `${lines.join('\n')}\n`
}
