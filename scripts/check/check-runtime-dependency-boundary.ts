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
        },
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
  findings.push({
    check: 'no build toolchain',
    ok: leaked.length === 0,
    detail:
      leaked.length === 0
        ? `none of ${BUILD_TOOLCHAIN.length} build tools reached the consumer tree`
        : `reached the consumer tree: ${leaked.join(', ')}`,
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
    check: 'only runtime packages',
    ok: unexpected.length === 0,
    detail:
      unexpected.length === 0
        ? 'every installed package is a runtime dependency'
        : `unexpected in a runtime-only consumer: ${unexpected.join(', ')}`,
  })

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
  findings.push({
    check: 'the plugin entry refuses to run without its tools',
    ok: pluginFailedLoudly,
    detail: pluginFailedLoudly
      ? 'the plugin entry reports a missing module instead of producing output without the compiler'
      : `importing the plugin entry succeeded or failed obscurely: ${pluginFailure.slice(0, 120)}`,
  })
} finally {
  fs.rmSync(work, { recursive: true, force: true })
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
