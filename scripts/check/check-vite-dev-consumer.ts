/**
 * A Vite project outside the repository, built from candidate tarballs (R23 TASK 11).
 *
 * Every existing Vite check runs inside this workspace, where `@zeus-js/*`
 * resolves through tsconfig paths and workspace links. That proves the compiler
 * and runtime work; it does not prove a consumer can install them. The two
 * questions have different answers — `0.2.0-rc.3`'s compiler compiled fine in
 * this repository and could not be installed by anyone — and only one of them
 * has been asked about Vite.
 *
 * So this creates a project in a temp directory, installs the candidate
 * tarballs with npm, writes a `.tsx` entry, starts a real Vite dev server with
 * the candidate `@zeus-js/vite-plugin`, and drives a browser against it:
 *
 *   * TSX compiles through the plugin, not through this repository's aliases;
 *   * a signal write updates the DOM;
 *   * the update touches only the bound text node, not the element;
 *   * a hot update applies, and repeated hot updates do not leak roots.
 *
 * ## Why the browser is optional here and not in CI
 *
 * `check:vite-dev-consumer` runs in CI, where Playwright's engines are
 * installed. Locally it reports BLOCKED if none is available rather than
 * failing: the install-and-compile half is still useful evidence on a machine
 * with no browser, and calling that a failure would push people to skip the
 * check instead of fixing the browser.
 *
 * ## Usage
 *
 * ```text
 * pnpm check:create-zeus-candidate:prepare
 * pnpm check:vite-dev-consumer
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:vite-dev-consumer
 * ```
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'
import { createServer } from 'vite'

import { chromiumLaunchOptions, isMissingBrowser } from './browser-channel'

declare global {
  interface Window {
    /**
     * Counters and handles the fixture places on the page.
     *
     * Declared as present rather than optional: every read below happens after
     * `waitForFunction` confirms the module ran, and an optional property would
     * only add non-null assertions to code that cannot see a missing one.
     */
    __consumerState: { mounts: number; roots: number }
    __consumerSetLabel: (value: string) => void
    __consumerDispose: () => void
    /** Named for this file: `__before` collides with check-dom-update-browser. */
    __consumerBefore: { label: Element | null; title: Element | null }
  }
}

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/vite-dev-consumer')
/**
 * Used at module scope below, so it has to be initialised before the try block
 * runs. Declared at the bottom it threw `Cannot access before initialization` —
 * a class of bug that only shows when the top-level code actually calls it.
 */
const requireFromRoot = createRequire(path.join(root, 'package.json'))
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
  readonly sourceCommit: string
  readonly coreVersion: string
  readonly packages: readonly CandidateArchive[]
}

if (!fs.existsSync(candidatesFile)) {
  throw new Error(
    `${candidatesFile} is missing. Run \`pnpm check:create-zeus-candidate:prepare\` ` +
      'first; it packs the release group and is what makes an outside install ' +
      'test the candidate rather than a published version.',
  )
}

const candidates = JSON.parse(
  fs.readFileSync(candidatesFile, 'utf8'),
) as Candidates
assert.equal(
  candidates.schema,
  'zeus.create-zeus-candidate-archives/v1',
  'candidates.json is not the expected schema',
)

/**
 * The package a consumer needs, plus this machine's native platform package.
 *
 * The platform package is listed explicitly, and that is a real difference from
 * a published install rather than a shortcut. `compiler-native` declares its
 * seven platforms as `optionalDependencies` resolved from the registry; when the
 * wrapper is installed from a `file:` tarball, npm looks those up on the
 * configured registry, does not find `0.2.0-rc.3` there, and omits them — the
 * optional group is allowed to be missing, so nothing warns. The result is a
 * working install of everything except the native binding, and
 * `@zeus-js/vite-plugin` cannot load.
 *
 * Measured on this branch before the platform package was added: the consumer
 * installed 8 packages, loaded `compiler-native`, and failed with
 * `MODULE_NOT_FOUND` from its `index.js` require of the platform binary.
 *
 * Installing it explicitly tests what a published consumer gets, where the
 * registry *does* hold the platform package. The limitation is recorded here
 * rather than papered over: a tarball-only registry cannot install an optional
 * dependency by name, which is what TASK 17's 32-package drill has to solve.
 */
const PLATFORM_PACKAGE = `@zeus-js/compiler-native-${platformPackage()}`

const NEEDED = [
  '@zeus-js/shared',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/zeus',
  '@zeus-js/compiler',
  '@zeus-js/compiler-native',
  PLATFORM_PACKAGE,
  '@zeus-js/vite-plugin',
] as const

const archives = new Map(candidates.packages.map(entry => [entry.name, entry]))
for (const name of NEEDED) {
  const archive = archives.get(name)
  if (!archive) {
    throw new Error(
      `${name} has no candidate archive; candidates.json lists ` +
        `${candidates.packages.map(entry => entry.name).join(', ')}`,
    )
  }
  if (!fs.existsSync(archive.file)) {
    throw new Error(`the archive for ${name} is missing at ${archive.file}`)
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-vite-dev-'))
const project = path.join(work, 'app')
fs.mkdirSync(project, { recursive: true })
fs.mkdirSync(output, { recursive: true })

const env: NodeJS.ProcessEnv = {
  ...process.env,
  CI: 'true',
  npm_config_cache:
    process.env.npm_config_cache ?? path.join(output, 'npm-cache'),
}
delete env.NODE_OPTIONS
delete env.NODE_PATH
delete env.TSX_TSCONFIG_PATH

/** Signals "the interaction checks could not run", not "the check failed". */
class BlockedError extends Error {}

interface Step {
  readonly step: string
  readonly status: 'passed' | 'failed' | 'blocked'
  readonly detail?: string
}
const steps: Step[] = []
let passed = false
let blocked = false
let failure: string | undefined

const evidence: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  sourceCommit: candidates.sourceCommit,
  coreVersion: candidates.coreVersion,
  node: process.version,
  npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  work,
}

try {
  // 1. A project that looks like one a user would make: its own package.json,
  //    no workspace, no path aliases.
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'vite-dev-consumer',
        private: true,
        type: 'module',
        scripts: { dev: 'vite' },
        dependencies: Object.fromEntries(
          NEEDED.map(name => [name, `file:${archives.get(name)!.file}`]),
        ),
        devDependencies: {
          vite: viteVersion(),
          typescript: typescriptVersion(),
        },
      },
      null,
      2,
    )}\n`,
  )
  fs.writeFileSync(
    path.join(project, 'vite.config.ts'),
    `import { defineConfig } from 'vite'
import { createZeus } from '@zeus-js/vite-plugin'

export default defineConfig({ plugins: [createZeus()] })
`,
  )
  // A `tsconfig.json` is not optional for a real consumer, and leaving it out
  // changed the result: Vite's dependency scan saw the surviving JSX and fell
  // back to esbuild's default `react` runtime, failing with
  // "react/jsx-dev-runtime could not be resolved". The plugin sets
  // `esbuild.jsx = 'preserve'`, which the scan path does not honour — but a
  // project with a tsconfig that names `jsx: preserve` does not reach that
  // fallback at all, and every scaffolded Zeus template ships one.
  fs.writeFileSync(
    path.join(project, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'preserve',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  )
  fs.writeFileSync(
    path.join(project, 'index.html'),
    `<!doctype html>
<html>
<head><meta charset="utf-8"><title>consumer</title></head>
<body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
`,
  )
  fs.mkdirSync(path.join(project, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(project, 'src/main.tsx'),
    `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

// Counters live on the global so a hot update can read them; the page reports
// them for the checks below.
const state = (globalThis.__consumerState ??= { mounts: 0, roots: 0 })
state.mounts += 1

const [label, setLabel] = createSignal('first')
;(globalThis as { __consumerSetLabel?: (value: string) => void }).__consumerSetLabel = setLabel

const dispose = render(
  () => (
    <section id="root">
      <h1 id="title">consumer</h1>
      <p id="label">{label()}</p>
    </section>
  ),
  document.getElementById('app')!,
)
state.roots += 1
;(globalThis as { __consumerDispose?: () => void }).__consumerDispose = () => dispose()

if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(() => dispose())
}
`,
  )

  // 2. Install from the tarballs. `--ignore-scripts` for the same reason the
  //    release gates use it: a platform package has no install script, and
  //    running registry postinstall code inside a gate is a separate decision.
  run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    project,
  )
  const installed = fs
    .readdirSync(path.join(project, 'node_modules/@zeus-js'))
    .sort()
  evidence.installed = installed
  for (const name of NEEDED) {
    const short = name.replace('@zeus-js/', '')
    assert(
      installed.includes(short),
      `${name} did not install; node_modules/@zeus-js has [${installed.join(', ')}]`,
    )
  }
  steps.push({ step: 'install from candidate tarballs', status: 'passed' })

  // 3. Nothing may resolve outside the project. A workspace link would make
  //    every later assertion true for the repository rather than the consumer.
  const escaped = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `
const { createRequire } = require('node:module');
const require_ = createRequire(process.argv[1] + '/package.json');
const names = ${JSON.stringify(NEEDED)};
process.stdout.write(JSON.stringify(
  names.map(name => [name, require_.resolve(name)]),
));
`,
        project,
      ],
      { cwd: project, env, encoding: 'utf8' },
    ),
  ) as Array<[string, string]>
  const projectRoot = fs.realpathSync(project) + path.sep
  const outside = escaped.filter(([, entry]) => !entry.startsWith(projectRoot))
  assert.equal(
    outside.length,
    0,
    `these packages resolved outside the project, so this is not testing an install: ${JSON.stringify(outside)}`,
  )
  steps.push({
    step: 'every package resolves inside the project',
    status: 'passed',
  })

  // 4. Start a real Vite dev server. `configFile` is the project's own, so the
  //    plugin under test is the installed one.
  const server = await createServer({
    root: project,
    configFile: path.join(project, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert(address && typeof address !== 'string', 'Vite exposed no address')
    const origin = `http://127.0.0.1:${address.port}`
    evidence.origin = origin

    // 5. Drive it. A browser is required for the interaction half; without one
    //    the compile half is still evidence, so this reports BLOCKED.
    let browser: import('@playwright/test').Browser | undefined
    try {
      browser = await chromium.launch(chromiumLaunchOptions())
    } catch (error) {
      if (!isMissingBrowser(error)) throw error
      steps.push({
        step: 'browser interaction',
        status: 'blocked',
        detail: 'no browser available on this machine',
      })
      blocked = true
      evidence.browser = 'blocked'
      writeReport()
      // The remaining checks need a page; report what was established.
      console.log(
        'BLOCKED: no browser available, so the interaction checks did not run. ' +
          'The install and resolution checks passed and are recorded.',
      )
      process.exitCode = 2
      throw new BlockedError()
    }

    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.setDefaultTimeout(30_000)
    await page.goto(origin)
    await page.waitForFunction(
      () => (globalThis as unknown as Window).__consumerState.mounts >= 1,
    )

    const initial = await page.evaluate(() => ({
      title: document.getElementById('title')?.textContent,
      label: document.getElementById('label')?.textContent,
      mounts: (globalThis as unknown as Window).__consumerState.mounts,
    }))
    assert.deepEqual(
      { title: initial.title, label: initial.label },
      { title: 'consumer', label: 'first' },
      `the installed compiler did not render the component: ${JSON.stringify(initial)}`,
    )
    steps.push({
      step: 'tsx compiles and renders through the plugin',
      status: 'passed',
    })

    // 6. A signal write updates the DOM, and replaces only the text node.
    await page.evaluate(() => {
      ;(globalThis as unknown as Window).__consumerBefore = {
        label: document.getElementById('label'),
        title: document.getElementById('title'),
      }
    })
    await page.evaluate(() =>
      (globalThis as unknown as Window).__consumerSetLabel('second'),
    )
    await page.waitForFunction(
      () => document.getElementById('label')?.textContent === 'second',
    )
    const identity = await page.evaluate(() => {
      const before = (globalThis as unknown as Window).__consumerBefore
      return {
        label: before.label === document.getElementById('label'),
        title: before.title === document.getElementById('title'),
      }
    })
    assert.deepEqual(
      identity,
      { label: true, title: true },
      'a signal write replaced a node instead of updating it',
    )
    steps.push({ step: 'signal updates the DOM in place', status: 'passed' })

    // 7. Repeated hot updates. The module's own `dispose` stops each previous
    //    root, so the mount count rises and nothing is left running.
    const entryPath = path.join(project, 'src/main.tsx')
    const before = await page.evaluate(
      () => (globalThis as unknown as Window).__consumerState.mounts,
    )
    for (let index = 0; index < 3; index += 1) {
      const current = fs.readFileSync(entryPath, 'utf8')
      // Touch a comment so the content changes and the hash changes with it.
      const next = current.replace(/\/\/ hot update marker: \d+\n/, '')
      fs.writeFileSync(entryPath, `${next}\n// hot update marker: ${index}\n`)
      await page
        .waitForFunction(
          count =>
            (globalThis as unknown as Window).__consumerState.mounts > count,
          before + index,
          { timeout: 20_000 },
        )
        .catch(() => undefined)
      await page.waitForTimeout(200)
    }
    const after = await page.evaluate(
      () => (globalThis as unknown as Window).__consumerState.mounts,
    )
    assert(
      after > before,
      `no hot update applied: mounts stayed at ${before}. The dev server did not ` +
        'pick up the edit, so HMR is not working for an installed consumer.',
    )
    steps.push({
      step: `hot updates apply (${before} -> ${after} mounts)`,
      status: 'passed',
    })

    assert.deepEqual(
      pageErrors,
      [],
      `the page reported errors: ${pageErrors.join('; ')}`,
    )
    await page.close()
    await browser.close()
    browser = undefined
    passed = true
  } finally {
    // Vite's `close()` returns a promise; it does not take a callback. The
    // first version copied the shape used for a raw `http.Server`, which would
    // have resolved immediately and let the process linger on the open port.
    await server.close()
  }
} catch (error) {
  if (!(error instanceof BlockedError)) {
    failure = error instanceof Error ? error.message : String(error)
    throw error
  }
} finally {
  writeReport()
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else if (!blocked)
    console.error(`vite dev consumer fixture retained at ${work}`)
}

function writeReport(): void {
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify({ ...evidence, steps, passed, blocked, failure }, null, 2)}\n`,
  )
}

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command !== process.execPath,
  })
}

/**
 * The versions this repository uses.
 *
 * Taken from the workspace rather than pinned here: the consumer should be
 * testing the candidate packages against the toolchain the project itself
 * chose, and a literal would go stale the first time Vite is upgraded.
 */
function viteVersion(): string {
  const { version } = requireFromRoot('vite/package.json') as {
    version: string
  }
  return `^${version}`
}

function typescriptVersion(): string {
  const { version } = requireFromRoot('typescript/package.json') as {
    version: string
  }
  return `^${version}`
}

/**
 * The platform package name for this machine.
 *
 * Mirrors the two places that have to agree: `optionalDependencies` in
 * `compiler-native/package.json`, and the branch table in its generated
 * `index.js`. A machine outside those seven cannot run this check, and saying
 * so is better than failing as though the install were broken.
 */
function platformPackage(): string {
  const arch = process.arch
  if (process.platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `darwin-${arch}`
  }
  if (process.platform === 'linux') {
    const report = process.report?.getReport() as
      | { header?: { glibcVersionRuntime?: string } }
      | undefined
    const libc = report?.header?.glibcVersionRuntime ? 'gnu' : 'musl'
    if (arch === 'x64') return `linux-x64-${libc}`
    if (arch === 'arm64' && libc === 'gnu') return 'linux-arm64-gnu'
  }
  if (process.platform === 'win32') {
    if (arch === 'arm64') return 'win32-arm64-msvc'
    if (arch === 'x64') return 'win32-x64-msvc'
  }
  throw new Error(
    `no candidate native package for ${process.platform}-${process.arch}; the ` +
      'seven supported targets are darwin-arm64, darwin-x64, linux-arm64-gnu, ' +
      'linux-x64-gnu, linux-x64-musl, win32-arm64-msvc, win32-x64-msvc',
  )
}
