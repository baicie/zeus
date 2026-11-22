/**
 * The readiness report is informational; the gates beside it are not (R22 TASK 28).
 *
 * `check:create-zeus`, `check:create-zeus-packed` and `check:rc-readiness` used
 * to share one step with `continue-on-error: true`. The first two are real
 * gates — they build a project from the candidate tarballs and run it — and a
 * failure in either was swallowed exactly like a readiness report that could not
 * read an environment's protection rules.
 *
 * `check:rc-readiness` has to tolerate failure: its `environments` probe needs
 * an Administration scope `GITHUB_TOKEN` cannot carry, so it reports `not_run`,
 * which is honest and must not be read as a pass. That is the only command
 * allowed to be informational, and this test is what keeps it that way.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
)

/**
 * Every step's `name`, `run` and `continue-on-error`, in file order.
 *
 * Deliberately a small line scanner rather than a YAML parser: the workflow is
 * read here for one property, and a parser would bring its own opinions about
 * anchors and merge keys that the file does not use.
 */
function steps(): Array<{ name: string; run: string; lenient: boolean }> {
  const lines = workflow.split('\n')
  const found: Array<{ name: string; run: string; lenient: boolean }> = []
  let current: { name: string; run: string; lenient: boolean } | null = null
  for (const line of lines) {
    const name = /^\s*- name: (.+)$/.exec(line)
    if (name) {
      if (current) found.push(current)
      current = { name: name[1].trim(), run: '', lenient: false }
      continue
    }
    if (!current) continue
    const run = /^\s*run: (.+)$/.exec(line)
    if (run) current.run = run[1].trim()
    if (/^\s*continue-on-error: true\s*$/.test(line)) current.lenient = true
  }
  if (current) found.push(current)
  return found
}

describe('CI step leniency', () => {
  it('never marks a create-zeus gate as continue-on-error', () => {
    const gates = steps().filter(step => step.run.includes('check:create-zeus'))
    expect(gates.length).toBeGreaterThan(0)
    const lenient = gates.filter(step => step.lenient).map(step => step.name)
    expect(
      lenient,
      `a create-zeus gate must fail the job; these tolerate failure: ${lenient.join(', ')}`,
    ).toEqual([])
  })

  it('keeps the readiness report as its own informational step', () => {
    const readiness = steps().filter(step =>
      step.run.includes('check:rc-readiness'),
    )
    expect(readiness.length).toBe(1)
    expect(readiness[0].lenient).toBe(true)
    // And it must not carry the gates with it.
    expect(readiness[0].run).not.toContain('check:create-zeus')
  })

  it('runs the readiness report even when an earlier step failed', () => {
    // `if: always()` is what makes the report describe a failed run rather than
    // being skipped by the gate failure in front of it.
    const source = workflow.slice(
      workflow.indexOf('name: RC readiness report'),
      workflow.indexOf('name: Preserve RC readiness report'),
    )
    expect(source).toContain('if: always()')
  })
})
