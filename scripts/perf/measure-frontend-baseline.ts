/**
 * Phase 1: a repeatable front-end performance baseline.
 *
 * ## Why this is a new script rather than an extension of the old one
 *
 * `scripts/playground/check-playground-performance.ts` measures once, on an
 * unthrottled local server, and reports whatever that run produced. A single
 * sample on a warm dev machine cannot tell a regression from machine noise, and
 * it says nothing about Admin. This script is deliberately separate:
 *
 *   - **N samples per scenario, median reported.** The median is what the
 *     report leads with; every sample is kept so a reader can see the spread.
 *     A scenario whose samples disagree widely is marked as unstable rather
 *     than being averaged into a confident-looking number.
 *   - **Cold and warm cache measured separately.** A cold number includes the
 *     download; a warm number does not. Mixing them produces a figure that
 *     describes neither.
 *   - **Throttled scenarios.** Slow 4G and Fast 3G, because a bundle that is
 *     fine on localhost can dominate the experience on a phone.
 *   - **Both products.** Playground (shell, first editable, first preview,
 *     first compile, Output) and Admin (login, dashboard, users, navigation,
 *     first DataGrid interaction).
 *   - **Transfer vs decode kept apart.** `transferSize` is what crossed the
 *     wire after compression; `decodedBodySize` is what the parser and the JS
 *     engine had to chew through. A change that improves one and worsens the
 *     other is not obviously a win, and a single "bytes" column hides that.
 *
 * ## What it deliberately does not do
 *
 * It does not compare against a committed threshold. A baseline from one laptop
 * is not a CI gate — the same bundle on a busy runner produces different
 * numbers, and a gate built on that noise would be turned off within a week.
 * The output is a document and a JSON file for a human to compare against a
 * previous run made **on the same machine, same browser, same viewport**.
 *
 * ## Usage
 *
 *   pnpm measure:frontend-baseline                 # both products, all scenarios
 *   pnpm measure:frontend-baseline --product admin # one product
 *   pnpm measure:frontend-baseline --samples 7     # more samples, slower
 *   pnpm measure:frontend-baseline --out temp/p10/baseline.json
 *
 * Requires both products to be built first:
 *   pnpm --filter @zeus-js/example-playground-editor build
 *   pnpm --filter @zeus-js/example-admin build
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'
import zlib from 'node:zlib'

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { startAdminServer } from '../../examples/admin/server/index'

const root = path.resolve(import.meta.dirname, '../..')
const playgroundDist = path.join(root, 'examples/playground-editor/dist')
const adminDist = path.join(root, 'examples/admin/dist')

const ADMIN_PASSWORD = 'admin-baseline-password-123'
const VIEWER_PASSWORD = 'viewer-baseline-password-123'

type Scenario = {
  readonly name: string
  /** Human description for the report table. */
  readonly measures: string
  /** `none` = unthrottled. */
  readonly throttle: 'none' | 'slow4g' | 'fast3g'
  readonly cache: 'cold' | 'warm'
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'cold/unthrottled',
    measures: 'download included',
    throttle: 'none',
    cache: 'cold',
  },
  {
    name: 'warm/unthrottled',
    measures: 'parse + execute only',
    throttle: 'none',
    cache: 'warm',
  },
  {
    name: 'cold/slow4g',
    measures: '1.6 Mbps, 150ms RTT',
    throttle: 'slow4g',
    cache: 'cold',
  },
  {
    name: 'cold/fast3g',
    measures: '1.6 Mbps, 562ms RTT',
    throttle: 'fast3g',
    cache: 'cold',
  },
]

/** Network profiles, expressed the way CDP wants them (bytes per second). */
const THROTTLE = {
  none: null,
  // Lighthouse's "Slow 4G" and "Fast 3G" definitions.
  slow4g: {
    latencyMs: 150,
    downloadBps: (1.6 * 1024 * 1024) / 8,
    uploadBps: (750 * 1024) / 8,
  },
  fast3g: {
    latencyMs: 562.5,
    downloadBps: ((1.6 * 1024 * 1024) / 8) * 0.4,
    uploadBps: ((750 * 1024) / 8) * 0.5,
  },
} as const

interface ResourceRow {
  readonly name: string
  readonly transfer: number
  readonly encoded: number
  readonly decoded: number
  readonly durationMs: number
  readonly startMs: number
}

interface Sample {
  readonly scenario: string
  readonly ms: number
  readonly metrics: Record<string, number | null>
  readonly resources: readonly ResourceRow[]
  readonly totals: { transfer: number; encoded: number; decoded: number }
  readonly error?: string
}

interface ProductReport {
  readonly product: string
  readonly commit: string
  readonly browser: string
  readonly viewport: string
  readonly samples: readonly Sample[]
  readonly medians: Record<string, Record<string, number | null>>
  readonly stability: Record<string, string>
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * Serves a built product with real Brotli compression and cache headers.
 *
 * Compression matters: measuring `transferSize` against an uncompressed server
 * reports bytes no user ever downloads. Compression is cached per file because
 * Brotli on the 2.2 MB Babel chunk is slow enough to distort the first request's
 * timing if it happened inline.
 */
async function serve(
  dir: string,
  options: { readonly immutable: boolean },
): Promise<{
  origin: string
  close: () => Promise<void>
}> {
  const compressed = new Map<string, Buffer>()
  const encode = (file: string, body: Buffer): Buffer => {
    let cached = compressed.get(file)
    if (!cached) {
      cached = zlib.brotliCompressSync(body)
      compressed.set(file, cached)
    }
    return cached
  }

  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]!)
    let file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath)
    if (!isFile(file)) file = path.join(dir, 'index.html')
    let body: Buffer
    try {
      body = readFileSync(file)
    } catch {
      response.statusCode = 404
      response.end('not found')
      return
    }
    response.setHeader(
      'Content-Type',
      MIME[path.extname(file)] ?? 'application/octet-stream',
    )
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    response.setHeader(
      'Cache-Control',
      options.immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    )
    const accept = String(request.headers['accept-encoding'] ?? '')
    if (accept.includes('br')) {
      const encoded = encode(file, body)
      response.setHeader('Content-Encoding', 'br')
      response.setHeader('Content-Length', encoded.length)
      response.end(encoded)
      return
    }
    response.setHeader('Content-Length', body.length)
    response.end(body)
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('no port')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

/** Applies a CDP network profile for the lifetime of one context. */
async function applyThrottle(
  context: BrowserContext,
  page: Page,
  profile: (typeof THROTTLE)[keyof typeof THROTTLE],
): Promise<void> {
  if (!profile) return
  const client = await context.newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latencyMs,
    downloadThroughput: profile.downloadBps,
    uploadThroughput: profile.uploadBps,
  })
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

/**
 * Reports how much the samples disagree.
 *
 * A wide spread means the number should not be read as a product property. The
 * ratio is `(p90 - p10) / median`; above 0.5 the report calls the scenario
 * unstable rather than presenting the median as if it were precise.
 */
function stabilityOf(values: readonly number[]): string {
  if (values.length < 3) return 'too few samples'
  const sorted = [...values].sort((a, b) => a - b)
  const p10 = sorted[Math.floor(sorted.length * 0.1)]!
  const p90 = sorted[Math.floor(sorted.length * 0.9)]!
  const mid = median(values)
  if (mid === 0) return 'zero median'
  const spread = (p90 - p10) / mid
  return spread > 0.5
    ? `unstable (spread ${(spread * 100).toFixed(0)}%)`
    : `stable (spread ${(spread * 100).toFixed(0)}%)`
}

/** Collects every same-origin resource with its real transfer and decode cost. */
async function collectResources(
  page: Page,
  origin: string,
): Promise<ResourceRow[]> {
  return page.evaluate(currentOrigin => {
    return performance
      .getEntriesByType('resource')
      .filter(entry => entry.name.startsWith(currentOrigin))
      .map(entry => {
        const resource = entry as PerformanceResourceTiming
        return {
          name: new URL(resource.name).pathname,
          transfer: resource.transferSize,
          encoded: resource.encodedBodySize,
          decoded: resource.decodedBodySize,
          durationMs: resource.duration,
          startMs: resource.startTime,
        }
      })
  }, origin)
}

function totalsOf(resources: readonly ResourceRow[]) {
  return resources.reduce(
    (accumulator, resource) => ({
      transfer: accumulator.transfer + resource.transfer,
      encoded: accumulator.encoded + resource.encoded,
      decoded: accumulator.decoded + resource.decoded,
    }),
    { transfer: 0, encoded: 0, decoded: 0 },
  )
}

/**
 * Measures the Playground.
 *
 * Milestones are taken from the page's own readiness signals rather than from
 * selectors where possible, so the measurement describes the product's state
 * machine rather than an incidental DOM detail.
 */
async function measurePlayground(
  page: Page,
  origin: string,
  scenario: Scenario,
): Promise<{
  metrics: Record<string, number | null>
  resources: ResourceRow[]
}> {
  const started = Date.now()
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })

  const metrics: Record<string, number | null> = {}
  const mark = async (
    key: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    try {
      await action()
      metrics[key] = Date.now() - started
    } catch {
      metrics[key] = null
    }
  }

  await mark('firstEditableMs', () =>
    page.waitForSelector('.cm-content[contenteditable="true"]', {
      timeout: 45_000,
    }),
  )
  await mark('firstPreviewMs', () =>
    page.waitForFunction(
      () => window.__zeusPlayground?.getState().previewReady === true,
      null,
      { timeout: 60_000 },
    ),
  )

  // The Output tab is where syntax highlighting loads; it is not the initial
  // tab, which is the point of the lazy chunk.
  await mark('firstOutputMs', async () => {
    await page.getByRole('tab', { name: /output/i }).click()
    await page.waitForSelector(
      '[data-testid="dom-output"][data-highlighted="true"]',
      {
        timeout: 30_000,
      },
    )
  })

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    return {
      domContentLoadedMs: entry?.domContentLoadedEventEnd ?? null,
      loadMs: entry?.loadEventEnd ?? null,
    }
  })
  Object.assign(metrics, navigation)

  // A compile is only meaningful after an edit; measure the round trip.
  const beforeSequence = await page.evaluate(
    () => window.__zeusPlayground?.getState().buildSequence ?? 0,
  )
  await mark('editToPreviewMs', async () => {
    await page.evaluate(() => {
      window.__zeusPlayground!.setSource(
        `import { render, createSignal } from '@zeus-js/zeus'\nconst [n, setN] = createSignal(0)\nfunction App() { return <button onClick={() => setN(n() + 1)}>n={n()}</button> }\nrender(() => <App />, document.querySelector('#root')!)`,
      )
    })
    await page.waitForFunction(
      previous =>
        window.__zeusPlayground!.getState().buildSequence > previous &&
        window.__zeusPlayground!.getState().previewReady === true,
      beforeSequence,
      { timeout: 60_000 },
    )
  })

  return { metrics, resources: await collectResources(page, origin) }
}

/**
 * Measures Admin.
 *
 * The login page is measured before authenticating, because that is the first
 * thing an unauthenticated visitor pays for. Everything after login is measured
 * through navigation, which is what the route-level code splitting question is
 * about.
 */
async function measureAdmin(
  page: Page,
  origin: string,
  scenario: Scenario,
): Promise<{
  metrics: Record<string, number | null>
  resources: ResourceRow[]
}> {
  const started = Date.now()
  const metrics: Record<string, number | null> = {}
  const mark = async (
    key: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    try {
      await action()
      metrics[key] = Date.now() - started
    } catch {
      metrics[key] = null
    }
  }

  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
  await mark('loginInteractiveMs', () =>
    page.getByTestId('login-card').waitFor({ timeout: 30_000 }),
  )
  const loginResources = await collectResources(page, origin)

  await mark('dashboardMs', async () => {
    await page.locator('#login-email').fill('ada@example.test')
    await page.locator('#login-password').fill(ADMIN_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.getByTestId('admin-layout').waitFor({ timeout: 30_000 })
    await page.getByTestId('overview-page').waitFor({ timeout: 30_000 })
  })

  await mark('usersPageMs', async () => {
    await page
      .getByRole('link', { name: /^users$/i })
      .first()
      .click()
    await page.getByTestId('users-page').waitFor({ timeout: 30_000 })
  })

  await mark('dataGridInteractiveMs', async () => {
    // The DataGrid is a custom element registered by its own WebC entry chunk,
    // so it has no `<tbody>`: rows carry `data-slot="data-grid-row"`. The first
    // row appearing is the proof that the chunk arrived, the element upgraded
    // and the query result was rendered into it.
    await page
      .locator('[data-testid="user-grid"] [data-slot="data-grid-row"]')
      .first()
      .waitFor({ timeout: 30_000 })
  })

  await mark('navigateBackMs', async () => {
    // The shell renders the same destinations twice (sidebar and top bar), so
    // `.first()` alone can pick the one behind the collapsed sidebar. Wait for
    // a visible one rather than whichever happens to be first in the DOM.
    const overview = page.getByRole('link', { name: /^overview$/i })
    const visible = overview.filter({ visible: true }).first()
    await visible.click({ timeout: 15_000 })
    await page.getByTestId('overview-page').waitFor({ timeout: 30_000 })
  })

  const afterLogin = await collectResources(page, origin)
  // Everything loaded after authentication is what navigation cost.
  const loginPaths = new Set(loginResources.map(resource => resource.name))
  const navigationOnly = afterLogin.filter(
    resource => !loginPaths.has(resource.name),
  )

  metrics.loginTransferBytes = totalsOf(loginResources).transfer
  metrics.navigationTransferBytes = totalsOf(navigationOnly).transfer
  metrics.allTransferBytes = totalsOf(afterLogin).transfer

  return { metrics, resources: afterLogin }
}

async function runScenario(
  browser: Browser,
  product: 'playground' | 'admin',
  origin: string,
  scenario: Scenario,
  sampleIndex: number,
): Promise<Sample> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    // Every cold sample must start with an empty HTTP cache. Without this the
    // browser's in-memory cache carries the previous sample's responses into
    // the next one, and a "cold" figure that is really warm is worse than no
    // figure: it hides the download that a first-time visitor pays.
    bypassCSP: false,
  })
  if (scenario.cache === 'cold') {
    // `newContext` already has an empty cache; this records the intent and
    // keeps the guarantee explicit if the context is ever reused.
    await context.clearCookies()
  }
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await applyThrottle(context, page, THROTTLE[scenario.throttle])
    const measured =
      product === 'playground'
        ? await measurePlayground(page, origin, scenario)
        : await measureAdmin(page, origin, scenario)

    // A warm sample reloads in the same context, so the HTTP cache applies.
    if (scenario.cache === 'warm') {
      const warmStart = Date.now()
      await page.reload({ waitUntil: 'domcontentloaded' })
      if (product === 'playground') {
        await page
          .waitForSelector('.cm-content[contenteditable="true"]', {
            timeout: 45_000,
          })
          .catch(() => {})
        measured.metrics.firstEditableMs = Date.now() - warmStart
      } else {
        await page
          .getByTestId('admin-layout')
          .waitFor({ timeout: 30_000 })
          .catch(() => {})
        measured.metrics.loginInteractiveMs = Date.now() - warmStart
      }
      measured.resources = await collectResources(page, origin)
    }

    return {
      scenario: scenario.name,
      ms: sampleIndex,
      metrics: measured.metrics,
      resources: measured.resources,
      totals: totalsOf(measured.resources),
      ...(errors.length > 0 ? { error: errors.slice(0, 3).join(' | ') } : {}),
    }
  } catch (error) {
    return {
      scenario: scenario.name,
      ms: sampleIndex,
      metrics: {},
      resources: [],
      totals: { transfer: 0, encoded: 0, decoded: 0 },
      error:
        error instanceof Error ? error.message.split('\n')[0] : String(error),
    }
  } finally {
    await context.close()
  }
}

/**
 * Aggregates samples into medians, discarding the first as a warm-up.
 *
 * The first sample of a scenario pays costs the others do not: the browser has
 * never run this page's JavaScript before, so the JIT has not warmed, and on
 * the Playground the first compile also downloads and instantiates the 1.5 MB
 * wasm compiler. On this machine that made the first cold sample 9,042 ms
 * against 315 and 277 for the two after it — a spread of 2,783% that made the
 * median meaningless.
 *
 * That first number is real and worth knowing, but it belongs in its own column
 * rather than being averaged into a figure that claims to describe the steady
 * state. `firstSample` keeps it; the median describes the rest. A scenario with
 * fewer than two remaining samples has no median, and says so.
 */
function aggregate(samples: readonly Sample[]): {
  medians: Record<string, Record<string, number | null>>
  stability: Record<string, string>
} {
  const medians: Record<string, Record<string, number | null>> = {}
  const stability: Record<string, string> = {}
  const byScenario = new Map<string, Sample[]>()
  for (const sample of samples) {
    const list = byScenario.get(sample.scenario) ?? []
    list.push(sample)
    byScenario.set(sample.scenario, list)
  }
  for (const [all, list] of byScenario) {
    const scenario = all
    // Drop the warm-up sample; keep it in the JSON under `samples`.
    const usable = list.length > 1 ? list.slice(1) : list
    const keys = new Set<string>()
    for (const sample of usable)
      for (const key of Object.keys(sample.metrics)) keys.add(key)
    const row: Record<string, number | null> = {}
    let slowest: { key: string; spread: string } | undefined
    for (const key of keys) {
      const values = usable
        .map(sample => sample.metrics[key])
        .filter((value): value is number => typeof value === 'number')
      row[key] = values.length > 0 ? Math.round(median(values)) : null
      const spread = stabilityOf(values)
      if (!slowest && spread.startsWith('unstable')) slowest = { key, spread }
    }
    medians[scenario] = row
    stability[scenario] = slowest
      ? `${slowest.key}: ${slowest.spread}`
      : usable.length < 2
        ? 'too few samples to judge'
        : 'stable'
  }
  return { medians, stability }
}

function renderMarkdown(reports: readonly ProductReport[]): string {
  const lines: string[] = []
  lines.push('# Phase P10 front-end baseline')
  lines.push('')
  lines.push(
    'Measured by `scripts/perf/measure-frontend-baseline.ts`. Every figure is a',
    '**median of the samples listed**, taken on one machine, one browser, one',
    'viewport. This is a comparison document, not a CI gate: a number from one',
    'laptop is not a threshold for another machine.',
  )
  lines.push('')
  for (const report of reports) {
    lines.push(`## ${report.product}`)
    lines.push('')
    lines.push(`- commit: \`${report.commit}\``)
    lines.push(`- browser: ${report.browser}, viewport ${report.viewport}`)
    lines.push(
      `- samples per scenario: ${new Set(report.samples.map(s => s.scenario)).size} scenarios`,
    )
    lines.push('')
    lines.push('| scenario | metric | median (ms) | stability |')
    lines.push('| --- | --- | ---: | --- |')
    for (const [scenario, row] of Object.entries(report.medians)) {
      for (const [metric, value] of Object.entries(row)) {
        if (metric.endsWith('Bytes')) continue
        lines.push(
          `| ${scenario} | ${metric} | ${value ?? '—'} | ${report.stability[scenario] ?? ''} |`,
        )
      }
    }
    lines.push('')
    lines.push('### Transfer vs decode (median of samples)')
    lines.push('')
    lines.push('| scenario | transfer KiB | encoded KiB | decoded KiB |')
    lines.push('| --- | ---: | ---: | ---: |')
    for (const scenario of Object.keys(report.medians)) {
      const list = report.samples.filter(sample => sample.scenario === scenario)
      if (list.length === 0) continue
      const transfer = median(list.map(sample => sample.totals.transfer))
      const encoded = median(list.map(sample => sample.totals.encoded))
      const decoded = median(list.map(sample => sample.totals.decoded))
      lines.push(
        `| ${scenario} | ${(transfer / 1024).toFixed(1)} | ${(encoded / 1024).toFixed(1)} | ${(decoded / 1024).toFixed(1)} |`,
      )
    }
    lines.push('')
    const failures = report.samples.filter(sample => sample.error)
    if (failures.length > 0) {
      lines.push('### Samples that failed')
      lines.push('')
      for (const failure of failures) {
        lines.push(`- ${failure.scenario}: ${failure.error}`)
      }
      lines.push('')
    }
  }
  return `${lines.join('\n')}\n`
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      product: { type: 'string' },
      samples: { type: 'string' },
      out: { type: 'string' },
      summary: { type: 'string' },
    },
  })
  const products: Array<'playground' | 'admin'> =
    values.product === 'playground' || values.product === 'admin'
      ? [values.product]
      : ['playground', 'admin']
  const sampleCount = Number(values.samples ?? '5')
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new Error(
      `--samples must be a positive integer (got "${values.samples}")`,
    )
  }
  const outFile = path.resolve(values.out ?? 'temp/p10/frontend-baseline.json')

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()

  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const reports: ProductReport[] = []
  try {
    for (const product of products) {
      const dist = product === 'playground' ? playgroundDist : adminDist
      try {
        await fs.access(path.join(dist, 'index.html'))
      } catch {
        throw new Error(
          `${product} is not built. Run: pnpm --filter @zeus-js/example-${product === 'playground' ? 'playground-editor' : 'admin'} build`,
        )
      }

      // Playground is static; Admin needs its API server.
      let origin: string
      let close: () => Promise<void>
      let adminServer: Awaited<ReturnType<typeof startAdminServer>> | undefined
      if (product === 'playground') {
        const served = await serve(dist, { immutable: true })
        origin = served.origin
        close = served.close
      } else {
        const databaseFile = path.join(root, 'temp/p10/admin.sqlite')
        await fs.mkdir(path.dirname(databaseFile), { recursive: true })
        adminServer = await startAdminServer({
          port: 0,
          databaseFile,
          staticDir: dist,
          adminPassword: ADMIN_PASSWORD,
          viewerPassword: VIEWER_PASSWORD,
          seedDemoUsers: true,
          bootstrap: true,
        })
        origin = adminServer.origin
        close = async () => {
          await adminServer?.close()
        }
      }

      const samples: Sample[] = []
      try {
        for (const scenario of SCENARIOS) {
          for (let index = 0; index < sampleCount; index += 1) {
            process.stderr.write(
              `[${product}] ${scenario.name} sample ${index + 1}/${sampleCount}\r`,
            )
            samples.push(
              await runScenario(browser, product, origin, scenario, index),
            )
          }
        }
      } finally {
        await close()
      }
      process.stderr.write('\n')

      const { medians, stability } = aggregate(samples)
      reports.push({
        product,
        commit,
        browser: `chromium ${browser.version()}`,
        viewport: '1440x900',
        samples,
        medians,
        stability,
      })
      void adminServer
    }
  } finally {
    await browser.close()
  }

  const document = {
    schema: 'zeus.frontend-baseline/v1',
    generatedFor: commit,
    reports,
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, `${JSON.stringify(document, null, 1)}\n`)
  const markdown = renderMarkdown(reports)
  await fs.writeFile(outFile.replace(/\.json$/, '.md'), markdown)
  if (values.summary) await fs.appendFile(values.summary, `\n${markdown}`)

  console.log(markdown)
  console.log(
    `wrote ${path.relative(root, outFile)} with ${reports.length} product report(s)`,
  )
}

void main().catch(error => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  )
  process.exitCode = 1
})
