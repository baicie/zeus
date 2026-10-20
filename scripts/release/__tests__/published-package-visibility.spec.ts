import {
  isRetryablePublishedPackageError,
  waitForPublishedPackageVisibility,
} from '../published-package-visibility'

function npmError(code: string): Error {
  return Object.assign(new Error('Command failed'), {
    stderr: `npm error code ${code}`,
  })
}

describe('published package visibility', () => {
  it('retries a newly published version while npm edges catch up', async () => {
    const queryVersion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(npmError('E404'))
      .mockRejectedValueOnce(npmError('E404'))
      .mockResolvedValue('0.1.1-canary.test')
    const wait = vi.fn(async () => {})

    await waitForPublishedPackageVisibility({
      packageName: '@zeus-js/shared',
      expectedVersion: '0.1.1-canary.test',
      queryVersion,
      delays: [0, 1_000, 2_000],
      wait,
    })

    expect(queryVersion).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls).toEqual([[1_000], [2_000]])
  })

  it('does not hide permission or invalid-version failures behind retries', async () => {
    const queryVersion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(npmError('E403'))
    const wait = vi.fn(async () => {})

    await expect(
      waitForPublishedPackageVisibility({
        packageName: '@zeus-js/shared',
        expectedVersion: '0.1.1-canary.test',
        queryVersion,
        delays: [0, 1_000],
        wait,
      }),
    ).rejects.toThrow('Command failed')
    expect(queryVersion).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
  })

  it('reports the final transient error after the bounded visibility window', async () => {
    const queryVersion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(npmError('ETIMEDOUT'))

    await expect(
      waitForPublishedPackageVisibility({
        packageName: '@zeus-js/shared',
        expectedVersion: '0.1.1-canary.test',
        queryVersion,
        delays: [0, 1_000],
        wait: async () => {},
      }),
    ).rejects.toThrow(
      '@zeus-js/shared@0.1.1-canary.test was not visible after 2 registry checks',
    )
  })

  it.each(['E404', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', '429', '503'])(
    'treats %s as a transient registry visibility failure',
    code => {
      expect(isRetryablePublishedPackageError(npmError(code))).toBe(true)
    },
  )
})
