/**
 * Measures the Playground's real browser cost: initial transfer, lazy editor
 * chunk, time to first editable source/preview, WASM compile time, auto-run
 * coalescing under high-frequency edits, and sandbox/heap cleanup.
 *
 * Run after `pnpm --filter @zeus-js/example-playground-editor build`.
 */
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium, type CDPSession, type Page } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'examples/playground-editor/dist')
const output = path.join(root, 'temp/playground-ux')

interface ResourceSummary {
  readonly name: string
  readonly bytes: number
  readonly lazy: boolean
}

interface PerformanceReport {
  readonly sourceCommit?: string
  readonly engine: string
  readonly initial: {
    readonly shellJavascriptBytes: number
    readonly cssBytes: number
    readonly editorChunkBytes: number
    readonly compilerBytes: number
    readonly totalTransferBytes: number
    readonly resources: readonly ResourceSummary[]
  }
  readonly timing: {
    readonly firstEditableMs: number
    readonly firstPreviewMs: number
    readonly domContentLoadedMs: number
    readonly loadMs: number
  }
  readonly compile: {
    readonly compileMs: number
    readonly previewMs: number
    readonly domBytes: number
    readonly ssrBytes: number
  }
  readonly autoRun: {
    readonly edits: number
    readonly compiles: number
    readonly elapsedMs: number
    readonly finalSourceVisible: boolean
  }
  readonly cleanup: {
    readonly builds: number
    readonly heapBeforeBytes: number
    readonly heapAfterBytes: number
    readonly heapGrowthBytes: number
    readonly iframesAfterBuilds: number
    readonly iframesAfterStop: number
    readonly workers: number
    readonly stopped: boolean
  }
}

async function main(): Promise<void> {
  await fs.mkdir(output, { recursive: true })
  const server = await createStaticServer(dist)
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()
    const report = await measure(page)
    await fs.writeFile(
      path.join(output, 'performance.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
    await closeServer(server)
  }
}

async function measure(page: Page): Promise<PerformanceReport> {
  const started = Date.now()
  await page.goto(`http://127.0.0.1:${serverPort()}/`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.cm-content[contenteditable="true"]', {
    timeout: 20_000,
  })
  const firstEditableMs = Date.now() - started
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="preview-status"]')
        ?.textContent?.includes('Preview ready'),
    null,
    { timeout: 30_000 },
  )
  const firstPreviewMs = Date.now() - started
  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    return {
      domContentLoadedMs: entry?.domContentLoadedEventEnd ?? 0,
      loadMs: entry?.loadEventEnd ?? 0,
    }
  })
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter(entry => entry.name.startsWith(location.origin))
      .map(entry => {
        const resource = entry as PerformanceResourceTiming
        return {
          name: new URL(resource.name).pathname,
          bytes: resource.encodedBodySize || resource.transferSize || 0,
          lazy: resource.name.includes('code-editor-impl'),
        }
      }),
  )
  const state = await page.evaluate(() => window.__zeusPlayground!.getState())
  const initialResources = resources.filter(resource => !resource.lazy)
  const compilerBytes = initialResources
    .filter(
      resource =>
        resource.name.includes('babel') ||
        resource.name.includes('zeus-compiler') ||
        resource.name.includes('/worker-'),
    )
    .reduce((total, resource) => total + resource.bytes, 0)
  const shellJavascriptBytes = initialResources
    .filter(
      resource =>
        resource.name.endsWith('.js') &&
        !resource.name.includes('babel') &&
        !resource.name.includes('/worker-'),
    )
    .reduce((total, resource) => total + resource.bytes, 0)
  const cssBytes = initialResources
    .filter(resource => resource.name.endsWith('.css'))
    .reduce((total, resource) => total + resource.bytes, 0)
  const editorChunkBytes = resources
    .filter(resource => resource.lazy)
    .reduce((total, resource) => total + resource.bytes, 0)
  const totalTransferBytes = resources.reduce(
    (total, resource) => total + resource.bytes,
    0,
  )

  // High-frequency edits must coalesce into one debounced compile.
  const beforeEdits = state.buildSequence
  const editsStarted = Date.now()
  const edits = 30
  for (let index = 0; index < edits; index += 1) {
    await page.evaluate(value => {
      window.__zeusPlayground!.setSource(
        `import { render } from '@zeus-js/zeus'\nrender(() => <p>final-marker-${value}</p>, document.querySelector('#root')!)\n`,
      )
    }, index)
    await page.waitForTimeout(30)
  }
  const marker = `final-marker-${edits - 1}`
  const preview = page.frameLocator('[data-testid="preview-frame"]')
  let finalSourceVisible = false
  const editDeadline = Date.now() + 20_000
  while (Date.now() < editDeadline) {
    const text = await preview
      .locator('p')
      .last()
      .textContent()
      .catch(() => null)
    if (text?.includes(marker)) {
      finalSourceVisible = true
      break
    }
    await page.waitForTimeout(100)
  }
  const elapsedMs = Date.now() - editsStarted
  const afterEdits = await page.evaluate(() =>
    window.__zeusPlayground!.getState(),
  )

  // Repeated builds must replace, not accumulate, sandbox realms and memory.
  const session = await page.context().newCDPSession(page)
  await collectGarbage(session)
  const heapBeforeBytes = await heapUsage(session)
  const builds = 10
  for (let index = 0; index < builds; index += 1) {
    const before = await page.evaluate(
      () => window.__zeusPlayground!.getState().buildSequence,
    )
    await page.evaluate(() => window.__zeusPlayground!.run())
    const after = await page.evaluate(() => window.__zeusPlayground!.getState())
    if (after.buildSequence <= before || after.busy) {
      throw new Error(`build ${index} did not settle: ${JSON.stringify(after)}`)
    }
    if (after.diagnostics.some(item => item.severity === 'error')) {
      throw new Error(
        `build ${index} reported ${JSON.stringify(after.diagnostics)}`,
      )
    }
  }
  await collectGarbage(session)
  const heapAfterBytes = await heapUsage(session)
  const iframesAfterBuilds = await page.locator('iframe').count()
  const workers = page.workers().length
  await page.evaluate(() => window.__zeusPlayground!.stop())
  const stopped = await page.evaluate(
    () => window.__zeusPlayground!.getState().status === 'Stopped',
  )
  const iframesAfterStop = await page.locator('iframe').count()

  return {
    sourceCommit: process.env.GITHUB_SHA,
    engine: 'chromium',
    initial: {
      shellJavascriptBytes,
      cssBytes,
      editorChunkBytes,
      compilerBytes,
      totalTransferBytes,
      resources,
    },
    timing: {
      firstEditableMs,
      firstPreviewMs,
      domContentLoadedMs: Math.round(navigation.domContentLoadedMs),
      loadMs: Math.round(navigation.loadMs),
    },
    compile: {
      compileMs: Number(afterEdits.buildMetrics.compileMs.toFixed(1)),
      previewMs: Number(afterEdits.buildMetrics.previewMs.toFixed(1)),
      domBytes: afterEdits.buildMetrics.domBytes,
      ssrBytes: afterEdits.buildMetrics.ssrBytes,
    },
    autoRun: {
      edits,
      compiles: afterEdits.buildSequence - beforeEdits,
      elapsedMs,
      finalSourceVisible,
    },
    cleanup: {
      builds,
      heapBeforeBytes,
      heapAfterBytes,
      heapGrowthBytes: heapAfterBytes - heapBeforeBytes,
      iframesAfterBuilds,
      iframesAfterStop,
      workers,
      stopped,
    },
  }
}

async function collectGarbage(session: CDPSession): Promise<void> {
  await session.send('HeapProfiler.collectGarbage')
}

async function heapUsage(session: CDPSession): Promise<number> {
  const usage = (await session.send('Runtime.getHeapUsage')) as {
    usedSize: number
  }
  return usage.usedSize
}

let server: http.Server | undefined

function serverPort(): number {
  const address = server?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Static server is not listening.')
  }
  return address.port
}

async function createStaticServer(directory: string): Promise<http.Server> {
  const instance = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const pathname =
      requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
    const file = path.resolve(directory, `.${pathname}`)
    if (!file.startsWith(`${directory}${path.sep}`)) {
      response.writeHead(403).end()
      return
    }
    try {
      const body = await fs.readFile(file)
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      if (pathname.endsWith('.js')) {
        response.setHeader('Content-Type', 'text/javascript')
      } else if (pathname.endsWith('.css')) {
        response.setHeader('Content-Type', 'text/css')
      } else if (pathname.endsWith('.html')) {
        response.setHeader('Content-Type', 'text/html')
      } else if (pathname.endsWith('.json')) {
        response.setHeader('Content-Type', 'application/json')
      } else if (pathname.endsWith('.wasm')) {
        response.setHeader('Content-Type', 'application/wasm')
      }
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>(resolve => instance.listen(0, resolve))
  server = instance
  return instance
}

async function closeServer(instance: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    instance.close(error => (error ? reject(error) : resolve())),
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
