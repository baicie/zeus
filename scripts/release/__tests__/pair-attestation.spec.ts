/**
 * The attestation that completes a bootstrap release.
 *
 * Every case here is about a claim the file makes about itself and the one
 * fact that must come from outside it. A well-formed attestation is worth
 * nothing unless its `coreCommit` matches the commit the release tag actually
 * points at, and that comparison is what most of these tests exercise.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  PAIR_ATTESTATION_SCHEMA,
  TAGGED_RECORD_PATHS,
  attestationFile,
  attestationTag,
  findConflictingAttestations,
  readAttestationDirectory,
  validatePairAttestation,
} from '../pair-attestation'
import {
  classifyGhFailure,
  readTaggedRecord,
  rootOfAttestationFile,
  rootOfAttestationFileWith,
} from '../write-pair-attestation'

const VERSION = '0.2.0-rc.0'
const CORE = 'a'.repeat(40)
const UI = 'b'.repeat(40)

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function attestation(overrides: Record<string, unknown> = {}): unknown {
  return {
    schema: PAIR_ATTESTATION_SCHEMA,
    releaseTag: `v${VERSION}`,
    coreCommit: CORE,
    coreVersion: VERSION,
    uiCommit: UI,
    uiVersion: VERSION,
    bootstrap: true,
    verifiedAt: '2026-11-17T00:00:00.000Z',
    ...overrides,
  }
}

function problemsFor(
  value: unknown,
  expected: {
    version?: string
    releaseTagCommit?: string
    uiCommit?: string
  } = {},
): string[] {
  return validatePairAttestation(
    value,
    attestationFile(expected.version ?? VERSION),
    { version: expected.version ?? VERSION, ...expected },
  ).map(problem => problem.message)
}

describe('a valid attestation', () => {
  it('passes with no expectation beyond structure', () => {
    expect(problemsFor(attestation())).toEqual([])
  })

  it('passes when both sides match what the caller established', () => {
    expect(
      problemsFor(attestation(), {
        releaseTagCommit: CORE,
        uiCommit: UI,
      }),
    ).toEqual([])
  })

  it('names the tag namespace that does not trigger a release', () => {
    expect(attestationTag(VERSION)).toBe(`pair/v${VERSION}`)
    /*
     * `v*` is the release trigger. A pair tag matching it would publish npm a
     * second time, so the prefix has to differ from the release prefix, and
     * `*` does not cross `/` — verified against the live ruleset.
     */
    expect(attestationTag(VERSION).startsWith('v')).toBe(false)
  })
})

describe('refusals', () => {
  it('rejects a non-object', () => {
    expect(problemsFor(null)).toContain('not a JSON object')
  })

  it('rejects the wrong schema', () => {
    expect(problemsFor(attestation({ schema: 'other' }))).toContainEqual(
      expect.stringContaining('schema must be'),
    )
  })

  it('rejects a release tag for another version', () => {
    expect(
      problemsFor(attestation({ releaseTag: 'v0.2.0-rc.1' })),
    ).toContainEqual(expect.stringContaining('does not name this release'))
  })

  it('rejects a uiCommit that is not a full SHA', () => {
    expect(problemsFor(attestation({ uiCommit: 'abc1234' }))).toContainEqual(
      expect.stringContaining('40-character SHA'),
    )
  })

  it('rejects a coreCommit that is not a full SHA', () => {
    expect(problemsFor(attestation({ coreCommit: 'main' }))).toContainEqual(
      expect.stringContaining('40-character SHA'),
    )
  })

  it('rejects versions that disagree with the release', () => {
    expect(problemsFor(attestation({ coreVersion: '0.2.0' }))).toContainEqual(
      expect.stringContaining('does not equal the release version'),
    )
    expect(
      problemsFor(attestation({ uiVersion: '0.2.0-rc.1' })),
    ).toContainEqual(
      expect.stringContaining('does not equal the release version'),
    )
  })

  it('rejects a non-boolean bootstrap field', () => {
    expect(problemsFor(attestation({ bootstrap: 'yes' }))).toContainEqual(
      expect.stringContaining('bootstrap must be a boolean'),
    )
  })

  it('rejects a timestamp in the future', () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    expect(problemsFor(attestation({ verifiedAt: future }))).toContainEqual(
      expect.stringContaining('must not be in the future'),
    )
  })

  it('rejects a file name that does not match its version', () => {
    const problems = validatePairAttestation(
      attestation(),
      'meta/release/pairing/attestations/v9.9.9.json',
      { version: VERSION },
    ).map(problem => problem.message)
    expect(problems).toContainEqual(
      expect.stringContaining('file name must be'),
    )
  })
})

/*
 * The comparison that makes it a pair rather than a statement. Both sides come
 * from Git; the file cannot establish either about itself.
 */
describe('binding to the real release', () => {
  it('rejects a coreCommit that is not the tag target', () => {
    const other = 'c'.repeat(40)
    expect(
      problemsFor(attestation(), { releaseTagCommit: other }),
    ).toContainEqual(
      expect.stringContaining('is not the commit v0.2.0-rc.0 points at'),
    )
  })

  it('rejects a uiCommit that is not the release being published', () => {
    const other = 'd'.repeat(40)
    expect(problemsFor(attestation(), { uiCommit: other })).toContainEqual(
      expect.stringContaining('is not the commit being released'),
    )
  })

  it('compares without caring about hex case', () => {
    expect(
      problemsFor(attestation({ coreCommit: CORE.toUpperCase() }), {
        releaseTagCommit: CORE,
      }),
    ).toEqual([])
  })
})

describe('one pair per version', () => {
  function store(entries: Array<[string, unknown]>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-attest-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'meta/release/pairing/attestations'), {
      recursive: true,
    })
    for (const [file, value] of entries) {
      fs.writeFileSync(path.join(root, file), JSON.stringify(value))
    }
    return root
  }

  it('accepts a single attestation', () => {
    const root = store([
      [`meta/release/pairing/attestations/v${VERSION}.json`, attestation()],
    ])
    expect(
      findConflictingAttestations(
        readAttestationDirectory(
          path.join(root, 'meta/release/pairing/attestations'),
        ),
        VERSION,
      ),
    ).toEqual([])
  })

  /*
   * Two files naming the same UI commit is a duplicate rather than a
   * contradiction — it is still refused, because a version that pairs once
   * should not accumulate claims, but the message has to say which it is.
   */
  it('reports an identical duplicate as a duplicate', () => {
    const root = store([
      [`meta/release/pairing/attestations/v${VERSION}.json`, attestation()],
      ['meta/release/pairing/attestations/copy.json', attestation()],
    ])
    const conflicts = findConflictingAttestations(
      readAttestationDirectory(
        path.join(root, 'meta/release/pairing/attestations'),
      ),
      VERSION,
    )
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts.join(' ')).toMatch(/duplicate attestation/)
  })

  it('reports a different UI commit as a conflict', () => {
    const root = store([
      [`meta/release/pairing/attestations/v${VERSION}.json`, attestation()],
      [
        'meta/release/pairing/attestations/other.json',
        attestation({ uiCommit: 'e'.repeat(40) }),
      ],
    ])
    const conflicts = findConflictingAttestations(
      readAttestationDirectory(
        path.join(root, 'meta/release/pairing/attestations'),
      ),
      VERSION,
    )
    expect(conflicts.join(' ')).toMatch(/conflicting attestation/)
  })

  it('ignores attestations for other versions', () => {
    const root = store([
      [`meta/release/pairing/attestations/v${VERSION}.json`, attestation()],
      [
        'meta/release/pairing/attestations/v0.1.0-rc.0.json',
        attestation({
          releaseTag: 'v0.1.0-rc.0',
          coreVersion: '0.1.0-rc.0',
          uiVersion: '0.1.0-rc.0',
        }),
      ],
    ])
    expect(
      findConflictingAttestations(
        readAttestationDirectory(
          path.join(root, 'meta/release/pairing/attestations'),
        ),
        VERSION,
      ),
    ).toEqual([])
  })
})

/*
 * The end-to-end shape, in real repositories: a bootstrap tag that cannot
 * move, a UI candidate, and an attestation that binds them.
 */
describe('the bootstrap → pair protocol is constructible', () => {
  function git(cwd: string, args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  }

  function repo(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-boot-'))
    roots.push(root)
    git(root, ['init', '-q'])
    git(root, ['config', 'user.email', 'test@example.com'])
    git(root, ['config', 'user.name', 'test'])
    return root
  }

  it(
    'binds the bootstrap tag to a later UI candidate without moving it',
    { timeout: 60_000 },
    () => {
      /* ---- Phase 1: Core bootstrap commit, tagged, unpaired ---- */
      const core = repo()
      fs.mkdirSync(path.join(core, 'meta/release/pairing'), { recursive: true })
      fs.writeFileSync(
        path.join(core, `meta/release/pairing/v${VERSION}.json`),
        JSON.stringify({
          schema: 'zeus.release-pairing/v1',
          coreVersion: VERSION,
          uiCommit: null,
          uiVersion: VERSION,
          verifiedAt: '2026-11-17T00:00:00.000Z',
          bootstrap: true,
        }),
      )
      git(core, ['add', '-A'])
      git(core, ['commit', '-qm', 'bootstrap'])
      const bootstrapCommit = git(core, ['rev-parse', 'HEAD'])
      git(core, ['tag', `v${VERSION}`])

      /* ---- Phase 2: a UI candidate exists somewhere else ---- */
      const ui = repo()
      fs.writeFileSync(
        path.join(ui, 'package.json'),
        '{"version":"0.2.0-rc.0"}\n',
      )
      git(ui, ['add', '-A'])
      git(ui, ['commit', '-qm', 'ui candidate'])
      const uiCommit = git(ui, ['rev-parse', 'HEAD'])

      /* ---- Phase 3: the attestation names both, in a later Core commit ---- */
      fs.mkdirSync(path.join(core, 'meta/release/pairing/attestations'), {
        recursive: true,
      })
      fs.writeFileSync(
        path.join(core, attestationFile(VERSION)),
        JSON.stringify(attestation({ coreCommit: bootstrapCommit, uiCommit })),
      )
      git(core, ['add', '-A'])
      git(core, ['commit', '-qm', 'pair attestation'])
      const pairCommit = git(core, ['rev-parse', 'HEAD'])
      git(core, ['tag', attestationTag(VERSION)])

      /*
       * The release tag did not move. This is the property the whole design
       * turns on: the commit that was published is still the commit the release
       * tag names, and the pair was added beside it rather than on top of it.
       */
      expect(git(core, ['rev-parse', `v${VERSION}^{commit}`])).toBe(
        bootstrapCommit,
      )
      expect(
        git(core, ['rev-parse', `${attestationTag(VERSION)}^{commit}`]),
      ).toBe(pairCommit)
      expect(bootstrapCommit).not.toBe(pairCommit)

      /* ---- The attestation validates against both real commits ---- */
      const written = JSON.parse(
        fs.readFileSync(path.join(core, attestationFile(VERSION)), 'utf8'),
      ) as unknown
      expect(
        validatePairAttestation(written, attestationFile(VERSION), {
          version: VERSION,
          releaseTagCommit: bootstrapCommit,
          uiCommit,
        }),
      ).toEqual([])
    },
  )

  /*
   * The failure the protocol exists to prevent: an attestation claiming a Core
   * commit other than the one the release tag points at. Accepting it would
   * pair the UI with a tree that was never published under this version.
   */
  it(
    'rejects an attestation that names a different Core commit',
    { timeout: 60_000 },
    () => {
      const core = repo()
      fs.writeFileSync(path.join(core, 'a.txt'), 'a\n')
      git(core, ['add', '-A'])
      git(core, ['commit', '-qm', 'one'])
      const first = git(core, ['rev-parse', 'HEAD'])
      fs.writeFileSync(path.join(core, 'a.txt'), 'b\n')
      git(core, ['commit', '-qam', 'two'])
      const second = git(core, ['rev-parse', 'HEAD'])
      git(core, ['tag', `v${VERSION}`])

      const problems = validatePairAttestation(
        attestation({ coreCommit: first }),
        attestationFile(VERSION),
        { version: VERSION, releaseTagCommit: second },
      ).map(problem => problem.message)
      expect(problems).toContainEqual(
        expect.stringContaining('was never published under this version'),
      )
    },
  )
})

/*
 * The pairing record moved from `release-pairing/` to `meta/release/pairing/`,
 * but the tags that carry it did not move. `v0.2.0-rc.0` … `rc.3` are already
 * pushed and the tag ruleset makes them undeletable, so pairing one of them
 * still has to read the old path — *inside that tag's tree*, never from a
 * branch.
 *
 * The failure these cases exist to prevent is a reader that treats any error
 * as "not here" and falls through: a corrupt record at the new path would then
 * be reported as whatever the old path happens to hold.
 */
describe('the tagged record is read from either layout, at the tag', () => {
  /** A `gh` that answers for exactly the paths given, and 404s otherwise. */
  function gh(bodies: Record<string, string>) {
    const asked: string[] = []
    const run = (args: readonly string[]): string => {
      const url = args[1]!
      asked.push(url)
      for (const [path, body] of Object.entries(bodies)) {
        if (url.includes(`/contents/${path}?ref=`)) return body
      }
      throw new Error('gh: Not Found (HTTP 404)')
    }
    return { run, asked }
  }

  it('prefers the new layout', () => {
    const { run } = gh({
      'meta/release/pairing/v0.2.0-rc.0.json': JSON.stringify({
        bootstrap: true,
        uiCommit: null,
      }),
      'release-pairing/v0.2.0-rc.0.json': JSON.stringify({
        bootstrap: false,
        uiCommit: UI,
      }),
    })
    expect(readTaggedRecord(VERSION, 'baicie/zeus', run)).toEqual({
      bootstrap: true,
      uiCommit: null,
    })
  })

  /*
   * The case the migration creates: rc.0 – rc.3 were tagged before the move,
   * so their trees hold the record at the old path only.
   */
  it('falls back to the pre-migration layout inside the tag', () => {
    const { run, asked } = gh({
      'release-pairing/v0.2.0-rc.0.json': JSON.stringify({
        bootstrap: true,
        uiCommit: null,
      }),
    })
    expect(readTaggedRecord(VERSION, 'baicie/zeus', run)).toEqual({
      bootstrap: true,
      uiCommit: null,
    })
    // Both reads are pinned to the tag, not to a branch or to HEAD.
    for (const url of asked) expect(url).toContain(`?ref=v${VERSION}`)
    expect(asked).toHaveLength(2)
  })

  it('reads both candidate paths at the tag, newest first', () => {
    expect(TAGGED_RECORD_PATHS[0]).toBe('meta/release/pairing')
    expect(TAGGED_RECORD_PATHS).toContain('release-pairing')
  })

  /*
   * The refusal that must survive the fallback: a version whose tag carries
   * neither layout is undefined, and the caller turns that into "there is
   * nothing to pair" — never into a default version or an empty SHA.
   */
  it('returns undefined when the tag carries neither layout', () => {
    const { run } = gh({})
    expect(readTaggedRecord(VERSION, 'baicie/zeus', run)).toBeUndefined()
  })

  /*
   * A record that is present but unreadable must not be mistaken for absence.
   * Without this, a corrupt file at the new path would silently resolve to the
   * old path's record — two different claims about one tag, with the second
   * one winning by accident.
   */
  it('refuses to fall through when the record it found is malformed', () => {
    const { run } = gh({
      'meta/release/pairing/v0.2.0-rc.0.json': '{not json',
      'release-pairing/v0.2.0-rc.0.json': JSON.stringify({
        bootstrap: true,
        uiCommit: null,
      }),
    })
    expect(() => readTaggedRecord(VERSION, 'baicie/zeus', run)).toThrow(
      /not valid JSON/,
    )
  })

  it('refuses a record that is JSON but not an object', () => {
    const { run } = gh({
      'meta/release/pairing/v0.2.0-rc.0.json': '"a string"',
    })
    expect(() => readTaggedRecord(VERSION, 'baicie/zeus', run)).toThrow(
      /not a JSON object/,
    )
  })
})

/*
 * `--out` names the attestation file; the writer needs the repository root so
 * it can rebuild the path from the directory constant.
 *
 * Deriving the root by stripping a fixed number of levels is what the move
 * broke: `release-pairing/attestations` is two levels, `meta/release/pairing/
 * attestations` is three, so the old count put the attestation in
 * `meta/release/` — where `check:release-pairing` reports it as a stray file
 * in the wrong place rather than as the pair.
 */
describe('an explicit --out still resolves to the repository root', () => {
  it('accepts the post-migration layout', () => {
    expect(
      rootOfAttestationFile('/repo/meta/release/pairing/attestations/v9.json'),
    ).toBe('/repo')
  })

  /*
   * A relative `--out` is resolved against the working directory first, so the
   * root it yields is absolute. Asserting the property rather than the string
   * keeps the test independent of where it runs.
   */
  it('accepts a relative path', () => {
    const root = rootOfAttestationFile(
      'meta/release/pairing/attestations/v9.json',
    )
    expect(path.isAbsolute(root)).toBe(true)
    expect(path.join(root, 'meta/release/pairing/attestations/v9.json')).toBe(
      path.resolve('meta/release/pairing/attestations/v9.json'),
    )
  })

  /*
   * The old layout is not silently accepted: a record written there would not
   * be read by the release, and the failure would arrive at tag time.
   */
  it('refuses a path outside the attested directory', () => {
    expect(() =>
      rootOfAttestationFile('/repo/release-pairing/attestations/v9.json'),
    ).toThrow(/is not inside meta\/release\/pairing\/attestations/)
  })

  it('refuses a path that is one level short', () => {
    expect(() =>
      rootOfAttestationFile('/repo/meta/release/pairing/v9.json'),
    ).toThrow(/is not inside/)
  })
})

/*
 * The failure classification, which the first implementation got wrong.
 *
 * It caught every exception and moved on to the next layout. `gh` exits 1 for
 * a 404, a 403 from a token that lost its scope, a 429, a 500 and a timeout
 * alike, so "it threw" carried no information — a permissions problem or a
 * GitHub outage silently changed which record the release paired against.
 *
 * Each case below asserts both outcomes: the refusal, and that the second
 * path was never requested. A test that only checked the throw would pass on
 * an implementation that asked the old path first and threw afterwards.
 */
describe('a failed read is classified, not treated as absence', () => {
  /** A `gh` that fails the new layout with `failure`, and serves the old one. */
  function ghFailingNewLayout(failure: () => Error) {
    const asked: string[] = []
    const run = (args: readonly string[]): string => {
      const url = args[1]!
      asked.push(url)
      if (url.includes('/contents/meta/release/pairing/')) throw failure()
      return JSON.stringify({ bootstrap: true, uiCommit: null })
    }
    return { run, asked }
  }

  /** What `execFileSync` throws for a real `gh` failure. */
  function ghError(
    stdout: string,
    stderr: string,
  ): Error & {
    status: number
    stdout: string
    stderr: string
  } {
    return Object.assign(new Error('Command failed: gh api'), {
      status: 1,
      stdout,
      stderr,
    })
  }

  const notFound = () =>
    ghError(
      '{"message":"Not Found","status":"404"}',
      'gh: Not Found (HTTP 404)\n',
    )

  it('reads the older layout when the newer one answers 404', () => {
    const { run, asked } = ghFailingNewLayout(notFound)
    expect(readTaggedRecord(VERSION, 'baicie/zeus', run)).toEqual({
      bootstrap: true,
      uiCommit: null,
    })
    // The negative control for every other case in this block.
    expect(asked).toHaveLength(2)
  })

  it.each([
    [
      '403',
      () =>
        ghError(
          '{"message":"Forbidden","status":"403"}',
          'gh: Forbidden (HTTP 403)\n',
        ),
    ],
    [
      '429',
      () =>
        ghError(
          '{"message":"rate limit","status":"429"}',
          'gh: API rate limit exceeded (HTTP 429)\n',
        ),
    ],
    [
      '500',
      () =>
        ghError(
          '{"message":"Server Error","status":"500"}',
          'gh: Server Error (HTTP 500)\n',
        ),
    ],
    [
      '401',
      () =>
        ghError(
          '{"message":"Bad credentials","status":"401"}',
          'gh: Bad credentials (HTTP 401)\n',
        ),
    ],
  ])(
    'refuses on HTTP %s without reading the older layout',
    (_code, failure) => {
      const { run, asked } = ghFailingNewLayout(failure)
      expect(() => readTaggedRecord(VERSION, 'baicie/zeus', run)).toThrow(
        /refusing to fall back/,
      )
      expect(asked).toHaveLength(1)
    },
  )

  /*
   * A timeout is reported by the child being killed, which may leave no
   * output at all — so the signal, not the text, has to carry the verdict.
   */
  it('refuses on a timeout that produced no output', () => {
    const { run, asked } = ghFailingNewLayout(() =>
      Object.assign(new Error('spawnSync gh ETIMEDOUT'), {
        status: null,
        signal: 'SIGTERM',
        killed: true,
        stdout: '',
        stderr: '',
      }),
    )
    expect(() => readTaggedRecord(VERSION, 'baicie/zeus', run)).toThrow(
      /\(timeout\)/,
    )
    expect(asked).toHaveLength(1)
  })

  it('refuses on a network failure', () => {
    const { run, asked } = ghFailingNewLayout(() =>
      ghError('', 'dial tcp: lookup api.github.com: no such host\n'),
    )
    expect(() => readTaggedRecord(VERSION, 'baicie/zeus', run)).toThrow(
      /\(network\)/,
    )
    expect(asked).toHaveLength(1)
  })

  it('refuses on an unclassified failure rather than guessing', () => {
    const { run, asked } = ghFailingNewLayout(() =>
      ghError('', 'something nobody has seen before\n'),
    )
    expect(() => readTaggedRecord(VERSION, 'baicie/zeus', run)).toThrow(
      /\(unknown\)/,
    )
    expect(asked).toHaveLength(1)
  })

  it('refuses when the newer record is served but corrupt', () => {
    const asked: string[] = []
    const run = (args: readonly string[]): string => {
      const url = args[1]!
      asked.push(url)
      if (url.includes('/contents/meta/release/pairing/')) return '{not json'
      return JSON.stringify({ bootstrap: true, uiCommit: null })
    }
    expect(() => readTaggedRecord(VERSION, 'baicie/zeus', run)).toThrow(
      /not valid JSON/,
    )
    expect(asked).toHaveLength(1)
  })
})

/*
 * `--out` is a path a person types, and the check that decides whether it is
 * inside the attested directory is the one that broke.
 *
 * The original compared strings: `resolved.endsWith(PAIR_ATTESTATION_DIRECTORY
 * + '/' + name)`. `path.resolve` returns backslashes on Windows while the
 * repository path is written with `/`, so every valid `--out` was rejected
 * there and no test noticed, because the tests ran on POSIX.
 *
 * `path.win32` is available on every platform, so the Windows branch is
 * exercised wherever the suite runs.
 */
describe('an explicit --out is read with the platform path rules', () => {
  const posix = path.posix
  const win = path.win32

  it('finds the root of a POSIX path', () => {
    expect(
      rootOfAttestationFileWith(
        posix,
        '/repo/meta/release/pairing/attestations/v9.json',
      ),
    ).toBe('/repo')
  })

  it('finds the root of a Windows path, backslashes intact', () => {
    expect(
      rootOfAttestationFileWith(
        win,
        'C:\\repo\\meta\\release\\pairing\\attestations\\v9.json',
      ),
    ).toBe('C:\\repo')
  })

  it('accepts a Windows path written with forward slashes', () => {
    expect(
      rootOfAttestationFileWith(
        win,
        'C:/repo/meta/release/pairing/attestations/v9.json',
      ),
    ).toBe('C:\\repo')
  })

  /*
   * A UNC path has no drive letter; the root is the share, and the answer
   * must keep the `\\server\share\` form rather than synthesising one.
   */
  it('finds the root of a UNC path', () => {
    expect(
      rootOfAttestationFileWith(
        win,
        '\\\\server\\share\\meta\\release\\pairing\\attestations\\v9.json',
      ),
    ).toBe('\\\\server\\share\\')
  })

  it.each([
    [
      'the pre-migration directory',
      '/repo/release-pairing/attestations/v9.json',
    ],
    ['one level short', '/repo/meta/release/pairing/v9.json'],
    [
      'a different directory with the same tail',
      '/repo/x/attestations/v9.json',
    ],
    [
      'an escaped directory',
      '/repo/meta/release/pairing/attestations/../../contracts/v9.json',
    ],
  ])('refuses %s on POSIX', (_label, out) => {
    expect(() => rootOfAttestationFileWith(posix, out)).toThrow(/is not inside/)
  })

  it.each([
    [
      'the pre-migration directory',
      'C:\\repo\\release-pairing\\attestations\\v9.json',
    ],
    ['one level short', 'C:\\repo\\meta\\release\\pairing\\v9.json'],
    [
      'an escaped directory',
      'C:\\repo\\meta\\release\\pairing\\attestations\\..\\..\\contracts\\v9.json',
    ],
  ])('refuses %s on Windows', (_label, out) => {
    expect(() => rootOfAttestationFileWith(win, out)).toThrow(/is not inside/)
  })

  /*
   * The trailing-segment check must not be satisfiable by a sibling whose
   * name merely contains the attested path.
   */
  it('refuses a directory that only ends with the same words', () => {
    expect(() =>
      rootOfAttestationFileWith(
        posix,
        '/repo/not-meta/release/pairing/attestations/v9.json',
      ),
    ).toThrow(/is not inside/)
  })

  it('keeps the public entry point on the platform rules', () => {
    const here = rootOfAttestationFile(
      'meta/release/pairing/attestations/v9.json',
    )
    expect(path.isAbsolute(here)).toBe(true)
    expect(path.join(here, 'meta/release/pairing/attestations/v9.json')).toBe(
      path.resolve('meta/release/pairing/attestations/v9.json'),
    )
  })
})

describe('the failure classifier reads what gh actually prints', () => {
  function ghError(stdout: string, stderr: string) {
    return Object.assign(new Error('Command failed: gh api'), {
      status: 1,
      stdout,
      stderr,
    })
  }

  it.each([
    ['404 body', '{"message":"Not Found","status":"404"}', '', 'not-found'],
    ['404 stderr', '', 'gh: Not Found (HTTP 404)\n', 'not-found'],
    ['403 body', '{"status":"403"}', '', 'forbidden'],
    [
      '429 stderr',
      '',
      'gh: API rate limit exceeded (HTTP 429)\n',
      'rate-limited',
    ],
    ['500 body', '{"status":"500"}', '', 'server-error'],
    ['503 stderr', '', 'gh: Service Unavailable (HTTP 503)\n', 'server-error'],
    ['401', '', 'gh: Bad credentials (HTTP 401)\n', 'auth-failed'],
    [
      'auth prompt',
      '',
      'To get started with GitHub CLI, please run: gh auth login\n',
      'auth-failed',
    ],
    ['dns', '', 'dial tcp: lookup api.github.com: no such host\n', 'network'],
    [
      'reset',
      '',
      'read tcp: connection reset by peer (ECONNRESET)\n',
      'network',
    ],
    ['unrecognised', '', 'something nobody has seen before\n', 'unknown'],
  ])('classifies %s', (_label, stdout, stderr, expected) => {
    expect(classifyGhFailure(ghError(stdout, stderr))).toBe(expected)
  })

  it('classifies a killed child as a timeout even with no output', () => {
    expect(
      classifyGhFailure(
        Object.assign(new Error('spawnSync gh ETIMEDOUT'), {
          signal: 'SIGTERM',
          killed: true,
          stdout: '',
          stderr: '',
        }),
      ),
    ).toBe('timeout')
  })
})
