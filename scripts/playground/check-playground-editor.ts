import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
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

const execFileAsync = promisify(execFile)
const root = path.resolve(import.meta.dirname, '../..')
const example = path.join(root, 'examples/playground-editor')
const dist = path.join(example, 'dist')
const output = path.join(root, 'temp/playground-editor')
const engines = { chromium, firefox, webkit }

interface BrowserResult {
  readonly browser: string
  readonly version?: string
  readonly status: 'failed' | 'passed'
  readonly error?: string
  readonly security?: Record<string, boolean>
}

const results: BrowserResult[] = []
let downloadedArchive: string | undefined
const requests: Array<{ host: string; path: string }> = []

async function main(): Promise<void> {
  await fs.mkdir(output, { recursive: true })
  editorServer = await createStaticServer(dist)

  try {
    for (const [name, engine] of Object.entries(engines)) {
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
        if (name === 'chromium') {
          downloadedArchive = await downloadExport(page)
        }
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

    await fs.writeFile(
      path.join(output, 'report.json'),
      `${JSON.stringify(
        {
          scope:
            'WASM multi-file compile, DOM/SSR output, sandbox interaction, diagnostics, security, loop budget and external export',
          host: 'http://127.0.0.1',
          sandbox: 'http://localhost',
          runtime: {
            node: process.version,
            v8: process.versions.v8,
          },
          requests,
          results,
        },
        null,
        2,
      )}\n`,
    )

    console.log(
      'Playground editor gate passed in Chromium, Firefox and WebKit.',
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
  await expect(firstFrame.locator('button')).toHaveText('Count: 0')
  const firstSandboxUrl = sandboxFrame(page).url()
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
  await expect(firstFrame.locator('button')).toHaveText('Live: 0')
  assert.notEqual(
    new URL(sandboxFrame(page).url()).hash,
    new URL(firstSandboxUrl).hash,
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
import { Counter } from './counter'
import './counter.css'

render(() => <Counter />, document.querySelector('#root')!)
`)
  await compile(page)
  await expect(firstFrame.locator('button')).toHaveText('Live: 0')
  return security
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

async function installAndBuildExport(archive: string): Promise<string> {
  const extraction = path.join(output, 'exported-project')
  await fs.rm(extraction, { recursive: true, force: true })
  await fs.mkdir(extraction, { recursive: true })
  await execFileAsync('tar', ['-xzf', archive, '-C', extraction])
  const directory = path.join(extraction, 'zeus-playground-export')
  const env = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ''}`,
    CI: 'true',
  }
  await execFileAsync('pnpm', ['install', '--ignore-scripts'], {
    cwd: directory,
    env,
    timeout: 120_000,
  })
  await execFileAsync('pnpm', ['check'], {
    cwd: directory,
    env,
    timeout: 60_000,
  })
  await execFileAsync('pnpm', ['build'], {
    cwd: directory,
    env,
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
