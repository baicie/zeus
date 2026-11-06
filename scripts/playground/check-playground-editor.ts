import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'

import {
  chromium,
  expect,
  firefox,
  webkit,
  type Browser,
  type Page,
} from '@playwright/test'

import { findWorkspacePackages } from '../shared/utils'

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dirname, '../..')
const example = path.join(root, 'examples/playground-editor')
const dist = path.join(example, 'dist')
const output = path.join(root, 'temp/playground-editor')
const engines = { chromium, firefox, webkit }
const requestedBrowsers = (
  process.env.PLAYGROUND_BROWSERS ?? 'chromium,firefox,webkit'
)
  .split(',')
  .map(name => name.trim())
  .filter(Boolean)
const selectedEngines = Object.entries(engines).filter(([name]) =>
  requestedBrowsers.includes(name),
)
if (!selectedEngines.some(([name]) => name === 'chromium')) {
  throw new Error('PLAYGROUND_BROWSERS must include chromium for export checks')
}

interface BrowserResult {
  readonly browser: string
  readonly version?: string
  readonly status: 'failed' | 'passed'
  readonly error?: string
  readonly security?: Record<string, boolean>
}

const results: BrowserResult[] = []
let downloadedArchive: string | undefined
let downloadedWebCArchive: string | undefined
const requests: Array<{ host: string; path: string }> = []

async function main(): Promise<void> {
  await fs.mkdir(output, { recursive: true })
  editorServer = await createStaticServer(dist)

  try {
    let nativeLabPassed = false
    let webcStudioPassed = false
    for (const [name, engine] of selectedEngines) {
      let browser: Browser | undefined
      try {
        browser = await engine.launch({
          headless: true,
          ...(name === 'chromium' ? { channel: 'chromium' } : {}),
        })
        const pageErrors: string[] = []
        const page = await browser.newPage()
        page.setDefaultTimeout(12_000)
        page.on('pageerror', error => pageErrors.push(error.message))
        const security = await runEditorChecks(page)
        Object.assign(security, await runSandboxOriginChecks(browser))
        nativeLabPassed = true
        if (name === 'chromium') {
          downloadedArchive = await downloadExport(page)
          const studio = await runWebCStudioChecks(page)
          assert.deepEqual(studio.manifest.components[0]?.tag, 'z-counter')
          webcStudioPassed = true
          downloadedWebCArchive = await downloadExport(page)
        }
        await runFrameworkHostChecks(page)
        assert.deepEqual(pageErrors, [], `${name} page errors`)
        results.push({
          browser: name,
          version: browser.version(),
          status: 'passed',
          security,
        })
        console.log(
          `Playground editor ${name}: compile, multi-file update, preview, diagnostics, security and loop recovery passed`,
        )
      } catch (error) {
        results.push({
          browser: name,
          status: 'failed',
          error:
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error),
        })
        console.error(`Playground editor ${name} failed:`, error)
      } finally {
        await browser?.close()
      }
    }

    assert(downloadedArchive, 'Chromium did not download the exported project.')
    assert(
      downloadedWebCArchive,
      'Chromium did not download the WebC Studio export.',
    )
    assert(
      results.every(result => result.status === 'passed'),
      'Every browser must pass the playground editor gate.',
    )

    const exportedProjectDirectory =
      await installAndBuildExport(downloadedArchive)
    const exportedSecurity = await checkExportedBrowser(
      exportedProjectDirectory,
      'chromium',
    )
    results.push({
      browser: 'chromium-export',
      status: 'passed',
      security: exportedSecurity,
    })
    const webcProject = await installAndBuildExport(downloadedWebCArchive!)
    const webcFiles = await fs.readdir(webcProject)
    assert(webcFiles.includes('custom-elements.json'))
    assert(webcFiles.includes('zeus.components.json'))
    results.push({
      browser: 'chromium-webc-export',
      status: 'passed',
    })

    await fs.writeFile(
      path.join(output, 'report.json'),
      `${JSON.stringify(
        {
          scope:
            'WASM multi-file compile, DOM/SSR output, sandbox interaction, diagnostics, security, loop budget and external export',
          sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: root,
            encoding: 'utf8',
          }).trim(),
          host: 'http://127.0.0.1',
          sandbox: 'http://localhost',
          runtime: {
            node: process.version,
            v8: process.versions.v8,
          },
          requests,
          results,
          products: [
            {
              id: 'native-lab',
              status: nativeLabPassed ? 'passed' : 'failed',
            },
            {
              id: 'webc-studio',
              status: webcStudioPassed ? 'passed' : 'failed',
            },
          ],
        },
        null,
        2,
      )}\n`,
    )

    console.log(
      `Playground editor gate passed in ${selectedEngines
        .map(([name]) => name)
        .join(', ')}.`,
    )
  } finally {
    const server = editorServer
    if (!server) throw new Error('Editor server must be running.')
    await closeServer(server)
  }
}

async function runEditorChecks(page: Page): Promise<Record<string, boolean>> {
  const host = `http://127.0.0.1:${serverPort()}`
  await page.goto(`${host}/`)
  await expect(page.getByTestId('compile')).toBeEnabled()

  await compile(page)
  await expect(page.getByTestId('status')).toContainText('编译完成：2 个模块')
  await expect(page.getByTestId('dom-output')).toContainText(
    '// src/main.tsx · source map',
  )
  await expect(page.getByTestId('dom-output')).toContainText(
    '// src/counter.tsx · source map',
  )
  await expect(page.getByTestId('ssr-output')).toContainText('Count:')
  await expect(page.getByTestId('diagnostics')).toContainText('"sourceMaps"')
  await expect(page.getByTestId('preview-status')).toContainText('预览就绪')

  const firstFrame = page.frameLocator('[data-testid="preview-frame"]')
  await expect(firstFrame.getByTestId('query-status')).toHaveText(
    'Router + Query ready',
  )
  await expect(firstFrame.locator('button')).toHaveText('Count: 0')
  await expect(page.getByTestId('hmr-kind-src/counter.tsx')).toContainText(
    'first-build',
  )
  await expect(page.getByTestId('devtools-mode')).toHaveText('runtime')
  await expect(page.getByTestId('devtools-owners')).not.toHaveText('0')
  await expect(page.getByTestId('devtools-bindings')).not.toHaveText('0')
  await expect(page.getByTestId('devtools-effects')).not.toHaveText('0')
  await expect(page.getByTestId('devtools-sources')).not.toHaveText('0')
  await expect(page.getByTestId('devtools-dom-nodes')).not.toHaveText('0')
  await expect(page.getByTestId('build-metrics')).toContainText('WASM compile')
  const firstSandboxUrl = sandboxFrame(page).url()
  const firstSandboxSession = sandboxSession(firstSandboxUrl)
  await firstFrame.locator('button').click()
  await expect(firstFrame.locator('button')).toHaveText('Count: 1')

  await page.getByRole('tab', { name: 'counter.tsx' }).click()
  const currentSource = await page.getByTestId('source').inputValue()
  await page
    .getByTestId('source')
    .fill(currentSource.replace('Count:', 'Live:'))
  await compile(page)
  await expect(page.getByTestId('dom-output')).toContainText('Live:')
  await expect(page.getByTestId('ssr-output')).toContainText('Live:')
  await expect(page.getByTestId('hmr-kind-src/counter.tsx')).toContainText(
    'template-structure',
  )
  await expect(firstFrame.locator('button')).toHaveText('Live: 0')
  assert.notEqual(
    sandboxSession(sandboxFrame(page).url()),
    firstSandboxSession,
    'Each preview build must receive a fresh sandbox realm.',
  )

  await page.getByRole('tab', { name: 'main.tsx' }).click()
  await page.getByTestId('source').fill('export const App = () => <div>\n')
  await compile(page, false)
  await expect(page.getByTestId('diagnostics')).toContainText(
    'ZEUS_PARSE_ERROR',
  )
  await expect(page.getByTestId('preview-status')).toHaveText(
    '存在编译错误，预览未启动',
  )

  await page
    .getByTestId('source')
    .fill(
      `export const helper = () => 'helper'\nexport const App = () => <p>Recovered</p>\n`,
    )
  await compile(page)
  await expect(firstFrame.locator('p')).toHaveText('Recovered')

  await page.evaluate(
    ({ currentOrigin }) => {
      localStorage.setItem('zeus-secret', 'parent-storage')
      document.cookie = 'zeus-secret=parent-cookie; path=/'
      return currentOrigin
    },
    { currentOrigin: host },
  )
  const probeSource = securityProbe(host)
  await page.getByTestId('source').fill(probeSource)
  await compile(page)
  const security = JSON.parse(
    (await firstFrame.getByTestId('security-probe').textContent()) ?? '{}',
  ) as Record<string, boolean>
  assert.deepEqual(security, {
    parentDom: false,
    parentStorage: false,
    localCookies: false,
    localFetch: false,
  })
  assert.equal(
    requests.some(request => request.path === '/secret'),
    false,
    'Sandbox fetch must not reach the host server.',
  )
  const frame = page.frames().find(candidate => candidate !== page.mainFrame())
  assert(frame, 'Sandbox iframe must be present.')
  assert.equal(
    await frame.evaluate(() => globalThis.origin),
    'null',
    'Sandbox must expose an opaque JS origin.',
  )
  assert.match(frame.url(), /^http:\/\/localhost:/)
  assert.equal(
    await page.getByTestId('preview-frame').getAttribute('sandbox'),
    'allow-scripts',
  )
  await expect(page.getByTestId('preview-status')).toContainText('预览就绪')

  await page
    .getByTestId('source')
    .fill('export const App = () => { while (true) {} }\n')
  await compile(page)
  await expect(page.getByTestId('preview-status')).toContainText(
    'ZEUS_PLAYGROUND_LOOP_BUDGET',
  )
  await page
    .getByTestId('source')
    .fill(`export const App = () => <button>Recovered</button>\n`)
  await compile(page)
  await expect(firstFrame.locator('button')).toHaveText('Recovered')

  await page.getByTestId('source').fill(`import { render } from '@zeus-js/zeus'
import { QueryClientProvider, createQueryClient } from '@zeus-js/query'
import { RouterProvider, createMemoryHistory, createRouter } from '@zeus-js/router'
import { Counter } from './counter'
import './counter.css'

const queryClient = createQueryClient()
const router = createRouter({
  history: createMemoryHistory({ initialEntries: ['/lab'] }),
  routes: [{ id: 'lab', path: '/lab', element: () => <Counter /> }],
})

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  ),
  document.querySelector('#root')!,
)
`)
  await compile(page)
  await expect(firstFrame.locator('button')).toHaveText('Live: 0')
  return security
}

async function runWebCStudioChecks(
  page: Page,
): Promise<{ manifest: { components: Array<{ tag: string }> } }> {
  const host = `http://127.0.0.1:${serverPort()}`
  await page.goto(`${host}/webc.html`)
  await expect(page.getByTestId('compile')).toBeEnabled()
  await compile(page)
  await expect(page.getByTestId('webc-manifest')).toContainText('z-counter')
  await expect(page.getByTestId('webc-declarations')).toContainText(
    'defineCustomElement',
  )
  await expect(page.getByTestId('preview-status')).toContainText('预览就绪')
  const frame = page.frameLocator('[data-testid="preview-frame"]')
  await expect(frame.locator('z-counter')).toHaveCount(1)
  await page.getByTestId('preview-frameworks').click()
  await expect(frame.getByTestId('sandbox-react-host')).toContainText(
    'React: 3',
  )
  await expect(frame.getByTestId('sandbox-vue-host')).toContainText('Vue: 7')
  await sandboxFrame(page).evaluate(() => {
    const button = document.querySelector(
      '[data-testid="sandbox-react-host"] z-counter button',
    )
    if (!(button instanceof HTMLElement)) {
      throw new Error('React-hosted Custom Element button is missing.')
    }
    button.click()
  })
  await expect(frame.getByTestId('sandbox-react-host')).toContainText(
    'React: 4',
  )
  const manifest = JSON.parse(
    (await page.getByTestId('webc-manifest').textContent()) ?? '{}',
  ) as { manifest: { components: Array<{ tag: string }> } }
  return { manifest: manifest.manifest }
}

async function runFrameworkHostChecks(page: Page): Promise<void> {
  const host = `http://127.0.0.1:${serverPort()}`
  await page.goto(`${host}/host.html`)
  const react = page.getByTestId('react-host')
  const vue = page.getByTestId('vue-host')
  await expect(react).toContainText('React: 3')
  await expect(vue).toContainText('Vue: 7')
  await expect(page.locator('z-host-counter')).toHaveCount(2)
  await react.getByRole('button').click()
  await expect(react).toContainText('React: 4')
}

async function compile(page: Page, expectSuccess = true): Promise<void> {
  const button = page.getByTestId('compile')
  const previousSequence = await button.getAttribute('data-build-sequence')
  await button.click()
  await page.waitForFunction(
    previous =>
      document
        .querySelector('[data-testid="compile"]')
        ?.getAttribute('data-build-sequence') !== previous,
    previousSequence,
    { timeout: 30_000 },
  )
  await expect(button).toBeEnabled()
  if (expectSuccess) {
    await expect(page.getByTestId('preview-status')).not.toContainText('未启动')
  }
}

async function downloadExport(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export').click()
  const download = await downloadPromise
  const archive = path.join(output, download.suggestedFilename())
  await download.saveAs(archive)
  await expect(page.getByTestId('status')).toContainText('已导出')
  return archive
}

const LOCAL_EXPORT_PACKAGES = new Set([
  '@zeus-js/zeus',
  '@zeus-js/signal',
  '@zeus-js/shared',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/query',
  '@zeus-js/router',
  '@zeus-js/resource',
])

async function packLocalPackages(): Promise<Record<string, string>> {
  const packagesDirectory = path.join(output, 'packages')
  await fs.rm(packagesDirectory, { recursive: true, force: true })
  await fs.mkdir(packagesDirectory, { recursive: true })
  const overrides: Record<string, string> = {}
  for (const pkg of findWorkspacePackages()) {
    if (!LOCAL_EXPORT_PACKAGES.has(pkg.name)) continue
    const { stdout } = await execFileAsync(
      'pnpm',
      ['pack', '--pack-destination', packagesDirectory, '--json'],
      { cwd: pkg.dir, shell: process.platform === 'win32' },
    )
    const parsed = JSON.parse(stdout.slice(stdout.indexOf('{'))) as {
      name: string
      filename: string
    }
    overrides[parsed.name] = `file:${path.resolve(parsed.filename)}`
  }
  return overrides
}

async function installAndBuildExport(archive: string): Promise<string> {
  const extraction = path.join(output, 'exported-project')
  await fs.rm(extraction, { recursive: true, force: true })
  await fs.mkdir(extraction, { recursive: true })
  await execFileAsync('tar', ['-xzf', archive, '-C', extraction])
  const entries = await fs.readdir(extraction)
  const packageDirectory = entries.find(
    entry => entry.startsWith('zeus-') && entry.endsWith('-export'),
  )
  assert(packageDirectory, 'The export archive must contain one project root.')
  const directory = path.join(extraction, packageDirectory)
  const env = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
    CI: 'true',
  }
  const overrides = await packLocalPackages()
  const manifestFile = path.join(directory, 'package.json')
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')) as {
    pnpm?: Record<string, unknown>
  }
  manifest.pnpm = {
    ...manifest.pnpm,
    overrides: { ...(manifest.pnpm?.overrides as object), ...overrides },
  }
  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  await execFileAsync(
    'pnpm',
    ['install', '--ignore-scripts', '--ignore-workspace'],
    {
      cwd: directory,
      env,
      shell: process.platform === 'win32',
      timeout: 120_000,
    },
  )
  await execFileAsync('pnpm', ['check'], {
    cwd: directory,
    env,
    shell: process.platform === 'win32',
    timeout: 60_000,
  })
  await execFileAsync('pnpm', ['build'], {
    cwd: directory,
    env,
    shell: process.platform === 'win32',
    timeout: 60_000,
  })
  return directory
}

async function checkExportedBrowser(
  directory: string,
  browserName: keyof typeof engines,
): Promise<Record<string, boolean>> {
  const server = await createStaticServer(path.join(directory, 'dist'))
  const address = server.address()
  assert(address && typeof address !== 'string')
  const browser = await engines[browserName].launch({
    headless: true,
    ...(browserName === 'chromium' ? { channel: 'chromium' } : {}),
  })
  try {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${address.port}/`)
    await expect(page.locator('button')).toHaveText('Live: 0')
    await page.locator('button').click()
    await expect(page.locator('button')).toHaveText('Live: 1')
    return { interaction: true }
  } finally {
    await browser.close()
    await closeServer(server)
  }
}

async function runSandboxOriginChecks(
  browser: Browser,
): Promise<Record<string, boolean>> {
  const sandboxUrl = `http://localhost:${serverPort()}/sandbox.html`
  const directContext = await browser.newContext()
  const direct = await directContext.newPage()
  const directErrors: string[] = []
  direct.on('pageerror', error => directErrors.push(error.message))
  try {
    await direct.goto(`${sandboxUrl}#direct-security`, {
      waitUntil: 'load',
      timeout: 30_000,
    })
    await direct.waitForTimeout(300)
    const directOrigin = await direct.evaluate(() => globalThis.origin)
    assert.notEqual(
      directOrigin,
      'null',
      'This check must run without an HTTP sandbox CSP header so the code-level gate is exercised.',
    )
    assert(
      directErrors.some(message =>
        message.includes('requires an opaque origin'),
      ),
      'A non-opaque direct sandbox must fail closed before accepting messages.',
    )
  } finally {
    await directContext.close()
  }

  const attackerContext = await browser.newContext()
  const attacker = await attackerContext.newPage()
  try {
    await attacker.goto('about:blank')
    await attacker.setContent(`<!doctype html><html><body><script>
      window.__sandboxMessages = []
      window.__sandboxPwned = null
      window.addEventListener('message', event => {
        window.__sandboxMessages.push(event.data)
        if (event.data && event.data.zeusPwn) window.__sandboxPwned = event.data
      })
      const frame = document.createElement('iframe')
      frame.src = ${JSON.stringify(sandboxUrl)} + '#third-party'
      document.body.append(frame)
      frame.addEventListener('load', () => setTimeout(() => {
        frame.contentWindow.postMessage({
          channel: 'zeus-playground-sandbox',
          version: 1,
          kind: 'sandbox-load',
          sessionId: 'third-party',
          requestId: 'third-party-1',
          timeoutMs: 5000,
          payload: {
            entryPath: 'main.js',
            modules: [{
              path: 'main.js',
              imports: [],
              code: 'parent.postMessage({ zeusPwn: true }, "*")\\nexport default () => document.createElement("div")',
            }],
            styles: [],
            runtimeModules: [],
          },
        }, '*')
      }, 500))
    </script></body></html>`)
    await attacker.waitForTimeout(1_500)
    const result = await attacker.evaluate(() => {
      const state = window as unknown as {
        __sandboxMessages?: unknown[]
        __sandboxPwned?: unknown
      }
      return {
        messages: state.__sandboxMessages ?? [],
        pwned: state.__sandboxPwned ?? null,
      }
    })
    assert.deepEqual(
      result.messages,
      [],
      'A third-party embed without a sandbox attribute must not receive sandbox readiness or results.',
    )
    assert.equal(result.pwned, null, 'Third-party code must not execute.')
    return { directOpaqueGate: true, thirdPartyEmbedBlocked: true }
  } finally {
    await attackerContext.close()
  }
}

function securityProbe(host: string): string {
  return `const checks = {
  parentDom: false,
  parentStorage: false,
  localCookies: false,
  localFetch: false,
}
try { void parent.document.body; checks.parentDom = true } catch {}
try { void parent.localStorage.getItem('zeus-secret'); checks.parentStorage = true } catch {}
try { if (document.cookie.includes('zeus-secret')) checks.localCookies = true } catch {}
try { await fetch('${host}/secret'); checks.localFetch = true } catch {}
parent.postMessage({
  channel: 'zeus-playground-sandbox',
  version: 1,
  kind: 'sandbox-load',
  sessionId: '../bad',
}, '*')
parent.postMessage('malformed payload', '*')
export const App = () => (
  <pre data-testid="security-probe">{JSON.stringify(checks)}</pre>
)
`
}

function sandboxSession(url: string): string {
  const parsed = new URL(url)
  return (
    parsed.searchParams.get('zeus-sandbox-session') ??
    decodeURIComponent(parsed.hash.slice(1))
  )
}

function sandboxFrame(page: Page) {
  const frame = page.frames().find(candidate => candidate !== page.mainFrame())
  assert(frame, 'Sandbox iframe must be present.')
  return frame
}

let editorServer: http.Server | undefined

function serverPort(): number {
  const address = editorServer?.address()
  assert(address && typeof address !== 'string')
  return address.port
}

async function createStaticServer(directory: string): Promise<http.Server> {
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const pathname =
      requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
    requests.push({
      host: request.headers.host ?? '',
      path: requestUrl.pathname,
    })
    const file = path.resolve(directory, `.${pathname}`)
    if (!file.startsWith(`${directory}${path.sep}`)) {
      response.writeHead(403).end()
      return
    }
    try {
      const body = await fs.readFile(file)
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      response.setHeader('Content-Type', contentType(path.extname(file)))
      response.setHeader('X-Content-Type-Options', 'nosniff')
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>(resolve => server.listen(0, resolve))
  return server
}

function contentType(extension: string): string {
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.js') return 'text/javascript; charset=utf-8'
  if (extension === '.css') return 'text/css; charset=utf-8'
  if (extension === '.wasm') return 'application/wasm'
  return 'application/octet-stream'
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
}

await main()
