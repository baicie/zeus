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
