import {
  assertCanaryEnvironment,
  getPublishEnvironment,
  parseCanaryOptions,
  publishCanaryPackages,
  publishCanaryPhases,
  resolvePublishedUiVersion,
} from '../release-canary'

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

describe('Canary dry-run-only contract', () => {
  it('parses the explicit dry-run-only option', () => {
    expect(parseCanaryOptions(['--dry-run-only'])).toEqual({
      dryRunOnly: true,
    })
    expect(parseCanaryOptions([])).toEqual({ dryRunOnly: false })
  })

  it('allows dry-run-only without CI credentials', () => {
    expect(() =>
      assertCanaryEnvironment({}, { dryRunOnly: true }),
    ).not.toThrow()
    expect(() => assertCanaryEnvironment({})).toThrow(
      'Canary publication is only allowed in GitHub Actions',
    )
  })

  it('runs every package dry-run and never enters the real publish phase', async () => {
    const calls: Array<[string, string, boolean]> = []
    const registryQueries: string[] = []
    const guards: string[] = []

    const result = await publishCanaryPhases({
      packages: ['@zeus-js/shared', '@zeus-js/compiler'],
      version,
      tag: 'zeus-canary-300-1',
      dryRunOnly: true,
      maxAttempts: 5,
      versionExists: async pkg => {
        registryQueries.push(pkg)
        return false
      },
      verifyHead: async () => {
        guards.push('verify')
      },
      publishPackage: async (pkg, expectedVersion, tag, dryRun) => {
        calls.push([pkg, `${expectedVersion}:${tag}`, dryRun])
      },
      wait: async () => {},
    })

    expect(result).toBe('dry-run-only')
    expect(calls).toEqual([
      ['@zeus-js/shared', `${version}:zeus-canary-300-1`, true],
      ['@zeus-js/compiler', `${version}:zeus-canary-300-1`, true],
    ])
    expect(registryQueries).toEqual([])
    expect(guards).toEqual([])
  })

  it('does not pass npm credentials to a dry-run subprocess', () => {
    const source = {
      NODE_AUTH_TOKEN: 'test-node-token',
      NPM_TOKEN: 'test-npm-token',
    }
    const dryEnvironment = getPublishEnvironment(true, source)
    expect(dryEnvironment.NODE_AUTH_TOKEN).toBeUndefined()
    expect(dryEnvironment.NPM_TOKEN).toBeUndefined()

    const publishEnvironment = getPublishEnvironment(false, source)
    expect(publishEnvironment.NODE_AUTH_TOKEN).toBe('test-node-token')
  })
})

describe('the UI version a canary verifies against', () => {
  it('prefers the rc tag', () => {
    /*
     * `rc` is the line a paired Core is expected to work with. `latest` on the
     * @zeus-web scope still points at a beta, so preferring it would have the
     * canary silently test against a year-old UI.
     */
    expect(
      resolvePublishedUiVersion(() =>
        JSON.stringify({ latest: '0.1.0-beta.0', rc: '0.2.0-rc.8' }),
      ),
    ).toBe('0.2.0-rc.8')
  })

  it('falls back to latest when there is no rc', () => {
    expect(
      resolvePublishedUiVersion(() =>
        JSON.stringify({ latest: '0.1.0-beta.35' }),
      ),
    ).toBe('0.1.0-beta.35')
  })

  it('refuses when the registry answers with neither', () => {
    expect(() =>
      resolvePublishedUiVersion(() =>
        JSON.stringify({ beta: '0.1.0-beta.35' }),
      ),
    ).toThrow(/no rc or latest dist-tag/)
  })

  it('refuses a dist-tag that is not a version', () => {
    expect(() =>
      resolvePublishedUiVersion(() =>
        JSON.stringify({ rc: 'latest', latest: '0.1.0' }),
      ),
    ).toThrow(/no rc or latest dist-tag/)
  })

  it('fails rather than skipping when the registry cannot be asked', () => {
    /*
     * "No UI is published" and "I could not ask" lead to different decisions.
     * Treating the second as the first is how a canary reports a compatibility
     * result it never obtained.
     */
    expect(() =>
      resolvePublishedUiVersion(() => {
        throw new Error('npm view failed: EAI_AGAIN')
      }),
    ).toThrow(/EAI_AGAIN/)
  })
})

describe('the canary cannot silently test against nothing', () => {
  it('does not fall back to the repository Core version when the UI is unknown', () => {
    /*
     * The defect this whole change closes: with no UI version the template sync
     * left `@zeus-web/button` at the unreleased Core version, and the only
     * signal was a registry ETARGET several minutes later. The resolution now
     * throws at the point where the value is missing, so the run names the
     * real problem.
     */
    expect(() => resolvePublishedUiVersion(() => '{}')).toThrow(
      /a canary needs a published UI to verify against/,
    )
  })
})
