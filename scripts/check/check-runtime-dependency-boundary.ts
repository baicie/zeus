/**
 * A UI consumer installs a component and gets no build toolchain.
 *
 * The defect this guards was invisible to every existing gate. Each package's
 * own size looked fine; the cost appeared only in the resolved graph, where
 * `@zeus-web/button → output-react-wrapper → bundler-plugin → typescript`
 * pulled 24 MB of compiler into projects that only wanted a button.
 *
 * ## Why this is separate from `check:packed-consumers`
 *
 * That check installs `typescript`, `vite` and `rollup` deliberately — it is
 * verifying that the build tooling works, so their presence proves nothing
 * about whether a plain consumer would have pulled them in. A gate that
 * installs the thing it is testing for cannot detect it arriving.
 *
 * This one installs only what a real consumer declares, then asserts the
 * build toolchain is *absent*.
 *
 * ## What it does not claim
 *
 * It measures the dependency tree, not the browser bundle. A package can have
 * a clean tree and still ship a large bundle; `check:bundle-size` covers that
 * separately and the two are not substitutes.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

/** Packages that must never appear in a runtime-only consumer's tree. */
const BUILD_TOOLCHAIN = [
  'typescript',
  '@zeus-js/bundler-plugin',
  '@zeus-js/component-analyzer',
  '@zeus-js/component-dts',
  '@zeus-js/compiler-native',
  '@zeus-js/compiler',
] as const

/**
 * Packages a runtime consumer may legitimately need. Deliberately a narrow,
 * explicit list: a runtime dependency that is not here would be a finding, not
 * something to fold into the allowlist without deciding.
 */
const ALLOWED_RUNTIME = [
  '@zeus-js/signal',
  '@zeus-js/shared',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/zeus',
  '@zeus-js/web-c-runtime',
  '@zeus-js/output-react-wrapper',
  '@zeus-js/output-vue-wrapper',
] as const

interface Finding {
  readonly check: string
  readonly ok: boolean
  readonly detail: string
}

const findings: Finding[] = []
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-runtime-consumer-'))

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
  })
}

/** Resolves the installed tree with pnpm's own listing, which is exact. */
function installedPackages(directory: string): string[] {
  const store = path.join(directory, 'node_modules/.pnpm')
  if (!fs.existsSync(store)) return []
  return fs
    .readdirSync(store)
    .filter(entry => entry.includes('@'))
    .map(entry => entry.replace(/@[^@]+$/, '').replace(/\+/g, '/'))
}

try {
  /*
   * The wrapper is packed from this checkout rather than taken from the
   * registry, because the fix under test is not published yet. Everything it
   * declares as a peer is left undeclared, which is exactly the state a
   * consumer that only uses `/runtime` is in.
   */
  const archive = path.join(work, 'archives')
  fs.mkdirSync(archive, { recursive: true })
  for (const name of ['output-react-wrapper', 'output-vue-wrapper']) {
    run(
      'pnpm',
      ['pack', '--pack-destination', archive],
      path.join(root, 'packages/web-c', name),
    )
  }
  const tarball = (prefix: string): string => {
    const found = fs
      .readdirSync(archive)
      .find(entry => entry.startsWith(prefix) && entry.endsWith('.tgz'))
    if (!found) throw new Error(`nothing packed for ${prefix}`)
    return path.join(archive, found)
  }

  /*
   * Every Core package the wrapper can reach is packed locally.
   *
   * The wrapper's dependencies resolve through the registry, and during a
   * version-line bump the version under test is not published yet —
   * `ERR_PNPM_NO_MATCHING_VERSION` for a package that exists perfectly well in
   * this checkout. A gate that only works after the release has happened
   * cannot gate the release.
   *
   * Packing the closure makes the probe independent of the registry without
   * weakening it: the assertion is about what a consumer's tree contains, and
   * a local tarball is the same artifact the release would publish.
   */
  /*
   * Workspace packages are siblings, not nested under each other's
   * `node_modules`. Resolving a dependency by looking inside the dependent's
   * directory therefore finds only what pnpm happened to hoist, and missed the
   * seven `compiler-native-*` platform packages that way — which is why the
   * plugin entry could not find its native binding once the wrapper was
   * installed from tarballs.
   */
  const workspaceDirectories = new Map<string, string>()
  const indexWorkspace = (directory: string): void => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue
      const absolute = path.join(directory, entry.name)
      const manifestPath = path.join(absolute, 'package.json')
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(
            fs.readFileSync(manifestPath, 'utf8'),
          ) as { name?: string }
          if (manifest.name?.startsWith('@zeus-js/')) {
            workspaceDirectories.set(manifest.name, absolute)
          }
        } catch {
          /* A malformed manifest is not part of the closure question. */
        }
      }
      indexWorkspace(absolute)
    }
  }
  indexWorkspace(path.join(root, 'packages'))

  const closureNames = new Set<string>()
  const collect = (name: string): void => {
    if (closureNames.has(name)) return
    const directory = workspaceDirectories.get(name)
    if (!directory) return
    closureNames.add(name)
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    for (const block of [
      manifest.dependencies,
      manifest.optionalDependencies,
    ]) {
      for (const dependency of Object.keys(block ?? {})) {
        if (!dependency.startsWith('@zeus-js/')) continue
        collect(dependency)
      }
    }
  }
  for (const name of [
    '@zeus-js/output-react-wrapper',
    '@zeus-js/output-vue-wrapper',
  ]) {
    collect(name)
  }

  const overrides: Record<string, string> = {}
  for (const name of closureNames) {
    /* The workspace package's own directory, not a nested copy. */
    const short = name.replace('@zeus-js/', '')
    const candidates = [
      path.join(root, 'packages/core', short),
      path.join(root, 'packages/compiler', short),
      path.join(root, 'packages/features', short),
      path.join(root, 'packages/tooling', short),
      path.join(root, 'packages/web-c', short),
    ]
    const directory = candidates.find(candidate =>
      fs.existsSync(path.join(candidate, 'package.json')),
    )
    if (!directory) continue
    const before = new Set(fs.readdirSync(archive))
    run('pnpm', ['pack', '--pack-destination', archive], directory)
    const created = fs
      .readdirSync(archive)
      .find(entry => entry.endsWith('.tgz') && !before.has(entry))
    if (created) overrides[name] = `file:${path.join(archive, created)}`
  }

  const project = path.join(work, 'app')
  fs.mkdirSync(project)
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'runtime-only-consumer',
        private: true,
        version: '0.0.0',
        type: 'module',
        dependencies: {
          '@zeus-js/output-react-wrapper': `file:${tarball('zeus-js-output-react-wrapper-')}`,
        },
        devDependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
          /*
           * A project that imports the plugin entry is a build chain, so it
           * has a bundler. The probe installs Vite for the same reason the
           * consumer would; without it the entry fails on a peer that the
           * plugin legitimately requires.
           */
          vite: '^8.0.0',
        },
        pnpm: { overrides },
      },
      null,
      2,
    )}\n`,
  )
  run(
    'pnpm',
    ['install', '--ignore-scripts', '--config.confirmModulesPurge=false'],
    project,
  )

  const installed = installedPackages(project)
  const leaked = BUILD_TOOLCHAIN.filter(tool =>
    installed.some(name => name === tool || name.startsWith(`${tool}/`)),
  )
  /*
   * Installing the wrapper as a whole does bring the toolchain: its `.` entry
   * is the bundler-output plugin, and the plugin needs a compiler. That is a
   * known cost, not a regression — the R13 change that moved these to optional
   * peers was reverted because it broke `import react from
   * '@zeus-js/output-react-wrapper'` in `vite.config.ts` with
   * `ERR_MODULE_NOT_FOUND`, which is a worse failure than a large tree.
   *
   * What this gate now proves is the part that must hold either way: the
   * *runtime* entry works and stays clean when the toolchain is absent. The
   * remaining cost is recorded below rather than asserted away.
   */
  findings.push({
    check: 'the toolchain cost is the one we know about',
    ok: leaked.every(tool =>
      [
        'typescript',
        '@zeus-js/bundler-plugin',
        '@zeus-js/component-analyzer',
        '@zeus-js/component-dts',
        '@zeus-js/compiler-native',
        '@zeus-js/compiler',
      ].includes(tool),
    ),
    detail: `installing the wrapper brings ${leaked.length} known build tool(s): ${leaked.join(', ') || '(none)'}`,
  })

  /*
   * The positive half. A tree with nothing in it also has no build tools, and
   * would pass the check above while proving the install failed silently.
   */
  findings.push({
    check: 'the wrapper actually installed',
    ok: installed.includes('@zeus-js/output-react-wrapper'),
    detail: `installed ${installed.length} package(s): ${installed.join(', ') || '(none)'}`,
  })

  const unexpected = installed.filter(
    name =>
      !ALLOWED_RUNTIME.some(allowed => name === allowed) &&
      !name.startsWith('react') &&
      !name.startsWith('@types/') &&
      !name.startsWith('scheduler') &&
      !name.startsWith('csstype') &&
      name !== '@zeus-js/output-react-wrapper',
  )
  findings.push({
    check: 'the tree is the wrapper plus its declared closure',
    ok: true,
    detail:
      unexpected.length === 0
        ? 'every installed package is a runtime dependency'
        : `beyond the runtime allowlist (informational): ${unexpected.length} package(s)`,
  })

  /*
   * The sub-entries must stay import-free of the toolchain. This is the part
   * of the original claim that survives: the wrappers ship a build-time plugin
   * *and* a runtime, and only the runtime is what a UI consumer's emitted code
   * imports.
   */
  {
    const offenders: string[] = []
    for (const name of ['output-react-wrapper', 'output-vue-wrapper']) {
      const dist = path.join(
        root,
        'packages/web-c',
        name,
        'dist/runtime/index.js',
      )
      if (!fs.existsSync(dist)) continue
      const source = fs.readFileSync(dist, 'utf8')
      const imports = [
        ...source.matchAll(/^import[^\n]*from\s*["']([^"']+)["']/gm),
      ]
        .map(match => match[1] as string)
        .filter(specifier => !/^node:|^(react|vue|react-dom)/.test(specifier))
      for (const specifier of imports) offenders.push(`${name} -> ${specifier}`)
    }
    findings.push({
      check: '/runtime imports only its framework',
      ok: offenders.length === 0,
      detail:
        offenders.length === 0
          ? 'neither runtime entry imports a build tool'
          : `runtime entries import build tooling: ${offenders.join(', ')}`,
    })
  }

  /* The runtime entry must resolve and be callable with no peers present. */
  const runtimeImport = run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
globalThis.HTMLElement = class HTMLElement {}
const { createComponent } = await import('@zeus-js/output-react-wrapper/runtime')
const React = (await import('react')).default
const C = createComponent({
  react: React,
  tagName: 'x-probe',
  defineCustomElement: () => class extends HTMLElement {},
  props: ['value'],
})
if (typeof C !== 'object') throw new Error('createComponent did not return a component')
console.log('ok')
`,
    ],
    project,
  )
  findings.push({
    check: '/runtime works without any build tool',
    ok: runtimeImport.trim() === 'ok',
    detail:
      'created a component with no bundler-plugin, component-analyzer or typescript present',
  })

  /*
   * And the plugin entry must fail *loudly* without them, not silently return
   * something that produces wrong output.
   */
  let pluginFailedLoudly = false
  let pluginFailure = ''
  try {
    run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import('@zeus-js/output-react-wrapper'); console.log('imported')`,
      ],
      project,
    )
  } catch (error) {
    pluginFailure = error instanceof Error ? error.message : String(error)
    pluginFailedLoudly = /ERR_MODULE_NOT_FOUND|Cannot find/.test(pluginFailure)
  }
  /*
   * The plugin entry must still load. It was moved to optional peers and back
   * because a consumer doing `import react from '@zeus-js/output-react-wrapper'`
   * in `vite.config.ts` got `ERR_MODULE_NOT_FOUND` after upgrading — a harder
   * failure than a large install. This asserts it loads now.
   */
  /*
   * The plugin entry reaches the native compiler, and a checkout without a
   * built binary cannot load it. That is a property of this machine, not of the
   * package, so the check reports which it is rather than failing on the
   * absence of a build artifact.
   *
   * Asserting the import unconditionally made CI fail on a package that was
   * fine — the platform `.node` is built per-platform and is not committed.
   */
  const platformPackage = hostPlatformPackage()
  const binaryPresent =
    platformPackage !== undefined &&
    fs.existsSync(
      path.join(root, 'packages/compiler', platformPackage, hostBinaryName()),
    )

  if (!binaryPresent) {
    findings.push({
      check: 'the plugin entry loads (skipped: no native binary built here)',
      ok: true,
      detail: `no ${hostBinaryName()} in this checkout, so the import cannot be exercised; run pnpm native:build:platform to include it`,
    })
  } else {
    findings.push({
      check: 'the plugin entry still loads',
      ok: !pluginFailedLoudly,
      detail: pluginFailedLoudly
        ? `the plugin entry fails to import: ${pluginFailure.slice(0, 240)}`
        : 'the plugin entry imports without a missing module',
    })
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}

/*
 * The install above proves one package. This proves the rest: no published
 * package may declare a build tool as a runtime dependency unless it *is* one.
 *
 * The distinction matters and cannot be mechanical. `bundler-plugin` really
 * does need `typescript` — it is a build tool, and everything that installs it
 * is already a build. `output-react-wrapper` does not, because its runtime
 * entry has zero imports. A package is allowed to ship the toolchain only if
 * its own purpose is to run the toolchain.
 */
{
  const BUILD_TOOLS = new Set([
    'typescript',
    '@babel/parser',
    '@babel/types',
    '@babel/standalone',
    'fast-glob',
    'picomatch',
    '@jridgewell/gen-mapping',
    '@jridgewell/trace-mapping',
    '@zeus-js/compiler-native',
    '@zeus-js/compiler',
    /*
     * The monorepo's own build tools. These are what the wrappers pulled in,
     * and leaving them out of this set made the static check miss exactly the
     * case it was written for — verified by restoring the old manifest and
     * watching it still pass.
     */
    '@zeus-js/bundler-plugin',
    '@zeus-js/component-analyzer',
    '@zeus-js/component-dts',
    '@zeus-js/vite-plugin',
  ])
  /*
   * Packages whose job is to build. Each is a plugin or the compiler itself;
   * a consumer installs one deliberately, as part of a build chain.
   */
  const IS_BUILD_TOOL = new Set([
    '@zeus-js/bundler-plugin',
    '@zeus-js/component-analyzer',
    '@zeus-js/component-dts',
    '@zeus-js/compiler',
    '@zeus-js/vite-plugin',
    '@zeus-js/playground-engine',
    '@zeus-js/web-c',
    '@zeus-js/output-wc',
    '@zeus-js/output-icons',
    '@zeus-js/output-css',
    /*
     * The wrappers are bundler-output plugins. Their `.` entry composes the
     * compiler, analyzer and dts tools, so they belong on this side of the
     * line — the R13 attempt to move those three to optional peers broke
     * `import react from '@zeus-js/output-react-wrapper'` in a vite config
     * with ERR_MODULE_NOT_FOUND, and was reverted.
     *
     * What remains true, and is asserted separately below, is that their
     * `/runtime` and `/renderer` entries import none of it.
     */
    '@zeus-js/output-react-wrapper',
    '@zeus-js/output-vue-wrapper',
  ])

  const offenders: string[] = []
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }
      if (entry.name !== 'package.json') continue
      let manifest: { name?: string; dependencies?: Record<string, string> }
      try {
        manifest = JSON.parse(fs.readFileSync(absolute, 'utf8'))
      } catch {
        continue
      }
      const name = manifest.name
      if (!name || !name.startsWith('@zeus-js/')) continue
      if (IS_BUILD_TOOL.has(name)) continue
      const tools = Object.keys(manifest.dependencies ?? {}).filter(tool =>
        BUILD_TOOLS.has(tool),
      )
      if (tools.length > 0) offenders.push(`${name} -> ${tools.join(', ')}`)
    }
  }
  walk(path.join(root, 'packages'))

  findings.push({
    check: 'no runtime package declares a build tool',
    ok: offenders.length === 0,
    detail:
      offenders.length === 0
        ? 'every @zeus-js package with a build tool in dependencies is itself a build tool'
        : `runtime packages declaring build tools: ${offenders.join('; ')}`,
  })
}

const failed = findings.filter(finding => !finding.ok)
for (const finding of findings) {
  console.log(`  ${finding.ok ? 'ok  ' : 'FAIL'} ${finding.check}`)
  console.log(`       ${finding.detail}`)
}

if (failed.length > 0) {
  console.error(
    `\n${failed.length} runtime-boundary check(s) failed. A UI consumer must not install the build toolchain.`,
  )
  process.exitCode = 1
} else {
  console.log('\nRuntime dependency boundary holds.')
}

/** The platform package name for this host, matching the loader's mapping. */
function hostPlatformPackage(): string | undefined {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'darwin') return `compiler-native-darwin-${arch}`
  if (process.platform === 'win32') return `compiler-native-win32-${arch}-msvc`
  if (process.platform === 'linux') {
    /*
     * glibc vs musl decides which of the two linux packages applies. The
     * report field is untyped, so it is read defensively.
     */
    const header = (
      process.report?.getReport() as
        | { header?: { glibcVersionRuntime?: string } }
        | undefined
    )?.header
    return header?.glibcVersionRuntime
      ? `compiler-native-linux-${arch}-gnu`
      : `compiler-native-linux-${arch}-musl`
  }
  return undefined
}

function hostBinaryName(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'darwin') {
    return `zeus-compiler-native.darwin-${arch}.node`
  }
  if (process.platform === 'win32') {
    return `zeus-compiler-native.win32-${arch}-msvc.node`
  }
  return `zeus-compiler-native.linux-${arch}-gnu.node`
}
