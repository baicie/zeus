import { describe, expect, it } from 'vitest'

import {
  assertSafeGitInvocation,
  assertSafeRefUpdate,
  FORBIDDEN_PATTERNS,
  RELIABLE_TRANSPORT_ARGS,
  SCOPE_NOTE,
} from './check-git-safety'

const SHA = 'a'.repeat(40)

describe('force-push detection', () => {
  it('refuses every spelling of a forced push', () => {
    const forced = [
      ['push', '--force', 'origin', 'main'],
      ['push', '-f', 'origin', 'main'],
      ['push', '--force-with-lease', 'origin', 'main'],
      ['push', '--force-with-lease=main:abc', 'origin', 'main'],
      ['push', '--mirror', 'origin'],
      ['push', 'origin', '--delete', 'main'],
    ]

    for (const argv of forced) {
      const verdict = assertSafeGitInvocation(argv)

      expect(verdict.safe, `expected ${argv.join(' ')} to be refused`).toBe(
        false,
      )
      expect(verdict.violations.length).toBeGreaterThan(0)
    }
  })

  it('allows an ordinary push', () => {
    expect(assertSafeGitInvocation(['push', 'origin', 'topic']).safe).toBe(true)
    expect(
      assertSafeGitInvocation(['push', '-u', 'origin', 'topic']).safe,
    ).toBe(true)
    expect(assertSafeGitInvocation(['fetch', 'origin']).safe).toBe(true)
  })

  it('does not confuse a filesystem force with a git force', () => {
    /*
     * The first draft of the scanner flagged 43 release scripts because they
     * call `fs.rmSync(path, { recursive: true, force: true })`. A guard that
     * cries wolf across the whole tree is one nobody reads.
     */
    expect(assertSafeGitInvocation(['clean', '-fdx']).safe).toBe(true)
    expect(assertSafeGitInvocation(['checkout', '--force', 'main']).safe).toBe(
      true,
    )
  })

  it('refuses to delete the default branch by name', () => {
    expect(
      assertSafeGitInvocation(['push', 'origin', '--delete', 'master']).safe,
    ).toBe(false)
    /* Deleting a topic branch is ordinary housekeeping. */
    expect(
      assertSafeGitInvocation(['push', 'origin', '--delete', 'topic']).safe,
    ).toBe(true)
  })

  it('keeps a reason for every pattern, so a failure explains itself', () => {
    for (const { why } of FORBIDDEN_PATTERNS) {
      expect(why.length).toBeGreaterThan(20)
    }
  })
})

describe('ref updates through the API', () => {
  it('refuses force: true, which is the route the incident took', () => {
    /*
     * A shell-level guard never sees this: the push that failed was a `git
     * push`, and the call that succeeded was a REST ref update with force.
     */
    const verdict = assertSafeRefUpdate({ force: true, sha: SHA })

    expect(verdict.safe).toBe(false)
    expect(verdict.violations.join('\n')).toMatch(/rewrites the remote branch/)
  })

  it('allows a fast-forward ref update', () => {
    expect(assertSafeRefUpdate({ sha: SHA }).safe).toBe(true)
    expect(assertSafeRefUpdate({ force: false, sha: SHA }).safe).toBe(true)
  })

  it('refuses anything that is not a full commit SHA', () => {
    expect(assertSafeRefUpdate({ sha: 'abc1234' }).safe).toBe(false)
    expect(assertSafeRefUpdate({ sha: 'refs/heads/main' }).safe).toBe(false)
    expect(assertSafeRefUpdate({}).safe).toBe(false)
  })
})

describe('the transport workaround', () => {
  it('is a git -c pair, so it can be prepended to any call', () => {
    expect(RELIABLE_TRANSPORT_ARGS).toEqual(['-c', 'http.version=HTTP/1.1'])
  })

  it('does not itself trip the guard', () => {
    expect(
      assertSafeGitInvocation([
        ...RELIABLE_TRANSPORT_ARGS,
        'push',
        'origin',
        'b',
      ]).safe,
    ).toBe(true)
  })
})

describe('scope', () => {
  it('says what it does not cover, so it is not mistaken for branch protection', () => {
    expect(SCOPE_NOTE).toMatch(/does not bind a terminal/)
    expect(SCOPE_NOTE).toMatch(/branch protection/)
  })
})
