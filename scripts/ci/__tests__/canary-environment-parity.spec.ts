/**
 * The Canary and main CI must not diverge in ways that change a test's verdict (R23 TASK 06).
 *
 * The R23 failure was exactly this: `browser-engine-faults.spec.ts` passed in
 * main CI and failed in the Canary, on the same commit, because the two
 * workflows install browsers differently. Main CI runs
 * `playwright install --no-shell …`; both release workflows omit `--no-shell`.
 * That flag decides whether `chromium_headless_shell` is present, and a test
 * that launches a browser can tell the difference.
 *
 * The fix for that one test is mine to make (PR #384). This file is about the
 * class: a workflow is a test environment, and two workflows running the same
 * tests with different environments is a source of red builds that cost an hour
 * each to diagnose and look like product defects.
 *
 * ## What is asserted
 *
 * Every workflow that runs `test-unit` must install Playwright the same way.
 * That is the concrete, checkable rule. The matrix below it is documentation —
 * the dimensions that *are* allowed to differ, and why each one cannot change a
 * unit test's verdict.
 *
 * This reads the workflow files rather than running them: the divergence only
 * exists in CI, and a local run can never show it.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const workflowsDir = path.join(root, '.github/workflows')

function workflow(name: string): string {
  return fs.readFileSync(path.join(workflowsDir, name), 'utf8')
}

/**
 * Every `playwright install …` command in a workflow, normalised.
 *
 * Anchored on `run:` so a comment that mentions the command — and ci.yml has
 * one, explaining the 50-second cost — is not mistaken for an invocation. The
 * first version matched the comment and failed with
 * `"playwright install 50s)" does not contain "chromium"`.
 */
function playwrightInstalls(source: string): string[] {
  return [
    ...source.matchAll(/^\s*(?:-\s*)?run:\s*(.*playwright install[^\n]*)$/gm),
  ].map(match => match[1]!.replace(/\s+/g, ' ').trim())
}

/** The workflow files that exist, so a rename cannot silently skip a case. */
function workflowNames(): string[] {
  return fs
    .readdirSync(workflowsDir)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
}

describe('Playwright installation is uniform where the same tests run', () => {
  /**
   * Workflows that run the unit suite, and therefore must present the same
   * browser environment to it.
   *
   * Not every workflow needs this. `host-deployment-prepare.yml` installs only
   * Chromium because it deploys and smoke-checks; `product-acceptance.yml`
   * installs Chromium twice for two different jobs. Those differences are
   * legitimate and none of them runs `test-unit`.
   */
  const UNIT_SUITE_WORKFLOWS = [
    'ci.yml',
    'release.yml',
    'release-canary.yml',
  ] as const

  it('every workflow that runs the unit suite installs all three engines', () => {
    for (const name of UNIT_SUITE_WORKFLOWS) {
      const source = workflow(name)
      expect(
        source,
        `${name} is listed as running the unit suite but never mentions it`,
      ).toMatch(/\b(test-unit|release:precheck|release:canary)\b/)

      const commands = playwrightInstalls(source)
      expect(commands.length, `${name} installs no browser`).toBeGreaterThan(0)
      for (const command of commands) {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
          expect(
            command,
            `${name} runs the unit suite but does not install ${engine}: "${command}"`,
          ).toContain(engine)
        }
      }
    }
  })

  it('installs them with the same flags', () => {
    // `--no-shell` is the flag that differed in R23: main CI passed it, both
    // release workflows did not, and a test that launches a browser could tell.
    // The whole command is compared rather than that one flag, so the next
    // divergence is caught the same way.
    const commands = new Map<string, string[]>()
    for (const name of UNIT_SUITE_WORKFLOWS) {
      for (const command of playwrightInstalls(workflow(name))) {
        commands.set(command, [...(commands.get(command) ?? []), name])
      }
    }
    expect(
      commands.size,
      `the unit-suite workflows install Playwright differently, which makes the ` +
        `same test environment-dependent:\n` +
        [...commands]
          .map(([command, where]) => `  ${command}\n    in ${where.join(', ')}`)
          .join('\n'),
    ).toBe(1)
  })

  it('leaves workflows that do not run the unit suite alone', () => {
    /*
     * The invariant is the conditional, not the existence of an example.
     *
     * This used to assert `withDivergentInstall.length > 0` — that at least one
     * workflow installs a partial browser set. `host-deployment-prepare` and
     * `host-deployment-stage2` were that example, and the deployment handover
     * moved them to zeus-ecosystem. Demanding a non-empty set afterwards would
     * mean the migration broke an assertion that describes correct behaviour
     * for the remaining workflows, so the claim is now what it always meant:
     * *if* a workflow installs a partial set, it must not run the unit suite.
     */
    const exempt = workflowNames().filter(
      name => !(UNIT_SUITE_WORKFLOWS as readonly string[]).includes(name),
    )
    const withDivergentInstall = exempt.filter(name =>
      playwrightInstalls(workflow(name)).some(
        command => !/chromium firefox webkit/.test(command),
      ),
    )
    for (const name of withDivergentInstall) {
      expect(
        workflow(name),
        `${name} installs a partial browser set and runs the unit suite — add it to UNIT_SUITE_WORKFLOWS or explain the difference here`,
      ).not.toMatch(/\bpnpm test-unit\b/)
    }
  })
})

describe('the environment matrix is stated, not implied', () => {
  /**
   * Dimensions that differ between main CI and the Canary, and why none of them
   * may decide a test's verdict.
   *
   * Kept as data so a new dimension has to be added deliberately, with a
   * reason, instead of appearing in a workflow and being discovered by a red
   * build.
   */
  const MATRIX = [
    {
      dimension: 'Node',
      main: '.node-version (24.16.0)',
      canary: '.node-version (24.16.0)',
      differs: false,
      why: 'Both read the same file; a difference here would change the runtime both use.',
    },
    {
      dimension: 'npm',
      main: 'bundled with Node',
      canary: 'bundled with Node',
      differs: false,
      why: 'Neither workflow pins npm separately, so both get whatever Node ships. This is the dimension R22 TASK 08 is about.',
    },
    {
      dimension: 'Playwright engines',
      main: 'chromium, firefox, webkit (--no-shell)',
      canary: 'chromium, firefox, webkit',
      differs: true,
      why: 'The --no-shell flag was the R23 divergence. Now asserted equal above.',
    },
    {
      dimension: 'Rust toolchain',
      main: '1.95.0, built in-job',
      canary: 'none — downloads native artifacts from native-prebuild',
      differs: true,
      why: 'The Canary never compiles Rust, so a Rust-only regression would surface in main CI first. It cannot change a TypeScript test result.',
    },
    {
      dimension: 'Version rewrite',
      main: 'none',
      canary: '`release:canary` rewrites versions before publishing',
      differs: true,
      why: 'Tests run in `release:precheck`, before the rewrite. A test that read its own version would break here — see the channel-aware test rule.',
    },
    {
      dimension: 'Production mode',
      main: '`__DEV__` from the vitest config',
      canary: 'same vitest config',
      differs: false,
      why: 'Both run the same unit config; the Canary adds steps, it does not switch modes.',
    },
  ]

  it('explains every dimension that is allowed to differ', () => {
    for (const row of MATRIX) {
      expect(
        row.why.length,
        `${row.dimension} differs (${row.differs}) but has no stated reason`,
      ).toBeGreaterThan(20)
    }
    // And the ones that differ are exactly the ones with a reason to.
    const differing = MATRIX.filter(row => row.differs).map(
      row => row.dimension,
    )
    expect(differing).toEqual([
      'Playwright engines',
      'Rust toolchain',
      'Version rewrite',
    ])
  })

  it('keeps the Node version identical, since both read one file', () => {
    const workflows = workflowNames().filter(name =>
      workflow(name).includes("node-version-file: '.node-version'"),
    )
    expect(workflows.length).toBeGreaterThan(0)
    // A workflow that pinned a literal Node version instead would drift from
    // the others the first time .node-version changed.
    for (const name of workflows) {
      const source = workflow(name)
      const literal = [...source.matchAll(/node-version:\s*'?(\d+)/g)].map(
        match => match[1],
      )
      // `${{ matrix.node }}` is allowed: the native matrix deliberately spans
      // several versions, and it says so in the workflow.
      if (literal.length > 0) {
        expect(
          source,
          `${name} pins literal Node ${literal.join(', ')} — the matrix job is the only place that is allowed`,
        ).toMatch(/matrix\.node/)
      }
    }
  })
})
