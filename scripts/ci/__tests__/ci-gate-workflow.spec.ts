/**
 * Keeps `scripts/ci/ci-gate.ts` and `.github/workflows/ci.yml` in agreement.
 *
 * The gate has two halves that can drift apart: the dependency list the
 * workflow declares under `needs`, and the list the script insists on. If the
 * workflow drops a job, the script's `not in needs` check fails the run — good,
 * but only after someone has debugged it. If the script drops a job, the gate
 * silently stops covering it, which is worse.
 *
 * This test reads the workflow file as text. A full YAML parse would be
 * sturdier, but the repository does not currently carry a YAML parser for
 * tests and the shape here is stable and shallow. The test asserts the exact
 * block it reads, so a workflow restructure that breaks the parse fails here
 * rather than passing silently.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { REQUIRED_DEPENDENCIES } from '../ci-gate'

const root = path.resolve(import.meta.dirname, '../../..')
const workflow = readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
)

/**
 * Returns the `ci-gate` job block, or undefined.
 *
 * A job key is two spaces of indent followed by a name and a colon at
 * end-of-line. Anchoring on end-of-line matters: `- create-zeus-candidates`
 * inside a `needs:` list also looks like a two-space key once the leading
 * `- ` is stripped, and a looser pattern split the block there.
 */
function gateJob(): string | undefined {
  // Anchoring matters: `- create-zeus-candidates` inside a `needs:` list also
  // looks like a two-space key once the leading `- ` is stripped, and a looser
  // pattern split the block there. In multiline mode `$` matches at every line
  // end, so the terminator must be a *following job key* rather than `$`;
  // `ci-gate` is currently last, so the match runs to end of file.
  const start = /^ {2}ci-gate:$/m.exec(workflow)
  if (!start) return undefined
  const rest = workflow.slice(start.index + start[0].length)
  const next = /^ {2}[a-z][a-z-]*:[ \t]*$/m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

/** Extracts the `needs:` list of the `ci-gate` job. */
function gateNeeds(): string[] {
  const job = gateJob()
  if (!job) throw new Error('ci-gate job not found in ci.yml')
  const block = /^ {4}needs:\n((?:^ {6}- .+\n)+)/m.exec(job)
  if (!block) throw new Error('ci-gate has no needs list')
  return block[1]!
    .split('\n')
    .map(line => line.replace(/^\s*- /, '').trim())
    .filter(Boolean)
}

describe('ci-gate workflow wiring', () => {
  it('declares the gate job', () => {
    expect(workflow).toMatch(/^ {2}ci-gate:$/m)
  })

  it('needs exactly the dependencies the script requires', () => {
    expect(gateNeeds().sort()).toEqual([...REQUIRED_DEPENDENCIES].sort())
  })

  it('runs with always() so a failure upstream still produces a verdict', () => {
    const job = gateJob()
    expect(job).toContain('if: always()')
  })

  it('passes the needs map and the planned skips to the script', () => {
    const job = gateJob()
    expect(job).toContain('NEEDS: ${{ toJSON(needs) }}')
    // The skip list is computed by the impact job, not hardcoded here. That is
    // the difference between "this job may skip" and "this job was planned to
    // skip": only the second is a reason to accept it.
    expect(job).toContain(
      'PLANNED_SKIPS: ${{ needs.impact.outputs.planned-skips }}',
    )
    expect(job).toContain('scripts/ci/ci-gate.ts')
  })

  it('does not use continue-on-error anywhere in the gate', () => {
    const job = gateJob()
    expect(job).not.toContain('continue-on-error')
  })
})
