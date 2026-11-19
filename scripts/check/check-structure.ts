/**
 * `pnpm check:structure` — enforce the six-domain package architecture.
 *
 * The rule this gate exists for is simple: a package's physical location must
 * state its role. `packages/core` is the framework runtime and nothing else;
 * a router, a compiler adapter or a test helper placed there is not a cosmetic
 * problem, it is what let the layout drift in the first place. Every check
 * below fails loudly rather than warning, because a warning in a gate that CI
 * does not read is the same as no gate at all.
 *
 * The gate is deterministic: it reads the working tree and the two configured
 * release lists. It never asks npm, so a registry outage cannot turn it green.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pico from 'picocolors'

import { zeusFixedPackages, zeusNativePackages } from '../release.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/**
 * The fixture root lets the gate's own tests build a synthetic workspace and
 * assert it fails on a misplaced package. It is an environment variable rather
 * than an argument so the shipped command line has exactly one form.
 */
const root = process.env.ZEUS_STRUCTURE_ROOT
  ? path.resolve(process.env.ZEUS_STRUCTURE_ROOT)
  : path.resolve(__dirname, '../..')

/** The six domains, in the order they are reported. */
const DOMAINS = [
  'core',
  'compiler',
  'features',
  'web-c',
  'tooling',
  'create',
] as const

type Domain = (typeof DOMAINS)[number]

/**
 * Packages allowed in each domain. A package in a domain it is not listed for
 * is an error, not a warning: the list is the architecture, and growing it is
 * a deliberate decision made in review rather than something a gate infers.
 */
const EXPECTED: Record<Domain, readonly string[]> = {
  core: ['shared', 'signal', 'runtime-dom', 'runtime-ssr', 'zeus'],
  compiler: [
    'compiler',
    'compiler-shared',
    'compiler-native',
    'compiler-wasm',
    'compiler-native-darwin-arm64',
    'compiler-native-darwin-x64',
    'compiler-native-linux-arm64-gnu',
    'compiler-native-linux-x64-gnu',
    'compiler-native-linux-x64-musl',
    'compiler-native-win32-arm64-msvc',
    'compiler-native-win32-x64-msvc',
  ],
  features: ['router', 'resource', 'query', 'i18n'],
  'web-c': [
    'component-analyzer',
    'component-dts',
    'bundler-plugin',
    'web-c-runtime',
    'web-c',
    'output-wc',
    'output-css',
    'output-icons',
    'output-react-wrapper',
    'output-vue-wrapper',
  ],
  tooling: [
    'vite-plugin',
    'eslint-plugin',
    'testing',
    'playground-engine',
    'consumer',
  ],
  create: ['create-zeus', 'zeus-ui', 'registry'],
}

/**
 * Which domains each domain may depend on.
 *
 * The direction is what matters: `core` is the floor and may depend on nothing
 * above it. `compiler` is a peer of `core` rather than a layer beneath it —
 * the runtime consumes compiler output but does not import the compiler — so
 * it also depends on nothing else. Everything else may build on those two.
 */
const ALLOWED_DOMAIN_DEPS: Record<Domain, readonly Domain[]> = {
  core: [],
  compiler: [],
  features: ['core'],
  'web-c': ['core', 'compiler'],
  tooling: ['core', 'compiler', 'features', 'web-c'],
  create: ['core', 'compiler', 'features', 'web-c', 'tooling'],
}

interface PackageRecord {
  readonly name: string
  readonly domain: Domain
  readonly shortName: string
  readonly dir: string
  readonly relativeDir: string
  readonly packageJson: PackageJson
}

interface PackageJson {
  name?: string
  version?: string
  private?: boolean
  repository?: { directory?: string }
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const problems: string[] = []
const notes: string[] = []

function fail(message: string): void {
  problems.push(message)
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
}

function discover(): PackageRecord[] {
  const records: PackageRecord[] = []
  for (const domain of DOMAINS) {
    const domainDir = path.join(root, 'packages', domain)
    if (!fs.existsSync(domainDir)) {
      fail(`domain directory is missing: packages/${domain}`)
      continue
    }
    for (const entry of fs.readdirSync(domainDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      // `node_modules` is not a package. A stale one survives a move: pnpm
      // leaves the directory behind when the manifest it linked from is gone,
      // and the gate then reports a package that does not exist while the real
      // one sits in its new domain. Skipping it is about the gate reading the
      // tree correctly, not about tolerating leftovers.
      if (entry.name === 'node_modules') continue
      const dir = path.join(domainDir, entry.name)
      const manifestPath = path.join(dir, 'package.json')
      if (!fs.existsSync(manifestPath)) {
        fail(`packages/${domain}/${entry.name} has no package.json`)
        continue
      }
      const packageJson = readJson<PackageJson>(manifestPath)
      if (!packageJson.name) {
        fail(`packages/${domain}/${entry.name}/package.json has no name`)
        continue
      }
      records.push({
        name: packageJson.name,
        domain,
        shortName: entry.name,
        dir,
        relativeDir: `packages/${domain}/${entry.name}`,
        packageJson,
      })
    }
  }
  return records
}

function checkStrayDirectories(records: readonly PackageRecord[]): void {
  const known = new Set(records.map(record => record.relativeDir))
  const packagesDir = path.join(root, 'packages')
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    // `global.d.ts` and similar files are not directories; anything that is
    // one either is a domain or holds packages addressed through a domain.
    if (!(DOMAINS as readonly string[]).includes(entry.name)) {
      fail(
        `packages/${entry.name} is not one of the six domains (${DOMAINS.join(', ')})`,
      )
    }
  }
  for (const record of records) {
    if (!known.has(record.relativeDir)) {
      fail(`unregistered package directory: ${record.relativeDir}`)
    }
  }
}

function checkDomainPlacement(records: readonly PackageRecord[]): void {
  for (const domain of DOMAINS) {
    const expected = new Set(EXPECTED[domain])
    const present = records.filter(record => record.domain === domain)
    for (const shortName of expected) {
      if (!present.some(record => record.shortName === shortName)) {
        fail(
          `packages/${domain}/${shortName} is expected but missing; the domain lists ${expected.size} package(s)`,
        )
      }
    }
    for (const record of present) {
      if (!expected.has(record.shortName)) {
        fail(
          `${record.relativeDir} is in the "${domain}" domain, which does not allow it; ` +
            `place it where its role belongs instead of widening the domain`,
        )
      }
    }
  }
}

function checkUniqueNames(records: readonly PackageRecord[]): void {
  const byName = new Map<string, PackageRecord[]>()
  for (const record of records) {
    byName.set(record.name, [...(byName.get(record.name) ?? []), record])
  }
  for (const [name, instances] of byName) {
    if (instances.length > 1) {
      fail(
        `package name ${name} is used by ${instances.length} directories: ` +
          instances.map(instance => instance.relativeDir).join(', '),
      )
    }
  }
}

function checkRepositoryDirectory(records: readonly PackageRecord[]): void {
  for (const record of records) {
    const declared = record.packageJson.repository?.directory
    // A missing `repository.directory` predates this layout for the two
    // `create` CLI packages. The gate's job is that a declared value matches
    // where the package actually lives — a wrong one sends readers to a
    // directory that no longer exists, which is the failure worth catching.
    if (declared === undefined) continue
    if (declared !== record.relativeDir) {
      fail(
        `${record.name}: repository.directory is "${declared}" but the package lives at "${record.relativeDir}"`,
      )
    }
  }
}

function domainOf(
  records: readonly PackageRecord[],
  name: string,
): Domain | undefined {
  return records.find(record => record.name === name)?.domain
}

function checkDependencyDirection(records: readonly PackageRecord[]): void {
  for (const record of records) {
    const allowed = ALLOWED_DOMAIN_DEPS[record.domain]
    const declared = {
      ...record.packageJson.dependencies,
      ...record.packageJson.peerDependencies,
      ...record.packageJson.optionalDependencies,
    }
    for (const dependency of Object.keys(declared)) {
      const target = domainOf(records, dependency)
      if (target === undefined) continue
      if (target === record.domain) continue
      if (!allowed.includes(target)) {
        fail(
          `${record.name} (${record.domain}) depends on ${dependency} (${target}); ` +
            `${record.domain} may only depend on ${allowed.length === 0 ? 'nothing else' : allowed.join(', ')}`,
        )
      }
    }
  }
}

function checkNoPrivateDependency(records: readonly PackageRecord[]): void {
  for (const record of records) {
    if (record.packageJson.private === true) continue
    const declared = {
      ...record.packageJson.dependencies,
      ...record.packageJson.peerDependencies,
    }
    for (const dependency of Object.keys(declared)) {
      const target = records.find(candidate => candidate.name === dependency)
      if (target?.packageJson.private === true) {
        fail(
          `publishable package ${record.name} depends on private package ${dependency}; ` +
            `a consumer installing from npm cannot resolve it`,
        )
      }
    }
  }
}

function checkReleaseLists(records: readonly PackageRecord[]): void {
  const byName = new Map(records.map(record => [record.name, record]))

  if (zeusFixedPackages.length !== 32) {
    fail(
      `the fixed release group has ${zeusFixedPackages.length} package(s); it is a 32-package contract`,
    )
  }
  if (zeusNativePackages.length !== 8) {
    fail(
      `the native release group has ${zeusNativePackages.length} package(s); it is an 8-package contract`,
    )
  }

  const duplicates = zeusFixedPackages.filter(
    (name, index) => zeusFixedPackages.indexOf(name) !== index,
  )
  for (const duplicate of new Set(duplicates)) {
    fail(`the fixed release group lists ${duplicate} more than once`)
  }

  for (const name of zeusFixedPackages) {
    if (!byName.has(name)) {
      fail(
        `the fixed release group lists ${name}, which is not a package in this workspace`,
      )
      continue
    }
    if (byName.get(name)?.packageJson.private === true) {
      fail(`the fixed release group lists private package ${name}`)
    }
  }

  for (const name of zeusNativePackages) {
    if (!byName.has(name)) {
      fail(
        `the native release group lists ${name}, which is not a package in this workspace`,
      )
    }
  }

  // The three packages whose version line is deliberately separate. If one of
  // them ever joins the fixed group, every future RC silently takes them along.
  for (const name of ['@zeus-js/vite-plugin', '@zeus-js/devtools-consumer']) {
    if (zeusFixedPackages.includes(name)) {
      fail(
        `${name} has its own version line and must not be in the fixed release group`,
      )
    }
  }
  if (zeusFixedPackages.includes('@zeus-js/compiler-wasm')) {
    fail(
      '@zeus-js/compiler-wasm is private and must not be in the fixed release group',
    )
  }
}

function checkNoRetiredPaths(): void {
  // A retired path reappearing means someone moved a package back. Catching it
  // here names the path, which a generic "unregistered package" failure does not.
  const retired = [
    'packages/core/router',
    'packages/core/resource',
    'packages/core/query',
    'packages/core/i18n',
    'packages/core/testing',
    'packages/core/compiler',
    'packages/core/compiler-shared',
    'packages/core/compiler-native',
    'packages/core/compiler-wasm',
    'packages/devtools',
  ]
  for (const relative of retired) {
    if (fs.existsSync(path.join(root, relative))) {
      fail(
        `${relative} is a retired path; it was moved in the six-domain layout and must not come back`,
      )
    }
  }
}

function checkDomainCounts(records: readonly PackageRecord[]): void {
  const expectedCounts: Record<Domain, number> = {
    core: 5,
    compiler: 11,
    features: 4,
    'web-c': 10,
    tooling: 5,
    create: 3,
  }
  for (const domain of DOMAINS) {
    const actual = records.filter(record => record.domain === domain).length
    if (actual !== expectedCounts[domain]) {
      fail(
        `packages/${domain} holds ${actual} package(s); the layout defines ${expectedCounts[domain]}`,
      )
    }
  }
  const total = records.length
  if (total !== 38) {
    fail(
      `the workspace holds ${total} package(s); the approved layout is 38 — ` +
        `adding or removing a package is a separate decision, not part of a refactor`,
    )
  } else {
    notes.push(`38 packages across 6 domains`)
  }
}

const records = discover()
checkStrayDirectories(records)
checkDomainPlacement(records)
checkUniqueNames(records)
checkRepositoryDirectory(records)
checkDependencyDirection(records)
checkNoPrivateDependency(records)
checkReleaseLists(records)
checkNoRetiredPaths()
checkDomainCounts(records)

if (problems.length > 0) {
  console.error(
    pico.red(`check:structure failed with ${problems.length} problem(s):`),
  )
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  console.error(
    'The six-domain layout is documented in docs/architecture/packages.md. ' +
      'A package belongs where its role belongs; the gate is not the place to make an exception.',
  )
  process.exit(1)
}

for (const note of notes) console.log(pico.gray(`  ${note}`))
console.log(pico.green('check:structure passed: 6 domains, 38 packages'))
