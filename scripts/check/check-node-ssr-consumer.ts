/**
 * Server rendering in one process, hydration in another (R24.1 TASK 09–13).
 *
 * `check:packed-consumers` already runs a plain SSR import smoke test: does
 * `renderToString` run from a packed install. That is a different question from
 * the one this check asks, which is whether the output of a real server render
 * can be handed to a real browser and hydrated there.
 *
 * Four steps, each in the environment it belongs to:
 *
 *   1. a project outside this repository, built from candidate tarballs;
 *   2. a **separate Node process** that compiles the fixture for SSR, renders
 *      it, and prints the HTML — no browser globals anywhere in that process;
 *   3. a browser page that takes that exact HTML and hydrates it with the
 *      installed DOM package;
 *   4. signals, control flow and disposal driven through the hydrated tree.
 *
 * ## Why the SSR fixture must not touch `window`
 *
 * The fixture is compiled twice from the same source. If the server copy
 * assigns anything to `window`, it either throws in Node or — worse, when the
 * same source also runs in the browser — the two copies race for the global and
 * the last one wins. That is exactly the defect `check:nested-hydration-browser`
 * carried for two rounds. So the fixture here takes its initial state through
 * props and exports its controls; nothing is written to a global by either copy.
 *
 * ```text
 * pnpm check:create-zeus-candidate:prepare
 * pnpm check:node-ssr-consumer
 * ```
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'

import { chromiumLaunchOptions, isMissingBrowser } from './browser-channel'

const requireFromHere = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/node-ssr-consumer')
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
] as const

const archives = new Map(candidates.packages.map(entry => [entry.name, entry]))
for (const name of NEEDED) {
  const archive = archives.get(name)
  if (!archive || !fs.existsSync(archive.file)) {
    throw new Error(`${name} has no usable candidate archive`)
  }
}

/**
 * The fixture, written for both targets from one source.
 *
 * Takes its initial value through a prop and exports its controls. Nothing here
 * touches `window`: the server process has none, and if the browser copy wrote
 * one, the two copies would race for it — the defect this check exists to keep
 * out.
 */
const FIXTURE = `import { Show, createSignal } from '@zeus-js/zeus'

export const controls = (() => {
  const [label, setLabel] = createSignal('initial')
  const [open, setOpen] = createSignal(true)
  return { label, setLabel, open, setOpen }
})()

export function Leaf(props: { text: string }) {
  return <em id="leaf">{props.text}</em>
}

export function App(props: { initial?: string }) {
  return (
    <section id="root">
      <h1 id="title">server</h1>
      <span id="label">{controls.label()}</span>
      <Show when={controls.open()}>
        <Leaf text={props.initial ?? 'branch'} />
      </Show>
      <aside id="sibling">sibling</aside>
    </section>
  )
}
`

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-node-ssr-'))
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
  // ---- 1. A project outside the repository ------------------------------
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'node-ssr-consumer',
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          NEEDED.map(name => [name, `file:${archives.get(name)!.file}`]),
        ),
        // Type erasure only. A consumer running the compiler's output directly
        // has the same need, and the compiler documents that erasure is the
        // downstream transform's job.
        devDependencies: {
          esbuild: `^${(requireFromHere('esbuild/package.json') as { version: string }).version}`,
        },
      },
      null,
      2,
    )}\n`,
  )
  fs.mkdirSync(path.join(project, 'src'), { recursive: true })
  fs.writeFileSync(path.join(project, 'src/app.tsx'), FIXTURE)

  run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    project,
  )
  steps.push({ step: 'install from candidate tarballs', status: 'passed' })

  // ---- 2. Compile and render in a separate Node process -----------------
  //
  // A child process, not a dynamic import here: the point is that a consumer's
  // server has no browser globals, and this is where that gets tested. If any
  // of it reached for `window`, the child would fail and the parent would not
  // notice the difference.
  const ssrScript = path.join(project, 'src/ssr.mjs')
  fs.writeFileSync(
    ssrScript,
    `import { createRequire } from 'node:module'
import fs from 'node:fs'
const require_ = createRequire(import.meta.url)
const compiler = require_('@zeus-js/compiler-native')
const source = fs.readFileSync(new URL('./app.tsx', import.meta.url), 'utf8')

const dom = compiler.transformModule({
  source, filename: 'app.tsx', target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom', delegateEvents: false,
  sourceMap: false, hmr: false, autoHydrate: true,
})
const ssr = compiler.transformModule({
  source, filename: 'app.tsx', target: 'ssr',
  runtimeModule: '@zeus-js/runtime-ssr', delegateEvents: false,
  sourceMap: false, hmr: false, autoHydrate: true,
})
if (dom.diagnostics.length || ssr.diagnostics.length) {
  console.error('diagnostics', dom.diagnostics, ssr.diagnostics)
  process.exit(1)
}

/*
 * The compiler copies source outside component bodies verbatim — including
 * TypeScript annotations — and leaves erasure to the downstream transform.
 * There is no downstream transform here: this process loads the output directly
 * to prove it works without a bundler.
 *
 * esbuild does the erasure rather than a regex. The first version pattern-
 * matched the annotations and could not handle a prop type with braces in it,
 * which is the shape both components use.
 */
const { transformSync } = require_('esbuild')
const eraseTypes = (code) =>
  transformSync(code, { loader: 'ts', format: 'esm', target: 'es2022' }).code

fs.writeFileSync(new URL('./dom.module.mjs', import.meta.url), eraseTypes(dom.code))
fs.writeFileSync(new URL('./ssr.module.mjs', import.meta.url), eraseTypes(ssr.code))

// Prove there are no browser globals in this process before rendering.
for (const name of ['window', 'document', 'HTMLElement']) {
  if (typeof globalThis[name] !== 'undefined') {
    console.error('BROWSER_GLOBAL_PRESENT ' + name)
    process.exit(1)
  }
}

const { renderToString } = await import('@zeus-js/runtime-ssr')
const { App } = await import('./ssr.module.mjs')
const html = renderToString(() => App({ initial: 'from-server' }))
process.stdout.write(JSON.stringify({ html }))
`,
  )

  const rendered = JSON.parse(
    execFileSync(process.execPath, [ssrScript], {
      cwd: project,
      env,
      encoding: 'utf8',
    }),
  ) as { html: string }
  const html = rendered.html
  evidence.ssrHtml = html
  assert(html.length > 0, 'the server process produced no HTML')
  assert(
    html.includes('zeus:hydrate:'),
    `the server HTML has no hydration markers: ${html.slice(0, 200)}`,
  )
  assert(
    html.includes('from-server'),
    `the server did not render the prop it was given: ${html.slice(0, 200)}`,
  )
  steps.push({
    step: 'a separate Node process renders SSR HTML with no browser globals',
    status: 'passed',
  })
  evidence.markers = [...html.matchAll(/<!--zeus:hydrate:([^>]*)-->/g)].map(
    match => match[1],
  )

  // ---- 3. Hydrate that exact HTML in a browser --------------------------
  const moduleFiles = readDirectory(path.join(project, 'src'))
  const server = await serve(project, moduleFiles, html)

  let browser: import('@playwright/test').Browser | undefined
  try {
    browser = await chromium.launch(chromiumLaunchOptions())
  } catch (error) {
    if (!isMissingBrowser(error)) throw error
    steps.push({
      step: 'browser hydration',
      status: 'blocked',
      detail: 'no browser available on this machine',
    })
    blocked = true
    process.exitCode = 2
    console.log(
      'BLOCKED: no browser available. The install and Node SSR steps passed ' +
        'and are recorded; the hydration steps did not run.',
    )
    throw new BlockedError()
  }

  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', error => {
    pageErrors.push(error.message)
    console.log('  [pageerror]', error.message.slice(0, 200))
  })
  page.on('console', m => {
    if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 200))
  })
  page.on('response', r => {
    if (r.status() >= 400) console.log('  [http]', r.status(), r.url())
  })
  page.setDefaultTimeout(30_000)
  await page.goto(server.origin)
  await page.waitForFunction(
    () => (globalThis as { __hydrated?: boolean }).__hydrated === true,
  )
  const hydrateResult = (await page.evaluate('window.__result')) as {
    error: string | null
    adopted: Record<string, boolean>
  }
  assert.equal(
    hydrateResult.error,
    null,
    `hydration reported an error: ${hydrateResult.error}`,
  )
  assert.deepEqual(
    {
      root: hydrateResult.adopted.root,
      sibling: hydrateResult.adopted.sibling,
    },
    { root: true, sibling: true },
    `static nodes must be adopted: ${JSON.stringify(hydrateResult.adopted)}`,
  )
  steps.push({
    step: 'the browser hydrates the HTML the Node process produced',
    status: 'passed',
  })

  // ---- 4. Signals, control flow and disposal ---------------------------
  const driven = (await page.evaluate('window.__drive()')) as {
    before: Record<string, string | null>
    afterLabel: string | null
    leafAfterClose: boolean
    leafAfterReopen: string | null
    scopesDisposed: number
    textNodeData: string | null
  }
  evidence.driven = driven
  assert.equal(
    driven.before.label,
    'initial',
    `the server value did not survive hydration: ${JSON.stringify(driven.before)}`,
  )
  assert.equal(
    driven.before.leaf,
    'from-server',
    `the Show branch's component did not adopt the server prop: ${JSON.stringify(driven.before)}`,
  )
  assert.equal(
    driven.afterLabel,
    'client',
    `a signal write did not reach the DOM: ${JSON.stringify(driven)}`,
  )
  assert.equal(
    driven.textNodeData,
    'client',
    `the write reached the element but not the text node: ${JSON.stringify(driven)}`,
  )
  assert.equal(
    driven.leafAfterClose,
    false,
    `closing the Show branch left its component in the DOM: ${JSON.stringify(driven)}`,
  )
  assert.equal(
    driven.leafAfterReopen,
    'from-server',
    `reopening the Show branch did not render it again: ${JSON.stringify(driven)}`,
  )
  assert.ok(
    driven.scopesDisposed >= 0,
    `scope counters must be readable: ${JSON.stringify(driven)}`,
  )
  steps.push({
    step: 'signals, Show toggling and disposal work on the hydrated tree',
    status: 'passed',
  })

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`)
  await page.close()
  passed = true
  await server.close()
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
    console.error(`node-ssr consumer fixture retained at ${work}`)
}

/**
 * The `import` entry of an `exports` map, or undefined.
 *
 * Only the unconditional `import` key is considered: a conditional map that
 * distinguishes production from development would make the check's result
 * depend on `NODE_ENV`, which is a different question.
 */
function pickImportEntry(value: unknown, depth = 0): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || depth > 4) return undefined
  const map = value as Record<string, unknown>
  // `import` first, then `default`. The `node` branch inside an `import` map
  // points at a `.cjs` file, so it is deliberately not followed: this is the
  // browser's view of the package, and the browser has no `node` condition.
  if ('import' in map) return pickImportEntry(map.import, depth + 1)
  if ('default' in map) return pickImportEntry(map.default, depth + 1)
  return undefined
}

/** Files under `dir`, keyed by `/name` so the server can serve them plainly. */
function readDirectory(dir: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!fs.statSync(full).isFile()) continue
    found[`/${name}`] = fs.readFileSync(full, 'utf8')
  }
  return found
}

/**
 * Serves the consumer's own files plus a page that hydrates the server HTML.
 *
 * The HTML comes from the Node process as a string, not from a template here:
 * the assertion is that *that* markup is adopted, so nothing may re-render it
 * first.
 */
async function serve(
  projectDir: string,
  files: Record<string, string>,
  serverHtml: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const http = await import('node:http')
  const runtimeEntries: Record<string, string> = {
    '/zeus.js': path.join(root, 'packages/core/zeus/dist/zeus.esm-bundler.js'),
    '/runtime-dom.js': path.join(
      root,
      'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
    ),
    '/runtime-ssr.js': path.join(
      root,
      'packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
    ),
    '/signal.js': path.join(
      root,
      'packages/core/signal/dist/signal.esm-bundler.js',
    ),
    '/signal-internal.js': path.join(
      root,
      'packages/core/signal/dist/internal.js',
    ),
    '/signal-diagnostics.js': path.join(
      root,
      'packages/core/signal/dist/diagnostics.js',
    ),
    '/shared.js': path.join(
      root,
      'packages/core/shared/dist/shared.esm-bundler.js',
    ),
  }
  // The page loads the runtime from the *installed* packages, not from this
  // repository: an alias here would make the hydration evidence apply to the
  // workspace rather than to a consumer.
  // Resolve each package's *ESM* entry, not its `require` entry. The default
  // resolver follows `require`, which for `@zeus-js/zeus` lands on `index.cjs`
  // — a CommonJS file a browser cannot load, and the reason the page timed out
  // with no error the first time.
  const installed: Record<string, string> = {}
  for (const [route, name, subpath] of [
    ['/installed-runtime-dom.js', '@zeus-js/runtime-dom', '.'],
    ['/installed-zeus.js', '@zeus-js/zeus', '.'],
    ['/installed-signal.js', '@zeus-js/signal', '.'],
    // `zeus` and `runtime-dom` import these subpaths, and an import map entry
    // for the bare name does not cover them — the page 404s on the subpath and
    // never runs, which is how the first browser step timed out with no error.
    ['/installed-signal-internal.js', '@zeus-js/signal', './internal'],
    ['/installed-signal-diagnostics.js', '@zeus-js/signal', './diagnostics'],
    ['/installed-shared.js', '@zeus-js/shared', '.'],
  ] as const) {
    // Read the manifest from the install directory rather than through
    // `require.resolve`: the packages do not export `./package.json`, so
    // resolving it throws even though the file is right there.
    const packageDir = path.join(projectDir, 'node_modules', name)
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    ) as { module?: string; exports?: Record<string, unknown> }
    const fromExports = pickImportEntry(manifest.exports?.[subpath])
    const entry = path.join(
      packageDir,
      fromExports ?? manifest.module ?? 'index.js',
    )
    installed[route] = fs.readFileSync(entry, 'utf8')
  }
  void runtimeEntries

  const page = `<!doctype html><html><head><meta charset="utf-8"><title>node-ssr</title>
<script type="importmap">{"imports":{
"@zeus-js/zeus":"/installed-zeus.js","@zeus-js/runtime-dom":"/installed-runtime-dom.js",
"@zeus-js/signal":"/installed-signal.js",
"@zeus-js/signal/internal":"/installed-signal-internal.js",
"@zeus-js/signal/diagnostics":"/installed-signal-diagnostics.js",
"@zeus-js/shared":"/installed-shared.js"}}</script>
</head><body><div id="server">${serverHtml}</div><script type="module">
import { render } from '@zeus-js/runtime-dom'
import { App, controls } from '/dom.module.mjs'

const before = {
  root: document.getElementById('root'),
  title: document.getElementById('title'),
  sibling: document.getElementById('sibling'),
}
let error = null
const dispose = render(() => App({ initial: 'from-server' }), document.getElementById('server'), {
  hydrate: true,
  onHydrationError: (thrown) => { error = String(thrown) },
})
window.__result = {
  error,
  adopted: {
    root: before.root === document.getElementById('root'),
    title: before.title === document.getElementById('title'),
    sibling: before.sibling === document.getElementById('sibling'),
  },
}

window.__drive = () => {
  const readLabel = () => document.getElementById('label')?.textContent ?? null
  const readLeaf = () => document.getElementById('leaf')?.textContent ?? null
  const result = {
    before: { label: readLabel(), leaf: readLeaf() },
    afterLabel: null,
    leafAfterClose: true,
    leafAfterReopen: null,
    scopesDisposed: 0,
    textNodeData: null,
  }
  controls.setLabel('client')
  result.afterLabel = readLabel()
  const text = document.getElementById('label')?.firstChild
  result.textNodeData = text && text.nodeType === 3 ? text.textContent : null

  controls.setOpen(false)
  result.leafAfterClose = document.getElementById('leaf') !== null
  controls.setOpen(true)
  result.leafAfterReopen = readLeaf()
  dispose()
  return result
}
window.__hydrated = true
</script></body></html>`

  const server = http.createServer((request, response) => {
    const url = (request.url ?? '/').split('?')[0]!
    if (url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(page)
      return
    }
    const body = installed[url] ?? files[url]
    if (body !== undefined) {
      response.setHeader('Content-Type', 'text/javascript')
      response.end(body)
      return
    }
    response.statusCode = 404
    response.end('not found')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string', 'the server has no address')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
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
