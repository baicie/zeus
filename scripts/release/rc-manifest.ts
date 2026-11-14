/**
 * Builds the machine-readable RC manifest.
 *
 * The manifest has to answer one question later: *which two commits, which
 * built artifacts, which native binaries and which test evidence does this RC
 * correspond to?* Everything in it is derived from the repository at a fixed
 * commit or from a report this run produced — nothing is typed in by hand,
 * because a hand-written manifest is exactly the failure R6-A was about.
 *
 * `--verify` re-derives the same fields from the same inputs and compares, so a
 * manifest that no longer describes the tree fails instead of being trusted.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { validateCrossPlatformEvidence } from './rc-approval'

export const RC_MANIFEST_SCHEMA = 'zeus.rc-manifest/v1'

const root = path.resolve(import.meta.dirname, '../..')
const uiRoot = path.resolve(root, '../zeus-ui')
const output = path.join(root, 'docs/release/0.2.0-rc-manifest.json')

interface PackageRef {
  readonly name: string
  readonly version: string
  readonly dir: string
}

interface NativeTarget {
  readonly package: string
  readonly platform: string
  readonly arch: string
  readonly present: boolean
}

interface TestEvidence {
  readonly check: string
  readonly status: 'PASS' | 'FAIL' | 'NOT_RUN'
  readonly source: string
  readonly detail?: string
}

export interface RcManifest {
  readonly schema: typeof RC_MANIFEST_SCHEMA
  readonly generatedAt: string
  readonly repositories: {
    readonly core: { readonly commit: string; readonly version: string }
    readonly ui: { readonly commit: string; readonly version: string }
  }
  readonly toolchain: {
    readonly node: string
    readonly pnpm: string
    readonly rust: string
    readonly nativeTargets: readonly string[]
  }
  readonly lockfiles: { readonly core: string; readonly ui: string }
  readonly releaseSet: {
    readonly core: readonly PackageRef[]
    readonly ui: readonly PackageRef[]
    readonly excluded: readonly {
      name: string
      version: string
      reason: string
    }[]
    readonly privateExamples: readonly string[]
  }
  readonly peers: readonly {
    readonly package: string
    readonly peer: string
    readonly requirement: string
  }[]
  readonly order: readonly string[]
  readonly artifacts: {
    readonly demoPairing: {
      readonly coreCommit: string
      readonly uiCommit: string
    } | null
    readonly sbomComponents: number | null
    readonly releaseTarballs: number | null
    readonly imageDigest: string | null
  }
  readonly tests: readonly TestEvidence[]
  readonly blockers: readonly string[]
  readonly verdict: 'GO' | 'CONDITIONAL_GO' | 'NO_GO'
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

/** Every package the release config would publish, with its current version. */
function fixedPackages(): PackageRef[] {
  const config = fs.readFileSync(
    path.join(root, 'scripts/release.config.ts'),
    'utf8',
  )
  const block = /export const zeusFixedPackages = \[([\s\S]*?)\]/.exec(config)
  if (!block)
    throw new Error('zeusFixedPackages not found in release.config.ts')
  // The list is written as `'@zeus-js/name'`; the `@` is part of the literal.
  const names = [...(block[1] ?? '').matchAll(/@(zeus-js\/[a-z0-9-]+)/g)].map(
    match => `@${match[1]}`,
  )
  const found: PackageRef[] = []
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }
      if (entry.name !== 'package.json') continue
      const manifest = readJson<{ name?: string; version?: string }>(absolute)
      if (!manifest?.name || !names.includes(manifest.name)) continue
      found.push({
        name: manifest.name,
        version: manifest.version ?? 'unknown',
        dir: path.relative(root, path.dirname(absolute)),
      })
    }
  }
  walk(path.join(root, 'packages'))
  return found.sort((left, right) => (left.name < right.name ? -1 : 1))
}

/**
 * UI packages.
 *
 * Enumerated from the same roots the UI release config uses, and filtered by
 * the same publishable rule (`@zeus-web/`), so "the release set" and "what the
 * UI repo would publish" cannot drift apart.
 */
function uiPackages(): PackageRef[] {
  const found: PackageRef[] = []
  for (const relative of [
    'packages',
    'packages/primitives',
    'packages/advanced',
  ]) {
    const directory = path.join(uiRoot, relative)
    if (!fs.existsSync(directory)) continue
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = readJson<{
        name?: string
        version?: string
        private?: boolean
      }>(path.join(directory, entry.name, 'package.json'))
      if (!manifest?.name) continue
      if (manifest.private === true) continue
      if (!manifest.name.startsWith('@zeus-web/')) continue
      found.push({
        name: manifest.name,
        version: manifest.version ?? 'unknown',
        dir: path.relative(root, path.join(directory, entry.name)),
      })
    }
  }
  return found.sort((left, right) => (left.name < right.name ? -1 : 1))
}

/**
 * Publishable packages the release config deliberately leaves out.
 *
 * They are listed rather than omitted: "not in the release set" and "forgotten"
 * look identical in a manifest that only lists what ships.
 */
function excludedPackages(): {
  name: string
  version: string
  reason: string
}[] {
  const excluded: { name: string; version: string; reason: string }[] = []
  const candidates = [
    'packages/devtools/vite-plugin',
    'packages/devtools/create-zeus',
    'packages/create/zeus-ui',
    'packages/create/registry',
    'packages/devtools/consumer',
    'packages/core/compiler-wasm',
  ]
  for (const relative of candidates) {
    const manifest = readJson<{
      name?: string
      version?: string
      private?: boolean
    }>(path.join(root, relative, 'package.json'))
    if (!manifest?.name) continue
    excluded.push({
      name: manifest.name,
      version: manifest.version ?? 'unknown',
      reason: manifest.private
        ? 'private: true'
        : 'not listed in zeusFixedPackages, so outside the publish set',
    })
  }
  return excluded
}

function privateExamples(): string[] {
  const examples = path.join(root, 'examples')
  if (!fs.existsSync(examples)) return []
  return fs
    .readdirSync(examples, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      name: entry.name,
      manifest: readJson<{ name?: string; private?: boolean }>(
        path.join(examples, entry.name, 'package.json'),
      ),
    }))
    .filter(entry => entry.manifest?.private)
    .map(entry => entry.manifest?.name ?? entry.name)
    .sort()
}

/** The peers every UI component declares against Core. */
function peers(): { package: string; peer: string; requirement: string }[] {
  const directories: string[] = []
  for (const relative of [
    'packages',
    'packages/primitives',
    'packages/advanced',
  ]) {
    const directory = path.join(uiRoot, relative)
    if (!fs.existsSync(directory)) continue
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory())
        directories.push(path.join(directory, entry.name, 'package.json'))
    }
  }
  const found: { package: string; peer: string; requirement: string }[] = []
  for (const manifestPath of directories) {
    const manifest =
      readJson<{
        name?: string
        private?: boolean
        peerDependencies?: Record<string, string>
      }>(manifestPath) ?? undefined
    if (!manifest?.name || manifest.private === true) continue
    for (const [peer, requirement] of Object.entries(
      manifest.peerDependencies ?? {},
    )) {
      if (!peer.startsWith('@zeus-js/')) continue
      found.push({ package: manifest.name, peer, requirement })
    }
  }
  return found.sort((left, right) => (left.package < right.package ? -1 : 1))
}

/**
 * The native platform packages, and whether each one is actually present.
 *
 * A missing platform package looks the same as a pass in a list of names, which
 * is why presence is recorded rather than assumed: the release only ships
 * binaries for the platforms it built.
 */
function nativeTargets(): NativeTarget[] {
  const platforms = [
    ['compiler-native-darwin-arm64', 'darwin', 'arm64'],
    ['compiler-native-darwin-x64', 'darwin', 'x64'],
    ['compiler-native-linux-arm64-gnu', 'linux', 'arm64'],
    ['compiler-native-linux-x64-gnu', 'linux', 'x64'],
    ['compiler-native-linux-x64-musl', 'linux', 'x64'],
    ['compiler-native-win32-arm64-msvc', 'win32', 'arm64'],
    ['compiler-native-win32-x64-msvc', 'win32', 'x64'],
  ] as const
  return platforms.map(([pkg, platform, arch]) => ({
    package: `@zeus-js/${pkg}`,
    platform,
    arch,
    present: fs.existsSync(
      path.join(root, 'packages/core', pkg, 'package.json'),
    ),
  }))
}

function testEvidence(): TestEvidence[] {
  const evidence: TestEvidence[] = []
  const packed = readJson<{ results?: { status?: string }[] }>(
    path.join(root, 'temp/packed-consumers/report.json'),
  )
  if (packed?.results) {
    const failed = packed.results.filter(result => result.status !== 'passed')
    evidence.push({
      check: 'packed-consumers',
      status: failed.length === 0 ? 'PASS' : 'FAIL',
      source: 'temp/packed-consumers/report.json',
      detail: `${packed.results.length} consumer runs, ${failed.length} failed`,
    })
  } else {
    evidence.push({
      check: 'packed-consumers',
      status: 'NOT_RUN',
      source: 'temp/packed-consumers/report.json',
      detail: 'report missing',
    })
  }

  const sbom = readJson<{ components?: unknown[] }>(
    path.join(root, 'temp/sbom/zeus.cdx.json'),
  )
  evidence.push({
    check: 'sbom',
    status: sbom ? 'PASS' : 'NOT_RUN',
    source: 'temp/sbom/zeus.cdx.json',
    detail: sbom ? `${sbom.components?.length ?? 0} components` : 'missing',
  })

  const readiness = readJson<{
    decision?: string
    checks?: { id: string; status: string }[]
  }>(path.join(root, 'temp/release/rc-readiness.json'))
  const failing = (readiness?.checks ?? []).filter(
    check => check.status !== 'pass',
  )
  evidence.push({
    check: 'rc-readiness',
    // `decision` is the field the readiness script writes; `READY` is the only
    // value that means the evidence is complete.
    status:
      readiness?.decision === 'READY_FOR_RELEASE_REVIEW' ? 'PASS' : 'FAIL',
    source: 'temp/release/rc-readiness.json',
    detail: readiness
      ? `${readiness.decision}; not passing: ${
          failing.map(check => check.id).join(', ') || 'none'
        }`
      : 'missing',
  })

  /*
   * Cross-platform evidence is a real CI artifact, not something this machine
   * produces. When the artifact has been downloaded into the audit directory it
   * is validated with the same function the readiness gate uses; otherwise the
   * absence is recorded rather than assumed.
   */
  const crossPlatformFile = path.join(root, 'temp/cross-platform/evidence.json')
  const crossPlatform = readJson<Record<string, unknown>>(crossPlatformFile)
  if (crossPlatform) {
    const validation = validateCrossPlatformEvidence(crossPlatform, {
      commit: git(['rev-parse', 'HEAD'], root),
    })
    evidence.push({
      check: 'cross-platform-evidence',
      status: validation.errors.length === 0 ? 'PASS' : 'FAIL',
      source: 'temp/cross-platform/evidence.json',
      detail:
        validation.errors.length === 0
          ? `validated artifact, digest ${validation.digest ?? 'unknown'}`
          : validation.errors.join('; '),
    })
  } else {
    evidence.push({
      check: 'cross-platform-evidence',
      status: 'NOT_RUN',
      source: 'temp/cross-platform/evidence.json',
      detail: 'artifact not downloaded into the audit directory',
    })
  }
  evidence.push({
    check: 'release-approval',
    status: 'NOT_RUN',
    source: '.github/workflows/rc-approval.yml',
    detail: 'maintainer-only; the workflow has no runs, so no approval exists',
  })
  evidence.push({
    check: 'online-products',
    status: 'NOT_RUN',
    source: 'deployment acceptance + transaction records',
    detail: 'four products need a real Stage 2 deployment and ONLINE_ACCEPTED',
  })
  evidence.push({
    check: 'product-signoff',
    status: 'NOT_RUN',
    source: 'docs/release/0.2.0-rc-readiness.md §7',
    detail: 'manual acceptance cannot be performed by an agent',
  })
  evidence.push({
    check: 'byok-live-gateway',
    status: 'NOT_RUN',
    source: 'ai-workbench-live environment',
    detail: 'needs environment secrets and a manual dispatch',
  })
  return evidence
}

/**
 * Whether npm has ever seen a package.
 *
 * Queried live rather than inferred from a lockfile: a workspace-only package
 * resolves locally and looks healthy right up until `npm install` fails.
 */
function registryHas(name: string): boolean {
  try {
    const output = execFileSync(
      'curl',
      [
        '-s',
        '--max-time',
        '20',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        `https://registry.npmjs.org/${name.replace('/', '%2f')}`,
      ],
      { encoding: 'utf8' },
    ).trim()
    return output === '200'
  } catch {
    // A network failure must not read as "published"; surface it as unknown and
    // let the caller treat it conservatively.
    return false
  }
}

function build(): RcManifest {
  const coreCommit = git(['rev-parse', 'HEAD'], root)
  const uiCommit = git(['rev-parse', 'HEAD'], uiRoot)
  const coreVersion =
    readJson<{ version?: string }>(path.join(root, 'package.json'))?.version ??
    'unknown'
  const uiVersion =
    readJson<{ version?: string }>(path.join(uiRoot, 'package.json'))
      ?.version ?? 'unknown'

  const rustChannel =
    /channel\s*=\s*"([^"]+)"/.exec(
      fs.readFileSync(path.join(root, 'rust-toolchain.toml'), 'utf8'),
    )?.[1] ?? 'unknown'
  const nodeVersion = fs
    .readFileSync(path.join(root, '.node-version'), 'utf8')
    .trim()
  const pnpmVersion =
    readJson<{ packageManager?: string }>(
      path.join(root, 'package.json'),
    )?.packageManager?.replace('pnpm@', '') ?? 'unknown'

  const demoPairing = (() => {
    const fromDemos = readJson<{ coreCommit?: string; uiCommit?: string }>(
      path.join(root, 'temp/rc-demo-pairing.json'),
    )
    if (fromDemos?.coreCommit && fromDemos.uiCommit) {
      return { coreCommit: fromDemos.coreCommit, uiCommit: fromDemos.uiCommit }
    }
    return null
  })()

  const tests = testEvidence()
  const targets = nativeTargets()
  const missingTargets = targets.filter(target => !target.present)

  const blockers: string[] = []
  if (!demoPairing) {
    blockers.push('demo pairing not recorded locally')
  } else if (
    demoPairing.coreCommit !== coreCommit ||
    demoPairing.uiCommit !== uiCommit
  ) {
    blockers.push(
      `demo pairing names ${demoPairing.coreCommit.slice(0, 8)}+${demoPairing.uiCommit.slice(0, 8)}, tree is ${coreCommit.slice(0, 8)}+${uiCommit.slice(0, 8)}`,
    )
  }
  for (const entry of tests) {
    if (entry.status === 'FAIL') {
      blockers.push(`${entry.check}: ${entry.detail ?? 'failed'}`)
    }
  }
  if (missingTargets.length > 0) {
    blockers.push(
      `native platform packages missing: ${missingTargets.map(target => target.package).join(', ')}`,
    )
  }
  // A manifest whose version is still the pre-RC one cannot describe an RC.
  if (coreVersion !== '0.2.0-rc.0' || uiVersion !== '0.2.0-rc.0') {
    blockers.push(
      `versions are core ${coreVersion} / ui ${uiVersion}, not 0.2.0-rc.0`,
    )
  }
  /*
   * Deployed products must say which commits they were built from. A record
   * that names the wrong UI commit is worse than no record: it survives review
   * and gets used to rebuild something that never shipped.
   */
  const deployed = readJson<{
    products?: {
      product: string
      coreCommit: string
      uiCommit: string
    }[]
  }>(path.join(root, 'temp/audit/deployed-build-info.json'))
  for (const product of deployed?.products ?? []) {
    if (product.uiCommit !== uiCommit) {
      blockers.push(
        `${product.product} build-info names ui ${product.uiCommit.slice(0, 8)}, frozen ui is ${uiCommit.slice(0, 8)}`,
      )
    }
  }

  const notRun = tests.filter(entry => entry.status === 'NOT_RUN')
  if (notRun.length > 0) {
    blockers.push(
      `evidence not produced: ${notRun.map(entry => entry.check).join(', ')}`,
    )
  }
  /*
   * A package in the fixed group that npm has never seen is not a version
   * problem — `skipExisting` will publish it — but its `latest` tag will be
   * created pointing at an RC. That has to be known up front, not discovered
   * after the fact.
   */
  const unpublished = [
    '@zeus-js/i18n',
    '@zeus-js/eslint-plugin',
    '@zeus-js/playground-engine',
  ].filter(name => !registryHas(name))
  if (unpublished.length > 0) {
    blockers.push(
      `never published on npm, so the RC creates their first latest tag: ${unpublished.join(', ')}`,
    )
  }

  return {
    schema: RC_MANIFEST_SCHEMA,
    generatedAt: new Date().toISOString(),
    repositories: {
      core: { commit: coreCommit, version: coreVersion },
      ui: { commit: uiCommit, version: uiVersion },
    },
    toolchain: {
      node: nodeVersion,
      pnpm: pnpmVersion,
      rust: rustChannel,
      nativeTargets: targets.map(
        target => `${target.package} ${target.platform}/${target.arch}`,
      ),
    },
    lockfiles: {
      core: sha256File(path.join(root, 'pnpm-lock.yaml')),
      ui: sha256File(path.join(uiRoot, 'pnpm-lock.yaml')),
    },
    releaseSet: {
      core: fixedPackages(),
      ui: uiPackages(),
      excluded: excludedPackages(),
      privateExamples: privateExamples(),
    },
    peers: peers(),
    order: [
      'core: replace the Cargo workspace version, then all 32 fixed packages',
      'core: publish first — every UI component pins an exact @zeus-js/zeus version',
      'ui: 46 packages at one version',
      'ui: replace vendor/zeus-web-dialog with the published version',
      'consumers: update @zeus-web/* to the RC version',
    ],
    artifacts: {
      demoPairing,
      sbomComponents:
        readJson<{ components?: unknown[] }>(
          path.join(root, 'temp/sbom/zeus.cdx.json'),
        )?.components?.length ?? null,
      releaseTarballs: null,
      imageDigest: null,
    },
    tests,
    blockers,
    verdict: blockers.length === 0 ? 'GO' : 'NO_GO',
  }
}

const { values } = parseArgs({
  options: { verify: { type: 'boolean', default: false } },
})

const manifest = build()

if (values.verify) {
  const existing = readJson<RcManifest>(output)
  if (!existing) throw new Error(`no manifest at ${output}`)
  const differences: string[] = []
  const compare = (label: string, before: unknown, now: unknown): void => {
    const left = JSON.stringify(before)
    const right = JSON.stringify(now)
    if (left !== right) differences.push(`${label}: ${left} -> ${right}`)
  }
  compare(
    'core commit',
    existing.repositories.core.commit,
    manifest.repositories.core.commit,
  )
  compare(
    'ui commit',
    existing.repositories.ui.commit,
    manifest.repositories.ui.commit,
  )
  compare('core lockfile', existing.lockfiles.core, manifest.lockfiles.core)
  compare('ui lockfile', existing.lockfiles.ui, manifest.lockfiles.ui)
  compare(
    'core release set',
    existing.releaseSet.core,
    manifest.releaseSet.core,
  )
  compare('ui release set', existing.releaseSet.ui, manifest.releaseSet.ui)
  if (differences.length > 0) {
    console.error('RC manifest is out of date:')
    for (const difference of differences) console.error(`  ${difference}`)
    process.exit(1)
  }
  console.log(
    `RC manifest verified: ${manifest.repositories.core.commit.slice(0, 8)} + ${manifest.repositories.ui.commit.slice(0, 8)}`,
  )
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`RC manifest written: ${path.relative(root, output)}`)
  console.log(`  verdict: ${manifest.verdict}`)
  console.log(`  core packages: ${manifest.releaseSet.core.length}`)
  console.log(`  ui packages: ${manifest.releaseSet.ui.length}`)
  console.log(`  peers: ${manifest.peers.length}`)
  for (const blocker of manifest.blockers) console.log(`  blocker: ${blocker}`)
}
