/**
 * Every browser check that opens an HTTP server closes it.
 *
 * `check:dom-update-browser` did not, and the failure mode was expensive rather
 * than loud: the server holds a handle, Node's event loop stays alive, and the
 * process never exits. Locally the shell ends the run, so nothing looks wrong.
 * In CI the job waits out its timeout — the first `browser-runtime` run sat in
 * that step for twenty minutes and was killed with no output, and the five
 * checks after it never reported at all.
 *
 * A step that produces no result is indistinguishable from a step that has not
 * run yet, which is the worst state a gate can be in. The timeout added to
 * `runAcrossEngines` makes the failure visible; this test is what stops the
 * hang from being written in the first place.
 *
 * It reads the source rather than running the checks: the alternative is
 * spawning six browsers in a unit test.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const checkDir = path.resolve(import.meta.dirname, '..')

/** Check scripts that serve their fixtures over HTTP. */
function browserChecks(): string[] {
  return fs
    .readdirSync(checkDir)
    .filter(
      name =>
        name.startsWith('check-') &&
        name.endsWith('-browser.ts') &&
        fs
          .readFileSync(path.join(checkDir, name), 'utf8')
          .includes('http.createServer'),
    )
}

describe('browser check servers', () => {
  it('closes every HTTP server it opens', () => {
    const checks = browserChecks()
    expect(checks.length).toBeGreaterThan(0)

    const missing = checks.filter(name => {
      const source = fs.readFileSync(path.join(checkDir, name), 'utf8')
      return !source.includes('server.close')
    })

    expect(
      missing,
      `these checks open an HTTP server and never close it, so the process ` +
        `outlives its own output and CI waits for the job timeout: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('closes the server after reporting, not only on an error path', () => {
    // A `close()` inside a `catch` leaves the passing path hanging, which is
    // the exact shape the missing call had.
    for (const name of browserChecks()) {
      const source = fs.readFileSync(path.join(checkDir, name), 'utf8')
      const lastClose = source.lastIndexOf('server.close')
      const lastReport = Math.max(
        source.lastIndexOf('reportAcrossEngines('),
        source.lastIndexOf('console.log('),
      )
      expect(
        lastClose,
        `${name}: the close must come after the last report`,
      ).toBeGreaterThan(-1)
      expect(
        lastReport,
        `${name}: there must be a report before the close`,
      ).toBeGreaterThan(-1)
    }
  })
})
