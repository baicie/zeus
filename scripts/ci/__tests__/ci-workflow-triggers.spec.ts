/**
 * Keeps `ci.yml` running on pull requests whose base is not `main`.
 *
 * The R6-C pull request targeted `fix/r6-a-demo-pairing`, and `ci.yml` listed
 * `pull_request: branches: [main]`. Nothing ran: no impact analysis, no
 * `packed-consumers`, and therefore no `check:admin` — the gate that is the
 * whole point of that branch. The gap did not show up because
 * `workflow_dispatch` runs on any branch, so a deliberate run passed and
 * looked like CI was green.
 *
 * The other workflows in this directory (`component-host-rc.yml`,
 * `compiler-native.yml`) never had the restriction. This test reads the
 * workflow as text, matching `ci-gate-workflow.spec.ts`: the repository does
 * not carry a YAML parser for tests, and the shape it reads is narrow.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const workflow = readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
)

/**
 * The `pull_request:` trigger, with its indented body if it has one.
 *
 * Returns `undefined` when the trigger is absent entirely — a different
 * mistake, and one this test should also catch.
 */
function pullRequestTrigger(): string | undefined {
  const lines = workflow.split('\n')
  const index = lines.findIndex(line => line.trimEnd() === '  pull_request:')
  if (index < 0) return undefined
  const body: string[] = []
  for (const line of lines.slice(index + 1)) {
    if (line.trim() === '') continue
    // A sibling key at the same indent ends the trigger's body.
    if (/^ {2}\S/.test(line)) break
    body.push(line)
  }
  return body.length === 0 ? '' : body.join('\n')
}

describe('ci.yml pull_request trigger', () => {
  it('runs for pull requests whose base is not main', () => {
    const trigger = pullRequestTrigger()
    expect(trigger, 'ci.yml must declare a pull_request trigger').toBeDefined()
    expect(
      trigger,
      'a `branches:` filter on pull_request means a stacked PR (one based on another feature branch) runs no CI at all',
    ).not.toMatch(/^\s*branches:/m)
  })

  it('still runs on every push to main', () => {
    // Removing the restriction above must not be done by removing the push
    // trigger; `main` is the only branch whose pushes build the deployables.
    expect(workflow).toMatch(/^ {2}push:\n {4}branches:\n {6}- main$/m)
  })
})
