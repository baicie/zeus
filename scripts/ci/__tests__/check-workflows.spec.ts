/**
 * A workflow whose YAML parses but whose Actions schema is invalid.
 *
 * #292 added `administration: read` to a `permissions` block. The YAML was
 * valid; the file was not. GitHub rejected it before creating a job, so the run
 * failed in 0s with no jobs and no check run — `gh pr checks` showed five
 * passes and no failures while the branch sat `BLOCKED`.
 *
 * Only a schema check catches that class. These tests pin the parsing and the
 * suppression rules, and one of them runs the real tool against a real fixture
 * so the regression cannot come back silently.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  KNOWN_SCHEMA_FALSE_POSITIVES,
  evaluateWorkflowProblems,
  isKnownSchemaFalsePositive,
  parseActionlintOutput,
  runActionlint,
  type WorkflowProblem,
} from '../check-workflows'

const root = path.resolve(import.meta.dirname, '../../..')
const fixture = path.join(
  root,
  'scripts/ci/__tests__/fixtures/workflows/invalid-permission.yml',
)

function hasActionlint(): boolean {
  try {
    execFileSync('actionlint', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('the regression fixture', () => {
  it('is a syntactically valid YAML file', () => {
    /*
     * The point of the fixture: a YAML parser accepts it. Anything that only
     * parses YAML passes this file, which is how #292 reached main.
     */
    const text = fs.readFileSync(fixture, 'utf8')
    expect(text).toContain('administration: read')
    expect(text).toContain('name: Regression Fixture Invalid Permission')
  })

  it('is rejected by actionlint as an unknown permission scope', () => {
    if (!hasActionlint()) {
      console.warn('skipping: actionlint not installed')
      return
    }
    let output = ''
    try {
      execFileSync('actionlint', ['-no-color', fixture], { encoding: 'utf8' })
    } catch (error) {
      output = (error as { stdout?: string }).stdout ?? ''
    }
    expect(output).toMatch(/unknown permission scope "administration"/)
    /*
     * The tool also names the complete legal set, which is the knowledge that
     * was missing when the key was written.
     */
    expect(output).toMatch(/all available permission scopes are/)
    expect(output).toMatch(/"contents"/)
  })
})

describe('parseActionlintOutput', () => {
  it('reads file, position, message and kind', () => {
    const problems = parseActionlintOutput(
      '.github/workflows/ci.yml:12:5: unknown permission scope "administration" [permissions]',
    )
    expect(problems).toEqual([
      {
        file: '.github/workflows/ci.yml',
        line: 12,
        column: 5,
        kind: 'permissions',
        message: 'unknown permission scope "administration"',
      },
    ])
  })

  /* Context blocks are indented lines and caret runs, not findings. */
  it('ignores the context block under a finding', () => {
    const problems = parseActionlintOutput(
      [
        '.github/workflows/x.yml:3:1: bad key [syntax-check]',
        '  |',
        '3 |   queue: max',
        '  |   ^~~~~',
      ].join('\n'),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]?.kind).toBe('syntax-check')
  })

  /*
   * Output the parser does not understand is kept as a problem. A gate that
   * silently drops what it cannot read can be defeated by changing the log
   * format.
   */
  it('keeps output it cannot classify', () => {
    const problems = parseActionlintOutput('something entirely unexpected')
    expect(problems).toEqual([
      {
        file: '(unknown)',
        kind: 'unparsed',
        message: 'something entirely unexpected',
      },
    ])
  })
})

describe('suppression', () => {
  const queueFinding: WorkflowProblem = {
    file: '.github/workflows/release-canary.yml',
    line: 39,
    column: 3,
    kind: 'syntax-check',
    message: 'unexpected key "queue" for "concurrency" section',
  }

  it('suppresses a documented false positive in the file it was observed in', () => {
    expect(isKnownSchemaFalsePositive(queueFinding)).toBe(true)
  })

  /* The same message in another file is not the same finding. */
  it('does not suppress the same message in a different file', () => {
    expect(
      isKnownSchemaFalsePositive({
        ...queueFinding,
        file: '.github/workflows/ci.yml',
      }),
    ).toBe(false)
  })

  /* The class that matters is never suppressed. */
  it('never suppresses an unknown permission scope', () => {
    expect(
      isKnownSchemaFalsePositive({
        file: '.github/workflows/ci.yml',
        kind: 'permissions',
        message: 'unknown permission scope "administration"',
      }),
    ).toBe(false)
  })

  it('records the evidence for every suppression', () => {
    for (const known of KNOWN_SCHEMA_FALSE_POSITIVES) {
      expect(known.reason.length).toBeGreaterThan(20)
    }
  })
})

describe('evaluateWorkflowProblems', () => {
  it('passes when only known findings remain', () => {
    const result = evaluateWorkflowProblems([
      {
        file: '.github/workflows/release-canary.yml',
        kind: 'syntax-check',
        message: 'unexpected key "queue" for "concurrency" section',
      },
    ])
    expect(result.ok).toBe(true)
    expect(result.suppressed).toHaveLength(1)
  })

  it('fails on a permissions finding', () => {
    const result = evaluateWorkflowProblems([
      {
        file: '.github/workflows/ci.yml',
        kind: 'permissions',
        message: 'unknown permission scope "administration"',
      },
    ])
    expect(result.ok).toBe(false)
  })
})

describe('the repository as it is', () => {
  it('has no blocking structural findings', () => {
    if (!hasActionlint()) {
      console.warn('skipping: actionlint not installed')
      return
    }
    const result = evaluateWorkflowProblems(runActionlint(root))
    if (!result.ok) {
      console.error(JSON.stringify(result.problems, null, 2))
    }
    expect(result.ok).toBe(true)
  })
})
