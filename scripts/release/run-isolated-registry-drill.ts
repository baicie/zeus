/**
 * Runs the isolated registry drill end to end, including its registry.
 *
 * `isolated-registry-drill.ts` needs a registry it does not start, which is why
 * TASK 45 sat at NOT_RUN for two rounds: the script existed and nobody could
 * run it without first finding out by hand that a Verdaccio had to be installed
 * and configured to accept anonymous publishes. This starts one, seeds a stable
 * baseline, runs the drill, stops the registry, and reports.
 *
 * It never reaches registry.npmjs.org. The registry it starts binds 127.0.0.1 on
 * a port the OS picks, and the packages it publishes are throwaway names under
 * `@zeus-js/drill-*` — not the real release group.
 *
 * ## What the seed is for
 *
 * The drill's whole point is the dist-tag behaviour of a *first* publish versus
 * a publish on top of a stable version, so both cases have to exist in the
 * registry before it runs:
 *
 *   `@zeus-js/drill-stable`  published at 0.1.0 first, `latest` must stay there
 *   `@zeus-js/drill-first`   never published, `latest` gets taken by the RC
 *
 * `drill-dup` is the same as `first` and exists so the duplicate-publish branch
 * has a package whose only history is the RC.
 *
 * ## Usage
 *
 * ```text
 * pnpm drill:isolated-registry
 * pnpm drill:isolated-registry --version 0.2.0-rc.9
 * ```
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { runIsolatedRegistryDrill } from './isolated-registry-drill'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/release')

const { values } = parseArgs({
  options: {
    version: { type: 'string', default: '0.2.0-rc.9' },
    'keep-registry': { type: 'boolean', default: false },
  },
})
const version = values.version!
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-drill-run-'))
const storage = path.join(work, 'storage')
const tarballs = path.join(work, 'tarballs')
// The drill refuses a directory holding more than one version, and the stable
// baseline is a different version by construction.
const baseline = path.join(work, 'baseline')
const userconfig = path.join(work, '.npmrc')
const config = path.join(work, 'config.yaml')

fs.mkdirSync(tarballs)
fs.mkdirSync(baseline)
fs.mkdirSync(storage)
fs.mkdirSync(output, { recursive: true })

const port = 4873
const registry = `http://127.0.0.1:${port}/`

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

let passed = false
let failure: string | undefined
const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  version,
  registry,
  node: process.version,
  npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  work,
}

try {
  await waitForPing()
  const token = register()
  fs.writeFileSync(
    userconfig,
    `//127.0.0.1:${port}/:_authToken=${token}\nregistry=${registry}\n`,
  )

  // Stable baseline for `drill-stable`, so the drill can show that an RC
  // publish does NOT move `latest` off an existing stable version.
  buildTarball('@zeus-js/drill-stable', '0.1.0', baseline)
  publishStableBaseline()

  for (const name of ['@zeus-js/drill-first', '@zeus-js/drill-dup']) {
    buildTarball(name, version)
  }
  // `drill-stable` also needs its RC, on top of the 0.1.0 already there.
  buildTarball('@zeus-js/drill-stable', version)

  const result = await runIsolatedRegistryDrill({
    registry,
    tarballs,
    version,
    out: path.join(output, 'isolated-registry-drill.json'),
    // The drill shells out to `npm publish`, which needs the token this run
    // registered. Without it Verdaccio answers "need auth" and the drill reads
    // that as a publish failure rather than a configuration one.
    npmUserConfigFile: userconfig,
  })
  report.drill = result
  report.passed = result.passed
  passed = result.passed
  if (!passed) failure = 'the drill reported a failure'
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  report.serverLog = serverLog.slice(-4000)
  throw error
} finally {
  verdaccio.kill('SIGTERM')
  report.failure = failure
  report.passed = passed
  fs.writeFileSync(
    path.join(output, 'isolated-registry-run.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  if (passed && !values['keep-registry']) {
    fs.rmSync(work, { recursive: true, force: true })
  } else {
    console.error(`Drill fixture retained at ${work}`)
  }
}

function buildTarball(
  name: string,
  packageVersion: string,
  destination = tarballs,
): void {
  const dir = path.join(work, 'build', name)
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
  execFileSync('npm', ['pack', '--pack-destination', destination], {
    cwd: dir,
    stdio: 'ignore',
  })
}

function publishStableBaseline(): void {
  const file = fs
    .readdirSync(baseline)
    .find(name => name.includes('drill-stable') && name.includes('0.1.0'))
  if (!file) throw new Error('the stable baseline tarball was not produced')
  execFileSync(
    'npm',
    [
      'publish',
      path.join(baseline, file),
      '--registry',
      registry,
      '--tag',
      'latest',
      '--userconfig',
      userconfig,
    ],
    {
      stdio: 'ignore',
      env: { ...process.env, npm_config_userconfig: userconfig },
    },
  )
}

async function waitForPing(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await fetch(`${registry}-/ping`)
      .then(response => response.ok)
      .catch(() => false)
    if (ok) return
    if (verdaccio.exitCode !== null) {
      throw new Error(
        `verdaccio exited with ${verdaccio.exitCode} before answering:\n${serverLog.slice(-2000)}`,
      )
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(
    `verdaccio did not answer on ${registry} within ${timeoutMs}ms`,
  )
}

function register(): string {
  const body = JSON.stringify({ name: 'drill', password: 'drill-password' })
  const answer = execFileSync(
    'curl',
    [
      '-s',
      '-X',
      'PUT',
      '-H',
      'Content-Type: application/json',
      '-d',
      body,
      `${registry}-/user/org.couchdb.user:drill`,
    ],
    { encoding: 'utf8' },
  )
  const parsed = JSON.parse(answer) as { token?: string }
  if (!parsed.token) throw new Error(`could not register: ${answer}`)
  return parsed.token
}
