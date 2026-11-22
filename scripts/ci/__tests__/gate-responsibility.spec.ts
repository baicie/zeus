/**
 * Which gate is responsible for what, and which failures may be excused (R23 TASK 07).
 *
 * Six things can say no to a release, and they answer different questions:
 *
 *   unit               — does the code behave
 *   browser E2E        — does it behave in a real engine
 *   candidate consumer — does it work when installed, not aliased
 *   canary preflight   — can this tree be published at all
 *   registry smoke     — did what we published actually land
 *   real acceptance    — is the deployed product usable
 *
 * A gate that silently tolerates failure moves the question somewhere it cannot
 * be answered. The R22 `continue-on-error` bug was exactly that: readiness and
 * `check:create-zeus` shared one lenient step, so a real gate was excused by an
 * informational report's leniency.
 *
 * The other direction matters as much. A pull request must not be blocked for
 * lacking publish credentials — it cannot have them, and asking makes every
 * contributor's build red for a reason they cannot fix. So some steps *must* be
 * lenient, and this file names which and why, rather than asserting a blanket
 * "no `continue-on-error`".
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const workflowsDir = path.join(root, '.github/workflows')

function workflow(name: string): string {
  return fs.readFileSync(path.join(workflowsDir, name), 'utf8')
}

/** Every step in a workflow: its name, run command and leniency. */
function steps(source: string): Array<{
  name: string
  run: string
  lenient: boolean
  conditional: boolean
}> {
  const lines = source.split('\n')
  const found: Array<{
    name: string
    run: string
    lenient: boolean
    conditional: boolean
  }> = []
  let current: (typeof found)[number] | null = null
  for (const line of lines) {
    const name = /^\s*- name: (.+)$/.exec(line)
    if (name) {
      if (current) found.push(current)
      current = {
        name: name[1]!.trim(),
        run: '',
        lenient: false,
        conditional: false,
      }
      continue
    }
    if (!current) continue
    const run = /^\s*run: (.+)$/.exec(line)
    if (run) current.run = run[1]!.trim()
    if (/^\s*continue-on-error: true\s*$/.test(line)) current.lenient = true
    if (/^\s*if: /.test(line)) current.conditional = true
  }
  if (current) found.push(current)
  return found
}

/**
 * Steps allowed to tolerate failure, each with the reason.
 *
 * Adding one here is the decision; the assertion below is what makes it a
 * decision rather than an edit nobody noticed.
 */
const EXCUSED = [
  {
    workflow: 'ci.yml',
    step: 'RC readiness report (informational)',
    why:
      'Its `environments` probe needs an Administration scope GITHUB_TOKEN cannot ' +
      'carry, so it reports not_run on every run. Not a gate: the gates it ' +
      'describes are separate steps that fail the job.',
  },
  {
    workflow: 'release-canary.yml',
    step: 'Clean Canary staging dist-tags',
    why:
      'Cleanup after a canary publish. A failure here leaves a staging tag ' +
      'behind, which the next run overwrites; it does not make the canary ' +
      'wrong, and failing the job would report the publish as broken when it was not.',
  },
] as const

describe('gate responsibility', () => {
  it('excuses exactly the steps that say why they are excused', () => {
    const lenient: Array<{ workflow: string; step: string }> = []
    for (const name of fs.readdirSync(workflowsDir)) {
      if (!name.endsWith('.yml')) continue
      for (const step of steps(workflow(name))) {
        if (step.lenient) lenient.push({ workflow: name, step: step.name })
      }
    }

    const excusedKeys = EXCUSED.map(entry => `${entry.workflow}::${entry.step}`)
    const actualKeys = lenient.map(entry => `${entry.workflow}::${entry.step}`)
    expect(
      actualKeys.sort(),
      `a step tolerates failure without being listed here with a reason`,
    ).toEqual(excusedKeys.sort())
  })

  it('never excuses a step that runs a gate', () => {
    // The specific bug this prevents: readiness leniency applied to
    // `check:create-zeus`, which is a gate. A lenient step must not carry any
    // command whose name says it checks something.
    const gates = [
      'check:create-zeus',
      'check:packed-consumers',
      'test-unit',
      'check:native-install',
      'release:precheck',
      'release:verify',
      'check:native-packages',
      'check:release-pairing',
    ]
    for (const entry of EXCUSED) {
      const source = workflow(entry.workflow)
      const step = steps(source).find(
        candidate => candidate.name === entry.step,
      )
      expect(
        step,
        `${entry.workflow} has no step named ${entry.step}`,
      ).toBeDefined()
      for (const gate of gates) {
        expect(
          step!.run,
          `"${entry.step}" is excused but runs the gate ${gate}`,
        ).not.toContain(gate)
      }
    }
  })

  it('gives every excused step a reason long enough to be one', () => {
    for (const entry of EXCUSED) {
      expect(
        entry.why.length,
        `${entry.workflow}::${entry.step} has no real reason`,
      ).toBeGreaterThan(60)
    }
  })
})

describe('a pull request is never blocked for lacking credentials', () => {
  it('keeps publish-dependent steps out of the PR workflow', () => {
    // `ci.yml` runs on pull_request. A step that needs NPM_TOKEN, a GitHub
    // environment or a tag would fail there for a reason no contributor can
    // fix, so it must live in a release workflow instead.
    const source = workflow('ci.yml')
    for (const forbidden of [
      'NPM_TOKEN',
      'release:verify:published',
      'release --publishOnly',
      'npm publish',
      'release:canary',
    ]) {
      expect(
        source,
        `ci.yml runs on pull requests and must not reference ${forbidden}`,
      ).not.toContain(forbidden)
    }
  })

  it('keeps the release-only checks in the release workflows', () => {
    // The complement, so "move it to release.yml" cannot become "delete it".
    for (const [name, marker] of [
      ['release.yml', 'release:verify:published'],
      ['release-canary.yml', 'release:verify:published'],
    ] as const) {
      expect(
        workflow(name),
        `${name} must verify the publication it just made`,
      ).toContain(marker)
    }
  })
})
