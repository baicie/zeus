/**
 * What the acceptance reports may and may not summarise.
 *
 * These three documents used to be written by hand during a release, so the
 * failure mode worth testing is a summary that is smaller than the thing it
 * summarises: "5 of 5" for a run that only covered five templates, or a
 * blocked probe counted as a render.
 */
import { describe, expect, it } from 'vitest'

import {
  browserAcceptance,
  type CandidateReportLike,
  templateAcceptance,
} from '../ui-acceptance-reports'

const UI_COMMIT = 'a'.repeat(40)
const VERSION = '0.2.0-rc.8'

function candidate(
  templates: CandidateReportLike['templates'],
  extra: Partial<CandidateReportLike> = {},
): CandidateReportLike {
  return {
    passed: true,
    coreVersion: VERSION,
    uiVersion: VERSION,
    templates,
    ...extra,
  }
}

describe('template acceptance', () => {
  it('counts the templates the report carries, not a constant', () => {
    const report = templateAcceptance(
      VERSION,
      UI_COMMIT,
      candidate([
        { template: 'basic-ts', passed: true, pinMatch: true },
        { template: 'admin-ts', passed: true, pinMatch: true },
      ]),
    )
    expect(report.templates).toBe(2)
    expect(report.passed).toBe(2)
  })

  it('refuses to summarise a run that failed', () => {
    expect(() =>
      templateAcceptance(
        VERSION,
        UI_COMMIT,
        candidate(
          [
            { template: 'basic-ts', passed: true, pinMatch: true },
            { template: 'admin-ts', passed: false, pinMatch: true },
          ],
          { passed: false },
        ),
      ),
    ).toThrow(/did not pass \(failed: admin-ts\)/)
  })

  it('refuses a template that did not match its pins', () => {
    expect(() =>
      templateAcceptance(
        VERSION,
        UI_COMMIT,
        candidate([{ template: 'basic-ts', passed: true, pinMatch: false }]),
      ),
    ).toThrow(/basic-ts did not match its pins/)
  })

  it('refuses an empty candidate report', () => {
    expect(() => templateAcceptance(VERSION, UI_COMMIT, candidate([]))).toThrow(
      /no templates/,
    )
  })

  it('records where the Core came from', () => {
    const fromRegistry = templateAcceptance(
      VERSION,
      UI_COMMIT,
      candidate([{ template: 'basic-ts', passed: true, pinMatch: true }], {
        coreFromRegistry: true,
      }),
    )
    expect(fromRegistry.coreSource).toBe('registry')

    const fromWorkspace = templateAcceptance(
      VERSION,
      UI_COMMIT,
      candidate([{ template: 'basic-ts', passed: true, pinMatch: true }]),
    )
    expect(fromWorkspace.coreSource).toBe('workspace')
  })
})

describe('browser acceptance', () => {
  it('counts only probes that rendered', () => {
    const report = browserAcceptance(
      VERSION,
      UI_COMMIT,
      candidate([
        {
          template: 'basic-ts',
          passed: true,
          loadProbe: { status: 'passed', detail: 'rendered 89 characters' },
        },
        {
          template: 'admin-ts',
          passed: true,
          loadProbe: { status: 'passed', detail: 'rendered 176 characters' },
        },
        /* No dist/index.html, so nothing was opened. */
        { template: 'component-library-ts', passed: true },
      ]),
    )
    expect(report.probes).toBe(2)
    expect(report.passed).toBe(2)
    expect(report.skipped).toEqual(['component-library-ts'])
  })

  it('does not count a blocked probe as a render', () => {
    /*
     * A machine with no browser proves nothing about the page. Counting it as
     * a pass would claim a render nobody saw; counting it as a failure would
     * report a template defect. It is excluded and named.
     */
    const report = browserAcceptance(
      VERSION,
      UI_COMMIT,
      candidate([
        {
          template: 'basic-ts',
          passed: true,
          loadProbe: { status: 'blocked', detail: 'no browser available' },
        },
        {
          template: 'admin-ts',
          passed: true,
          loadProbe: { status: 'passed', detail: 'rendered 176 characters' },
        },
      ]),
    )
    expect(report.probes).toBe(1)
    expect(report.passed).toBe(1)
    expect(report.skipped).toEqual(['basic-ts'])
  })

  it('refuses a probe that failed', () => {
    expect(() =>
      browserAcceptance(
        VERSION,
        UI_COMMIT,
        candidate([
          {
            template: 'basic-ts',
            passed: true,
            loadProbe: { status: 'failed', detail: 'page errors: boom' },
          },
        ]),
      ),
    ).toThrow(/basic-ts failed: page errors: boom/)
  })

  it('refuses when nothing was opened at all', () => {
    expect(() =>
      browserAcceptance(
        VERSION,
        UI_COMMIT,
        candidate([{ template: 'component-library-ts', passed: true }]),
      ),
    ).toThrow(/no browser acceptance to report/)
  })
})
