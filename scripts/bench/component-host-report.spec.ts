import { describe, expect, it } from 'vitest'

import { renderTrendCsv, upsertTrendReport } from './component-host-report'

import type { BenchmarkReport, BenchmarkTrend } from './component-host-report'

describe('component-host trend reports', () => {
  const first: BenchmarkReport = {
    name: 'component-host',
    createdAt: '2026-10-17T00:00:00.000Z',
    git: { branch: 'main', sha: 'a'.repeat(40) },
    size: [
      {
        file: 'component-host.css',
        raw: 3000,
        gzip: 900,
        brotli: 750,
      },
    ],
    compile: [{ name: 'build.all.ms', ms: 1500 }],
  }

  it('updates one commit while preserving measurements omitted by a partial run', () => {
    const history: BenchmarkTrend = { schemaVersion: 1, commits: [] }
    const created = upsertTrendReport(history, first)
    const updated = upsertTrendReport(created, {
      ...first,
      createdAt: '2026-10-17T01:00:00.000Z',
      size: [
        {
          file: 'component-host.css',
          raw: 3200,
          gzip: 920,
          brotli: 770,
        },
      ],
    })

    expect(updated.commits).toHaveLength(1)
    expect(updated.commits[0]?.size?.[0]?.raw).toBe(3200)
    expect(updated.commits[0]?.compile).toEqual(first.compile)
    expect(updated.commits[0]?.git?.sha).toBe('a'.repeat(40))
  })

  it('renders commit-traceable size rows with all compression formats', () => {
    const csv = renderTrendCsv({ schemaVersion: 1, commits: [first] })

    expect(csv).toContain(
      'sha,branch,createdAt,section,name,raw,gzip,brotli,ms',
    )
    expect(csv).toContain(
      `${'a'.repeat(40)},main,2026-10-17T00:00:00.000Z,size,component-host.css,3000,900,750,`,
    )
  })

  it('neutralizes formula-like branch and metric names', () => {
    const csv = renderTrendCsv({
      schemaVersion: 1,
      commits: [
        {
          ...first,
          git: { branch: '=cmd', sha: first.git!.sha },
          runtime: [{ name: '@cmd', ms: 1 }],
        },
      ],
    })

    expect(csv).toContain("'=cmd")
    expect(csv).toContain("'@cmd")
  })
})
