import { publishCanaryPackages } from '../release-canary'

const version = '0.1.1-canary.20260814.300.1.b919e736'

describe('publishCanaryPackages', () => {
  it('verifies main immediately before every real publish attempt', async () => {
    const events: string[] = []
    let attempts = 0

    await publishCanaryPackages({
      packages: ['@zeus-js/shared'],
      version,
      tag: 'zeus-canary-300-1',
      dryRun: false,
      maxAttempts: 2,
      versionExists: async () => false,
      verifyHead: async () => {
        events.push('verify')
      },
      publishPackage: async () => {
        events.push('publish')
        attempts += 1
        if (attempts === 1) throw new Error('npm error code E503')
      },
      wait: async () => {},
    })

    expect(events).toEqual(['verify', 'publish', 'verify', 'publish', 'verify'])
  })

  it('retries the publish when its visibility check also fails transiently', async () => {
    let registryChecks = 0
    let publishAttempts = 0
    const waits: number[] = []

    await publishCanaryPackages({
      packages: ['@zeus-js/shared'],
      version,
      tag: 'zeus-canary-300-1',
      dryRun: false,
      maxAttempts: 2,
      versionExists: async () => {
        registryChecks += 1
        if (registryChecks === 2) {
          throw new Error('npm error code E503 while checking the version')
        }
        return false
      },
      verifyHead: async () => {},
      publishPackage: async () => {
        publishAttempts += 1
        if (publishAttempts === 1) throw new Error('npm error code E503')
      },
      wait: async ms => {
        waits.push(ms)
      },
    })

    expect(publishAttempts).toBe(2)
    expect(waits).toEqual([10_000])
  })

  it('keeps the publish error when the final visibility check also fails', async () => {
    const publishError = new Error('npm error code E503')
    let registryChecks = 0

    const publication = publishCanaryPackages({
      packages: ['@zeus-js/shared'],
      version,
      tag: 'zeus-canary-300-1',
      dryRun: false,
      maxAttempts: 1,
      versionExists: async () => {
        registryChecks += 1
        if (registryChecks === 2) {
          throw new Error('npm error code E503 while checking the version')
        }
        return false
      },
      verifyHead: async () => {},
      publishPackage: async () => {
        throw publishError
      },
      wait: async () => {},
    })

    await expect(publication).rejects.toBe(publishError)
  })

  it('throws non-retryable publish errors without another registry check', async () => {
    const publishError = new Error('invalid package metadata')
    let registryChecks = 0
    let waits = 0

    const publication = publishCanaryPackages({
      packages: ['@zeus-js/shared'],
      version,
      tag: 'zeus-canary-300-1',
      dryRun: false,
      maxAttempts: 2,
      versionExists: async () => {
        registryChecks += 1
        return false
      },
      verifyHead: async () => {},
      publishPackage: async () => {
        throw publishError
      },
      wait: async () => {
        waits += 1
      },
    })

    await expect(publication).rejects.toBe(publishError)
    expect(registryChecks).toBe(1)
    expect(waits).toBe(0)
  })

  it('accepts a retryable publish error when the version is already visible', async () => {
    let registryChecks = 0
    let publishAttempts = 0
    let guards = 0
    let waits = 0

    await publishCanaryPackages({
      packages: ['@zeus-js/shared'],
      version,
      tag: 'zeus-canary-300-1',
      dryRun: false,
      maxAttempts: 2,
      versionExists: async () => {
        registryChecks += 1
        return registryChecks === 2
      },
      verifyHead: async () => {
        guards += 1
      },
      publishPackage: async () => {
        publishAttempts += 1
        throw new Error('npm error code E503')
      },
      wait: async () => {
        waits += 1
      },
    })

    expect(publishAttempts).toBe(1)
    expect(guards).toBe(2)
    expect(waits).toBe(0)
  })

  it('stops before the next package when main advances', async () => {
    const published: string[] = []
    let guards = 0

    await expect(
      publishCanaryPackages({
        packages: ['@zeus-js/shared', '@zeus-js/compiler'],
        version,
        tag: 'zeus-canary-300-1',
        dryRun: false,
        maxAttempts: 1,
        versionExists: async () => false,
        verifyHead: async () => {
          guards += 1
          if (guards === 2) throw new Error('origin/main advanced')
        },
        publishPackage: async pkg => {
          published.push(pkg)
        },
        wait: async () => {},
      }),
    ).rejects.toThrow('origin/main advanced')

    expect(published).toEqual(['@zeus-js/shared'])
  })

  it('does not guard dry-runs or already-published versions', async () => {
    let guards = 0
    let publishes = 0

    await publishCanaryPackages({
      packages: ['@zeus-js/shared'],
      version,
      tag: 'zeus-canary-300-1',
      dryRun: true,
      maxAttempts: 1,
      versionExists: async () => false,
      verifyHead: async () => {
        guards += 1
      },
      publishPackage: async () => {
        publishes += 1
      },
      wait: async () => {},
    })

    await publishCanaryPackages({
      packages: ['@zeus-js/shared'],
      version,
      tag: 'zeus-canary-300-1',
      dryRun: false,
      maxAttempts: 1,
      versionExists: async () => true,
      verifyHead: async () => {
        guards += 1
      },
      publishPackage: async () => {
        publishes += 1
      },
      wait: async () => {},
    })

    expect(guards).toBe(0)
    expect(publishes).toBe(1)
  })
})
