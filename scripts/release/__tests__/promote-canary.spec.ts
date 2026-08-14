import { cleanupCanaryStagingTags, promoteCanaryTags } from '../promote-canary'

const version = '0.1.1-canary.20260814.300.1.b919e736'
const packages = ['@zeus-js/shared', '@zeus-js/compiler']

describe('promoteCanaryTags', () => {
  it('verifies main before each shared tag mutation', async () => {
    const tags = createTags()
    const events: string[] = []

    await promoteCanaryTags({
      packages,
      version,
      sourceTag: 'zeus-canary-300-1',
      targetTag: 'canary',
      readTags: async pkg => ({ ...tags.get(pkg) }),
      addTag: async (pkg, tag, nextVersion) => {
        events.push(`add:${pkg}`)
        tags.set(pkg, { ...tags.get(pkg), [tag]: nextVersion })
      },
      removeTag: async (pkg, tag) => {
        const next = { ...tags.get(pkg) }
        delete next[tag]
        tags.set(pkg, next)
      },
      verifyHead: async () => {
        events.push('verify')
      },
    })

    expect(events).toEqual([
      'verify',
      'add:@zeus-js/shared',
      'verify',
      'verify',
      'add:@zeus-js/compiler',
      'verify',
      'verify',
    ])
    expect(tags.get('@zeus-js/shared')?.canary).toBe(version)
    expect(tags.get('@zeus-js/compiler')?.canary).toBe(version)
  })

  it('waits for a promoted tag to become visible after a stale registry read', async () => {
    const pkg = packages[0]
    const tags = createTags()
    let promotionStarted = false
    let staleReads = 1

    await promoteCanaryTags({
      packages: [pkg],
      version,
      sourceTag: 'zeus-canary-300-1',
      targetTag: 'canary',
      readTags: async currentPackage => {
        const current = { ...tags.get(currentPackage) }
        if (promotionStarted && staleReads > 0) {
          staleReads -= 1
          return { ...current, canary: '0.1.1-canary.old' }
        }
        return current
      },
      addTag: async (currentPackage, tag, nextVersion) => {
        tags.set(currentPackage, {
          ...tags.get(currentPackage),
          [tag]: nextVersion,
        })
        promotionStarted = true
      },
      removeTag: async () => {},
      verifyHead: async () => {},
      consistency: {
        retryDelays: [0, 0],
        wait: async () => {},
      },
    })

    expect(tags.get(pkg)?.canary).toBe(version)
  })

  it('refuses to overwrite a target tag changed after the initial snapshot', async () => {
    const pkg = packages[0]
    const tags = createTags()
    const externallyPublishedVersion = '0.1.1-canary.external'
    let writes = 0

    await expect(
      promoteCanaryTags({
        packages: [pkg],
        version,
        sourceTag: 'zeus-canary-300-1',
        targetTag: 'canary',
        readTags: async currentPackage => ({ ...tags.get(currentPackage) }),
        addTag: async (currentPackage, tag, nextVersion) => {
          writes += 1
          tags.set(currentPackage, {
            ...tags.get(currentPackage),
            [tag]: nextVersion,
          })
        },
        removeTag: async () => {},
        verifyHead: async () => {
          tags.set(pkg, {
            ...tags.get(pkg),
            canary: externallyPublishedVersion,
          })
        },
      }),
    ).rejects.toThrow(
      `canary changed from 0.1.1-canary.old to ${externallyPublishedVersion} before promotion`,
    )

    expect(writes).toBe(0)
    expect(tags.get(pkg)?.canary).toBe(externallyPublishedVersion)
  })

  it('restores every changed target tag when promotion fails', async () => {
    const tags = createTags()
    let guards = 0

    await expect(
      promoteCanaryTags({
        packages,
        version,
        sourceTag: 'zeus-canary-300-1',
        targetTag: 'canary',
        readTags: async pkg => ({ ...tags.get(pkg) }),
        addTag: async (pkg, tag, nextVersion) => {
          tags.set(pkg, { ...tags.get(pkg), [tag]: nextVersion })
        },
        removeTag: async (pkg, tag) => {
          const next = { ...tags.get(pkg) }
          delete next[tag]
          tags.set(pkg, next)
        },
        verifyHead: async () => {
          guards += 1
          if (guards === 2) throw new Error('origin/main advanced')
        },
      }),
    ).rejects.toThrow('origin/main advanced')

    expect(tags.get('@zeus-js/shared')?.canary).toBe('0.1.1-canary.old')
    expect(tags.get('@zeus-js/compiler')?.canary).toBe('0.1.1-canary.old')
  })

  it('waits for a rolled-back tag to become visible after a stale registry read', async () => {
    const pkg = packages[0]
    const tags = createTags()
    let guards = 0
    let rollbackStarted = false
    let staleRollbackReads = 1

    const failure = await promoteCanaryTags({
      packages: [pkg],
      version,
      sourceTag: 'zeus-canary-300-1',
      targetTag: 'canary',
      readTags: async currentPackage => {
        const current = { ...tags.get(currentPackage) }
        if (rollbackStarted && staleRollbackReads > 0) {
          staleRollbackReads -= 1
          return { ...current, canary: version }
        }
        return current
      },
      addTag: async (currentPackage, tag, nextVersion) => {
        tags.set(currentPackage, {
          ...tags.get(currentPackage),
          [tag]: nextVersion,
        })
        if (nextVersion === '0.1.1-canary.old') rollbackStarted = true
      },
      removeTag: async () => {},
      verifyHead: async () => {
        guards += 1
        if (guards === 2) throw new Error('origin/main advanced')
      },
      consistency: {
        retryDelays: [0, 0],
        wait: async () => {},
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      'Canary tag promotion failed: origin/main advanced',
    )
    expect(tags.get(pkg)?.canary).toBe('0.1.1-canary.old')
  })

  it('does not roll back over a target tag changed by another writer', async () => {
    const pkg = packages[0]
    const tags = createTags()
    const externallyPublishedVersion = '0.1.1-canary.external'
    const writes: string[] = []
    let guards = 0

    const failure = await promoteCanaryTags({
      packages: [pkg],
      version,
      sourceTag: 'zeus-canary-300-1',
      targetTag: 'canary',
      readTags: async currentPackage => ({ ...tags.get(currentPackage) }),
      addTag: async (currentPackage, tag, nextVersion) => {
        writes.push(nextVersion)
        tags.set(currentPackage, {
          ...tags.get(currentPackage),
          [tag]: nextVersion,
        })
      },
      removeTag: async () => {},
      verifyHead: async () => {
        guards += 1
        if (guards === 2) {
          tags.set(pkg, {
            ...tags.get(pkg),
            canary: externallyPublishedVersion,
          })
          throw new Error('origin/main advanced')
        }
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain(
      `rollback skipped: ${pkg}: canary now points to ${externallyPublishedVersion}`,
    )
    expect(writes).toEqual([version])
    expect(tags.get(pkg)?.canary).toBe(externallyPublishedVersion)
  })

  it('refuses promotion unless every staging tag is complete', async () => {
    const tags = createTags()
    tags.set('@zeus-js/compiler', { canary: '0.1.1-canary.old' })

    await expect(
      promoteCanaryTags({
        packages,
        version,
        sourceTag: 'zeus-canary-300-1',
        targetTag: 'canary',
        readTags: async pkg => ({ ...tags.get(pkg) }),
        addTag: async () => {
          throw new Error('must not mutate')
        },
        removeTag: async () => {},
        verifyHead: async () => {},
      }),
    ).rejects.toThrow('@zeus-js/compiler')
  })
})

describe('cleanupCanaryStagingTags', () => {
  it('confirms that every removed staging tag is actually absent', async () => {
    const tags = createTags()
    const removed: string[] = []

    await cleanupCanaryStagingTags({
      packages,
      version,
      sourceTag: 'zeus-canary-300-1',
      readTags: async pkg => ({ ...tags.get(pkg) }),
      removeTag: async (pkg, tag) => {
        removed.push(pkg)
        const next = { ...tags.get(pkg) }
        delete next[tag]
        tags.set(pkg, next)
      },
    })

    expect(removed).toEqual(packages)
    expect(tags.get('@zeus-js/shared')).not.toHaveProperty('zeus-canary-300-1')
    expect(tags.get('@zeus-js/compiler')).not.toHaveProperty(
      'zeus-canary-300-1',
    )
  })

  it('waits for a removed staging tag to disappear after a stale registry read', async () => {
    const pkg = packages[0]
    const tags = createTags()
    let removalStarted = false
    let staleReads = 1

    await cleanupCanaryStagingTags({
      packages: [pkg],
      version,
      sourceTag: 'zeus-canary-300-1',
      readTags: async currentPackage => {
        const current = { ...tags.get(currentPackage) }
        if (removalStarted && staleReads > 0) {
          staleReads -= 1
          return { ...current, 'zeus-canary-300-1': version }
        }
        return current
      },
      removeTag: async (currentPackage, tag) => {
        const next = { ...tags.get(currentPackage) }
        delete next[tag]
        tags.set(currentPackage, next)
        removalStarted = true
      },
      consistency: {
        retryDelays: [0, 0],
        wait: async () => {},
      },
    })

    expect(tags.get(pkg)).not.toHaveProperty('zeus-canary-300-1')
  })

  it('fails when npm reports success but keeps a staging tag', async () => {
    const pkg = packages[0]
    const tags = createTags()

    const failure = await cleanupCanaryStagingTags({
      packages: [pkg],
      version,
      sourceTag: 'zeus-canary-300-1',
      readTags: async currentPackage => ({ ...tags.get(currentPackage) }),
      removeTag: async () => {},
      consistency: {
        retryDelays: [0, 0],
        wait: async () => {},
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      `Unable to clean Canary staging tag: ${pkg}: zeus-canary-300-1 did not converge to <missing>; last observed ${version}`,
    )
  })

  it('refuses to remove a staging tag that changed to another version', async () => {
    const tags = createTags()
    tags.set(packages[0], {
      ...tags.get(packages[0]),
      'zeus-canary-300-1': '0.1.1-canary.other',
    })
    const removed: string[] = []

    await expect(
      cleanupCanaryStagingTags({
        packages: [packages[0]],
        version,
        sourceTag: 'zeus-canary-300-1',
        readTags: async pkg => ({ ...tags.get(pkg) }),
        removeTag: async pkg => {
          removed.push(pkg)
        },
      }),
    ).rejects.toThrow('refusing cleanup')

    expect(removed).toEqual([])
  })
})

function createTags(): Map<string, Record<string, string>> {
  return new Map(
    packages.map(pkg => [
      pkg,
      {
        canary: '0.1.1-canary.old',
        'zeus-canary-300-1': version,
      },
    ]),
  )
}
