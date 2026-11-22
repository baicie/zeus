/**
 * `check:rc-readiness` must run in a job that can see an SBOM.
 *
 * GitHub Actions jobs run on separate runners and share no filesystem. R7 put
 * `pnpm check:sbom:write` in `lint-and-check`; `check:rc-readiness` runs in
 * `packed-consumers`. The SBOM was written on one runner and read on another,
 * so `sbom` reported `not_run` on every run — a gate with no input, which reads
 * exactly like a gate that was never configured.
 *
 * This test checks the property rather than the current line numbers: for the
 * job that runs `check:rc-readiness`, there must be a `check:sbom:write` step
 * in that same job.
 *
 * Read as text for the same reason the other workflow tests are: the repository
 * carries no YAML parser for tests.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const workflow = readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
)

/** Map of job name to that job's text. */
function jobs(): Record<string, string> {
  const lines = workflow.split('\n')
  const found: Record<string, string> = {}
  let current: string | undefined
  let body: string[] = []
  for (const line of lines) {
    const match = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)
    if (match) {
      if (current) found[current] = body.join('\n')
      current = match[1]
      body = []
      continue
    }
    body.push(line)
  }
  if (current) found[current] = body.join('\n')
  return found
}

describe('rc-readiness has its inputs in the same job', () => {
  const all = jobs()

  it('finds the job that runs rc-readiness', () => {
    const runner = Object.entries(all).find(([, body]) =>
      body.includes('check:rc-readiness'),
    )
    expect(runner, 'no job runs check:rc-readiness').toBeDefined()
  })

  it('generates the SBOM in that same job', () => {
    const runner = Object.entries(all).find(([, body]) =>
      body.includes('check:rc-readiness'),
    )!
    expect(
      runner[1].includes('check:sbom:write'),
      `${runner[0]} runs check:rc-readiness but never writes the SBOM it reads; jobs do not share temp/`,
    ).toBe(true)
  })

  it('writes the SBOM before reading it', () => {
    const [, body = ''] = Object.entries(all).find(([, text]) =>
      text.includes('check:rc-readiness'),
    )!
    /*
     * Anchor on the two steps' own `run:` lines, not on any occurrence of the
     * command names: the explanatory comments above both steps mention
     * `check:rc-readiness` and would otherwise be found first.
     *
     * The readiness anchor used to be `run: pnpm check:create-zeus &&`, the
     * shared step that carried the gates. That step no longer exists — the
     * gates are their own steps and the published-registry variant is not in CI
     * at all — so the anchor is the readiness step's own command.
     */
    const sbomStep = body.indexOf('run: pnpm check:sbom:write')
    const readinessStep = body.indexOf('run: pnpm check:rc-readiness')
    expect(sbomStep).toBeGreaterThanOrEqual(0)
    expect(readinessStep).toBeGreaterThanOrEqual(0)
    expect(sbomStep).toBeLessThan(readinessStep)
  })
})
