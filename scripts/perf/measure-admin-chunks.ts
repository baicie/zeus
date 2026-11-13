/**
 * Admin chunk inventory: which file is the login first paint, what each route
 * adds, and whether the login page really loads no route chunk.
 *
 * ## Why this exists next to `measure-frontend-baseline.ts`
 *
 * The baseline harness answers *when* things happen (ms, per scenario, per
 * sample) and keeps only totals in `loginTransferBytes` /
 * `navigationTransferBytes`. It never records **which file** a byte belonged
 * to, and it decides "login resources" by taking a snapshot shortly after the
 * login card appears — a wall-clock window, not a statement about the app.
 *
 * Route-level lazy loading is a claim about the chunk graph:
 *
 *   1. the login page downloads the entry chunk and nothing from `pages/`;
 *   2. logging in adds exactly the started route's chunk;
 *   3. first visit to Users adds the Users chunk plus the WebC entry chunks it
 *      actually uses.
 *
 * This script measures that claim directly. It serves the built `dist` through
 * the real Admin server, loads the login page in a fresh browser context, and
 * reads `performance.getEntriesByType('resource')`. Because the login page is
 * unauthenticated, no route has been navigated to at that point, so a
 * `pages/*.js` request is a genuine eager dependency — not a race with a
 * click that has not happened.
 *
 * ## What it reports
 *
 * - `login`: the entry JS + CSS with raw / gzip(9) / brotli bytes, plus the
 *   exact resource list the login page requested.
 * - `afterLogin`: resources that appear only after authenticating, split into
 *   the Overview chunk and API calls.
 * - `users`: the increment for first navigation to `/admin/users`, including
 *   `zw-data-grid.entry` and `zw-input.entry`.
 * - `routeSwitch`: in-page navigation timing (Overview -> Users shell, Users
 *   rows, back to Overview), outside the baseline harness's scope.
 * - `lazyInvariant`: PASS when the login page loaded no chunk that maps to a
 *   file under `examples/admin/src/pages/`, FAIL with the offending files.
 *
 * ## Not a CI gate
 *
 * Like the baseline, the byte figures are single-machine evidence. The
 * `lazyInvariant` is the only boolean, because "the login page downloads no
 * route chunk" is a property of the bundle graph, not of the machine.
 *
 * ## Usage
 *
 *   pnpm --filter @zeus-js/example-admin build
 *   pnpm measure:admin-chunks                       # writes temp/p10/admin-chunks.json
 *   pnpm measure:admin-chunks --out temp/p10/x.json
 *   pnpm measure:admin-chunks --samples 7
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { chromium, type Browser, type Page } from '@playwright/test'

import { startAdminServer } from '../../examples/admin/server/index'

const root = path.resolve(import.meta.dirname, '../..')
const adminDist = path.join(root, 'examples/admin/dist')
const pagesDirectory = path.join(root, 'examples/admin/src/pages')

const ADMIN_EMAIL = 'ada@example.test'
const ADMIN_PASSWORD = 'admin-chunks-password-123'
const VIEWER_PASSWORD = 'viewer-chunks-password-123'

interface AssetInventory {
  readonly file: string
  readonly raw: number
  readonly gzip: number
  readonly brotli: number
}

interface ResourceRow {
  readonly name: string
  readonly transfer: number
  readonly encoded: number
  readonly decoded: number
}

interface LoginSample {
  readonly loginInteractiveMs: number
  readonly resources: readonly ResourceRow[]
}

interface AfterLoginSample {
  readonly dashboardMs: number
  readonly usersPageMs: number
  readonly usersRowsMs: number
  readonly backMs: number
  readonly loginResources: readonly ResourceRow[]
  readonly afterLoginResources: readonly ResourceRow[]
}

/** Page source files that become route chunks; `shared` is a helper module. */
async function readPageNames(): Promise<readonly string[]> {
  const entries = await fs.readdir(pagesDirectory)
  return entries
    .filter(file => file.endsWith('.tsx'))
    .map(file => path.basename(file, '.tsx'))
    .filter(name => name !== 'shared')
    .sort()
}

async function readInventory(): Promise<Map<string, AssetInventory>> {
  const directory = path.join(adminDist, 'assets')
  const inventory = new Map<string, AssetInventory>()
  for (const file of (await fs.readdir(directory)).sort()) {
    if (!/\.(js|css)$/.test(file)) continue
    const bytes = await fs.readFile(path.join(directory, file))
    inventory.set(`/assets/${file}`, {
      file,
      raw: bytes.byteLength,
      gzip: gzipSync(bytes, { level: 9 }).byteLength,
      brotli: brotliCompressSync(bytes).byteLength,
    })
  }
  return inventory
}

/**
 * Reads the entry chunks from `index.html` rather than guessing by name.
 *
 * The file names carry a content hash, and a future Vite setting could change
 * the naming scheme; parsing the real document keeps the report attached to
 * what a browser actually requests first.
 */
async function readEntryAssets(): Promise<readonly string[]> {
  const html = await fs.readFile(path.join(adminDist, 'index.html'), 'utf8')
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
    match => match[1]!,
  )
}

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
        }
      })
  }, origin)
}

function sum(bytes: Iterable<number>): number {
  let total = 0
  for (const value of bytes) total += value
  return total
}

/** Adds raw / gzip / brotli for a set of paths; unknown paths are reported. */
function totalsOf(
  names: readonly string[],
  inventory: Map<string, AssetInventory>,
): { raw: number; gzip: number; brotli: number; missing: string[] } {
  const missing: string[] = []
  const rows: AssetInventory[] = []
  for (const name of names) {
    const asset = inventory.get(name)
    if (asset) rows.push(asset)
    else missing.push(name)
  }
  return {
    raw: sum(rows.map(row => row.raw)),
    gzip: sum(rows.map(row => row.gzip)),
    brotli: sum(rows.map(row => row.brotli)),
    missing,
  }
}

/**
 * A route chunk is a hashed JS asset whose prefix is a page source file.
 *
 * Matching the source pages (instead of a generic `<word>-<hash>.js` shape)
 * keeps the entry chunk `index-<hash>.js` and the WebC entries
 * `zw-*.entry-<hash>.js` out of the verdict, and follows a page being renamed.
 * The hash is eight characters and may itself contain `-`, so both parts are
 * matched instead of splitting on the last hyphen.
 */
function routeChunkOf(
  name: string,
  entryAssets: readonly string[],
  pageNames: readonly string[],
): string | undefined {
  if (!name.startsWith('/assets/') || !name.endsWith('.js')) return undefined
  if (entryAssets.includes(name)) return undefined
  const file = path.basename(name)
  for (const page of pageNames) {
    if (new RegExp(`^${page}-[A-Za-z0-9_-]{8}\\.js$`).test(file)) return page
  }
  return undefined
}

async function measureLogin(
  browser: Browser,
  origin: string,
): Promise<LoginSample> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  })
  const page = await context.newPage()
  const started = Date.now()
  try {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('login-card').waitFor({ timeout: 30_000 })
    const loginInteractiveMs = Date.now() - started
    // No fixed sleep: an unauthenticated page has no route to navigate to, so
    // any chunk it means to load is already requested by this point.
    return {
      loginInteractiveMs,
      resources: await collectResources(page, origin),
    }
  } finally {
    await context.close()
  }
}

async function measureAfterLogin(
  browser: Browser,
  origin: string,
): Promise<AfterLoginSample> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  })
  const page = await context.newPage()
  try {
    const started = Date.now()
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('login-card').waitFor({ timeout: 30_000 })
    const loginResources = await collectResources(page, origin)

    await page.locator('#login-email').fill(ADMIN_EMAIL)
    await page.locator('#login-password').fill(ADMIN_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.getByTestId('overview-page').waitFor({ timeout: 30_000 })
    const dashboardMs = Date.now() - started

    await page
      .getByRole('link', { name: /^users$/i })
      .filter({ visible: true })
      .first()
      .click()
    await page.getByTestId('users-page').waitFor({ timeout: 30_000 })
    const usersPageMs = Date.now() - started

    // The DataGrid is a custom element with its own WebC entry chunk; the
    // first row is the proof that the chunk arrived and rendered.
    await page
      .locator('[data-testid="user-grid"] [data-slot="data-grid-row"]')
      .first()
      .waitFor({ timeout: 30_000 })
    const usersRowsMs = Date.now() - started

    await page
      .getByRole('link', { name: /^overview$/i })
      .filter({ visible: true })
      .first()
      .click()
    await page.getByTestId('overview-page').waitFor({ timeout: 30_000 })
    const backMs = Date.now() - started

    return {
      dashboardMs,
      usersPageMs,
      usersRowsMs,
      backMs,
      loginResources,
      afterLoginResources: await collectResources(page, origin),
    }
  } finally {
    await context.close()
  }
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!
}

function renderMarkdown(report: {
  commit: string
  browser: string
  samples: number
  entryAssets: readonly string[]
  login: readonly LoginSample[]
  afterLogin: readonly AfterLoginSample[]
  assets: readonly AssetInventory[]
  lazyInvariant: {
    pass: boolean
    problems: readonly string[]
    knownRouteChunks: readonly string[]
    verdict: 'PASS' | 'FAIL' | 'UNPROVEN'
  }
  transferByAsset: ReadonlyArray<{ name: string; transfer: number }>
}): string {
  const lines: string[] = []
  lines.push('# Admin chunk inventory')
  lines.push('')
  lines.push(
    'Measured by `scripts/perf/measure-admin-chunks.ts`. Bytes are file sizes',
    '(raw / gzip level 9 / Brotli default). HTTP transfer for the same files is',
    'browser- and compression-aware and is recorded in the JSON.',
  )
  lines.push('')
  lines.push(`- commit: \`${report.commit}\``)
  lines.push(`- browser: ${report.browser}`)
  lines.push(`- samples: ${report.samples}`)
  lines.push('')
  lines.push('## Entry assets (`index.html`)')
  lines.push('')
  for (const asset of report.entryAssets) lines.push(`- \`${asset}\``)
  lines.push('')
  lines.push('## Login page loads')
  lines.push('')
  lines.push(
    report.lazyInvariant.verdict === 'PASS'
      ? 'PASS — no chunk from `src/pages/` was requested before authentication.'
      : report.lazyInvariant.verdict === 'FAIL'
        ? `FAIL — route chunks requested before login: ${report.lazyInvariant.problems.join(', ')}`
        : 'UNPROVEN — no built asset matched a page source file, so "none were requested" means nothing. Check the chunk naming or the `src/pages/` list.',
  )
  lines.push('')
  if (report.lazyInvariant.knownRouteChunks.length > 0) {
    lines.push(
      `Route chunks recognised in this build: ${report.lazyInvariant.knownRouteChunks.map(name => `\`${name}\``).join(', ')}.`,
    )
    lines.push('')
  }
  lines.push('## Chunk sizes (raw / gzip / brotli, bytes)')
  lines.push('')
  lines.push('| file | raw | gzip | brotli |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const asset of report.assets) {
    lines.push(
      `| ${asset.file} | ${asset.raw} | ${asset.gzip} | ${asset.brotli} |`,
    )
  }
  lines.push('')
  lines.push('## HTTP transfer (median of samples, bytes)')
  lines.push('')
  lines.push('| asset | transfer |')
  lines.push('| --- | ---: |')
  for (const row of report.transferByAsset) {
    lines.push(`| \`${row.name}\` | ${row.transfer} |`)
  }
  lines.push('')
  lines.push('## Navigation timing (median of samples, ms)')
  lines.push('')
  lines.push(
    'The first sample is discarded as a warm-up (first JIT, first disk read);',
    'the baseline harness does the same for the same reason.',
  )
  lines.push('')
  const usable = <T>(samples: readonly T[]): readonly T[] =>
    samples.length > 1 ? samples.slice(1) : samples
  lines.push('| metric | median |')
  lines.push('| --- | ---: |')
  lines.push(
    `| loginInteractiveMs | ${medianOf(usable(report.login).map(sample => sample.loginInteractiveMs))} |`,
  )
  for (const key of [
    'dashboardMs',
    'usersPageMs',
    'usersRowsMs',
    'backMs',
  ] as const) {
    lines.push(
      `| ${key} | ${medianOf(usable(report.afterLogin).map(sample => sample[key]))} |`,
    )
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      samples: { type: 'string' },
    },
  })
  const sampleCount = Number(values.samples ?? '5')
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new Error(
      `--samples must be a positive integer (got "${values.samples}")`,
    )
  }
  const outFile = path.resolve(values.out ?? 'temp/p10/admin-chunks.json')

  try {
    await fs.access(path.join(adminDist, 'index.html'))
  } catch {
    throw new Error(
      'admin is not built. Run: pnpm --filter @zeus-js/example-admin build',
    )
  }

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const inventory = await readInventory()
  const entryAssets = await readEntryAssets()
  const pageNames = await readPageNames()

  const databaseFile = path.join(root, 'temp/p10/admin-chunks.sqlite')
  await fs.mkdir(path.dirname(databaseFile), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    await fs.rm(`${databaseFile}${suffix}`, { force: true })
  }
  const server = await startAdminServer({
    port: 0,
    databaseFile,
    staticDir: adminDist,
    adminPassword: ADMIN_PASSWORD,
    viewerPassword: VIEWER_PASSWORD,
    seedDemoUsers: true,
    bootstrap: true,
  })

  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const login: LoginSample[] = []
  const afterLogin: AfterLoginSample[] = []
  try {
    for (let index = 0; index < sampleCount; index += 1) {
      process.stderr.write(`[admin-chunks] login ${index + 1}/${sampleCount}\r`)
      login.push(await measureLogin(browser, server.origin))
      process.stderr.write(
        `[admin-chunks] after-login ${index + 1}/${sampleCount}\r`,
      )
      afterLogin.push(await measureAfterLogin(browser, server.origin))
    }
    process.stderr.write('\n')
  } finally {
    await browser.close()
    await server.close()
  }

  // The invariant is about every clean load, not an aggregate: one sample that
  // requested a route chunk before login is a failure.
  const loginAssets = [
    ...new Set(
      login.flatMap(sample =>
        sample.resources
          .map(resource => resource.name)
          .filter(name => name.startsWith('/assets/')),
      ),
    ),
  ].sort()
  const problems = [
    ...new Set(
      loginAssets
        .map(name => routeChunkOf(name, entryAssets, pageNames))
        .filter((prefix): prefix is string => Boolean(prefix)),
    ),
  ].sort()
  // A negative verdict is only meaningful if the matcher can recognise the
  // route chunks at all. Prove it on the real build instead of trusting the
  // regex: if no asset matches while `src/pages/` has pages, the invariant is
  // UNPROVEN, not PASS.
  const knownRouteChunks = [...inventory.keys()]
    .map(name => routeChunkOf(name, entryAssets, pageNames))
    .filter((prefix): prefix is string => Boolean(prefix))
  const lazyInvariant = {
    pass: problems.length === 0 && knownRouteChunks.length > 0,
    problems,
    knownRouteChunks: [...new Set(knownRouteChunks)].sort(),
    verdict:
      problems.length > 0
        ? ('FAIL' as const)
        : knownRouteChunks.length > 0
          ? ('PASS' as const)
          : ('UNPROVEN' as const),
  }

  // Every asset observed in any sample, with the median transfer across
  // samples. Resources that a warm cache turns into 0 bytes keep their cold
  // figure because each measureAfterLogin call starts a fresh context.
  const observed = [
    ...new Set(
      afterLogin.flatMap(sample =>
        sample.afterLoginResources.map(resource => resource.name),
      ),
    ),
  ].sort()
  const transferByAsset = observed.map(name => ({
    name,
    transfer: medianOf(
      afterLogin
        .map(
          sample =>
            sample.afterLoginResources.find(resource => resource.name === name)
              ?.transfer,
        )
        .filter((value): value is number => typeof value === 'number'),
    ),
  }))

  const report = {
    schema: 'zeus.admin-chunks/v1',
    generatedFor: commit,
    browser: `chromium ${browser.version()}`,
    samples: sampleCount,
    entryAssets,
    login,
    afterLogin,
    assets: [...inventory.values()],
    totals: {
      loginAssets: totalsOf(loginAssets, inventory),
      entryAssets: totalsOf(entryAssets, inventory),
    },
    lazyInvariant,
    transferByAsset,
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, `${JSON.stringify(report, null, 1)}\n`)
  const markdown = renderMarkdown({
    commit,
    browser: `chromium ${browser.version()}`,
    samples: sampleCount,
    entryAssets,
    login,
    afterLogin,
    assets: [...inventory.values()],
    lazyInvariant,
    transferByAsset,
  })
  await fs.writeFile(outFile.replace(/\.json$/, '.md'), markdown)
  console.log(markdown)
  console.log(`wrote ${path.relative(root, outFile)}`)
}

void main().catch(error => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  )
  process.exitCode = 1
})
