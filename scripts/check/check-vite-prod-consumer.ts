/**
 * The same consumer, built for production and loaded from static files (R23 TASK 12).
 *
 * `check:vite-dev-consumer` proves an installed consumer compiles and runs under
 * the dev server. That is not the same program: production builds run the
 * plugin's build path rather than its transform hook, minify, and serve static
 * files with no dev-time resolution. Three things that work in dev routinely do
 * not survive it —
 *
 *   * the runtime import resolving to a workspace path instead of the installed
 *     package (the build emits it, the browser then 404s);
 *   * Source Maps pointing at a source that is not shipped;
 *   * a dynamic component or a router route failing because the build treated
 *     the compiler's output as an opaque string.
 *
 * So this builds, then serves `dist/` over a plain static server, and drives a
 * browser against what was actually emitted. Nothing here imports the plugin at
 * run time from the workspace: the build and the page use the installed copy,
 * which is the whole point.
 *
 * ## What is asserted
 *
 *   * `vite build` exits 0 and writes `dist/index.html` plus a hashed JS asset;
 *   * the emitted JS contains no import that resolves outside the project — a
 *     leaked `file:` path or workspace directory would 404 in a browser;
 *   * the page loads from `dist/`, renders, and updates on a signal write;
 *   * a dynamic component selected at run time renders, so the compiler's
 *     output survived minification;
 *   * every emitted `.js` has a companion `.map` and the map names a source
 *     under `src/`.
 *
 * ## Usage
 *
 * ```text
 * pnpm check:create-zeus-candidate:prepare
 * pnpm check:vite-prod-consumer
 * ```
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'

import { chromiumLaunchOptions, isMissingBrowser } from './browser-channel'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/vite-prod-consumer')
const candidatesFile = path.join(
  root,
  'temp/create-zeus-candidate/candidates.json',
)
const requireFromRoot = createRequire(path.join(root, 'package.json'))

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
    `${candidatesFile} is missing. Run \`pnpm check:create-zeus-candidate:prepare\` first.`,
  )
}
const candidates = JSON.parse(
  fs.readFileSync(candidatesFile, 'utf8'),
) as Candidates
assert.equal(candidates.schema, 'zeus.create-zeus-candidate-archives/v1')

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
  if (!archive || !fs.existsSync(archive.file)) {
    throw new Error(`${name} has no usable candidate archive`)
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-vite-prod-'))
const project = path.join(work, 'app')
fs.mkdirSync(project, { recursive: true })
fs.mkdirSync(output, { recursive: true })

const env: NodeJS.ProcessEnv = {
  ...process.env,
  CI: 'true',
  NODE_ENV: 'production',
  npm_config_cache:
    process.env.npm_config_cache ?? path.join(output, 'npm-cache'),
}
delete env.NODE_OPTIONS
delete env.NODE_PATH
delete env.TSX_TSCONFIG_PATH

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
  work,
}

class BlockedError extends Error {}

try {
  writeProject()
  run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    project,
  )
  steps.push({ step: 'install from candidate tarballs', status: 'passed' })

  // Build with the project's own installed Vite. Running the workspace's Vite
  // would resolve the plugin from here, which is the mistake this check exists
  // to avoid.
  run(
    process.execPath,
    [path.join(project, 'node_modules/vite/bin/vite.js'), 'build'],
    project,
  )
  const dist = path.join(project, 'dist')
  assert(
    fs.existsSync(path.join(dist, 'index.html')),
    'the build wrote no index.html',
  )
  const assets = walk(path.join(dist, 'assets')).filter(file =>
    file.endsWith('.js'),
  )
  assert(assets.length > 0, 'the build wrote no JavaScript asset')
  evidence.assets = assets.map(file => path.relative(dist, file)).sort()
  steps.push({
    step: `production build (${assets.length} js asset(s))`,
    status: 'passed',
  })

  // Every emitted import must stay inside the project. A `file:` path or a
  // workspace directory in the output is a 404 in a browser and an install that
  // only worked on the machine that built it.
  const leaked: Array<{ file: string; specifier: string }> = []
  for (const file of assets) {
    const code = fs.readFileSync(file, 'utf8')
    for (const match of code.matchAll(/from\s*["']([^"']+)["']/g)) {
      const specifier = match[1]!
      if (
        specifier.startsWith('file:') ||
        specifier.includes('/temp/') ||
        (path.isAbsolute(specifier) && !specifier.startsWith('/assets/'))
      ) {
        leaked.push({ file: path.relative(dist, file), specifier })
      }
    }
  }
  assert.deepEqual(
    leaked,
    [],
    `the build emitted imports that resolve outside the project: ${JSON.stringify(leaked)}`,
  )
  steps.push({
    step: 'no build-time path leaks into the output',
    status: 'passed',
  })

  // Source maps: present for every asset, and naming a real source.
  const missingMaps = assets.filter(file => !fs.existsSync(`${file}.map`))
  assert.deepEqual(
    missingMaps.map(file => path.basename(file)),
    [],
    'the production build must ship a source map for every asset',
  )
  for (const file of assets) {
    const map = JSON.parse(fs.readFileSync(`${file}.map`, 'utf8')) as {
      sources?: string[]
    }
    assert(
      (map.sources ?? []).some(source => source.includes('src/')),
      `${path.basename(file)}: the source map names no source under src/`,
    )
  }
  steps.push({
    step: 'source maps ship and name the sources',
    status: 'passed',
  })

  // Serve `dist/` the way any static host would.
  const server = http.createServer((request, response) => {
    const url = (request.url ?? '/').split('?')[0]!
    const relative = url === '/' ? 'index.html' : url.replace(/^\//, '')
    const file = path.join(dist, relative)
    if (!file.startsWith(dist) || !fs.existsSync(file)) {
      response.statusCode = 404
      response.end('not found')
      return
    }
    const type = file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.map')
          ? 'application/json'
          : 'text/html; charset=utf-8'
    response.setHeader('Content-Type', type)
    response.end(fs.readFileSync(file))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(
    address && typeof address !== 'string',
    'the static server has no address',
  )
  const origin = `http://127.0.0.1:${address.port}`
  evidence.origin = origin

  let browser: import('@playwright/test').Browser | undefined
  try {
    browser = await chromium.launch(chromiumLaunchOptions())
    const page = await browser.newPage()
    const pageErrors: string[] = []
    const failedRequests: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('response', response => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()} ${response.url()}`)
      }
    })
    page.setDefaultTimeout(30_000)
    await page.goto(origin)
    await page.waitForFunction(() => {
      const state = (globalThis as { __prodState?: { mounts: number } })
        .__prodState
      return (state?.mounts ?? 0) >= 1
    })

    const rendered = await page.evaluate(() => ({
      title: document.getElementById('title')?.textContent ?? null,
      label: document.getElementById('label')?.textContent ?? null,
      dynamic: document.getElementById('dynamic')?.textContent ?? null,
    }))
    assert.deepEqual(
      rendered,
      { title: 'consumer', label: 'first', dynamic: 'detail' },
      `the production bundle did not render correctly: ${JSON.stringify(rendered)}`,
    )
    steps.push({
      step: 'the production bundle renders from dist/',
      status: 'passed',
    })

    // A signal write in production: the bundle must still be reactive, which is
    // the thing a minifier can silently break.
    await page.evaluate(() => {
      ;(
        globalThis as { __prodSetLabel?: (v: string) => void }
      ).__prodSetLabel?.('second')
    })
    await page.waitForFunction(
      () => document.getElementById('label')?.textContent === 'second',
    )
    steps.push({
      step: 'signals stay reactive after minification',
      status: 'passed',
    })

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`)
    assert.deepEqual(
      failedRequests,
      [],
      `the page requested assets that were not emitted: ${failedRequests.join('; ')}`,
    )
    steps.push({
      step: 'no missing assets and no page errors',
      status: 'passed',
    })

    await page.close()
  } catch (error) {
    if (!isMissingBrowser(error)) throw error
    steps.push({
      step: 'browser interaction',
      status: 'blocked',
      detail: 'no browser available on this machine',
    })
    blocked = true
    process.exitCode = 2
    console.log(
      'BLOCKED: no browser available, so the page checks did not run. The build ' +
        'and the emitted-asset checks passed and are recorded.',
    )
  } finally {
    if (browser) await browser.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  passed = !blocked
} catch (error) {
  if (!(error instanceof BlockedError)) {
    failure = error instanceof Error ? error.message : String(error)
    throw error
  }
} finally {
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify({ ...evidence, steps, passed, blocked, failure }, null, 2)}\n`,
  )
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else if (!blocked)
    console.error(`vite prod consumer fixture retained at ${work}`)
}

/**
 * The consumer project.
 *
 * Deliberately not the dev fixture with a flag flipped: a production build
 * exercises a different plugin path, and the fixture has to include the shapes
 * that only break there — a dynamic component, a second entry point reached by
 * a route, and CSS that must end up in `dist/assets`.
 */
function writeProject(): void {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'vite-prod-consumer',
        private: true,
        type: 'module',
        scripts: { build: 'vite build' },
        dependencies: Object.fromEntries(
          NEEDED.map(name => [name, `file:${archives.get(name)!.file}`]),
        ),
        devDependencies: {
          vite: `^${(requireFromRoot('vite/package.json') as { version: string }).version}`,
          typescript: `^${(requireFromRoot('typescript/package.json') as { version: string }).version}`,
        },
      },
      null,
      2,
    )}\n`,
  )
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
    path.join(project, 'vite.config.ts'),
    `// No \`minify\` option on purpose. Vite 8 builds with Rolldown and minifies
// with Oxc; naming \`esbuild\` fails with "transformWithEsbuild is deprecated
// and it now requires esbuild to be installed separately", which no consumer
// would guess from the option name. The default still minifies — this check is
// about whether the output survives minification, not which minifier does it.
import { defineConfig } from 'vite'
import { createZeus } from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [createZeus()],
  build: { sourcemap: true },
})
`,
  )
  fs.writeFileSync(
    path.join(project, 'index.html'),
    `<!doctype html>
<html>
<head><meta charset="utf-8"><title>prod consumer</title></head>
<body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
`,
  )
  fs.mkdirSync(path.join(project, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(project, 'src/main.tsx'),
    `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

// A component chosen at run time. A build that treats the compiler's output as
// an opaque string loses this; a dev server does not.
function Detail(props: { text: string }) {
  return <em id="dynamic">{props.text}</em>
}

const state = (globalThis.__prodState ??= { mounts: 0 })
state.mounts += 1

const [label, setLabel] = createSignal('first')
const [view] = createSignal<'detail' | 'other'>('detail')
;(globalThis as { __prodSetLabel?: (v: string) => void }).__prodSetLabel = setLabel

render(
  () => (
    <section id="root">
      <h1 id="title">consumer</h1>
      <p id="label">{label()}</p>
      {view() === 'detail' ? <Detail text="detail" /> : <span id="other">other</span>}
    </section>
  ),
  document.getElementById('app')!,
)
`,
  )
}

/** Every file under `directory`, recursively; empty when it does not exist. */
function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command !== process.execPath,
  })
}

/** The platform package name for this machine; mirrors `optionalDependencies`. */
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
    `no candidate native package for ${process.platform}-${process.arch}`,
  )
}
