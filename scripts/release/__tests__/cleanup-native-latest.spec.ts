import {
  cleanupNativeLatestTags,
  getNativeLatestCleanupErrors,
} from '../cleanup-native-latest'

const packages = [
  '@zeus-js/compiler-native',
  '@zeus-js/compiler-native-linux-x64-gnu',
]
const pollutedVersion = '0.1.1-canary.20260812.106.1.658fe407'

describe('native latest cleanup', () => {
  it('accepts only the exact polluted prerelease or an already-missing tag', () => {
    expect(
      getNativeLatestCleanupErrors({
        packages,
        expectedVersion: pollutedVersion,
        tagsByPackage: new Map<string, Record<string, string>>([
          [packages[0], { latest: pollutedVersion }],
          [packages[1], { canary: pollutedVersion }],
        ]),
      }),
    ).toEqual([])

    expect(
      getNativeLatestCleanupErrors({
        packages,
        expectedVersion: pollutedVersion,
        tagsByPackage: new Map([
          [packages[0], { latest: '0.1.0' }],
          [packages[1], { latest: pollutedVersion }],
        ]),
      }),
    ).toContain(`${packages[0]}: latest points to 0.1.0, refusing cleanup`)
  })

  it('preflights every package before deleting and confirms each removal', async () => {
    const tags = new Map<string, Record<string, string>>(
      packages.map(pkg => [pkg, { latest: pollutedVersion }]),
    )
    const removed: string[] = []

    await cleanupNativeLatestTags({
      packages,
      expectedVersion: pollutedVersion,
      readTags: async pkg => ({ ...tags.get(pkg) }),
      removeLatest: async pkg => {
        removed.push(pkg)
        tags.set(pkg, {})
      },
    })

    expect(removed).toEqual(packages)
  })

  it('waits for latest to disappear after a stale registry read', async () => {
    const pkg = packages[0]
    const tags = new Map<string, Record<string, string>>([
      [pkg, { latest: pollutedVersion }],
    ])
    let removalStarted = false
    let staleReads = 1

    await cleanupNativeLatestTags({
      packages: [pkg],
      expectedVersion: pollutedVersion,
      readTags: async currentPackage => {
        const current = { ...tags.get(currentPackage) }
        if (removalStarted && staleReads > 0) {
          staleReads -= 1
          return { ...current, latest: pollutedVersion }
        }
        return current
      },
      removeLatest: async currentPackage => {
        tags.set(currentPackage, {})
        removalStarted = true
      },
      consistency: {
        retryDelays: [0, 0],
        wait: async () => {},
      },
    })

    expect(tags.get(pkg)).not.toHaveProperty('latest')
  })

  it('fails after the configured confirmation attempts when latest remains', async () => {
    const pkg = packages[0]
    let reads = 0

    await expect(
      cleanupNativeLatestTags({
        packages: [pkg],
        expectedVersion: pollutedVersion,
        readTags: async () => {
          reads += 1
          return { latest: pollutedVersion }
        },
        removeLatest: async () => {},
        consistency: {
          retryDelays: [0, 0],
          wait: async () => {},
        },
      }),
    ).rejects.toThrow(
      `latest did not converge to <missing>; last observed ${pollutedVersion}`,
    )

    expect(reads).toBe(4)
  })

  it('does not mutate any package when preflight finds another version', async () => {
    const removed: string[] = []

    await expect(
      cleanupNativeLatestTags({
        packages,
        expectedVersion: pollutedVersion,
        readTags: async pkg => ({
          latest: pkg === packages[0] ? pollutedVersion : '0.1.0',
        }),
        removeLatest: async pkg => {
          removed.push(pkg)
        },
      }),
    ).rejects.toThrow('refusing cleanup')

    expect(removed).toEqual([])
  })

  it('rechecks the tag immediately before deletion and refuses a changed value', async () => {
    let reads = 0
    const removed: string[] = []

    await expect(
      cleanupNativeLatestTags({
        packages: [packages[0]],
        expectedVersion: pollutedVersion,
        readTags: async () => {
          reads += 1
          return {
            latest: reads === 1 ? pollutedVersion : '0.1.0',
          }
        },
        removeLatest: async pkg => {
          removed.push(pkg)
        },
      }),
    ).rejects.toThrow('changed to 0.1.0 before cleanup')

    expect(removed).toEqual([])
  })
})
