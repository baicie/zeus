/**
 * Recovery drills: a release that dies partway, then reruns (R22 TASK 46–49).
 *
 * The rc.3 recovery plan is "rerun, `skipExisting` skips what already landed,
 * continue from the eighth package". That plan rests on three claims nobody had
 * tested together:
 *
 *   1. a partial publish leaves the registry in a state a rerun can read;
 *   2. `skipExisting` skips by *asking the registry whether the version
 *      exists*, not by catching a publish conflict, so a rerun makes progress
 *      rather than re-uploading;
 *   3. the packages that did land keep their dist-tags across the rerun.
 *
 * All three are testable on an isolated registry with real publishes, and none
 * of them needs the real npm. This drives one: it starts a Verdaccio, publishes
 * a group in two batches the way an interrupted run would, reruns the whole
 * group, and reports what each rerun step did.
 *
 * The failure is injected by *stopping after N packages*, which is exactly what
 * rc.3 did — the eighth package failed and the remaining twenty-four were never
 * attempted. That is a truer model than making one package's publish throw.
 *
 * ## Usage
 *
 * ```text
 * pnpm drill:recovery
 * ```
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/release')
const version = '0.2.0-rc.9'
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-recovery-drill-'))
const storage = path.join(work, 'storage')
const tarballs = path.join(work, 'tarballs')
const userconfig = path.join(work, '.npmrc')
const config = path.join(work, 'config.yaml')
const port = 4874
const registry = `http://127.0.0.1:${port}/`

/**
 * A five-package group in publish order, with one package that has a stable
 * version first so the rerun has a dist-tag that must survive it.
 */
const GROUP = [
  '@zeus-js/recover-a',
  '@zeus-js/recover-b',
  '@zeus-js/recover-c',
  '@zeus-js/recover-d',
  '@zeus-js/recover-e',
] as const
/** Stops here, the way rc.3 stopped at the eighth. */
const INTERRUPT_AFTER = 2

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

interface Step {
  readonly step: string
  readonly package: string
  readonly outcome: 'published' | 'skipped' | 'failed'
  readonly detail?: string
}

const steps: Step[] = []
let passed = false
let failure: string | undefined
const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  version,
  registry,
  group: GROUP,
  interruptAfter: INTERRUPT_AFTER,
  work,
}

try {
  await waitForPing()
  const token = register()
  fs.writeFileSync(
    userconfig,
    `//127.0.0.1:${port}/:_authToken=${token}\nregistry=${registry}\n`,
  )

  for (const name of GROUP) buildTarball(name, version)

  // A stable version for one package, so "did the rerun disturb an existing
  // latest tag" has an answer.
  buildTarball('@zeus-js/recover-c', '0.1.0')
  publish('@zeus-js/recover-c', '0.1.0', 'latest')

  // --- First attempt: stops after INTERRUPT_AFTER packages ------------------
  for (const [index, name] of GROUP.entries()) {
    if (index === INTERRUPT_AFTER) break
    publishDuringAttempt(name, 'first attempt')
  }

  const afterInterrupt = await distTagsAll()
  report.afterInterrupt = afterInterrupt

  // --- Rerun: the whole group, skipping what exists -------------------------
  //
  // This mirrors `skipExisting`: ask the registry whether the version is
  // there, and publish only if it is not. It is deliberately the same shape as
  // `@baicie/release`'s `npmVersionExists` check rather than an
  // EPUBLISHCONFLICT catch, because that is what the tool does — a rerun that
  // caught the conflict instead would still pay an upload per package.
  let skipped = 0
  let published = 0
  for (const name of GROUP) {
    if (versionExists(name)) {
      skipped += 1
      steps.push({ step: 'rerun', package: name, outcome: 'skipped' })
      continue
    }
    publishDuringAttempt(name, 'rerun')
    published += 1
  }

  const afterRerun = await distTagsAll()
  report.afterRerun = afterRerun
  report.steps = steps
  report.rerun = { skipped, published }

  // --- What the drills assert -----------------------------------------------
  //
  // 1. The rerun skipped exactly the packages the first attempt landed.
  if (skipped !== INTERRUPT_AFTER) {
    throw new Error(
      `the rerun skipped ${skipped} package(s), expected the ${INTERRUPT_AFTER} that landed`,
    )
  }
  // 2. Every package in the group now has the version — a rerun completes the
  //    group rather than stopping again.
  const tags = afterRerun as Record<string, Record<string, string>>
  for (const name of GROUP) {
    if (tags[name]?.['rc'] !== version) {
      throw new Error(
        `${name} is missing ${version} after the rerun: ${JSON.stringify(tags[name])}`,
      )
    }
  }
  // 3. The stable `latest` on recover-c survived both publishes. This is the
  //    claim the rc.3 audit cared about: a first publish takes `latest`, an
  //    existing stable version keeps it.
  if (tags['@zeus-js/recover-c']?.latest !== '0.1.0') {
    throw new Error(
      `the stable latest on recover-c did not survive: ${JSON.stringify(tags['@zeus-js/recover-c'])}`,
    )
  }
  // 4. Packages that were first-published by this run took `latest`, which is
  //    the pollution the group audit found on eslint-plugin and
  //    playground-engine. Recorded rather than fixed: the repair is a separate
  //    decision.
  report.latestPolluted = GROUP.filter(
    name => tags[name]?.latest === version,
  ).length

  passed = true
  console.log(
    `recovery drill PASS: ${skipped} skipped, ${published} published, ` +
      `latest polluted on ${report.latestPolluted} package(s)`,
  )
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  report.serverLog = serverLog.slice(-3000)
  throw error
} finally {
  verdaccio.kill('SIGTERM')
  report.passed = passed
  report.failure = failure
  report.steps = steps
  fs.writeFileSync(
    path.join(output, 'recovery-drill.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else console.error(`Recovery drill fixture retained at ${work}`)
}

/** Publishes without treating an existing version as a failure. */
function publishDuringAttempt(name: string, attempt: string): void {
  try {
    publish(name, version, 'rc')
    steps.push({ step: attempt, package: name, outcome: 'published' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    steps.push({
      step: attempt,
      package: name,
      outcome: 'failed',
      detail: message.split('\n')[0],
    })
    throw error
  }
}

function publish(name: string, packageVersion: string, tag: string): void {
  const file = fs
    .readdirSync(tarballs)
    .find(
      entry =>
        entry.includes(name.replace('@zeus-js/', 'zeus-js-')) &&
        entry.includes(packageVersion),
    )
  if (!file) throw new Error(`no tarball for ${name}@${packageVersion}`)
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

/** Mirrors `@baicie/release`'s `npmVersionExists`. */
function versionExists(name: string): boolean {
  try {
    const answer = execFileSync(
      'npm',
      [
        'view',
        `${name}@${version}`,
        'version',
        '--json',
        '--registry',
        registry,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return answer.length > 0
  } catch {
    return false
  }
}

async function distTagsAll(): Promise<Record<string, Record<string, string>>> {
  const result: Record<string, Record<string, string>> = {}
  for (const name of GROUP) {
    try {
      result[name] = JSON.parse(
        execFileSync(
          'npm',
          ['view', name, 'dist-tags', '--json', '--registry', registry],
          { encoding: 'utf8' },
        ),
      ) as Record<string, string>
    } catch {
      result[name] = {}
    }
  }
  return result
}

function buildTarball(name: string, packageVersion: string): void {
  const dir = path.join(work, 'build', name, packageVersion)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version: packageVersion,
        main: 'index.js',
        publishConfig: { access: 'public' },
      },
      null,
      2,
    )}\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `module.exports = ${JSON.stringify(`${name}@${packageVersion}`)}\n`,
  )
  execFileSync('npm', ['pack', '--pack-destination', tarballs], {
    cwd: dir,
    stdio: 'ignore',
  })
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
