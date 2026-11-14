import { verifyMainHead } from '../verify-main-head'

const currentSha = 'b919e7365230205d415a1f056359996ee20dffc6'

describe('verifyMainHead', () => {
  it('accepts a main push whose checkout and remote head match', () => {
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: currentSha,
        checkoutSha: currentSha,
        remoteMainSha: currentSha,
      }),
    ).not.toThrow()
  })

  it('rejects a stale workflow after main advances', () => {
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: currentSha,
        checkoutSha: currentSha,
        remoteMainSha: '658fe4071817927b09a96f805b2a96e057154e78',
      }),
    ).toThrow('is stale')
  })

  it('rejects manual publication from a feature ref', () => {
    expect(() =>
      verifyMainHead({
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/fix/canary-publish-ordering',
        workflowSha: currentSha,
        checkoutSha: currentSha,
        remoteMainSha: currentSha,
      }),
    ).toThrow('only allowed from refs/heads/main')
  })
})

/**
 * The gate's full decision table.
 *
 * `verify-main-head` is the only thing standing between a stale checkout and
 * an npm publish, so every branch it can take is pinned here rather than left
 * to whichever workflow happens to call it.
 */
describe('verifyMainHead decision table', () => {
  const main = 'b919e7365230205d415a1f056359996ee20dffc6'
  const other = '658fe4071817927b09a96f805b2a96e057154e78'

  it('accepts when every source agrees', () => {
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: main,
        checkoutSha: main,
        remoteMainSha: main,
      }),
    ).not.toThrow()
  })

  it('rejects when the checkout is not the workflow commit', () => {
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: main,
        checkoutSha: other,
        remoteMainSha: main,
      }),
    ).toThrow('does not match workflow SHA')
  })

  it('rejects a missing workflow SHA', () => {
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: undefined,
        checkoutSha: main,
        remoteMainSha: main,
      }),
    ).toThrow('GITHUB_SHA is required')
  })

  it('rejects a SHA that is not 40 hex characters', () => {
    // An empty value fails the earlier "required" guard; the rest fail shape.
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: '',
        checkoutSha: main,
        remoteMainSha: main,
      }),
    ).toThrow('GITHUB_SHA is required')
    // Surrounding whitespace is trimmed on purpose, so it is not an error.
    for (const bad of ['abc', 'g'.repeat(40), `${main}0`, `${main}ab`]) {
      expect(() =>
        verifyMainHead({
          eventName: 'push',
          ref: 'refs/heads/main',
          workflowSha: bad,
          checkoutSha: main,
          remoteMainSha: main,
        }),
      ).toThrow('Invalid git SHA')
    }
  })

  it('rejects an event that may not publish', () => {
    for (const event of ['pull_request', 'schedule', undefined]) {
      expect(() =>
        verifyMainHead({
          eventName: event,
          ref: 'refs/heads/main',
          workflowSha: main,
          checkoutSha: main,
          remoteMainSha: main,
        }),
      ).toThrow('not allowed for event')
    }
  })

  it('rejects a non-main ref for both dispatch and push', () => {
    for (const event of ['workflow_dispatch', 'push']) {
      expect(() =>
        verifyMainHead({
          eventName: event,
          ref: 'refs/heads/release/0.2.0',
          workflowSha: main,
          checkoutSha: main,
          remoteMainSha: main,
        }),
      ).toThrow('only allowed from refs/heads/main')
    }
  })

  it('rejects main advancing between the early and late check', () => {
    // This is the TOCTOU window the late check exists to close: the early
    // check passed at commit A, a merge landed, and packaging now runs at A
    // while origin/main is B.
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: main,
        checkoutSha: main,
        remoteMainSha: other,
      }),
    ).toThrow('is stale')
  })

  it('is case-insensitive about SHAs but still validates length', () => {
    expect(() =>
      verifyMainHead({
        eventName: 'push',
        ref: 'refs/heads/main',
        workflowSha: main.toUpperCase(),
        checkoutSha: main,
        remoteMainSha: main,
      }),
    ).not.toThrow()
  })
})
