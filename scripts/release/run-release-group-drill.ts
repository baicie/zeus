/**
 * The real 32-package release group, published to an isolated registry (R23 TASK 17).
 *
 * `drill:recovery` proved the *mechanism* on five synthetic packages. This runs
 * the mechanism against the actual archives: the same tarballs the release
 * would upload, in the order the releaser computes, with their real
 * `dependencies` and `optionalDependencies` intact. A synthetic group cannot
 * show what rc.3 got wrong, because the thing it got wrong was dependencies —
 * the runtime packages were behind the native ones in the order.
 *
 * ## What it asserts
 *
 *   * every archive is published exactly once, or skipped exactly once on the
 *     rerun, and never both;
 *   * the order is `publishOrder`'s, so the native platform packages come
 *     before the runtime and a stop inside them leaves no usable framework;
 *   * after the rerun the group is 32/32 and the framework checkpoint holds;
 *   * a consumer can then install `@zeus-js/zeus` from this registry and load
 *     the compiler — the check rc.3 would have failed.
 *
 * ## The optional-dependency problem, and why this drill does not hit it
 *
 * TASK 11 found that a `file:` install cannot place `optionalDependencies`:
 * npm looks them up by name on the registry. Here they *are* on the registry —
 * this drill publishes the platform packages first, in order — so the wrapper's
 * `optionalDependencies: {"@zeus-js/compiler-native-darwin-arm64": "0.2.0-rc.3"}`
 * resolves the way it does in production. That is the difference between this
 * and the candidate matrix, and it is what makes this drill able to answer the
 * installability question the tarball-only path cannot.
 *
 * ## Usage
 *
 * ```text
 * pnpm check:create-zeus-candidate:prepare   # produces the archives
 * pnpm drill:release-group
 * ```
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { FRAMEWORK_PACKAGES } from './audit-release-group'
import { publishOrder } from './publish-order'
import { zeusFixedPackages } from '../release.config'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/release')
const candidatesFile = path.join(
  root,
  'temp/create-zeus-candidate/candidates.json',
)

interface CandidateArchive {
  readonly name: string
  readonly version: string
  readonly file: string
}
interface Candidates {
  readonly schema: string
  readonly coreVersion: string
  readonly sourceCommit: string
  readonly packages: readonly CandidateArchive[]
}

if (!fs.existsSync(candidatesFile)) {
  throw new Error(
    `${candidatesFile} is missing. Run \`pnpm check:create-zeus-candidate:prepare\` first; ` +
      'the drill publishes the real archives, not synthetic ones.',
  )
}
const candidates = JSON.parse(
  fs.readFileSync(candidatesFile, 'utf8'),
) as Candidates

const archives = new Map(candidates.packages.map(entry => [entry.name, entry]))
const group = [...zeusFixedPackages]
const missingArchives = group.filter(name => !archives.has(name))
if (missingArchives.length > 0) {
  throw new Error(
    `the release group has no archive for: ${missingArchives.join(', ')}`,
  )
}

/** Directory of each package, so `publishOrder` can compute the real order. */
function directories(): Map<string, string> {
  const found = new Map<string, string>()
  for (const domain of fs.readdirSync(path.join(root, 'packages'))) {
    const domainDir = path.join(root, 'packages', domain)
    if (!fs.statSync(domainDir).isDirectory()) continue
    for (const entry of fs.readdirSync(domainDir)) {
      const manifest = path.join(domainDir, entry, 'package.json')
      if (!fs.existsSync(manifest)) continue
      const { name } = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
        name: string
      }
      found.set(name, `packages/${domain}/${entry}`)
    }
  }
  return found
}
const order = publishOrder(group, name => directories().get(name))

/** Where rc.3 stopped: the eighth package. */
const INTERRUPT_AT = 8

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-release-group-drill-'))
const storage = path.join(work, 'storage')
const config = path.join(work, 'config.yaml')
const userconfig = path.join(work, '.npmrc')
const port = 4875
const registry = `http://127.0.0.1:${port}/`
const version = candidates.coreVersion

fs.mkdirSync(storage)
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

interface PublishRecord {
  readonly attempt: 'first' | 'rerun'
  readonly name: string
  readonly position: number
  readonly outcome: 'published' | 'skipped' | 'failed'
  readonly detail?: string
}

const records: PublishRecord[] = []
let passed = false
let failure: string | undefined
const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  version,
  sourceCommit: candidates.sourceCommit,
  registry,
  groupSize: group.length,
  order,
  interruptAt: INTERRUPT_AT,
  work,
}

try {
  await waitForPing()
  const token = register()
  fs.writeFileSync(
    userconfig,
    `//127.0.0.1:${port}/:_authToken=${token}\nregistry=${registry}\n`,
  )

  // --- First attempt: publish in order, stop where rc.3 stopped ------------
  let stoppedAt: string | undefined
  for (const [index, name] of order.entries()) {
    if (index === INTERRUPT_AT) {
      stoppedAt = name
      break
    }
    publish(name, 'first', index)
  }
  report.stoppedAt = stoppedAt

  const afterInterrupt = publishedNames()
  report.afterInterrupt = {
    count: afterInterrupt.size,
    framework: FRAMEWORK_PACKAGES.filter(pkg => afterInterrupt.has(pkg)),
  }

  // The claim rc.3 made, measured: a stop at position 8 leaves no framework.
  const frameworkAfterStop = FRAMEWORK_PACKAGES.filter(pkg =>
    afterInterrupt.has(pkg),
  )
  if (frameworkAfterStop.length > 0) {
    throw new Error(
      `the interrupt point is supposed to leave no framework package published, ` +
        `but ${frameworkAfterStop.join(', ')} had already gone out — the order changed`,
    )
  }

  // --- Rerun: the whole group, skipping what exists ------------------------
  let skipped = 0
  let published = 0
  for (const [index, name] of order.entries()) {
    if (versionExists(name)) {
      skipped += 1
      records.push({
        attempt: 'rerun',
        name,
        position: index + 1,
        outcome: 'skipped',
      })
      continue
    }
    publish(name, 'rerun', index)
    published += 1
  }
  report.rerun = { skipped, published }

  // Every package must end the rerun in exactly one state.
  //
  // Inside one attempt, not across both: the first attempt published the first
  // eight and the rerun then legitimately skipped those same eight. Counting
  // per package across both attempts made that correct behaviour look like a
  // contradiction — the first version of this assertion failed on exactly the
  // eight packages that had gone right.
  const rerunOutcomes = new Map<string, Set<string>>()
  for (const record of records.filter(entry => entry.attempt === 'rerun')) {
    const seen = rerunOutcomes.get(record.name) ?? new Set<string>()
    seen.add(record.outcome)
    rerunOutcomes.set(record.name, seen)
  }
  const ambiguous = [...rerunOutcomes].filter(([, seen]) => seen.size > 1)
  if (ambiguous.length > 0) {
    throw new Error(
      `the rerun reached more than one outcome for: ${ambiguous.map(([name]) => name).join(', ')}`,
    )
  }
  if (rerunOutcomes.size !== group.length) {
    throw new Error(
      `the rerun must visit every package exactly once: expected ${group.length}, saw ${rerunOutcomes.size}`,
    )
  }
  const rerunFailed = [...rerunOutcomes].filter(([, seen]) =>
    seen.has('failed'),
  )
  if (rerunFailed.length > 0) {
    throw new Error(
      `the rerun failed for: ${rerunFailed.map(([name]) => name).join(', ')}`,
    )
  }
  // And the first attempt must have published exactly the interrupt point.
  const firstAttemptPublished = records.filter(
    entry => entry.attempt === 'first' && entry.outcome === 'published',
  )
  if (firstAttemptPublished.length !== INTERRUPT_AT) {
    throw new Error(
      `the first attempt published ${firstAttemptPublished.length}, expected ${INTERRUPT_AT}`,
    )
  }
  if (skipped !== INTERRUPT_AT) {
    throw new Error(
      `the rerun skipped ${skipped}, expected the ${INTERRUPT_AT} the first attempt published`,
    )
  }

  // --- 32/32 and the framework -------------------------------------------
  const final = publishedNames()
  const missing = group.filter(name => !final.has(name))
  if (missing.length > 0) {
    throw new Error(
      `after the rerun the group is incomplete: ${missing.join(', ')}`,
    )
  }
  const frameworkMissing = FRAMEWORK_PACKAGES.filter(name => !final.has(name))
  if (frameworkMissing.length > 0) {
    throw new Error(
      `the framework is incomplete after a full rerun: ${frameworkMissing.join(', ')}`,
    )
  }
  report.afterRerun = {
    count: final.size,
    framework: FRAMEWORK_PACKAGES.filter(name => final.has(name)),
  }
  report.distTags = await distTags()

  // --- A consumer, from this registry ------------------------------------
  const consumer = await installConsumer()
  report.consumer = consumer
  if (consumer.status !== 'passed') {
    throw new Error(
      `a consumer could not use the published group: ${consumer.detail}`,
    )
  }

  passed = true
  console.log(
    `release group drill PASS: ${group.length}/${group.length} published, ` +
      `framework complete, consumer installs and loads`,
  )
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  report.serverLog = serverLog.slice(-3000)
  throw error
} finally {
  verdaccio.kill('SIGTERM')
  report.passed = passed
  report.failure = failure
  report.records = records
  fs.writeFileSync(
    path.join(output, 'release-group-drill.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else console.error(`Release group drill fixture retained at ${work}`)
}

function publish(
  name: string,
  attempt: 'first' | 'rerun',
  position: number,
): void {
  const archive = archives.get(name)!
  try {
    execFileSync(
      'npm',
      [
        'publish',
        archive.file,
        '--registry',
        registry,
        '--tag',
        'rc',
        // `publishConfig.provenance` is true on every released package (it is
        // asserted by `check:native-packages`), and it needs an OIDC provider
        // that an offline registry does not have. `isolated-registry-drill`
        // disables it the same way. This is a property of the drill, not of the
        // release: the drill is testing the publish *order and recovery*, and a
        // provenance failure here would say nothing about either.
        '--provenance=false',
        '--userconfig',
        userconfig,
      ],
      {
        stdio: 'ignore',
        env: { ...process.env, npm_config_userconfig: userconfig },
      },
    )
    records.push({
      attempt,
      name,
      position: position + 1,
      outcome: 'published',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    records.push({
      attempt,
      name,
      position: position + 1,
      outcome: 'failed',
      detail: message.split('\n')[0],
    })
    throw error
  }
}

/** Names this registry currently holds at the drill's version. */
function publishedNames(): Set<string> {
  const found = new Set<string>()
  for (const name of group) {
    if (versionExists(name)) found.add(name)
  }
  return found
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

async function distTags(): Promise<Record<string, Record<string, string>>> {
  const tags: Record<string, Record<string, string>> = {}
  for (const name of group) {
    try {
      tags[name] = JSON.parse(
        execFileSync(
          'npm',
          ['view', name, 'dist-tags', '--json', '--registry', registry],
          { encoding: 'utf8' },
        ),
      ) as Record<string, string>
    } catch {
      tags[name] = {}
    }
  }
  return tags
}

/**
 * Installs `@zeus-js/zeus` from this registry into an empty project and loads
 * the compiler through it.
 *
 * This is the check rc.3 would have failed and no count would have shown:
 * installing the umbrella package has to pull the runtime, and the runtime's
 * optional native dependency has to resolve from the registry rather than from
 * a `file:` path.
 */
async function installConsumer(): Promise<{
  status: 'passed' | 'failed'
  detail: string
  installed?: string[]
  compiler?: string
}> {
  const project = path.join(work, 'consumer')
  fs.mkdirSync(project, { recursive: true })
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify({ name: 'drill-consumer', private: true }, null, 2)}\n`,
  )
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'true',
    npm_config_cache: path.join(work, 'npm-cache'),
    npm_config_userconfig: userconfig,
  }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  try {
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--registry',
        registry,
        `@zeus-js/zeus@${version}`,
      ],
      { cwd: project, env, stdio: 'ignore' },
    )
  } catch (error) {
    return {
      status: 'failed',
      detail: `npm install failed: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`,
    }
  }

  const installed = fs
    .readdirSync(path.join(project, 'node_modules/@zeus-js'))
    .sort()
  const missing = FRAMEWORK_PACKAGES.map(name =>
    name.replace('@zeus-js/', ''),
  ).filter(short => !installed.includes(short))
  if (missing.length > 0) {
    return {
      status: 'failed',
      detail: `installing @zeus-js/zeus did not bring ${missing.join(', ')}`,
      installed,
    }
  }

  // What has to load is the runtime, because that is what `@zeus-js/zeus`
  // brings: it depends on `signal`, `runtime-dom` and `runtime-ssr`, and not on
  // the compiler — the compiler arrives with `@zeus-js/vite-plugin`.
  //
  // Asserting `require('@zeus-js/compiler')` here failed with MODULE_NOT_FOUND
  // and that was the assertion's error, not the registry's: the umbrella
  // package does not depend on the compiler, and demanding it would have meant
  // "this release is broken" for a dependency that was never claimed.
  try {
    const answer = execFileSync(
      process.execPath,
      [
        '-e',
        `
const { createRequire } = require('node:module');
const require_ = createRequire(process.argv[1] + '/package.json');
// The runtime entry points a consumer reaches for.
const zeus = require_('@zeus-js/zeus');
const dom = require_('@zeus-js/runtime-dom');
const signal = require_('@zeus-js/signal');
const created = typeof signal.createSignal === 'function';
const rendered = typeof dom.render === 'function';
const entry = require_.resolve('@zeus-js/runtime-dom');
process.stdout.write(JSON.stringify({
  entry,
  created,
  rendered,
  zeusKeys: Object.keys(zeus).length,
}));
`,
        project,
      ],
      { cwd: project, env, encoding: 'utf8' },
    )
    const parsed = JSON.parse(answer) as {
      entry: string
      created: boolean
      rendered: boolean
      zeusKeys: number
    }
    if (!parsed.created || !parsed.rendered) {
      return {
        status: 'failed',
        detail:
          'the installed runtime loads but does not expose its entry points ' +
          `(createSignal: ${parsed.created}, render: ${parsed.rendered})`,
        installed,
      }
    }
    return {
      status: 'passed',
      detail:
        `installed ${installed.length} packages; runtime-dom loads with render ` +
        `and signal with createSignal, ${parsed.zeusKeys} exports from zeus`,
      installed,
      compiler: parsed.entry,
    }
  } catch (error) {
    return {
      status: 'failed',
      detail: `the installed runtime does not load: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`,
      installed,
    }
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
