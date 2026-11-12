/**
 * Tests for change-impact analysis.
 *
 * The scenarios are the ones the task named, plus the failure modes that make
 * a skip dangerous. For each: which areas are selected, which jobs run, and —
 * for the escalation cases — that the analysis refuses to be clever.
 */
import { describe, expect, it } from 'vitest'

import {
  AREAS,
  classifyChanges,
  JOB_NEEDS,
  parseNameStatus,
  planJobs,
  type Plan,
} from '../impact-analysis'

/**
 * Every job currently declared. Asserting against this instead of a literal
 * means adding a job to `JOB_NEEDS` does not require editing the tests that
 * say "everything runs" — those tests are about the escalation rule, not
 * about how many jobs exist.
 */
const ALL_JOBS = JOB_NEEDS.length

function planFor(changed: string[], options: { fullRun?: boolean } = {}): Plan {
  return planJobs({
    classification: classifyChanges({ changedFiles: changed }),
    ...options,
  })
}

function running(plan: Plan): string[] {
  return plan.jobs
    .filter(job => job.run)
    .map(job => job.name)
    .sort()
}

describe('classifyChanges — named scenarios', () => {
  it('docs-only selects docs and nothing else', () => {
    const result = classifyChanges({
      changedFiles: ['docs/guide/quick-start.md', 'docs/index.md'],
    })
    expect(result.areas).toEqual(['docs'])
    expect(result.fullSuite).toBe(false)
  })

  it('admin-only selects admin without native or compiler', () => {
    const result = classifyChanges({
      changedFiles: ['examples/admin/src/pages.tsx'],
    })
    expect(result.areas).toContain('admin')
    expect(result.areas).not.toContain('native')
    expect(result.areas).not.toContain('compiler')
    expect(result.areas).not.toContain('docs')
  })

  it('runtime-only reaches consumers and adapters', () => {
    const result = classifyChanges({
      changedFiles: ['packages/core/runtime-dom/src/insert.ts'],
    })
    expect(result.areas).toContain('core-runtime')
    expect(result.areas).toContain('consumers')
    expect(result.areas).toContain('framework-adapters')
  })

  it('compiler-only reaches wasm and consumers', () => {
    const result = classifyChanges({
      changedFiles: ['packages/core/compiler/src/index.ts'],
    })
    expect(result.areas).toContain('compiler')
    expect(result.areas).toContain('wasm')
    expect(result.areas).toContain('consumers')
  })

  it('a Rust change reaches compiler and native but not docs or admin', () => {
    const result = classifyChanges({
      changedFiles: ['crates/zeus_compiler/src/lib.rs'],
    })
    expect(result.areas).toContain('compiler')
    expect(result.areas).toContain('native')
    expect(result.areas).not.toContain('docs')
    expect(result.areas).not.toContain('admin')
  })

  it('a lockfile change escalates to the full suite', () => {
    const result = classifyChanges({ changedFiles: ['pnpm-lock.yaml'] })
    expect(result.fullSuite).toBe(true)
    expect(result.areas).toEqual([...AREAS].sort())
  })

  it('a release config change selects release', () => {
    const result = classifyChanges({
      changedFiles: ['scripts/release.config.ts', '.changeset/config.json'],
    })
    expect(result.areas).toContain('release')
  })

  it('a workflow change selects shared-infrastructure and escalates', () => {
    const result = classifyChanges({
      changedFiles: ['.github/workflows/ci.yml'],
    })
    expect(result.areas).toContain('shared-infrastructure')
    expect(result.fullSuite).toBe(true)
  })
})

describe('classifyChanges — failure modes', () => {
  it('an unrecognised path escalates rather than guessing', () => {
    const result = classifyChanges({
      changedFiles: ['some-new-directory/thing.txt'],
    })
    expect(result.fullSuite).toBe(true)
    expect(result.escalated.join(' ')).toContain('unrecognised')
  })

  it('an incomplete diff escalates', () => {
    const result = classifyChanges({
      changedFiles: ['docs/index.md'],
      diffIncomplete: true,
    })
    expect(result.fullSuite).toBe(true)
  })

  it('an empty diff escalates', () => {
    const result = classifyChanges({ changedFiles: [] })
    expect(result.fullSuite).toBe(true)
  })

  it('a large PR escalates', () => {
    const files = Array.from(
      { length: 201 },
      (_, index) => `docs/page-${index}.md`,
    )
    const result = classifyChanges({ changedFiles: files })
    expect(result.fullSuite).toBe(true)
    expect(result.escalated.join(' ')).toContain('201 files')
  })

  it('a deleted file is classified by its old path', () => {
    const result = classifyChanges({
      changedFiles: ['docs/index.md'],
      deletedFiles: ['packages/core/runtime-dom/src/insert.ts'],
    })
    expect(result.areas).toContain('core-runtime')
  })
})

describe('planJobs', () => {
  it('runs only docs-build for a docs-only change', () => {
    expect(running(planFor(['docs/guide/state.md']))).toEqual(['docs-build'])
  })

  it('keeps the three browser jobs on exactly the same trigger', () => {
    // `browser-web-components` and `browser-playground` were steps inside
    // `packed-consumers`. Splitting them for wall clock must not give any of
    // them a narrower trigger than the job it left: that would be a coverage
    // hole that reports green. They share `BROWSER_GATE_AREAS`, and this test
    // is what stops a future edit from breaking that.
    const browserJobs = [
      'packed-consumers',
      'browser-web-components',
      'browser-playground',
    ]
    const changes: string[][] = [
      ['examples/admin/src/pages.tsx'],
      ['examples/playground/src/app.tsx'],
      ['packages/core/runtime-dom/src/insert.ts'],
      ['packages/core/compiler/src/index.ts'],
      ['scripts/check/check-admin.ts'],
      ['crates/compiler/src/lib.rs'],
      ['docs/guide/state.md'],
      ['pnpm-lock.yaml'],
    ]
    for (const changed of changes) {
      const plan = planFor(changed)
      const decision = browserJobs.map(
        name => plan.jobs.find(job => job.name === name)?.run,
      )
      expect(new Set(decision).size, `${changed.join(', ')}`).toBe(1)
    }
  })

  it('runs everything on a full run regardless of paths', () => {
    const plan = planFor(['docs/guide/state.md'], { fullRun: true })
    expect(running(plan)).toHaveLength(ALL_JOBS)
    for (const job of plan.jobs) expect(job.reason).toBe('full run')
  })

  it('runs rust-compiler only when the compiler or native areas changed', () => {
    expect(running(planFor(['examples/admin/src/pages.tsx']))).not.toContain(
      'rust-compiler',
    )
    expect(running(planFor(['crates/x/src/lib.rs']))).toContain('rust-compiler')
  })

  it('runs every code job when the lockfile changes', () => {
    const plan = planFor(['pnpm-lock.yaml'])
    expect(running(plan)).toHaveLength(ALL_JOBS)
  })

  it('records why each job ran or did not', () => {
    const plan = planFor(['examples/admin/src/pages.tsx'])
    for (const job of plan.jobs) {
      expect(job.reason.length).toBeGreaterThan(0)
    }
  })

  it('a new workspace package selects code areas, not docs', () => {
    // A brand-new package is an unmatched-by-name path only if its directory
    // has no rule; `packages/` has one, so it lands on code.
    const result = classifyChanges({
      changedFiles: ['packages/core/new-thing/package.json'],
    })
    expect(result.areas).toContain('core-runtime')
    expect(result.areas).not.toContain('docs')
  })

  it('a broad cross-domain change runs every job', () => {
    const plan = planFor([
      'docs/index.md',
      'crates/x/src/lib.rs',
      'packages/core/runtime-dom/src/insert.ts',
      'examples/admin/src/pages.tsx',
    ])
    expect(running(plan)).toHaveLength(ALL_JOBS)
  })
})

describe('parseNameStatus', () => {
  it('separates added, modified and deleted paths', () => {
    const diff = parseNameStatus(
      ['A\tdocs/new.md', 'M\tsrc/a.ts', 'D\tsrc/gone.ts'].join('\n'),
    )
    expect(diff.files).toEqual(['docs/new.md', 'src/a.ts', 'src/gone.ts'])
    expect(diff.deleted).toEqual(['src/gone.ts'])
    expect(diff.renamed).toEqual([])
  })

  it('records both endpoints of a rename', () => {
    const diff = parseNameStatus(
      'R100\tpackages/core/old/a.ts\tpackages/core/new/a.ts',
    )
    expect(diff.renamed).toEqual(['packages/core/old/a.ts'])
    expect(diff.files).toEqual(['packages/core/new/a.ts'])
  })

  it('marks a truncated diff incomplete', () => {
    expect(parseNameStatus('M\ta.ts', true).incomplete).toBe(true)
  })
})
