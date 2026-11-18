/**
 * The pairing-record wiring, tested through the real CLI and the real
 * workflow file.
 *
 * The defect this covers is the kind that unit tests miss by construction: the
 * policy function handled `acknowledgedFirstPublish` correctly and every test
 * passed it directly, while the workflow never passed the flag that fills it.
 * A rule can be right and unreachable at the same time.
 *
 * So these tests run `authorize-release.ts` as a subprocess with the same
 * arguments the workflow uses, and read `release.yml` to confirm the flag is
 * among them.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  readFailedRun,
  readRecoveryClaim,
  readRemoteTagCommit,
} from '../authorize-release'

const root = path.resolve(import.meta.dirname, '../../..')
const CLI = path.join(root, 'scripts/release/authorize-release.ts')
const TSX = path.join(root, 'node_modules/.bin/tsx')
const UI_COMMIT = '89fc93cac5b97f29f48deb64964886476c5d7aac'
const VERSION = '0.2.0-rc.0'

const work: string[] = []

afterEach(() => {
  for (const directory of work.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

interface Scaffold {
  readonly directory: string
  readonly sha: string
  readonly pairingFile: string
  readonly bundleReport: string
  /** Where the stubbed `gh` and `npm` live. */
  readonly bin: string
}

/**
 * A repository the CLI can be pointed at, with a stubbed `gh` and `npm`.
 *
 * The stubs answer what the release needs: CI runs for this commit, a tag
 * pointing at it, and a registry where three packages have never been
 * published. Everything else — the policy, the CLI, the argument parsing — is
 * the real code.
 */
function scaffold(pairing: unknown | 'missing'): Scaffold {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-pairing-wire-'))
  work.push(directory)
  const repo = path.join(directory, 'repo')
  const bin = path.join(directory, 'bin')
  fs.mkdirSync(path.join(repo, 'packages/core/zeus'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'release-pairing'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'temp/sbom'), { recursive: true })
  fs.mkdirSync(bin, { recursive: true })

  /*
   * `zeusFixedPackages` is the published set; the scaffold needs its members
   * present so the Core/UI pairing rule can read them. Two is enough — the
   * rule checks that they agree with each other and with the tag.
   */
  for (const [name, dir] of [
    ['@zeus-js/zeus', 'packages/core/zeus'],
    ['@zeus-js/signal', 'packages/core/signal'],
  ] as const) {
    fs.mkdirSync(path.join(repo, dir), { recursive: true })
    fs.writeFileSync(
      path.join(repo, `${dir}/package.json`),
      `${JSON.stringify({ name, version: VERSION })}\n`,
    )
  }

  const pairingFile = path.join(repo, 'release-pairing', `v${VERSION}.json`)
  if (pairing !== 'missing') {
    fs.writeFileSync(pairingFile, `${JSON.stringify(pairing, null, 2)}\n`)
  }

  fs.writeFileSync(
    path.join(repo, 'temp/sbom/zeus.cdx.json'),
    JSON.stringify({ bomFormat: 'CycloneDX', components: [{ name: 'x' }] }),
  )
  const bundleReport = path.join(directory, 'tarballs.json')
  fs.writeFileSync(
    bundleReport,
    JSON.stringify({ schema: 'zeus.release-artifacts/v1', ok: true }),
  )

  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  git(['init', '-q'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'test'])
  git(['add', '-A'])
  git(['commit', '-qm', 'init'])
  const sha = git(['rev-parse', 'HEAD'])

  /* `origin/main` at the same commit, so reachability is established. */
  const origin = path.join(directory, 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', origin])
  git(['remote', 'add', 'origin', origin])
  git(['push', '-q', 'origin', `HEAD:refs/heads/main`])

  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/bin/bash
case "$*" in
  *actions/workflows/ci.yml/runs*)
    echo '{"workflow_runs":[{"id":1,"path":".github/workflows/ci.yml","head_sha":"${sha}","run_attempt":1,"conclusion":"success","event":"push","status":"completed"}]}' ;;
  *actions/workflows/compiler-native.yml/runs*)
    echo '{"workflow_runs":[{"id":2,"path":".github/workflows/compiler-native.yml","head_sha":"${sha}","run_attempt":1,"conclusion":"success","event":"workflow_call","status":"completed"}]}' ;;
  *git/ref/tags*) echo '{"object":{"type":"commit","sha":"${sha}"}}' ;;
  *) echo '{}' ;;
esac
`,
  )
  fs.writeFileSync(
    path.join(bin, 'npm'),
    `#!/bin/bash
case "$*" in
  *"view @zeus-js/i18n "*|*"view @zeus-js/eslint-plugin "*|*"view @zeus-js/playground-engine "*)
    echo "npm error code E404" >&2; exit 1 ;;
  *"view"*) echo '["0.1.1-beta.20"]' ;;
  *) exit 1 ;;
esac
`,
  )
  for (const name of ['gh', 'npm']) {
    fs.chmodSync(path.join(bin, name), 0o755)
  }
  return { directory: repo, sha, pairingFile, bundleReport, bin }
}

interface CliResult {
  readonly code: number
  readonly stdout: string
  readonly record?: {
    verdict: string
    findings: { rule: string; verdict: string; detail: string }[]
  }
}

function runCli(
  built: Scaffold,
  options: {
    readPairing?: boolean
    /** `null` omits `--ui-commit`, as the workflow does on the bootstrap path. */
    uiCommit?: string | null
    bootstrap?: boolean
  } = {},
): CliResult {
  const out = path.join(built.directory, 'temp/release/authorization.json')
  const readPairing = options.readPairing ?? true
  const uiCommit = options.uiCommit === undefined ? UI_COMMIT : options.uiCommit
  const args = [
    CLI,
    '--root',
    built.directory,
    '--repository',
    'baicie/zeus',
    '--version',
    VERSION,
    '--tag-ref',
    `refs/tags/v${VERSION}`,
    '--workflow-sha',
    built.sha,
    ...(uiCommit === null ? [] : ['--ui-commit', uiCommit]),
    '--ui-version',
    VERSION,
    '--dist-tag',
    'rc',
    ...(options.bootstrap ? ['--bootstrap'] : []),
    '--require-sbom',
    '--bundle-report',
    built.bundleReport,
  ]
  if (readPairing) args.push('--pairing-record', built.pairingFile)
  args.push('--out', out)

  let stdout = ''
  let code = 0
  try {
    /*
     * `tsx` directly, not `pnpm exec tsx`: pnpm rebuilds PATH for the child,
     * which drops the stubbed `gh` and `npm` this test relies on. That was
     * why the first version reported zero first publications — the real npm
     * answered, and every package looked published.
     */
    if (process.env.DEBUG_WIRING) {
      console.error(
        'PATH starts:',
        `${path.join(built.directory, 'bin')}:${process.env.PATH ?? ''}`.slice(
          0,
          90,
        ),
      )
      console.error(
        'stub exists:',
        fs.existsSync(path.join(built.directory, 'bin', 'npm')),
      )
    }
    stdout = execFileSync(TSX, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
      env: {
        ...process.env,
        PATH: `${built.bin}:${process.env.PATH ?? ''}`,
      },
    })
  } catch (error) {
    const failure = error as {
      status?: number
      stdout?: string
      stderr?: string
    }
    code = failure.status ?? 1
    stdout = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
  }

  const record = fs.existsSync(out)
    ? (JSON.parse(fs.readFileSync(out, 'utf8')) as CliResult['record'])
    : undefined
  return { code, stdout, record }
}

function distTagFinding(result: CliResult) {
  return result.record?.findings.find(entry => entry.rule === 'dist-tag')
}

const THREE = [
  '@zeus-js/i18n',
  '@zeus-js/eslint-plugin',
  '@zeus-js/playground-engine',
]

function pairing(firstPublish?: unknown): Record<string, unknown> {
  return {
    schema: 'zeus.release-pairing/v1',
    coreVersion: VERSION,
    uiCommit: UI_COMMIT,
    uiVersion: VERSION,
    verifiedAt: '2026-11-16T00:00:00.000Z',
    ...(firstPublish === undefined ? {} : { firstPublish }),
  }
}

/** The unpaired record: a new version line's first release. */
function bootstrapPairing(firstPublish?: unknown): Record<string, unknown> {
  return {
    ...pairing(firstPublish),
    uiCommit: null,
    bootstrap: true,
  }
}

function pairingFinding(result: CliResult) {
  return result.record?.findings.find(entry => entry.rule === 'core-ui-pairing')
}

describe('the workflow passes the pairing record', () => {
  /*
   * The defect this file exists for: the flag was never passed, so a
   * maintainer who accepted the three first publications would still be
   * refused, and the error told them to add names to a file nobody read.
   */
  it('passes --pairing-record to the authorisation', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/release.yml'),
      'utf8',
    )
    expect(workflow).toContain('--pairing-record')
    expect(workflow).toMatch(
      /--pairing-record "release-pairing\/v\$\{\{ steps\.release-version\.outputs\.version \}\}\.json"/,
    )
  })

  /*
   * `--bootstrap` is only passed when the record declares it. It must never be
   * derived from an empty `--ui-commit`, or a workflow that forgot to read the
   * record would silently publish unpaired.
   */
  it('passes --bootstrap only when the record declares it', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/release.yml'),
      'utf8',
    )
    expect(workflow).toMatch(
      /\$\{\{ steps\.pairing\.outputs\.bootstrap == 'true' && '--bootstrap' \|\| '' \}\}/,
    )
  })
})

/*
 * The Bootstrap → Pair split, exercised through the real CLI with the same
 * arguments the workflow builds.
 *
 * The deadlock it exists for: a new version line's first Core release cannot
 * name a UI commit, because the UI lockfile cannot resolve until those
 * packages are published, and the record has to be inside the commit the tag
 * points at. The two requirements form a cycle, so the first tag in a line has
 * to publish unpaired — and say so.
 */
describe('bootstrap releases', () => {
  it('publishes when the record declares bootstrap and names no commit', () => {
    const result = runCli(scaffold(bootstrapPairing(THREE)), {
      uiCommit: null,
      bootstrap: true,
    })
    const finding = pairingFinding(result)
    /*
     * Limitation, not authorisation. A bootstrap release did not verify the
     * pair, and the record has to say that rather than claim a check passed.
     */
    expect(finding?.verdict).toBe('POLICY_LIMITATION')
    expect(finding?.detail).toMatch(/no UI pair was verified/)
    expect(result.code).toBe(0)
  }, 180_000)

  /*
   * The flag is not a waiver of the pair's *shape*. A record that names a
   * commit and claims bootstrap is ambiguous, and ambiguity is what the flag
   * exists to remove.
   */
  it('refuses when bootstrap is passed with a UI commit', () => {
    const result = runCli(scaffold(pairing(THREE)), { bootstrap: true })
    expect(pairingFinding(result)?.verdict).toBe('REFUSED')
    expect(pairingFinding(result)?.detail).toMatch(
      /paired or unpaired, never both/,
    )
    expect(result.code).not.toBe(0)
  }, 180_000)

  /*
   * And it is not a waiver of the record itself. No file, no release.
   */
  it('refuses a bootstrap run with no pairing record at all', () => {
    const result = runCli(scaffold('missing'), { bootstrap: true })
    expect(result.stdout).toMatch(/does not exist/)
    expect(result.code).not.toBe(0)
  }, 180_000)

  /*
   * A paired release is unaffected: the same tree, the same arguments, and
   * `core-ui-pairing` authorises rather than limiting.
   */
  it('still authorises a paired release', () => {
    const result = runCli(scaffold(pairing(THREE)))
    expect(pairingFinding(result)?.verdict).toBe('AUTHORIZED')
    expect(result.code).toBe(0)
  }, 180_000)
})

describe('the CLI with the real arguments', () => {
  it('accepts all three first publications when the record lists them', () => {
    const result = runCli(scaffold(pairing(THREE)))
    expect(distTagFinding(result)?.verdict).toBe('AUTHORIZED')
    expect(distTagFinding(result)?.detail).toMatch(
      /3 first publish\(es\) accepted/,
    )
  }, 180_000)

  it('refuses when one of the three is missing from the list', () => {
    const result = runCli(scaffold(pairing(THREE.slice(0, 2))))
    expect(distTagFinding(result)?.verdict).toBe('REFUSED')
    expect(distTagFinding(result)?.detail).toMatch(/never been published/)
  }, 180_000)

  it('refuses when the record lists a package this repository does not publish', () => {
    /*
     * A name outside the published set makes the list look satisfied while the
     * real first publication goes unacknowledged — a typo and an attempt both
     * have to fail.
     */
    const result = runCli(
      scaffold(pairing([...THREE.slice(0, 2), '@zeus-js/not-a-package'])),
    )
    expect(distTagFinding(result)?.verdict).toBe('REFUSED')
    expect(result.stdout).toMatch(/does not publish/)
  }, 180_000)

  it('refuses when the record file is missing', () => {
    const result = runCli(scaffold('missing'))
    expect(distTagFinding(result)?.verdict).toBe('REFUSED')
    expect(result.stdout).toMatch(/does not exist/)
  }, 180_000)

  it('refuses when firstPublish is not an array', () => {
    const result = runCli(scaffold(pairing('@zeus-js/i18n')))
    expect(distTagFinding(result)?.verdict).toBe('REFUSED')
    expect(result.stdout).toMatch(/not an array of package names/)
  }, 180_000)

  it('refuses when the record is not valid JSON', () => {
    const built = scaffold(pairing(THREE))
    fs.writeFileSync(built.pairingFile, '{not json')
    const result = runCli(built)
    expect(distTagFinding(result)?.verdict).toBe('REFUSED')
  }, 180_000)

  /*
   * And the wiring defect itself: without the flag the CLI cannot see the
   * record at all, which is why the workflow must pass it.
   */
  it('refuses when the flag is not passed, and says so', () => {
    const result = runCli(scaffold(pairing(THREE)), { readPairing: false })
    expect(distTagFinding(result)?.verdict).toBe('REFUSED')
    expect(result.stdout).toMatch(/no --pairing-record was passed/)
  }, 180_000)
})

/*
 * Recovery evidence, read from GitHub rather than from the record.
 *
 * The record says which failed version and run to check. Whether that run
 * really stopped before publishing is the claim the whole recovery path rests
 * on, so it is answered by the API. A record can ask for a recovery; it cannot
 * certify one.
 */
describe('recovery evidence', () => {
  function ghReturning(responses: Record<string, unknown>) {
    return (args: readonly string[]): string => {
      const key = args.find(arg => arg.startsWith('repos/')) ?? ''
      for (const [pattern, value] of Object.entries(responses)) {
        if (key.includes(pattern)) return JSON.stringify(value)
      }
      throw new Error(`unexpected gh call: ${args.join(' ')}`)
    }
  }

  it('reads the tag commit and whether the run reached a publish step', () => {
    const gh = ghReturning({
      'git/ref/tags/v0.2.0-rc.0': {
        object: { type: 'commit', sha: 'a'.repeat(40) },
      },
      'actions/runs/44218605332/jobs': {
        jobs: [
          {
            steps: [
              { name: 'Checkout', status: 'completed' },
              { name: 'Release precheck', status: 'completed' },
              { name: 'Build and publish', status: 'skipped' },
            ],
          },
        ],
      },
      'actions/runs/44218605332': { head_sha: 'a'.repeat(40) },
    })

    expect(readRemoteTagCommit('baicie/zeus', 'v0.2.0-rc.0', gh)).toBe(
      'a'.repeat(40),
    )
    expect(readFailedRun('baicie/zeus', '44218605332', gh)).toEqual({
      tagCommit: 'a'.repeat(40),
      reachedPublish: false,
    })
  })

  /*
   * A skipped publish step did not publish. The distinction matters because
   * the release that this recovery path was built for failed in precheck and
   * left `Build and publish` as `skipped`.
   */
  it('treats a skipped publish step as not reached', () => {
    const gh = ghReturning({
      'actions/runs/1/jobs': {
        jobs: [{ steps: [{ name: 'Build and publish', status: 'skipped' }] }],
      },
      'actions/runs/1': { head_sha: 'b'.repeat(40) },
    })
    expect(readFailedRun('baicie/zeus', '1', gh)?.reachedPublish).toBe(false)
  })

  it('treats a started publish step as reached', () => {
    const gh = ghReturning({
      'actions/runs/2/jobs': {
        jobs: [{ steps: [{ name: 'Build and publish', status: 'failure' }] }],
      },
      'actions/runs/2': { head_sha: 'c'.repeat(40) },
    })
    expect(readFailedRun('baicie/zeus', '2', gh)?.reachedPublish).toBe(true)
  })

  /*
   * The shape GitHub actually returns for a step whose `if:` was false.
   *
   * `status` is `completed` and `conclusion` is `skipped` — there is no
   * `status: "skipped"` for a step that never ran. Every fixture above used
   * the shape that does not occur, so the guard against
   * `status === 'skipped'` never fired in production: rc.1's three
   * never-executed publish steps were counted as reached and the release was
   * refused as "partially published" while nothing had been published.
   */
  it('treats completed+skipped publish steps as not reached', () => {
    const gh = ghReturning({
      'actions/runs/44263303787/jobs': {
        jobs: [
          {
            name: 'release',
            steps: [
              {
                name: 'Release precheck',
                status: 'completed',
                conclusion: 'failure',
              },
              {
                name: 'Build and publish',
                status: 'completed',
                conclusion: 'skipped',
              },
              {
                name: 'Verify published create-zeus scaffold',
                status: 'completed',
                conclusion: 'skipped',
              },
              {
                name: 'Check npm latest after publishing',
                status: 'completed',
                conclusion: 'skipped',
              },
            ],
          },
        ],
      },
      'actions/runs/44263303787': { head_sha: 'd'.repeat(40) },
    })
    expect(readFailedRun('baicie/zeus', '44263303787', gh)).toEqual({
      tagCommit: 'd'.repeat(40),
      reachedPublish: false,
    })
  })

  /*
   * The safe direction: a publish step that ran and failed still counts.
   * Reading `conclusion` must not turn a real attempt into "never ran".
   */
  it('still counts a publish step that ran and failed', () => {
    const gh = ghReturning({
      'actions/runs/4/jobs': {
        jobs: [
          {
            steps: [
              {
                name: 'Build and publish',
                status: 'completed',
                conclusion: 'failure',
              },
            ],
          },
        ],
      },
      'actions/runs/4': { head_sha: 'e'.repeat(40) },
    })
    expect(readFailedRun('baicie/zeus', '4', gh)?.reachedPublish).toBe(true)
  })

  /*
   * Cancelled counts as reached. A cancelled publish may have pushed some
   * packages before it stopped, so it is the "might have" case the rule
   * refuses on.
   */
  it('counts a cancelled publish step as reached', () => {
    const gh = ghReturning({
      'actions/runs/5/jobs': {
        jobs: [
          {
            steps: [
              {
                name: 'Build and publish',
                status: 'completed',
                conclusion: 'cancelled',
              },
            ],
          },
        ],
      },
      'actions/runs/5': { head_sha: 'f'.repeat(40) },
    })
    expect(readFailedRun('baicie/zeus', '5', gh)?.reachedPublish).toBe(true)
  })

  it('returns undefined when the run cannot be read', () => {
    const gh = (): string => {
      throw new Error('404')
    }
    expect(readFailedRun('baicie/zeus', '3', gh)).toBeUndefined()
    expect(
      readRemoteTagCommit('baicie/zeus', 'v0.2.0-rc.0', gh),
    ).toBeUndefined()
  })

  it('dereferences an annotated tag to its commit', () => {
    const gh = ghReturning({
      'git/ref/tags/v0.2.0-rc.0': {
        object: { type: 'tag', sha: 'e'.repeat(40) },
      },
      'git/tags/eeee': { object: { type: 'commit', sha: 'f'.repeat(40) } },
    })
    expect(readRemoteTagCommit('baicie/zeus', 'v0.2.0-rc.0', gh)).toBe(
      'f'.repeat(40),
    )
  })

  it('reads the recovery claim from a record, and nothing more', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-recovery-'))
    work.push(dir)
    const file = path.join(dir, 'record.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        schema: 'zeus.release-pairing/v1',
        recovery: {
          failedVersion: '0.2.0-rc.0',
          failedRunId: '44218605332',
          failedTagCommit: 'a'.repeat(40),
          failedRunReachedPublish: true,
        },
      }),
    )
    const claim = readRecoveryClaim(file)
    /*
     * `failedRunReachedPublish` is in the file and is **not** returned: it is
     * the one field an attacker would flip, so it is read from GitHub instead.
     */
    expect(claim).toEqual({
      failedVersion: '0.2.0-rc.0',
      failedRunId: '44218605332',
      failedTagCommit: 'a'.repeat(40),
    })
  })

  it('returns undefined for a record with no recovery block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-recovery-'))
    work.push(dir)
    const file = path.join(dir, 'record.json')
    fs.writeFileSync(
      file,
      JSON.stringify({ schema: 'zeus.release-pairing/v1' }),
    )
    expect(readRecoveryClaim(file)).toBeUndefined()
    expect(readRecoveryClaim(undefined)).toBeUndefined()
  })
})
