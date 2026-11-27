/**
 * The template dependency question: is what a template pins actually out
 * there?
 *
 * ## Why this is separate from the template build checks
 *
 * `create-zeus` templates are built two ways. Most are linked against the
 * workspace and never touch a registry. `webc-consumer-ts` is installed with a
 * real `npm install`, because it consumes `@zeus-web/*` — a package on a
 * different release train from Core.
 *
 * That makes it the one template whose own pin can name a version that does
 * not exist yet, and for a long time the only evidence of it was an `ETARGET`
 * from npm, several steps away from the decision that caused it. These assert
 * the classification instead: a published pin is a pass, an absent one is a
 * named deferral, and a registry that could not answer is neither.
 *
 * ## What each test protects
 *
 * The failure modes are not interchangeable. "Not published" may be covered by
 * the candidate gate. "Could not ask" may not — a 500, a 403 or a timeout says
 * nothing about the version, and treating one as absence would let a flaky
 * registry excuse a real gap, or block a release that was ready.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import {
  findUnpublishedTemplateDependencies,
  readPackageDependencyRequirements,
  readPublishedVersions,
  readTemplateRequirements,
} from '../check-template-dependencies'

const roots: string[] = []
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function templateFile(
  name: string,
  dependencies: Record<string, string>,
): string {
  const root = mkdtempSync(join(tmpdir(), 'zeus-template-deps-'))
  roots.push(root)
  const directory = join(root, name)
  mkdirSync(directory, { recursive: true })
  const file = join(directory, 'package.json')
  writeFileSync(file, JSON.stringify({ name, dependencies }))
  return file
}

const requirement = (template: string, packageName: string, range: string) => ({
  template,
  packageName,
  range,
})

describe('which dependencies a template declares', () => {
  it('reads both @zeus-js and @zeus-web, because both are published', () => {
    const file = templateFile('webc-consumer-ts', {
      '@zeus-web/button': '0.2.0-rc.7',
      '@zeus-js/zeus': '0.2.0-rc.7',
      react: '^19.0.0',
    })

    const requirements = readPackageDependencyRequirements(
      'webc-consumer-ts',
      file,
    )

    expect(requirements.map(item => item.packageName).sort()).toEqual([
      '@zeus-js/zeus',
      '@zeus-web/button',
    ])
  })

  it('does not report a third-party dependency as a Zeus requirement', () => {
    const file = templateFile('basic-ts', {
      vite: '^8.0.16',
      typescript: '^6.0.3',
    })

    expect(readPackageDependencyRequirements('basic-ts', file)).toEqual([])
  })

  it('names the template from its directory when given a list of files', () => {
    const file = templateFile('admin-ts', { '@zeus-js/zeus': '0.2.0-rc.7' })

    const requirements = readTemplateRequirements([file])

    expect(requirements.length).toBe(1)
    expect(requirements[0]!.template).toBe('admin-ts')
  })
})

describe('a published pin', () => {
  it('is not reported when the exact version is on the registry', () => {
    const unpublished = findUnpublishedTemplateDependencies(
      [requirement('webc-consumer-ts', '@zeus-web/button', '0.2.0-rc.7')],
      new Map([
        ['@zeus-web/button', ['0.1.0-beta.35', '0.2.0-rc.6', '0.2.0-rc.7']],
      ]),
    )

    expect(unpublished).toEqual([])
  })

  it('is matched as a semver range, not as a string', () => {
    const unpublished = findUnpublishedTemplateDependencies(
      [requirement('basic-ts', '@zeus-js/zeus', '^0.2.0-rc.7')],
      new Map([['@zeus-js/zeus', ['0.2.0-rc.8']]]),
    )

    expect(unpublished).toEqual([])
  })
})

describe('an unpublished pin', () => {
  it('is reported by name, with the range that could not be satisfied', () => {
    const unpublished = findUnpublishedTemplateDependencies(
      [requirement('webc-consumer-ts', '@zeus-web/button', '0.2.0-rc.7')],
      new Map([['@zeus-web/button', ['0.1.0-beta.34', '0.1.0-beta.35']]]),
    )

    expect(unpublished.length).toBe(1)
    expect(unpublished[0]!.template).toBe('webc-consumer-ts')
    expect(unpublished[0]!.packageName).toBe('@zeus-web/button')
    expect(unpublished[0]!.range).toBe('0.2.0-rc.7')
  })

  it('is reported when the registry has no document for the package at all', () => {
    const unpublished = findUnpublishedTemplateDependencies(
      [requirement('webc-consumer-ts', '@zeus-web/button', '0.2.0-rc.7')],
      new Map(),
    )

    expect(unpublished.length).toBe(1)
  })

  it('is reported when only a different version of the range exists', () => {
    const unpublished = findUnpublishedTemplateDependencies(
      [requirement('webc-consumer-ts', '@zeus-web/button', '0.2.0-rc.7')],
      new Map([['@zeus-web/button', ['0.2.0-rc.6']]]),
    )

    expect(unpublished.length).toBe(1)
  })
})

describe('a registry that cannot answer', () => {
  const withFetch = <T>(
    impl: typeof fetch,
    body: () => Promise<T>,
  ): Promise<T> => {
    const original = globalThis.fetch
    globalThis.fetch = impl
    return body().finally(() => {
      globalThis.fetch = original
    })
  }

  it('throws on a 500 rather than reporting no versions', async () => {
    await withFetch(
      async () => new Response('upstream error', { status: 500 }),
      async () => {
        await expect(
          readPublishedVersions(
            '@zeus-web/button',
            'https://registry.npmjs.org',
          ),
        ).rejects.toThrow(/Registry request failed.*500/)
      },
    )
  })

  it('throws on a 403 rather than reporting no versions', async () => {
    await withFetch(
      async () => new Response('forbidden', { status: 403 }),
      async () => {
        await expect(
          readPublishedVersions(
            '@zeus-web/button',
            'https://registry.npmjs.org',
          ),
        ).rejects.toThrow(/Registry request failed.*403/)
      },
    )
  })

  it('throws when the request itself fails', async () => {
    await withFetch(
      (async () => {
        throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org')
      }) as unknown as typeof fetch,
      async () => {
        await expect(
          readPublishedVersions(
            '@zeus-web/button',
            'https://registry.npmjs.org',
          ),
        ).rejects.toThrow(/Registry request failed.*ENOTFOUND/)
      },
    )
  })

  it('answers "no versions" for a 404, which is what an unpublished package is', async () => {
    await withFetch(
      async () => new Response('{"error":"Not found"}', { status: 404 }),
      async () => {
        const versions = await readPublishedVersions(
          '@zeus-web/button',
          'https://registry.npmjs.org',
        )
        expect(versions).toEqual([])
      },
    )
  })

  it('returns the published versions a 200 document carries', async () => {
    await withFetch(
      async () =>
        new Response(
          JSON.stringify({
            versions: { '0.2.0-rc.7': {}, '0.1.0-beta.35': {} },
          }),
          { status: 200 },
        ),
      async () => {
        const versions = await readPublishedVersions(
          '@zeus-web/button',
          'https://registry.npmjs.org',
        )
        expect(versions.sort()).toEqual(['0.1.0-beta.35', '0.2.0-rc.7'])
      },
    )
  })

  it('propagates the error rather than turning it into a deferral', async () => {
    const read = vi.fn(async () => {
      throw new Error('Registry request failed for @zeus-web/button: 503')
    })

    await expect(
      read().then(versions =>
        findUnpublishedTemplateDependencies(
          [requirement('webc-consumer-ts', '@zeus-web/button', '0.2.0-rc.7')],
          new Map([['@zeus-web/button', versions]]),
        ),
      ),
    ).rejects.toThrow(/503/)
  })
})
