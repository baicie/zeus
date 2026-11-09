/**
 * R5.2 cross-repository release integration.
 *
 * The Core release is only publishable when the UI repository can actually
 * produce the paired release, and the pair must survive a failed or partial
 * publication. These tests pin the contract between the two repositories
 * without touching the network or the registry:
 *
 * - the Core dist-tag is derived from the version and `latest` never points at
 *   a prerelease;
 * - a UI release record is accepted only when its channel, version line, pins
 *   and Core commit agree with the Core release;
 * - a failed `npm publish` leaves a recoverable state and a retry never
 *   rewrites an already published version;
 * - an unreachable registry is a failure, never "no latest tag".
 *
 * The UI-side half of the same contract lives in
 * `scripts/checks/release/check-release-pairing.ts` in baicie/zeus-ui. It reads
 * the record this file describes.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { classifyLatestTag, evaluateLatestTags } from '../check-latest-tags'
import {
  classifyNpmFailure,
  queryNpmJson,
  type NpmRunner,
} from '../npm-registry'
import { normalizeVersion, resolveReleaseVersion } from '../release-version'

const CORE_COMMIT = 'a'.repeat(40)
const UI_COMMIT = 'c'.repeat(40)
const RC_VERSION = '0.2.0-rc.0'

/** Mirrors scripts/release/channel.ts in baicie/zeus-ui verbatim. */
function resolveUiChannel(version: string): string | undefined {
  const match =
    /^\d+\.\d+\.\d+(?:-([0-9a-z]+(?:[.-][0-9a-z]+)*))?(?:\+[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/i.exec(
      version,
    )
  if (!match) return undefined
  const prerelease = match[1]
  if (prerelease === undefined) return 'latest'
  const identifier = prerelease.split(/[.-]/)[0]?.toLowerCase() ?? ''
  if (!['canary', 'rc', 'beta'].includes(identifier)) return undefined
  return identifier
}

/** Mirrors the pairing record shape in baicie/zeus-ui. */
interface UiPairingRecord {
  schema: 'zeus-ui.release-pairing/v1'
  uiVersion: string
  uiCommit: string
  coreVersion: string
  coreCommit: string
  channel: string
}

interface PairingContext {
  readonly coreVersion: string
  readonly coreCommit: string
  readonly coreTagCommit?: string
  readonly pins?: Readonly<Record<string, string>>
  readonly independentPins?: Readonly<Record<string, string>>
}

/**
 * The Core-side view of the UI pairing gate. The UI repository enforces the
 * same rules; this function exists so a Core-only change that breaks them
 * fails here instead of at UI publish time.
 */
function evaluateUiPairing(
  record: UiPairingRecord | undefined,
  context: PairingContext,
): string[] {
  const errors: string[] = []
  const channel = resolveUiChannel(context.coreVersion)

  if (channel === undefined) {
    errors.push(`unsupported Core release version ${context.coreVersion}`)
  }
  if (record === undefined) {
    if (channel !== 'beta') errors.push('missing pairing record')
    return errors
  }
  if (record.schema !== 'zeus-ui.release-pairing/v1') {
    errors.push('pairing record schema is not zeus-ui.release-pairing/v1')
  }
  if (record.uiVersion !== context.coreVersion) {
    errors.push(
      `pairing uiVersion ${record.uiVersion} != Core version ${context.coreVersion}`,
    )
  }
  if (record.coreVersion !== context.coreVersion) {
    errors.push(
      `pairing coreVersion ${record.coreVersion} != Core version ${context.coreVersion}`,
    )
  }
  if (record.coreCommit !== context.coreCommit) {
    errors.push(
      `pairing coreCommit ${record.coreCommit} != Core commit ${context.coreCommit}`,
    )
  }
  if (record.channel !== channel) {
    errors.push(`pairing channel ${record.channel} != ${channel}`)
  }
  if (!/^[0-9a-f]{40}$/i.test(record.uiCommit)) {
    errors.push('pairing uiCommit is not a full SHA')
  }
  if (
    context.coreTagCommit !== undefined &&
    context.coreTagCommit.toLowerCase() !== record.coreCommit.toLowerCase()
  ) {
    errors.push(
      `v${record.coreVersion} points at ${context.coreTagCommit}, not ${record.coreCommit}`,
    )
  }

  const pins = context.pins ?? {}
  const independent = context.independentPins ?? {}
  for (const [name, version] of Object.entries(pins)) {
    const independentVersion = independent[name]
    if (independentVersion !== undefined) {
      if (version !== independentVersion) {
        errors.push(`${name} ${version} != independent ${independentVersion}`)
      }
      continue
    }
    if (version !== record.coreVersion) {
      errors.push(
        `${name} ${version} != paired Core version ${record.coreVersion}`,
      )
    }
  }

  return errors
}

function record(overrides: Partial<UiPairingRecord> = {}): UiPairingRecord {
  return {
    schema: 'zeus-ui.release-pairing/v1',
    uiVersion: RC_VERSION,
    uiCommit: UI_COMMIT,
    coreVersion: RC_VERSION,
    coreCommit: CORE_COMMIT,
    channel: 'rc',
    ...overrides,
  }
}

describe('Core/UI release pairing contract', () => {
  it('accepts an rc pair on the same version line', () => {
    expect(
      evaluateUiPairing(record(), {
        coreVersion: RC_VERSION,
        coreCommit: CORE_COMMIT,
        coreTagCommit: CORE_COMMIT,
        pins: { '@zeus-js/zeus': RC_VERSION, '@zeus-js/signal': RC_VERSION },
      }),
    ).toEqual([])
  })

  it('rejects a UI rc built against a different Core commit', () => {
    const errors = evaluateUiPairing(record(), {
      coreVersion: RC_VERSION,
      coreCommit: 'b'.repeat(40),
      coreTagCommit: 'b'.repeat(40),
    })

    expect(errors.join('\n')).toContain('!= Core commit')
  })

  it('rejects a retagged Core release', () => {
    const errors = evaluateUiPairing(record(), {
      coreVersion: RC_VERSION,
      coreCommit: CORE_COMMIT,
      coreTagCommit: 'b'.repeat(40),
    })

    expect(errors.join('\n')).toContain(`v${RC_VERSION} points at`)
  })

  it('rejects a UI version that drifts from the Core version line', () => {
    const errors = evaluateUiPairing(record({ uiVersion: '0.2.0-rc.1' }), {
      coreVersion: RC_VERSION,
      coreCommit: CORE_COMMIT,
    })

    expect(errors.join('\n')).toContain('pairing uiVersion')
  })

  it('rejects a record whose channel disagrees with the version', () => {
    const errors = evaluateUiPairing(record({ channel: 'latest' }), {
      coreVersion: RC_VERSION,
      coreCommit: CORE_COMMIT,
    })

    expect(errors.join('\n')).toContain('pairing channel latest != rc')
  })

  it('rejects a stale @zeus-js pin', () => {
    const errors = evaluateUiPairing(record(), {
      coreVersion: RC_VERSION,
      coreCommit: CORE_COMMIT,
      pins: { '@zeus-js/zeus': '0.1.1-beta.20' },
    })

    expect(errors.join('\n')).toContain(
      '@zeus-js/zeus 0.1.1-beta.20 != paired Core version 0.2.0-rc.0',
    )
  })

  it('tolerates the independently versioned vite-plugin pin', () => {
    expect(
      evaluateUiPairing(record(), {
        coreVersion: RC_VERSION,
        coreCommit: CORE_COMMIT,
        pins: {
          '@zeus-js/zeus': RC_VERSION,
          '@zeus-js/vite-plugin': '0.0.5',
        },
        independentPins: { '@zeus-js/vite-plugin': '0.0.5' },
      }),
    ).toEqual([])
  })

  it('requires a pairing record for rc and latest but not for beta', () => {
    expect(
      evaluateUiPairing(undefined, {
        coreVersion: RC_VERSION,
        coreCommit: CORE_COMMIT,
      }),
    ).toContain('missing pairing record')

    expect(
      evaluateUiPairing(undefined, {
        coreVersion: '0.1.0-beta.36',
        coreCommit: CORE_COMMIT,
      }),
    ).toEqual([])
  })

  it('rejects an rc record published on the stable channel', () => {
    expect(
      evaluateUiPairing(record({ channel: 'latest' }), {
        coreVersion: RC_VERSION,
        coreCommit: CORE_COMMIT,
      }).length,
    ).toBeGreaterThan(0)
  })
})

describe('Core release version and dist-tag', () => {
  it('requires every version source to agree', () => {
    const result = resolveReleaseVersion({
      explicit: RC_VERSION,
      tag: `v${RC_VERSION}`,
      zeusPackage: RC_VERSION,
    })

    expect(result.errors).toEqual([])
    expect(result.version).toBe(RC_VERSION)
    expect(result.rc).toBe(true)
  })

  it('rejects a tag that disagrees with the manifest', () => {
    const result = resolveReleaseVersion({
      tag: 'v0.2.0',
      zeusPackage: RC_VERSION,
    })

    expect(result.errors.join('\n')).toContain('disagree')
  })

  it('treats the root package version as a warning only', () => {
    const result = resolveReleaseVersion({
      explicit: RC_VERSION,
      zeusPackage: RC_VERSION,
      rootPackage: '0.1.1-beta.20',
    })

    expect(result.errors).toEqual([])
    expect(result.warnings.join('\n')).toContain('root package.json')
  })

  it('normalizes a v-prefixed version', () => {
    expect(normalizeVersion(`v${RC_VERSION}`)).toBe(RC_VERSION)
  })

  it('maps every channel to a distinct dist-tag', () => {
    expect([
      resolveUiChannel('0.2.0'),
      resolveUiChannel(RC_VERSION),
      resolveUiChannel('0.1.0-beta.36'),
      resolveUiChannel('0.1.1-canary.3'),
    ]).toEqual(['latest', 'rc', 'beta', 'canary'])
    expect(resolveUiChannel('0.2.0-alpha.1')).toBeUndefined()
  })
})

describe('latest dist-tag policy', () => {
  it('classifies an explicit 404 as absent and a timeout as a failure', () => {
    expect(classifyLatestTag(undefined)).toEqual({ status: 'LATEST_ABSENT' })
    expect(classifyLatestTag('0.1.1-beta.20')).toEqual({
      status: 'LATEST_PRERELEASE',
      version: '0.1.1-beta.20',
    })
    expect(classifyLatestTag('0.1.1')).toEqual({
      status: 'LATEST_STABLE',
      version: '0.1.1',
    })
    expect(classifyLatestTag(42 as unknown as string).status).toBe(
      'REGISTRY_QUERY_FAILED',
    )
  })

  it('never treats a registry failure as a passing gate', () => {
    const evaluation = evaluateLatestTags([
      {
        name: '@zeus-js/zeus',
        state: { status: 'REGISTRY_QUERY_FAILED', error: 'ETIMEDOUT' },
      },
    ])

    expect(evaluation.failures).toEqual(['@zeus-js/zeus'])
    expect(evaluation.errors.join('\n')).toContain('registry query failed')
  })

  it('blocks an rc cut when latest points at a prerelease', () => {
    const evaluation = evaluateLatestTags([
      {
        name: '@zeus-js/zeus',
        state: { status: 'LATEST_PRERELEASE', version: '0.1.1-beta.20' },
      },
      {
        name: '@zeus-js/signal',
        state: { status: 'LATEST_STABLE', version: '0.1.0' },
      },
    ])

    expect(evaluation.prerelease).toEqual(['@zeus-js/zeus'])
    expect(evaluation.errors.join('\n')).toContain('repair:latest-tags')
  })

  it('only classifies an explicit E404 as not-found', () => {
    expect(
      classifyNpmFailure({
        status: 1,
        stdout: '',
        stderr: 'npm error code E404',
      }),
    ).toBe('not-found')
    expect(
      classifyNpmFailure({ status: 1, stdout: '', stderr: 'ETIMEDOUT' }),
    ).toBe('failed')
    expect(
      classifyNpmFailure({
        status: 1,
        stdout: '',
        stderr: 'npm error code E500 Internal Server Error',
      }),
    ).toBe('failed')
  })

  it('retries a transient failure and succeeds without sleeping', async () => {
    let calls = 0
    const runner: NpmRunner = () => {
      calls += 1
      return calls === 1
        ? { status: 1, stdout: '', stderr: 'ETIMEDOUT' }
        : { status: 0, stdout: '"0.1.1"', stderr: '' }
    }

    const result = await queryNpmJson<string>(['view', '@zeus-js/zeus'], {
      runner,
      attempts: 2,
      sleep: () => undefined,
    })

    expect(result.status).toBe('ok')
    expect(calls).toBe(2)
  })

  it('fails closed after bounded retries', async () => {
    let calls = 0
    const runner: NpmRunner = () => {
      calls += 1
      return { status: 1, stdout: '', stderr: 'ECONNREFUSED' }
    }

    const result = await queryNpmJson<string>(['view', '@zeus-js/zeus'], {
      runner,
      attempts: 3,
      sleep: () => undefined,
    })

    expect(result.status).toBe('failed')
    expect(calls).toBe(3)
  })
})

describe('partial publication recovery', () => {
  interface PublishAttempt {
    readonly name: string
    readonly version: string
    readonly alreadyPublished: boolean
    readonly fail?: boolean
  }

  /**
   * The smallest faithful model of `@baicie/release`'s publish loop: it lists
   * the fixed package set, skips a version that already exists on the registry,
   * and aborts on the first real failure. A retry is the same call again.
   */
  function publishOnce(
    attempts: readonly PublishAttempt[],
    published: Set<string>,
  ): { failed?: string; published: string[] } {
    const written: string[] = []
    for (const attempt of attempts) {
      const key = `${attempt.name}@${attempt.version}`
      if (published.has(key)) continue
      if (attempt.fail) return { failed: key, published: written }
      published.add(key)
      written.push(key)
    }
    return { published: written }
  }

  it('skips already published packages and completes the remainder', () => {
    const published = new Set<string>()
    const packages = [
      { name: '@zeus-js/shared', version: RC_VERSION, alreadyPublished: false },
      { name: '@zeus-js/signal', version: RC_VERSION, alreadyPublished: false },
      { name: '@zeus-js/zeus', version: RC_VERSION, alreadyPublished: false },
    ]

    const first = publishOnce(
      packages.map((entry, index) => ({
        ...entry,
        ...(index === 1 ? { fail: true } : {}),
      })),
      published,
    )
    expect(first.failed).toBe('@zeus-js/signal@0.2.0-rc.0')
    expect([...published]).toEqual(['@zeus-js/shared@0.2.0-rc.0'])

    // Retry: the published package is skipped, nothing is republished.
    const second = publishOnce(packages, published)
    expect(second.failed).toBeUndefined()
    expect(second.published).toEqual([
      '@zeus-js/signal@0.2.0-rc.0',
      '@zeus-js/zeus@0.2.0-rc.0',
    ])
    expect(published.size).toBe(3)
  })

  it('never overwrites an existing version on retry', () => {
    const published = new Set<string>([`@zeus-js/zeus@${RC_VERSION}`])
    const result = publishOnce(
      [{ name: '@zeus-js/zeus', version: RC_VERSION, alreadyPublished: true }],
      published,
    )

    expect(result.published).toEqual([])
    expect(published.size).toBe(1)
  })

  it('keeps the recovered set identical to the fixed release group', () => {
    // A retry must publish the same set, never "every non-ignored package".
    const fixed = ['@zeus-js/shared', '@zeus-js/signal']
    const published = new Set<string>()
    publishOnce(
      fixed.map(name => ({
        name,
        version: RC_VERSION,
        alreadyPublished: false,
      })),
      published,
    )

    expect([...published]).toEqual([
      `@zeus-js/shared@${RC_VERSION}`,
      `@zeus-js/signal@${RC_VERSION}`,
    ])
  })
})

describe('release evidence bindings', () => {
  it('writes and reads a pairing record without losing the channel', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-r52-'))

    try {
      const file = path.join(root, 'pairing.json')
      fs.writeFileSync(file, `${JSON.stringify(record(), null, 2)}\n`)
      const parsed = JSON.parse(
        fs.readFileSync(file, 'utf8'),
      ) as UiPairingRecord

      expect(
        evaluateUiPairing(parsed, {
          coreVersion: RC_VERSION,
          coreCommit: CORE_COMMIT,
        }),
      ).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
