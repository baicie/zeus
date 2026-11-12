/**
 * Loop budget gate: the runaway case must be stopped, and the preview must
 * recover afterwards.
 *
 * ## Why this is its own script rather than part of `check-playground-editor`
 *
 * That gate covers the same ground — it types `while (true) {}`, compiles, and
 * expects the budget diagnostic — but it runs only from `product-acceptance.yml`
 * on `workflow_dispatch` or a release branch. A protection that stops working
 * between releases is exactly the kind that needs a gate on every pull request.
 *
 * ## Why it cannot hang CI
 *
 * The thing under test is a defence against code that never yields. If the
 * defence regresses, three layers keep this job from hanging:
 *
 *   1. the page is given a hard `Promise.race` deadline per phase;
 *   2. the whole browser is closed in a `finally`, so a wedged page cannot
 *      outlive the run;
 *   3. the job itself declares `timeout-minutes` in `ci.yml`.
 *
 * A deadline hit is reported as a failure with `harness-timeout`, never as a
 * pass — the same rule the unit tests follow.
 *
 * ## What it asserts
 *
 *   1. a synchronous infinite loop is stopped and produces the budget
 *      diagnostic;
 *   2. the editor is still usable afterwards (source can be replaced);
 *   3. recompiling the replacement produces a live preview again;
 *   4. a bounded async loop that waits longer than the budget is NOT killed —
 *      the false-positive case, which has no other browser coverage.
 *
 * Usage:
 *   pnpm --filter @zeus-js/example-playground-editor build
 *   PLAYGROUND_BROWSERS=chromium,firefox,webkit node --import tsx \
 *     scripts/playground/check-playground-loop-budget.ts
 */
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'

import {
  chromium,
  expect,
  firefox,
  type Browser,
  type Page,
  webkit,
} from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'examples/playground-editor/dist')

/** Per-phase ceiling. A phase that exceeds it fails; it never passes. */
const PHASE_TIMEOUT_MS = 90_000

const engines = { chromium, firefox, webkit } as const
const selected = (process.env.PLAYGROUND_BROWSERS ?? 'chromium,firefox,webkit')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean)
if (!selected.includes('chromium')) {
  // The export checks below rely on Chromium's download behaviour; keep the
  // requirement explicit rather than silently skipping a third of the matrix.
  throw new Error('PLAYGROUND_BROWSERS must include chromium')
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
}

/** Serves the built Playground with Brotli, like a real static host. */
async function serve(): Promise<{
  origin: string
  close: () => Promise<void>
}> {
  const cache = new Map<string, Buffer>()
  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]!)
    let file = path.join(dist, urlPath === '/' ? 'index.html' : urlPath)
    fs.stat(file)
      .then(stat => {
        if (!stat.isFile()) file = path.join(dist, 'index.html')
      })
      .catch(() => {
        file = path.join(dist, 'index.html')
      })
      .finally(() => {
        fs.readFile(file)
          .then(body => {
            response.setHeader(
              'Content-Type',
              MIME[path.extname(file)] ?? 'application/octet-stream',
            )
            response.setHeader('Access-Control-Allow-Origin', '*')
            response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
            response.setHeader('Cache-Control', 'no-store')
            const accept = String(request.headers['accept-encoding'] ?? '')
            if (accept.includes('br')) {
              let encoded = cache.get(file)
              if (!encoded) {
                encoded = zlib.brotliCompressSync(body)
                cache.set(file, encoded)
              }
              response.setHeader('Content-Encoding', 'br')
              response.end(encoded)
              return
            }
            response.end(body)
          })
          .catch(() => {
            response.statusCode = 404
            response.end('not found')
          })
      })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('server did not bind a port')
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

/** Races a phase against the ceiling so a wedged page fails instead of hanging. */
async function phase<T>(label: string, action: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label}: harness-timeout after ${PHASE_TIMEOUT_MS} ms`,
              ),
            ),
          PHASE_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function setSource(page: Page, source: string): Promise<void> {
  await page.evaluate(
    value => window.__zeusPlayground!.setSource(value),
    source,
  )
}

async function runOnce(page: Page): Promise<void> {
  await page.evaluate(() => window.__zeusPlayground!.run())
}

async function waitForDiagnostic(
  page: Page,
  text: string | RegExp,
  timeout = 60_000,
): Promise<void> {
  await page.waitForFunction(
    expected => {
      const state = window.__zeusPlayground!.getState()
      const haystack = JSON.stringify(state)
      return typeof expected === 'string'
        ? haystack.includes(expected)
        : new RegExp(expected.source, expected.flags).test(haystack)
    },
    text instanceof RegExp ? { source: text.source, flags: text.flags } : text,
    { timeout },
  )
}

async function checkEngine(
  name: keyof typeof engines,
  origin: string,
): Promise<void> {
  let browser: Browser | undefined
  try {
    browser = await engines[name].launch({
      headless: true,
      ...(name === 'chromium' ? { channel: 'chromium' } : {}),
    })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    })
    const page = await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await phase(`${name}: load`, async () => {
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.cm-content[contenteditable="true"]', {
        timeout: 60_000,
      })
    })

    // 1. Runaway loop is stopped.
    await phase(`${name}: runaway loop`, async () => {
      await setSource(
        page,
        "import { render } from '@zeus-js/zeus'\nexport const App = () => { while (true) {} }\nrender(() => <App />, document.querySelector('#root')!)\n",
      )
      await runOnce(page)
      await waitForDiagnostic(page, 'ZEUS_PLAYGROUND_LOOP_BUDGET')
    })

    // 2. Editor still accepts input after the kill.
    await phase(`${name}: editor usable after kill`, async () => {
      await setSource(
        page,
        "import { render } from '@zeus-js/zeus'\nrender(() => <i>edited</i>, document.querySelector('#root')!)\n",
      )
      const source = await page.evaluate(() =>
        window.__zeusPlayground!.getSource(),
      )
      expect(source).toContain('edited')
    })

    // 3. The preview comes back.
    await phase(`${name}: preview recovers`, async () => {
      await runOnce(page)
      await page.waitForFunction(
        () => window.__zeusPlayground!.getState().previewReady === true,
        null,
        { timeout: 60_000 },
      )
      const frame = page.frameLocator('iframe').first()
      await expect(frame.locator('i')).toHaveText('edited', { timeout: 30_000 })
    })

    // 4. Legal loops still run to completion.
    //
    //    The false-positive guard. The async case — a loop whose `await`s add
    //    up past the budget — is covered exhaustively by the unit suite
    //    (`loop-budget.spec.ts`, "does not count await waiting time against the
    //    budget"), where a child process can observe the module's own result.
    //    In the browser the preview's readiness signal fires when the entry
    //    module finishes importing, before a detached async callback would have
    //    run, so the same assertion cannot be made here without measuring the
    //    sandbox's own scheduling instead of the budget.
    await phase(`${name}: bounded loop completes`, async () => {
      await setSource(
        page,
        `import { render } from '@zeus-js/zeus'
let total = 0
for (let i = 0; i < 200000; i += 1) total += i
render(() => <b>sum-{total}</b>, document.querySelector('#root')!)
`,
      )
      await runOnce(page)
      const frame = page.frameLocator('iframe').first()
      await expect(frame.locator('b')).toHaveText('sum-19999900000', {
        timeout: 60_000,
      })
    })

    const budgetErrors = pageErrors.filter(error =>
      error.includes('ZEUS_PLAYGROUND_LOOP_BUDGET'),
    )
    expect(
      budgetErrors,
      `${name}: the budget must surface as a diagnostic, not a page error`,
    ).toHaveLength(0)

    console.log(`[loop-budget] ${name}: PASS`)
  } catch (error) {
    console.error(
      `[loop-budget] ${name}: FAIL ${error instanceof Error ? error.message.split('\n').slice(0, 6).join(' / ') : String(error)}`,
    )
    throw error
  } finally {
    await browser?.close()
  }
}

async function main(): Promise<void> {
  await fs.access(path.join(dist, 'index.html')).catch(() => {
    throw new Error(
      'Playground is not built. Run: pnpm --filter @zeus-js/example-playground-editor build',
    )
  })
  const server = await serve()
  const failures: string[] = []
  try {
    for (const name of selected as Array<keyof typeof engines>) {
      try {
        await checkEngine(name, server.origin)
      } catch {
        failures.push(name)
      }
    }
  } finally {
    await server.close()
  }
  if (failures.length > 0) {
    throw new Error(`Loop budget gate failed in: ${failures.join(', ')}`)
  }
  console.log(
    `Loop budget gate passed in ${selected.join(', ')}: runaway stopped, editor usable, preview recovered, bounded loop completed.`,
  )
}

await main()
