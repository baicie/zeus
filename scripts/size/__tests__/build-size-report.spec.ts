import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  REPORT_SCHEMA,
  artifactKey,
  buildReport,
  collectArtifacts,
  evaluateArtifact,
  findRule,
  renderMarkdown,
  toBaseline,
  type ArtifactMeasurement,
  type BudgetFile,
  type BudgetRule,
} from '../build-size-report'

const roots: string[] = []

function workspace(
  packages: Array<{
    name: string
    files: Record<string, string>
    private?: boolean
  }>,
): Array<{ name: string; dir: string; packageJson: Record<string, unknown> }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-size-report-'))
  roots.push(root)
  return packages.map(pkg => {
    const dir = path.join(root, pkg.name.replace(/[@/]/g, '_'))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: pkg.name, version: '0.0.0' }),
    )
    for (const [relative, content] of Object.entries(pkg.files)) {
      const file = path.join(dir, relative)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
    return {
      name: pkg.name,
      dir,
      packageJson: pkg.private ? { private: true } : {},
    }
  })
}

function artifact(
  overrides: Partial<ArtifactMeasurement> = {},
): ArtifactMeasurement {
  return {
    packageName: '@zeus-js/signal',
    file: 'dist/signal.esm-browser.prod.js',
    format: 'esm-browser',
    production: true,
    rawBytes: 17_642,
    gzipBytes: 6_320,
    brotliBytes: 5_816,
    ...overrides,
  }
}

/**
 * Content that gzip cannot collapse.
 *
 * A repeated single byte is the wrong fixture for a size test: 50,000 `x`
 * characters compress to about 48 bytes, so a "large" file looks tiny and a
 * growth assertion never fires. This produces deterministic pseudo-random
 * characters that compress only slightly, the way real minified code behaves.
 */
function incompressible(bytes: number): string {
  const alphabet =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$(){}[];:,.<>=+-*/&|!?'
  let state = 0x2f6e2b1
  let out = ''
  for (let index = 0; index < bytes; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    out += alphabet[state % alphabet.length]
  }
  return out
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('collectArtifacts', () => {
  it('classifies each build format', () => {
    const packages = workspace([
      {
        name: '@zeus-js/signal',
        files: {
          'dist/signal.global.prod.js': 'a',
          'dist/signal.global.js': 'a',
          'dist/signal.esm-browser.prod.js': 'a',
          'dist/signal.esm-browser.js': 'a',
          'dist/signal.esm-bundler.js': 'a',
          'dist/signal.prod.cjs': 'a',
          'dist/signal.cjs': 'a',
          'dist/signal.d.ts': 'a',
        },
      },
    ])
    const { artifacts } = collectArtifacts(packages)
    const formats = Object.fromEntries(
      artifacts.map(item => [item.file, `${item.format}:${item.production}`]),
    )
    expect(formats['dist/signal.global.prod.js']).toBe('global:true')
    expect(formats['dist/signal.global.js']).toBe('global:false')
    expect(formats['dist/signal.esm-browser.prod.js']).toBe('esm-browser:true')
    expect(formats['dist/signal.esm-browser.js']).toBe('esm-browser:false')
    expect(formats['dist/signal.esm-bundler.js']).toBe('esm-bundler:false')
    expect(formats['dist/signal.prod.cjs']).toBe('cjs:true')
    expect(formats['dist/signal.cjs']).toBe('cjs:false')
    expect(formats['dist/signal.d.ts']).toBe('dts:false')
  })

  it('measures raw, gzip and brotli for every artifact', () => {
    const body = 'export const x = 1\n'.repeat(200)
    const packages = workspace([
      {
        name: '@zeus-js/signal',
        files: { 'dist/signal.esm-bundler.js': body },
      },
    ])
    const { artifacts } = collectArtifacts(packages)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]!.rawBytes).toBe(Buffer.byteLength(body))
    expect(artifacts[0]!.gzipBytes).toBeLessThan(artifacts[0]!.rawBytes)
    expect(artifacts[0]!.brotliBytes).toBeLessThan(artifacts[0]!.rawBytes)
  })

  it('skips sourcemaps, which are diagnostics rather than shipped bytes', () => {
    const packages = workspace([
      {
        name: '@zeus-js/signal',
        files: {
          'dist/signal.esm-bundler.js': 'a',
          'dist/signal.esm-bundler.js.map': '{}',
        },
      },
    ])
    const { artifacts } = collectArtifacts(packages)
    expect(artifacts.map(item => item.file)).toEqual([
      'dist/signal.esm-bundler.js',
    ])
  })

  it('skips private packages, which never reach npm', () => {
    const packages = workspace([
      {
        name: '@zeus-js/example-admin',
        private: true,
        files: { 'dist/index.js': 'a' },
      },
    ])
    const { artifacts, missing } = collectArtifacts(packages)
    expect(artifacts).toHaveLength(0)
    expect(missing).toHaveLength(0)
  })

  it('reports a public package with no dist as missing rather than as zero', () => {
    const packages = workspace([{ name: '@zeus-js/signal', files: {} }])
    const { artifacts, missing } = collectArtifacts(packages)
    expect(artifacts).toHaveLength(0)
    expect(missing).toEqual(['@zeus-js/signal'])
  })

  it('measures a native package whose binary sits at the package root', () => {
    const packages = workspace([
      {
        name: '@zeus-js/compiler-native-linux-x64-gnu',
        files: { 'zeus-compiler-native.linux-x64-gnu.node': 'binary' },
      },
    ])
    const { artifacts, missing } = collectArtifacts(packages)
    expect(missing).toHaveLength(0)
    expect(artifacts[0]!.format).toBe('native')
    expect(artifacts[0]!.production).toBe(true)
  })
})

describe('findRule', () => {
  const rules: BudgetRule[] = [
    { format: 'native', tolerancePercent: 10 },
    { package: '@zeus-js/signal', tolerancePercent: 15 },
    { artifact: '@zeus-js/signal/dist/signal.global.js', limitKiB: 20 },
  ]

  it('prefers an exact artifact rule', () => {
    const rule = findRule(artifact({ file: 'dist/signal.global.js' }), rules)
    expect(rule?.limitKiB).toBe(20)
  })

  it('falls back to a package rule', () => {
    const rule = findRule(artifact(), rules)
    expect(rule?.package).toBe('@zeus-js/signal')
  })

  it('falls back to a format rule', () => {
    const rule = findRule(
      artifact({
        packageName: '@zeus-js/compiler-native-linux-x64-gnu',
        file: 'x.node',
        format: 'native',
      }),
      rules,
    )
    expect(rule?.format).toBe('native')
  })

  it('returns undefined when no rule matches', () => {
    expect(
      findRule(artifact({ packageName: '@zeus-js/other' }), rules),
    ).toBeUndefined()
  })
})

describe('evaluateArtifact', () => {
  it('passes within a tolerance of the baseline', () => {
    const report = evaluateArtifact(
      artifact({ gzipBytes: 6_500 }),
      { package: '@zeus-js/signal', metric: 'gzip', tolerancePercent: 15 },
      artifact(),
    )
    expect(report.result).toBe('PASS')
    expect(report.deltaBytes).toBe(180)
  })

  it('reports a regression beyond the tolerance and attributes the delta', () => {
    const report = evaluateArtifact(
      artifact({ gzipBytes: 9_000 }),
      { package: '@zeus-js/signal', metric: 'gzip', tolerancePercent: 15 },
      artifact(),
    )
    expect(report.result).toBe('REGRESSION')
    expect(report.detail).toContain('tolerance 15%')
    expect(report.deltaPercent).toBeCloseTo(42.4, 1)
  })

  it('enforces an absolute limit in kibibytes', () => {
    const rule: BudgetRule = {
      artifact: '@zeus-js/signal/dist/signal.esm-browser.prod.js',
      metric: 'gzip',
      limitKiB: 8,
    }
    expect(evaluateArtifact(artifact(), rule, artifact()).result).toBe('PASS')
    expect(
      evaluateArtifact(artifact({ gzipBytes: 9 * 1024 }), rule, artifact())
        .result,
    ).toBe('REGRESSION')
  })

  it('marks an artifact with no matching rule as NO_BUDGET, never PASS', () => {
    const report = evaluateArtifact(artifact(), undefined, artifact())
    expect(report.result).toBe('NO_BUDGET')
  })

  it('fails a baseline-relative rule when the baseline has no entry', () => {
    const report = evaluateArtifact(
      artifact(),
      { package: '@zeus-js/signal', tolerancePercent: 15 },
      undefined,
    )
    expect(report.result).toBe('REGRESSION')
    expect(report.detail).toContain('no baseline entry')
  })

  it('fails a rule that states neither a limit nor a tolerance', () => {
    const report = evaluateArtifact(
      artifact(),
      { package: '@zeus-js/signal' },
      artifact(),
    )
    expect(report.result).toBe('REGRESSION')
    expect(report.detail).toContain('neither a limit nor a tolerance')
  })

  it('compares against raw bytes when the rule asks for raw', () => {
    const report = evaluateArtifact(
      artifact({ rawBytes: 30_000 }),
      { package: '@zeus-js/signal', metric: 'raw', tolerancePercent: 15 },
      artifact(),
    )
    expect(report.result).toBe('REGRESSION')
    expect(report.budget?.metric).toBe('raw')
  })
})

describe('buildReport', () => {
  const budget: BudgetFile = {
    schema: REPORT_SCHEMA,
    baseline: { commit: 'base', measuredAt: '2026-11-12' },
    rules: [
      { package: '@zeus-js/signal', metric: 'gzip', tolerancePercent: 15 },
    ],
  }

  it('summarises pass, regression, missing and no-budget counts', () => {
    const packages = workspace([
      {
        name: '@zeus-js/signal',
        files: {
          'dist/signal.esm-browser.prod.js': incompressible(1_000),
          'dist/signal.global.prod.js': incompressible(20_000),
        },
      },
      { name: '@zeus-js/broken', files: {} },
    ])
    const report = buildReport({
      packages,
      currentSha: 'abc1234',
      budget,
      baseline: {
        commit: 'base',
        artifacts: [
          artifact({
            file: 'dist/signal.esm-browser.prod.js',
            gzipBytes: 6_320,
          }),
          artifact({ file: 'dist/signal.global.prod.js', gzipBytes: 40 }),
        ],
      },
      now: '2026-11-12T00:00:00.000Z',
    })
    expect(report.schema).toBe(REPORT_SCHEMA)
    expect(report.currentSha).toBe('abc1234')
    expect(report.baselineSha).toBe('base')
    expect(report.summary.measured).toBe(2)
    expect(report.summary.unmeasured).toBe(1)
    // The global artifact is 20 KB of incompressible content against a 40 B
    // baseline, so it regresses. The 1 KB browser artifact gzips to roughly
    // 400 B — *below* its 6320 B baseline — so it passes; that asymmetry is
    // what makes this a useful fixture rather than two identical assertions.
    expect(report.summary.regressions).toBe(1)
    expect(report.missing).toEqual(['@zeus-js/broken'])
  })

  it('treats a missing baseline set as no comparison rather than a failure', () => {
    const packages = workspace([
      { name: '@zeus-js/signal', files: { 'dist/signal.esm-bundler.js': 'x' } },
    ])
    const report = buildReport({ packages, currentSha: 'abc' })
    expect(report.artifacts[0]!.result).toBe('NO_BUDGET')
    expect(report.artifacts[0]!.baselineBytes).toBeUndefined()
  })

  it('separates a declared-expected missing package from an unexpected one', () => {
    const packages = workspace([
      { name: '@zeus-js/signal', files: { 'dist/signal.esm-bundler.js': 'x' } },
      { name: 'create-zeus', files: {} },
      { name: '@zeus-js/surprise', files: {} },
    ])
    const report = buildReport({
      packages,
      currentSha: 'abc',
      budget: {
        schema: REPORT_SCHEMA,
        baseline: { commit: 'b', measuredAt: 'x' },
        rules: [{ package: '@zeus-js/signal', metric: 'gzip', limitKiB: 1 }],
        expectedUnmeasured: [
          { package: 'create-zeus', reason: 'built by its own package script' },
        ],
      },
    })
    expect(report.expectedMissing).toEqual([
      { package: 'create-zeus', reason: 'built by its own package script' },
    ])
    expect(report.unexpectedMissing).toEqual(['@zeus-js/surprise'])
    // Both are still absent from the measurements; the declaration only
    // explains one of them.
    expect(report.missing).toEqual(['create-zeus', '@zeus-js/surprise'])
    expect(report.summary.unmeasured).toBe(2)
  })
})

describe('toBaseline', () => {
  it('stores identity and measurement only, never the evaluation', () => {
    const packages = workspace([
      {
        name: '@zeus-js/signal',
        files: { 'dist/signal.esm-bundler.js': 'abc' },
      },
    ])
    const report = buildReport({ packages, currentSha: 'abc1234' })
    const baseline = toBaseline(report, 'note', '2026-11-12')
    expect(baseline.commit).toBe('abc1234')
    expect(baseline.note).toBe('note')
    expect(baseline.artifacts[0]).not.toHaveProperty('result')
    expect(baseline.artifacts[0]).toMatchObject({
      packageName: '@zeus-js/signal',
      file: 'dist/signal.esm-bundler.js',
    })
  })
})

describe('renderMarkdown', () => {
  it('lists regressions before the largest artifacts', () => {
    const packages = workspace([
      {
        name: '@zeus-js/signal',
        files: {
          'dist/signal.esm-browser.prod.js': incompressible(50_000),
        },
      },
    ])
    const report = buildReport({
      packages,
      currentSha: 'abc',
      budget: {
        schema: REPORT_SCHEMA,
        baseline: { commit: 'b', measuredAt: 'x' },
        rules: [{ package: '@zeus-js/signal', tolerancePercent: 5 }],
      },
      baseline: {
        commit: 'b',
        artifacts: [artifact({ gzipBytes: 100 })],
      },
      now: '2026-11-12T00:00:00.000Z',
    })
    const markdown = renderMarkdown(report)
    expect(markdown.indexOf('## Regressions')).toBeLessThan(
      markdown.indexOf('## Largest artifacts'),
    )
    expect(markdown).toContain('❌ REGRESSION')
    expect(markdown).toContain('abc')
    expect(markdown).toContain('b')
  })

  it('names unmeasured packages so a gap is visible beside the numbers', () => {
    const packages = workspace([{ name: '@zeus-js/broken', files: {} }])
    const report = buildReport({ packages, currentSha: 'abc' })
    const markdown = renderMarkdown(report)
    expect(markdown).toContain('## Unmeasured packages')
    expect(markdown).toContain('`@zeus-js/broken`')
  })
})

describe('artifactKey', () => {
  it('joins package and file with a slash', () => {
    expect(artifactKey(artifact())).toBe(
      '@zeus-js/signal/dist/signal.esm-browser.prod.js',
    )
  })
})
