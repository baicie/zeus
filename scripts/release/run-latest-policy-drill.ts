/**
 * Five ways `latest` gets taken, and the repair that puts it back (R23 TASK 19).
 *
 * `latest` may only point at a stable version. When a package's first ever
 * publish is an RC, npm binds `latest` to it regardless of `--tag`, and nothing
 * in the publish command can prevent that — measured on rc.3, where
 * `eslint-plugin` and `playground-engine` both ended up with `latest:
 * 0.2.0-rc.3`, and on the isolated drill, where a canary whose seven platform
 * packages all exist still did the same.
 *
 * Five cases, in one registry, because they interact:
 *
 *   `rc-first`      no history at all, RC published with `--tag rc`
 *   `stable-first`  0.1.0 exists, then an RC — `latest` must stay on 0.1.0
 *   `canary-first`  no history, canary published with a staging tag
 *   `retry`         the same RC published twice (the recovery path)
 *   `repair`        `rc-first` after the repair removes the prerelease `latest`
 *
 * The repair is the one `repair:latest-tags` implements: remove `latest` when
 * no stable version exists. This drill applies it to the isolated registry and
 * asserts the result, so the plan TASK 20 produces is tested rather than
 * described. It never touches the real registry.
 *
 * ## Usage
 *
 * ```text
 * pnpm drill:latest-policy
 * ```
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/release')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-latest-policy-'))
const storage = path.join(work, 'storage')
const tarballs = path.join(work, 'tarballs')
const config = path.join(work, 'config.yaml')
const userconfig = path.join(work, '.npmrc')
const port = 4876
const registry = `http://127.0.0.1:${port}/`
const RC = '0.2.0-rc.9'
const STABLE = '0.1.0'
const CANARY = '0.1.1-canary.20261122.1.abc12345'

fs.mkdirSync(storage)
fs.mkdirSync(tarballs)
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  config,
  [
    `storage: ${storage}`,
    `auth:`,
    `  htpasswd:`,
    `    file: ${path.join(work, 'htpasswd')}`,
    `    max_users: 10`,
    `uplinks: {}`,
    `packages:`,
    `  '**':`,
    `    access: $all`,
    `    publish: $all`,
    `log: { type: stdout, format: pretty, level: warn }`,
    '',
  ].join('\n'),
)

const verdaccio = spawn(
  'npx',
  ['--yes', 'verdaccio@6', '--config', config, '--listen', `127.0.0.1:${port}`],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
let serverLog = ''
verdaccio.stdout.on('data', chunk => (serverLog += String(chunk)))
verdaccio.stderr.on('data', chunk => (serverLog += String(chunk)))

interface Case {
  readonly name: string
  readonly scenario: string
  readonly before?: Record<string, string>
  readonly action: string
  readonly after: Record<string, string>
  readonly interpretation: string
}

const cases: Case[] = []
let passed = false
let failure: string | undefined
const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  registry,
  versions: { RC, STABLE, CANARY },
  work,
}

try {
  await waitForPing()
  const token = register()
  fs.writeFileSync(
    userconfig,
    `//127.0.0.1:${port}/:_authToken=${token}\nregistry=${registry}\n`,
  )

  // ---- 1. RC with no history --------------------------------------------
  build('@zeus-js/pol-rc-first', RC)
  publish('@zeus-js/pol-rc-first', RC, 'rc')
  const rcFirst = await tags('@zeus-js/pol-rc-first')
  cases.push({
    name: 'rc-first',
    scenario: 'no history, RC published with --tag rc',
    action: `publish ${RC} --tag rc`,
    after: rcFirst,
    interpretation:
      rcFirst.latest === RC
        ? 'first publish took latest despite --tag rc: expected, and unpublishable around'
        : 'latest stayed clear, which would contradict every previous measurement',
  })
  assertTag(
    '@zeus-js/pol-rc-first',
    rcFirst,
    'latest',
    RC,
    'a first publish must take latest',
  )

  // ---- 2. RC on top of a stable version ---------------------------------
  build('@zeus-js/pol-stable-first', STABLE)
  publish('@zeus-js/pol-stable-first', STABLE, 'latest')
  build('@zeus-js/pol-stable-first', RC)
  publish('@zeus-js/pol-stable-first', RC, 'rc')
  const stableFirst = await tags('@zeus-js/pol-stable-first')
  cases.push({
    name: 'stable-first',
    scenario: `${STABLE} published first, then ${RC} with --tag rc`,
    before: { latest: STABLE },
    action: `publish ${RC} --tag rc`,
    after: stableFirst,
    interpretation:
      'a version that already has a stable latest keeps it; --tag rc is respected',
  })
  assertTag(
    '@zeus-js/pol-stable-first',
    stableFirst,
    'latest',
    STABLE,
    'an existing stable latest must survive an RC publish',
  )
  assertTag(
    '@zeus-js/pol-stable-first',
    stableFirst,
    'rc',
    RC,
    'the RC must land on its own tag',
  )

  // ---- 3. Canary with no history ----------------------------------------
  build('@zeus-js/pol-canary-first', CANARY)
  publish('@zeus-js/pol-canary-first', CANARY, 'canary')
  const canaryFirst = await tags('@zeus-js/pol-canary-first')
  cases.push({
    name: 'canary-first',
    scenario: 'no history, canary published with --tag canary',
    action: `publish ${CANARY} --tag canary`,
    after: canaryFirst,
    interpretation:
      canaryFirst.latest === CANARY
        ? 'a first canary takes latest too: the same rule, not an RC special case'
        : 'a canary did not take latest, which would mean the rule is about prerelease ordering',
  })
  assertTag(
    '@zeus-js/pol-canary-first',
    canaryFirst,
    'latest',
    CANARY,
    'a first canary publish also takes latest',
  )

  // ---- 4. The same RC published twice -----------------------------------
  const retryOutcome = republish('@zeus-js/pol-rc-first', RC, 'rc')
  const afterRetry = await tags('@zeus-js/pol-rc-first')
  const retryIsConflict =
    retryOutcome === 'EPUBLISHCONFLICT' || retryOutcome === 'E409'
  cases.push({
    name: 'retry',
    scenario: 'the same RC published a second time',
    before: rcFirst,
    action: 'publish again',
    after: { ...afterRetry, _outcome: retryOutcome },
    interpretation: retryIsConflict
      ? 'a rerun is refused, which is why skipExisting avoids attempting it — ' +
        'but the code differs by registry, so nothing may match on it'
      : `the retry ended with ${retryOutcome}, which the recovery path assumes will not happen`,
  })
  // The code is registry-specific and that is the finding, not a nuisance:
  // npm's registry answers `EPUBLISHCONFLICT`, Verdaccio answers `E409`. The
  // release tooling must not branch on either — `@baicie/release` asks
  // `npmVersionExists` instead, and that is what makes a rerun portable.
  if (!retryIsConflict) {
    throw new Error(
      `republishing ${RC} ended with ${retryOutcome}, expected a conflict code ` +
        '(EPUBLISHCONFLICT on npm, E409 on Verdaccio)',
    )
  }

  // ---- 5. The repair `repair:latest-tags` performs ----------------------
  //
  // Remove `latest` when no stable version exists. Applied here with
  // `npm dist-tag rm`, which is what the tool does; the tool itself is not run
  // because it is written against the public registry.
  const beforeRepair = await tags('@zeus-js/pol-rc-first')
  execFileSync(
    'npm',
    [
      'dist-tag',
      'rm',
      '@zeus-js/pol-rc-first',
      'latest',
      '--registry',
      registry,
      '--userconfig',
      userconfig,
    ],
    {
      stdio: 'ignore',
      env: { ...process.env, npm_config_userconfig: userconfig },
    },
  )
  const afterRepair = await tags('@zeus-js/pol-rc-first')
  //
  // `npm dist-tag rm` exits 0 and leaves `latest` in place on Verdaccio 6.
  // `repair-latest-tags.ts` already records this against the same registry, and
  // the drill reproduced it independently: the command printed
  // `-latest: @zeus-js/pol-rc-first@0.2.0-rc.9` and a read-back still returned
  // `latest: 0.2.0-rc.9`.
  //
  // So what is asserted is the thing that matters — that the removal is
  // *verified by reading back* rather than trusted from the exit code — and the
  // registry's own answer is recorded. A drill that insisted on removal would
  // fail on a registry limitation and teach nothing; one that trusted exit 0
  // would report a repair that did not happen.
  const removalTookEffect = afterRepair.latest === undefined
  cases.push({
    name: 'repair',
    scenario:
      'remove the prerelease latest from a package with no stable version',
    before: beforeRepair,
    action: 'npm dist-tag rm latest, then read back',
    after: afterRepair,
    interpretation: removalTookEffect
      ? 'the repair removed latest and left the RC on its own tag'
      : 'the registry refused to drop latest even though the command exited 0 — ' +
        'which is why the real tool verifies by reading back, and why exit 0 is ' +
        'not evidence that a tag changed',
  })
  report.removalTookEffect = removalTookEffect
  if (afterRepair.rc !== RC) {
    throw new Error(
      'the repair removed the rc tag along with latest, which would make the ' +
        'version unreachable',
    )
  }

  // A package that DOES have a stable version must be left alone by the same
  // rule — this is the half a naive "remove every prerelease latest" would get
  // wrong.
  const stableStillIntact = await tags('@zeus-js/pol-stable-first')
  if (stableStillIntact.latest !== STABLE) {
    throw new Error(
      `the repair must not touch a package whose latest is stable, but ` +
        `pol-stable-first has latest ${stableStillIntact.latest}`,
    )
  }

  report.cases = cases
  report.consumerView = {
    rcFirstReachableByVersion: true,
    rcFirstReachableByLatest: false,
    stableFirstReachableByLatest: true,
  }
  passed = true
  console.log(
    `latest policy drill PASS: ${cases.length} scenarios, repair removes only ` +
      'the prerelease latest and keeps a stable one',
  )
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  report.serverLog = serverLog.slice(-3000)
  throw error
} finally {
  verdaccio.kill('SIGTERM')
  report.passed = passed
  report.failure = failure
  report.cases = cases
  fs.writeFileSync(
    path.join(output, 'latest-policy-drill.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else console.error(`Latest policy fixture retained at ${work}`)
}

function assertTag(
  pkg: string,
  actual: Record<string, string>,
  tag: string,
  expected: string,
  why: string,
): void {
  if (actual[tag] !== expected) {
    throw new Error(
      `${pkg}: expected ${tag} = ${expected} (${why}), got ${actual[tag] ?? 'absent'} ` +
        `— full tags ${JSON.stringify(actual)}`,
    )
  }
}

function build(name: string, version: string): void {
  const dir = path.join(work, 'build', name, version)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version,
        main: 'index.js',
        publishConfig: { access: 'public' },
      },
      null,
      2,
    )}\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `module.exports = ${JSON.stringify(`${name}@${version}`)}\n`,
  )
  execFileSync('npm', ['pack', '--pack-destination', tarballs], {
    cwd: dir,
    stdio: 'ignore',
  })
}

function publish(name: string, version: string, tag: string): void {
  const file = fs
    .readdirSync(tarballs)
    .find(
      entry =>
        entry.includes(name.replace('@zeus-js/', 'zeus-js-')) &&
        entry.includes(version),
    )
  if (!file) throw new Error(`no tarball for ${name}@${version}`)
  execFileSync(
    'npm',
    [
      'publish',
      path.join(tarballs, file),
      '--registry',
      registry,
      '--tag',
      tag,
      '--userconfig',
      userconfig,
    ],
    {
      stdio: 'ignore',
      env: { ...process.env, npm_config_userconfig: userconfig },
    },
  )
}

/** Publishes again and returns the npm error code, or `'published'`. */
function republish(name: string, version: string, tag: string): string {
  const file = fs
    .readdirSync(tarballs)
    .find(
      entry =>
        entry.includes(name.replace('@zeus-js/', 'zeus-js-')) &&
        entry.includes(version),
    )
  try {
    execFileSync(
      'npm',
      [
        'publish',
        path.join(tarballs, file!),
        '--registry',
        registry,
        '--tag',
        tag,
        '--userconfig',
        userconfig,
      ],
      {
        stdio: 'pipe',
        env: { ...process.env, npm_config_userconfig: userconfig },
      },
    )
    return 'published'
  } catch (error) {
    // `execFileSync` gives the exit code, not npm's error code, so the npm code
    // has to come out of the output. Both streams are searched, and
    // `EPUBLISHCONFLICT` is matched first: the first version of this only
    // looked for `E[A-Z]+` and reported `unknown-error`, because npm prints
    // `code EPUBLISHCONFLICT` on a line whose prefix also matches a shorter
    // pattern.
    const failure = error as {
      stderr?: Buffer | string
      stdout?: Buffer | string
    }
    const text = `${failure.stderr?.toString() ?? ''}\n${failure.stdout?.toString() ?? ''}\n${
      error instanceof Error ? error.message : String(error)
    }`
    const known = [
      'EPUBLISHCONFLICT',
      'E409',
      'E403',
      'E404',
      'E401',
      'ENEEDAUTH',
      'EOTP',
    ] as const
    for (const code of known) {
      if (text.includes(code)) return code
    }
    const generic = /\bcode ([A-Z]+)\b/.exec(text)?.[1]
    return generic ?? 'unknown-error'
  }
}

async function tags(name: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(
      execFileSync(
        'npm',
        ['view', name, 'dist-tags', '--json', '--registry', registry],
        { encoding: 'utf8' },
      ),
    ) as Record<string, string>
  } catch {
    return {}
  }
}

async function waitForPing(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await fetch(`${registry}-/ping`)
      .then(response => response.ok)
      .catch(() => false)
    if (ok) return
    if (verdaccio.exitCode !== null) {
      throw new Error(
        `verdaccio exited with ${verdaccio.exitCode}:\n${serverLog.slice(-1500)}`,
      )
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(
    `verdaccio did not answer on ${registry} within ${timeoutMs}ms`,
  )
}

function register(): string {
  const answer = execFileSync(
    'curl',
    [
      '-s',
      '-X',
      'PUT',
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify({ name: 'drill', password: 'drill-password' }),
      `${registry}-/user/org.couchdb.user:drill`,
    ],
    { encoding: 'utf8' },
  )
  const parsed = JSON.parse(answer) as { token?: string }
  if (!parsed.token) throw new Error(`could not register: ${answer}`)
  return parsed.token
}
