/**
 * The canary must fail a stale commit before it spends seven native builds.
 *
 * `canary-dry-run` is the only job that used to check whether the workflow SHA
 * was still `origin/main`, and it `needs: native-prebuild`. Nine consecutive
 * merges in one evening therefore compiled seven platforms each — every one of
 * them successfully — and only then failed on a check that needs nothing but
 * `git ls-remote`.
 *
 * The fix runs the same check in `release-preflight`, which `native-prebuild`
 * depends on. Two properties have to hold at once, and both are asserted here:
 *
 * 1. the early check exists and sits before `native-prebuild`, so a stale run
 *    costs a checkout instead of seven builds;
 * 2. the late check stays, because the early one cannot see a push that lands
 *    between it and the actual packaging — that window is exactly what the
 *    late check closes.
 *
 * Read as text for the same reason the other workflow tests are: the
 * repository carries no YAML parser for tests.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const workflow = readFileSync(
  path.join(root, '.github/workflows/release-canary.yml'),
  'utf8',
)

/** The `- name:` steps of one job, in order. */
function stepsOf(job: string): { name: string; block: string }[] {
  const lines = workflow.split('\n')
  const start = lines.findIndex(line => line.trimEnd() === `  ${job}:`)
  expect(start, `job ${job} must exist`).toBeGreaterThanOrEqual(0)
  const steps: { name: string; block: string }[] = []
  let current: { name: string; block: string } | undefined
  for (const line of lines.slice(start + 1)) {
    // A sibling job at two-space indent ends this one.
    if (/^ {2}[a-z][a-z0-9-]*:\s*$/.test(line)) break
    const match = /^ {6}- name:\s*(.+)$/.exec(line)
    if (match) {
      if (current) steps.push(current)
      current = { name: match[1]!.trim(), block: '' }
      continue
    }
    if (current) current.block += `${line}\n`
  }
  if (current) steps.push(current)
  return steps
}

describe('Release Canary fails stale commits before the native matrix', () => {
  it('runs the head check in release-preflight', () => {
    const steps = stepsOf('release-preflight')
    const names = steps.map(step => step.name)
    expect(
      names.some(name => /verify.*main.*head/i.test(name)),
      `release-preflight must verify the main head before native-prebuild; steps: ${names.join(' | ')}`,
    ).toBe(true)
  })

  it('runs after install but before anything that builds', () => {
    /*
     * The check goes through `tsx`, a dev dependency, so it needs
     * `node_modules` — placing it before `pnpm install` would fail. What it
     * must precede is the work that costs real time: the dependency audit and,
     * through the job dependency, the seven-platform native matrix.
     */
    const names = stepsOf('release-preflight').map(step => step.name)
    const check = names.findIndex(name => /verify.*main.*head/i.test(name))
    const install = names.findIndex(name => /install dependencies/i.test(name))
    const audit = names.findIndex(name =>
      /production dependency audit/i.test(name),
    )
    expect(check, 'the head check must exist').toBeGreaterThanOrEqual(0)
    expect(
      check,
      `the check needs tsx from node_modules; steps: ${names.join(' | ')}`,
    ).toBeGreaterThan(install)
    if (audit >= 0) {
      expect(
        check,
        `the check must precede the audit; steps: ${names.join(' | ')}`,
      ).toBeLessThan(audit)
    }
  })

  it('keeps the late check in canary-dry-run', () => {
    const steps = stepsOf('canary-dry-run')
    expect(
      steps.some(step => /verify.*main.*head/i.test(step.name)),
      'the late check closes the window between the early check and packaging; removing it would be a regression',
    ).toBe(true)
  })

  it('guards both checks with the same main-only condition', () => {
    // A `workflow_dispatch` dry-run on a release branch is allowed and must
    // not be blocked by a main-head check it can never satisfy.
    for (const job of ['release-preflight', 'canary-dry-run']) {
      const step = stepsOf(job).find(entry =>
        /verify.*main.*head/i.test(entry.name),
      )
      expect(step, `${job} must have the check`).toBeDefined()
      expect(
        step!.block,
        `${job}'s head check must only run on refs/heads/main`,
      ).toMatch(/if:.*refs\/heads\/main/)
    }
  })
})

describe('Release Canary concurrency', () => {
  it('keeps cancel-in-progress disabled', () => {
    // Cancelling a running publish midway is worse than queueing; the
    // workflow publishes npm packages in sequence.
    expect(workflow).toMatch(/cancel-in-progress:\s*false/)
  })

  it('queues rather than dropping when many pushes arrive', () => {
    expect(workflow).toMatch(/queue:\s*max/)
  })
})

/**
 * The canary shares a concurrency queue with the real release.
 *
 * `release.yml`, `release-canary.yml`, `repair-native-latest.yml` and
 * `repair-dist-tags.yml` all declare `group: npm-release`. That is deliberate
 * for the three that publish: two npm publishes must never interleave.
 *
 * It also means every push to main queues a dry-run ahead of a manual release.
 * With `cancel-in-progress: false` and `queue: max`, a burst of merges delays
 * a human-triggered publish by the time it takes those dry-runs to drain.
 *
 * This test records the shared group so a future edit does not separate the
 * publishers by accident, and records the coupling so the trade-off stays
 * visible.
 */
describe('the npm-release queue is shared with the real release', () => {
  const root = path.resolve(import.meta.dirname, '../../..')

  it('keeps the canary and the release in one group', () => {
    for (const file of ['release.yml', 'release-canary.yml']) {
      const text = readFileSync(
        path.join(root, '.github/workflows', file),
        'utf8',
      )
      expect(text, `${file} must join the npm-release queue`).toMatch(
        /^\s*group:\s*npm-release\s*$/m,
      )
    }
  })

  it('documents that dry-runs and publishes queue together', () => {
    // Not a defect — a serialized publisher queue is the point. Recorded so
    // the cost is a decision rather than a surprise.
    expect(workflow).toMatch(/cancel-in-progress:\s*false/)
  })
})
