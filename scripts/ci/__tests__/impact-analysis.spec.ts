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
  parseNameStatus,
  planJobs,
  requiresFullRun,
  type Plan,
} from '../impact-analysis'

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
  it('treats a toolchain file as a full-suite change', () => {
    // `.nvmrc` selects the Node version every job runs on. It used to match
    // the `^\.[a-z]+rc$` lint rule and land on `tooling`, which skips
    // rust-compiler and still runs the browser gates — the wrong direction.
    // The verification matrix found it; this test keeps it fixed.
    for (const file of ['.nvmrc', '.babelrc', '.swcrc', 'babel.config.cjs']) {
      const result = classifyChanges({ changedFiles: [file] })
      expect(result.areas, file).toContain('shared-infrastructure')
      expect(result.fullSuite, file).toBe(true)
    }
  })

  it('still classifies lint configuration as tooling, not full suite', () => {
    for (const file of [
      '.eslintrc.json',
      '.prettierrc.json',
      '.prettierignore',
      'eslint.config.js',
    ]) {
      const result = classifyChanges({ changedFiles: [file] })
      expect(result.areas, file).toContain('tooling')
      expect(result.fullSuite, file).toBe(false)
    }
  })

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

  it('runs everything on a full run regardless of paths', () => {
    const plan = planFor(['docs/guide/state.md'], { fullRun: true })
    expect(running(plan)).toHaveLength(7)
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
    expect(running(plan)).toHaveLength(7)
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
    expect(running(plan)).toHaveLength(7)
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

describe('requiresFullRun', () => {
  it('analyses only pull requests narrowly', () => {
    expect(requiresFullRun({ event: 'pull_request' })).toBe(false)
  })

  it('runs everything on push, dispatch and every unknown event', () => {
    for (const event of [
      'push',
      'workflow_dispatch',
      // Events this file has never reasoned about. The negated form of this
      // check ("not push, not dispatch") used to give all of these the narrow
      // path by accident.
      'merge_group',
      'schedule',
      'release',
      'repository_dispatch',
      'workflow_run',
      '',
    ]) {
      expect(requiresFullRun({ event }), `${event || '(empty)'}`).toBe(true)
    }
  })

  it('honours an explicit override from the caller', () => {
    expect(requiresFullRun({ event: 'pull_request', forced: true })).toBe(true)
  })
})
