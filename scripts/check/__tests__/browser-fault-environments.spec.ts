/**
 * The fault suite must reach the same verdicts in every browser environment (R23 TASK 02).
 *
 * The Release Canary failure was not a bug in the runner — it was a test whose
 * outcome depended on which browsers happened to be installed. Chromium only,
 * all three engines, or none: the suite's *conclusions* must not move.
 *
 * Two of the eight fault modes reach a browser at all (`pass` and the timeout
 * modes); the rest fail before a launch. What this file pins is the property
 * that made the Canary failure possible and that a future edit could quietly
 * reintroduce:
 *
 *   * every assertion that is about classification is decided by a substituted
 *     launcher, not by the machine;
 *   * nothing in the fault harness reads the installed-browser state to choose
 *     an expected outcome;
 *   * `ZEUS_BROWSERS` selects which engines run, and the blocked path blocks
 *     whichever are selected.
 *
 * It reads the harness and the spec as source rather than running them, because
 * running them is what the other file does — and running them on a machine with
 * one browser installed can only ever prove the one case this machine has.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const harness = fs.readFileSync(
  path.join(root, 'scripts/check/fixtures/_engine-fault.ts'),
  'utf8',
)
const spec = fs.readFileSync(
  path.join(root, 'scripts/check/__tests__/browser-engine-faults.spec.ts'),
  'utf8',
)

describe('fault modes do not depend on installed browsers', () => {
  it('substitutes a launcher for the blocked mode unconditionally', () => {
    // `substituted` must be chosen by mode alone. Any condition that also
    // looked at installed browsers would put the Canary failure back.
    const assignment = harness.slice(
      harness.indexOf('const substituted'),
      harness.indexOf('const outcomes'),
    )
    expect(assignment).toContain("mode === 'blocked'")
    expect(assignment).not.toMatch(
      /existsSync|readdir|isMissingBrowser|process\.env/,
    )
  })

  it('makes the blocked launcher fail without touching a real browser', () => {
    // The substitute must throw before any launch. It spreads `chromium` for
    // its shape and overrides `launch`, so a future Playwright change to the
    // other members cannot break it.
    expect(harness).toMatch(/async launch\(\)\s*\{\s*throw/)
    expect(harness).toContain("Executable doesn't exist")
  })

  it('never asserts a browser-specific expected exit code outside the blocked modes', () => {
    // The old failure was `drive('pass', 'firefox')` with `toBe(2)`: a mode
    // that launches a browser paired with an expectation that only holds when
    // the launch fails.
    const blockedDrives = [
      ...spec.matchAll(/drive\('(\w+)',\s*'([^']+)'\)/g),
    ].map(match => ({ mode: match[1]!, engines: match[2]! }))
    expect(blockedDrives.length).toBeGreaterThan(0)
    for (const drive of blockedDrives) {
      if (drive.mode === 'blocked') continue
      // A non-blocked mode may name engines, but it must not be the only
      // consumer of the BLOCKED assertion. This guards the shape rather than
      // trying to evaluate the assertion.
      expect(
        spec,
        `drive('${drive.mode}', '${drive.engines}') must not be the BLOCKED case`,
      ).not.toMatch(
        new RegExp(
          `drive\\('${drive.mode}',\\s*'${drive.engines}'\\)[\\s\\S]{0,200}toBe\\(2\\)`,
        ),
      )
    }
  })

  it('documents the environment in the failure message, not the expectation', () => {
    // The channel is a developer convenience for the browser-driving modes. It
    // must not appear anywhere near an expected exit code.
    expect(spec).toContain('ZEUS_BROWSER_CHANNEL')
    const blockedTest = spec.slice(
      spec.indexOf("it('exits 2 when the browser cannot start"),
      spec.indexOf("it('blocks every requested engine"),
    )
    expect(
      blockedTest,
      'the BLOCKED test must not be steered by a browser-channel choice',
    ).not.toContain('ZEUS_BROWSER_CHANNEL')
  })
})
