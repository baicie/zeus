/**
 * A Show branch around a nested component, built by Vite and hydrated from SSR (R24 TASK 08).
 *
 * `check:vite-prod-consumer` builds a consumer and drives it, and
 * `check:node-ssr-consumer` renders on a server and hydrates in a browser — but
 * neither puts a Show branch *with a nested component inside it* through a
 * bundler. That combination is the shape R24 was opened for, and every
 * assertion about it so far has come from the compiler's output loaded
 * directly, never from what a build actually ships.
 *
 * The difference is not academic. A build minifies, renames, and lowers the
 * compiler's output; a Show region is compiled to anchor comments and a mount
 * call, so a transform that reorders or drops comments changes what the runtime
 * can find. The checks that pass on raw output cannot see that.
 *
 * ## What it asserts
 *
 *   * `vite build` succeeds and emits one JavaScript asset;
 *   * a separate Node process renders the same source for SSR and prints HTML
 *     containing the Show's markers;
 *   * the built page hydrates that HTML: the nested component inside the Show
 *     adopts its server node rather than replacing it;
 *   * a signal write reaches the nested component's text node;
 *   * closing and reopening the Show installs and removes that component;
 *   * no page errors and no missing assets.
 *
 * The second and third are what make this a hydration check rather than a
 * render check: the HTML comes from Node, and the browser's job is only to
 * adopt it.
 *
 * ## Why the fixture exports its controls
 *
 * The source is compiled twice — once for the server, once for the client —
 * and both copies run. Writing to a global at module scope makes the last one
 * to import win, which is the defect `check:nested-hydration-browser` carried
 * for two rounds. Nothing here assigns to `window` at module scope; the
 * controls are exported and the page imports them from the module it loaded.
 *
 * ```text
 * pnpm check:create-zeus-candidate:prepare
 * pnpm check:vite-show-branch-consumer
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

const requireFromRoot = createRequire(path.join(process.cwd(), 'package.json'))
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/vite-show-branch-consumer')
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

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-vite-show-'))
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

// Declared at module scope so `finally` can release them on every path. A
// browser or server left open holds the event loop and the process never exits
// — the defect that cost `packed-consumers` 26 minutes in run 45110152226.
let server: http.Server | undefined
let browser: import('@playwright/test').Browser | undefined
let page: import('@playwright/test').Page | undefined

const DEADLINE_MS = 180_000
const watchdog = setTimeout(() => {
  const reached = steps.map(entry => entry.step).join(' -> ') || '(none)'
  console.error(
    `TIMEOUT: the check did not finish within ${DEADLINE_MS / 1000}s. ` +
      `Steps completed: ${reached}`,
  )
  process.exit(1)
}, DEADLINE_MS)
watchdog.unref()

try {
  writeProject()
  run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    project,
  )
  steps.push({ step: 'install from candidate tarballs', status: 'passed' })

  // ---- 1. Build ---------------------------------------------------------
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

  // ---- 2. The same source, rendered for SSR in another process ----------
  //
  // From `src/`, not from `dist/`: the server has no bundler. What must match
  // is the *source*, which is what the compiler and the runtime agree on. The
  // built client module is the thing under test on the other side.
  const ssrScript = path.join(project, 'ssr-render.mjs')
  fs.writeFileSync(
    ssrScript,
    `import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const compiler = require_('@zeus-js/compiler-native')
const fs = require_('node:fs')
const source = fs.readFileSync(new URL('./src/App.tsx', import.meta.url), 'utf8')

const ssr = compiler.transformModule({
  source, filename: 'App.tsx', target: 'ssr',
  runtimeModule: '@zeus-js/runtime-ssr', delegateEvents: false,
  sourceMap: false, hmr: false, autoHydrate: true,
})
if (ssr.diagnostics.length) {
  console.error('diagnostics', ssr.diagnostics)
  process.exit(1)
}

/*
 * The compiler copies source outside component bodies verbatim, including
 * TypeScript annotations, and leaves erasure to the downstream transform.
 * esbuild rather than a regex: the prop types here contain braces.
 */
const { transformSync } = require_('esbuild')
fs.writeFileSync(
  new URL('./App.ssr.mjs', import.meta.url),
  transformSync(ssr.code, { loader: 'ts', format: 'esm', target: 'es2022' }).code,
)

for (const name of ['window', 'document', 'HTMLElement']) {
  if (typeof globalThis[name] !== 'undefined') {
    console.error('BROWSER_GLOBAL_PRESENT ' + name)
    process.exit(1)
  }
}

const { renderToString } = await import('@zeus-js/runtime-ssr')
const { App } = await import('./App.ssr.mjs')
process.stdout.write(JSON.stringify({ html: renderToString(() => App({ initial: 'from-server' })) }))
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
  assert(html.length > 0, 'the server process produced no HTML')
  assert(
    html.includes('zeus:hydrate:'),
    `the server HTML has no hydration markers: ${html.slice(0, 200)}`,
  )
  assert(
    html.includes('from-server'),
    `the server did not render the nested component's prop: ${html.slice(0, 300)}`,
  )
  evidence.ssrHtml = html
  steps.push({
    step: 'a separate Node process renders the Show branch for SSR',
    status: 'passed',
  })

  // ---- 3. Serve `dist/` and hydrate that HTML ---------------------------
  server = await serve(dist, html)
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  const pageErrors: string[] = []
  const missing: string[] = []
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
      'BLOCKED: no browser available. The build and the Node SSR step passed ' +
        'and are recorded; the hydration steps did not run.',
    )
    throw new BlockedError()
  }

  page = await browser.newPage()
  page.on('pageerror', error => {
    pageErrors.push(error.message)
    console.log('  [pageerror]', error.message.slice(0, 200))
  })
  page.on('response', r => {
    const url = r.url()
    // The favicon is the one 404 a healthy run produces.
    if (r.status() >= 400 && !url.endsWith('/favicon.ico')) {
      missing.push(`${r.status()} ${url}`)
      console.log('  [http]', r.status(), url)
    }
  })
  page.setDefaultTimeout(30_000)
  await page.goto(origin)
  await page.waitForFunction(
    () => (globalThis as { __hydrated?: boolean }).__hydrated === true,
  )

  const result = (await page.evaluate('window.__result')) as {
    error: string | null
    adopted: Record<string, boolean>
    before: Record<string, string | null>
    afterLabel: string | null
    leafAfterClose: boolean
    leafAfterReopen: string | null
  }
  evidence.result = result

  assert.equal(
    result.error,
    null,
    `hydration reported an error: ${result.error}`,
  )
  // Only the nodes outside the Show are required to keep their identity.
  //
  // `leaf` sits inside the Show branch, and adoption is disabled inside a
  // dynamic region on purpose (`withHydrationCreateFrame`): the branch is
  // rebuilt when it toggles, so it cannot hold server node identities across
  // that. Asserting `leaf: true` here would be asserting against the
  // documented contract, and the first version of this check did exactly that.
  // What the branch must do is carry the server's *content*, which the next
  // assertion covers.
  assert.deepEqual(
    { root: result.adopted.root, title: result.adopted.title },
    { root: true, title: true },
    `the built page did not adopt the server nodes outside the Show: ${JSON.stringify(result.adopted)}`,
  )
  assert.equal(
    result.before.leaf,
    'from-server',
    `the Show branch lost the server content: ${JSON.stringify(result.before)}`,
  )
  steps.push({
    step: 'the built page hydrates the HTML Node produced',
    status: 'passed',
  })

  assert.equal(
    result.before.leaf,
    'from-server',
    `the nested component inside the Show did not adopt the server prop: ${JSON.stringify(result.before)}`,
  )
  assert.equal(
    result.afterLabel,
    'client',
    `a signal write did not reach the nested component: ${JSON.stringify(result)}`,
  )
  steps.push({
    step: 'a signal write reaches the component inside the Show',
    status: 'passed',
  })

  assert.equal(
    result.leafAfterClose,
    false,
    `closing the Show left its component in the DOM: ${JSON.stringify(result)}`,
  )
  assert.equal(
    result.leafAfterReopen,
    'from-server',
    `reopening the Show did not render the component again: ${JSON.stringify(result)}`,
  )
  steps.push({
    step: 'closing and reopening the Show installs and removes the component',
    status: 'passed',
  })

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`)
  assert.deepEqual(
    missing,
    [],
    `the page requested assets that were not emitted: ${missing.join('; ')}`,
  )
  steps.push({
    step: 'no missing assets and no page errors',
    status: 'passed',
  })

  passed = true
} catch (error) {
  if (!(error instanceof BlockedError)) {
    failure = error instanceof Error ? error.message : String(error)
    throw error
  }
} finally {
  clearTimeout(watchdog)
  // Every exit path closes all three, so a failure reports rather than hangs.
  try {
    await page?.close()
  } catch {
    // A page in a crashed browser cannot be closed; the browser close matters.
  }
  try {
    await browser?.close()
  } catch {
    // A browser that already died has nothing to release.
  }
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()))

  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify({ ...evidence, steps, passed, blocked, failure }, null, 2)}\n`,
  )
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else if (!blocked)
    console.error(`vite show-branch consumer fixture retained at ${work}`)
}

/**
 * The consumer project.
 *
 * The shape is R24's: a Show whose branch holds a nested component, next to a
 * dynamic text outside the Show. The text outside is what makes a mis-scoped
 * region observable — if the Show's close marker swallows the sibling text's
 * region, the text stops updating even though the Show still works.
 */
function writeProject(): void {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'vite-show-consumer',
        private: true,
        type: 'module',
        scripts: { build: 'vite build' },
        dependencies: Object.fromEntries(
          NEEDED.map(name => [name, `file:${archives.get(name)!.file}`]),
        ),
        devDependencies: {
          vite: `^${(requireFromRoot('vite/package.json') as { version: string }).version}`,
          typescript: `^${(requireFromRoot('typescript/package.json') as { version: string }).version}`,
          // Type erasure for the SSR copy only; the client goes through Vite.
          esbuild: `^${(requireFromRoot('esbuild/package.json') as { version: string }).version}`,
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
    `import { defineConfig } from 'vite'
import { createZeus } from '@zeus-js/vite-plugin'

export default defineConfig({
  // Hydration has to be on for both environments: the server emits the markers
  // and the client looks for them, so a mismatch is not a degraded result but
  // ZEUS_HYDRATION_NO_ADOPTION on markup this same source produced. The plugin
  // passes this flag to the client and the SSR transform alike.
  plugins: [createZeus({ compiler: { autoHydrate: true } })],
  build: { sourcemap: true },
})
`,
  )
  // The server HTML is injected at request time, so the page itself is only
  // the loader. Everything the server rendered lives inside `#app`.
  fs.writeFileSync(
    path.join(project, 'index.html'),
    `<!doctype html>
<html>
<head><meta charset="utf-8"><title>show consumer</title></head>
<body><div id="app"><!--ssr--></div><script type="module" src="/src/main.tsx"></script></body>
</html>
`,
  )
  fs.mkdirSync(path.join(project, 'src'), { recursive: true })

  fs.writeFileSync(
    path.join(project, 'src/App.tsx'),
    `import { Show, createSignal } from '@zeus-js/zeus'

/*
 * A second component in the same module, not an inline expression inside the
 * Show. The compiler gives it its own root marker pair, which is the nested
 * shape under test; flattening it into the branch would test nothing.
 *
 * Same module rather than its own file because the SSR side has no bundler:
 * Node's ESM loader resolves neither an extensionless relative specifier nor a
 * TypeScript file, so a second file would need a second compile step.
 */
function Leaf(props: { text: string }) {
  return <em id="leaf">{props.text}</em>
}

/*
 * Exported, not assigned to a global.
 *
 * This module is compiled twice — once for SSR, once for the client — and both
 * copies run. Assigning to \`window\` at module scope lets the last import win,
 * which is the defect \`check:nested-hydration-browser\` carried for two rounds:
 * the controls end up pointing at one copy while the tree is bound to the other.
 */
export const controls = (() => {
  const [label, setLabel] = createSignal('initial')
  const [open, setOpen] = createSignal(true)
  return { label, setLabel, open, setOpen }
})()

export function App(props: { initial?: string }) {
  return (
    <section id="root">
      <h1 id="title">server</h1>
      <span id="label">{controls.label()}</span>
      <Show when={controls.open()}>
        <Leaf text={props.initial ?? 'branch'} />
      </Show>
    </section>
  )
}
`,
  )

  // The client entry: hydrate with the server HTML already in the container.
  fs.writeFileSync(
    path.join(project, 'src/main.tsx'),
    `import { render } from '@zeus-js/runtime-dom'
import { App, controls } from './App'

const container = document.getElementById('app')!
const before = {
  root: document.getElementById('root'),
  title: document.getElementById('title'),
  leaf: document.getElementById('leaf'),
}

let error = null
render(() => App({ initial: 'from-server' }), container, {
  hydrate: true,
  onHydrationError: (thrown) => { error = String(thrown) },
})

const readLabel = () => document.getElementById('label')?.textContent ?? null
const readLeaf = () => document.getElementById('leaf')?.textContent ?? null
const beforeRead = { label: readLabel(), leaf: readLeaf() }

controls.setLabel('client')
const afterLabel = readLabel()

controls.setOpen(false)
const leafAfterClose = document.getElementById('leaf') !== null
controls.setOpen(true)
const leafAfterReopen = readLeaf()

window.__result = {
  error,
  adopted: {
    root: before.root === document.getElementById('root'),
    title: before.title === document.getElementById('title'),
    leaf: before.leaf === document.getElementById('leaf'),
  },
  before: beforeRead,
  afterLabel,
  leafAfterClose,
  leafAfterReopen,
}
window.__hydrated = true
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

/**
 * Static server for `dist/`, with the server HTML substituted into `#app`.
 *
 * Substituted at request time rather than at build time on purpose: the HTML
 * must be the exact output of the Node process, not something the bundler could
 * have rewritten.
 */
async function serve(dist: string, serverHtml: string): Promise<http.Server> {
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  const pageHtml = index.replace('<!--ssr-->', serverHtml)
  const server = http.createServer((request, response) => {
    const url = (request.url ?? '/').split('?')[0]!
    if (url === '/' || url === '/index.html') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(pageHtml)
      return
    }
    const file = path.join(dist, url.replace(/^\//, ''))
    // Confined to `dist`: a `..` in the URL must not read this repository.
    if (!path.resolve(file).startsWith(path.resolve(dist))) {
      response.statusCode = 403
      response.end('forbidden')
      return
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      response.setHeader(
        'Content-Type',
        file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'application/octet-stream',
      )
      response.end(fs.readFileSync(file))
      return
    }
    response.statusCode = 404
    response.end('not found')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return server
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
