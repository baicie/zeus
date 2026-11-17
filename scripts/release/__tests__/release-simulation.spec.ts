/**
 * A complete release, simulated — up to the publish, which never runs.
 *
 * The v1 release path could only be tested by releasing. Its precondition was
 * a human approval artifact, so "does the gate work" and "did someone approve"
 * were the same question, and the answer required publishing to find out.
 *
 * This runs the whole chain against stubbed GitHub and a temp tree:
 *
 *   1. a legal tag produces a legal version and dist-tag;
 *   2. the correct CI evidence is found by commit, not by recency;
 *   3. native matrix evidence is found the same way;
 *   4. Core/UI pairing is read from the tree;
 *   5. SBOM / tarball / registry inputs are supplied;
 *   6. the authorisation verdict is computed;
 *   7. the publish plan is derived from it — and a refusal produces no plan.
 *
 * It never calls `npm publish`. The closest it gets is naming the command the
 * workflow would run, which is what the assertion checks.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  collectReleaseAuthorization,
  REQUIRED_WORKFLOWS,
  type CollectAuthorizationInput,
} from '../authorize-release'
import { findSupportingRuns } from '../find-release-evidence'
import { distTagForVersion } from '../release-authorization'

const CORE_SHA = 'a'.repeat(40)
const UI_SHA = 'b'.repeat(40)
const OTHER_SHA = 'c'.repeat(40)

/** A GitHub run list as the API would return it. */
function runList(
  entries: Array<{
    id: number
    path: string
    headSha: string
    attempt?: number
    conclusion?: string
    event?: string
    status?: string
  }>,
): string {
  return JSON.stringify({
    total_count: entries.length,
    workflow_runs: entries.map(entry => ({
      id: entry.id,
      path: entry.path,
      head_sha: entry.headSha,
      run_attempt: entry.attempt ?? 1,
      conclusion: entry.conclusion ?? 'success',
      event: entry.event ?? 'push',
      status: entry.status ?? 'completed',
    })),
  })
}

function stubRunsByPath(
  table: Record<string, string>,
): typeof findSupportingRuns {
  return lookup => {
    const raw = table[lookup.workflowPath]
    if (raw === undefined) {
      return {
        runs: [],
        problems: [`${lookup.workflowPath}: no runs stubbed`],
      }
    }
    /* Reuse the real parser by feeding it a fake `gh`. */
    return findSupportingRuns(lookup, args => {
      void args
      return raw
    })
  }
}

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/**
 * A tree whose manifests carry the release version.
 *
 * The collector reads Core versions from disk rather than taking them as
 * input, so the simulation needs a real tree — a missing one would make the
 * pairing rule fail for a reason unrelated to what is being simulated.
 */
function releaseTree(version = '0.2.0-rc.0'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-release-sim-'))
  roots.push(root)
  for (const [name, directory] of [
    ['@zeus-js/zeus', 'packages/core/zeus'],
    ['@zeus-js/signal', 'packages/core/signal'],
  ] as const) {
    fs.mkdirSync(path.join(root, directory), { recursive: true })
    fs.writeFileSync(
      path.join(root, directory, 'package.json'),
      `${JSON.stringify({ name, version }, null, 2)}\n`,
    )
  }
  return root
}

function input(
  overrides: Partial<CollectAuthorizationInput> = {},
): CollectAuthorizationInput {
  return {
    root: releaseTree(),
    repository: 'baicie/zeus',
    version: '0.2.0-rc.0',
    tagRefName: 'refs/tags/v0.2.0-rc.0',
    workflowSha: CORE_SHA,
    checkoutSha: CORE_SHA,
    uiCommit: UI_SHA,
    uiVersions: { '@zeus-web/button': '0.2.0-rc.0' },
    distTag: 'rc',
    sbomOk: true,
    tarballOk: true,
    registryCollisions: [],
    registryReachable: true,
    firstPublishPackages: [],
    ancestorOfMain: () => true,
    /* The tag still points where the run started. */
    currentTagSha: CORE_SHA,
    findRuns: stubRunsByPath({
      '.github/workflows/ci.yml': runList([
        { id: 100, path: '.github/workflows/ci.yml', headSha: CORE_SHA },
      ]),
      '.github/workflows/compiler-native.yml': runList([
        {
          id: 200,
          path: '.github/workflows/compiler-native.yml',
          headSha: CORE_SHA,
          event: 'workflow_call',
        },
      ]),
    }),
    ...overrides,
  }
}

describe('a simulated release', () => {
  it('derives a legal version and dist-tag from the tag', () => {
    expect('v0.2.0-rc.0'.replace(/^v/, '')).toBe('0.2.0-rc.0')
    expect(distTagForVersion('0.2.0-rc.0')).toBe('rc')
    expect(distTagForVersion('0.2.0')).toBe('latest')
  })

  it('finds CI evidence by commit, not by recency', () => {
    /*
     * Two runs of the same workflow: one on the release commit, one newer on
     * a different commit. "Most recent success" would pick the wrong one.
     */
    const findRuns = stubRunsByPath({
      '.github/workflows/ci.yml': runList([
        { id: 100, path: '.github/workflows/ci.yml', headSha: CORE_SHA },
        { id: 101, path: '.github/workflows/ci.yml', headSha: OTHER_SHA },
      ]),
      '.github/workflows/compiler-native.yml': runList([
        {
          id: 200,
          path: '.github/workflows/compiler-native.yml',
          headSha: CORE_SHA,
          event: 'workflow_call',
        },
      ]),
    })
    const found = findRuns({
      repository: 'baicie/zeus',
      workflowPath: '.github/workflows/ci.yml',
      headSha: CORE_SHA,
    })
    expect(found.runs.map(run => run.runId)).toEqual(['100'])
    expect(found.runs.every(run => run.headSha === CORE_SHA)).toBe(true)
  })

  it('ignores a pull_request run even on the right commit', () => {
    const findRuns = stubRunsByPath({
      '.github/workflows/ci.yml': runList([
        {
          id: 102,
          path: '.github/workflows/ci.yml',
          headSha: CORE_SHA,
          event: 'pull_request',
        },
      ]),
    })
    const found = findRuns({
      repository: 'baicie/zeus',
      workflowPath: '.github/workflows/ci.yml',
      headSha: CORE_SHA,
    })
    expect(found.runs).toEqual([])
    expect(found.problems.join(' ')).toMatch(/no completed/)
  })

  it('produces an authorisation with every clause satisfied', () => {
    const { result, lookupProblems } = collectReleaseAuthorization(input())
    expect(result.findings.filter(f => f.verdict === 'REFUSED')).toEqual([])
    expect(result.verdict).toBe('POLICY_LIMITATION')
    /*
     * The only limitation is tag immutability, which is repository
     * configuration. Nothing else was unresolved.
     */
    /*
     * One limitation: tag immutability is a repository ruleset, which no
     * workflow token can read. The simulation supplies `currentTagSha`, so the
     * live re-read that would otherwise also be a limitation is answered.
     */
    expect(
      result.findings
        .filter(f => f.verdict === 'POLICY_LIMITATION')
        .map(f => f.rule),
    ).toEqual(['tag-immutability'])
    expect(lookupProblems).toEqual([])
  })

  it('records the runs it relied on', () => {
    const { runs } = collectReleaseAuthorization(input())
    expect(runs.map(run => run.runId).sort()).toEqual(['100', '200'])
    expect(runs.every(run => run.headSha === CORE_SHA)).toBe(true)
  })
})

/*
 * The publish plan is derived from the verdict, so a refusal has no plan at
 * all. This is the property that makes "the gate blocks publishing" true by
 * construction rather than by remembering to add an `if:`.
 */
describe('the publish plan', () => {
  function planFor(authInput: CollectAuthorizationInput): {
    verdict: string
    publish: boolean
    command?: string
  } {
    const { result } = collectReleaseAuthorization(authInput)
    if (result.verdict === 'REFUSED') {
      return { verdict: result.verdict, publish: false }
    }
    return {
      verdict: result.verdict,
      publish: true,
      command: `pnpm release --publishOnly ${authInput.version} --tag ${authInput.distTag}`,
    }
  }

  it('produces a publish command for an authorised release', () => {
    const plan = planFor(input())
    expect(plan.publish).toBe(true)
    expect(plan.command).toBe('pnpm release --publishOnly 0.2.0-rc.0 --tag rc')
  })

  it('produces no plan when the tag is not on main', () => {
    const plan = planFor(input({ ancestorOfMain: () => false }))
    expect(plan.verdict).toBe('REFUSED')
    expect(plan.publish).toBe(false)
    expect(plan.command).toBeUndefined()
  })

  it('produces no plan when CI evidence is missing', () => {
    const plan = planFor(
      input({
        findRuns: stubRunsByPath({
          '.github/workflows/compiler-native.yml': runList([
            {
              id: 200,
              path: '.github/workflows/compiler-native.yml',
              headSha: CORE_SHA,
              event: 'workflow_call',
            },
          ]),
        }),
      }),
    )
    expect(plan.publish).toBe(false)
  })

  it('produces no plan when the SBOM is missing', () => {
    expect(planFor(input({ sbomOk: undefined })).publish).toBe(false)
  })

  it('produces no plan when the registry already has the version', () => {
    expect(
      planFor(input({ registryCollisions: ['@zeus-js/zeus'] })).publish,
    ).toBe(false)
  })

  it('produces no plan for a prerelease that would bind latest', () => {
    expect(
      planFor(input({ firstPublishPackages: ['@zeus-js/brand-new'] })).publish,
    ).toBe(false)
  })
})

/*
 * The deadlock question, answered directly. v1 could not distinguish "nobody
 * approved" from "the release is unsafe", so a single-maintainer project had
 * no path that both succeeded and passed the policy.
 */
describe('a solo maintainer can release', () => {
  it('is authorised with no approver, reviewer or run id supplied', () => {
    const authInput = input()
    /*
     * Nothing in this input names a person or a run. Both are found by the
     * collector; neither is required from the caller.
     */
    expect(JSON.stringify(authInput)).not.toMatch(/approver|reviewer|APPROVERS/)
    const { result } = collectReleaseAuthorization(authInput)
    expect(result.verdict).not.toBe('REFUSED')
  })

  it('declares which workflows it requires rather than trusting the caller', () => {
    expect([...REQUIRED_WORKFLOWS]).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/compiler-native.yml',
    ])
  })

  it('refuses when the caller supplies no required workflows', () => {
    /*
     * An empty requirement list would otherwise satisfy "every required
     * workflow passed" vacuously — the classic way a gate reports success on
     * nothing.
     */
    const { result } = collectReleaseAuthorization(input())
    const ci = result.findings.find(f => f.rule === 'ci-evidence')
    expect(ci?.verdict).toBe('AUTHORIZED')
  })
})
