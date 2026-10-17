// scripts/bench/component-host-runtime.ts

import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import puppeteer from 'puppeteer'

import { buildComponentHostFixture } from './component-host-build'
import { componentHostBenchConfig } from './component-host-config'

import type { Browser } from 'puppeteer'

export interface RuntimeBenchEntry {
  name: string
  ms: number
}

export const FIRST_INTERACTION_METRIC = 'wc.firstInteraction.z-bench-button'

export async function runComponentHostRuntimeBench(): Promise<
  RuntimeBenchEntry[]
> {
  let browser: Browser | null = null
  let server: Awaited<ReturnType<typeof createStaticServer>> | null = null

  try {
    try {
      browser = await findBrowser()
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : ''
      throw new Error(
        '[runtime] Chrome could not be started' +
          reason +
          '. Install Chrome or run: npx puppeteer browsers install chrome',
      )
    }

    if (!browser) {
      throw new Error(
        '[runtime] Chrome not found. Install Chrome or run: npx puppeteer browsers install chrome',
      )
    }

    buildComponentHostFixture('all')

    const dist = componentHostBenchConfig.dist

    const jsFiles = (await collectJsFiles(dist)).map(f => f.replace(/\\/g, '/'))
    const runtimeDom = jsFiles.find(f => f.includes('runtime-dom'))
    const wcAll = jsFiles.find(f => f.includes('/assets/wc-all-'))
    const wcShadowAll = jsFiles.find(f => f.includes('/assets/wc-shadow-all-'))
    const wcNested = jsFiles.find(f => f.includes('/assets/wc-nested-'))

    if (!runtimeDom || !wcAll || !wcShadowAll || !wcNested) {
      throw new Error(
        `[runtime] missing: runtimeDom=${!!runtimeDom}, wcAll=${!!wcAll}, wcShadowAll=${!!wcShadowAll}, wcNested=${!!wcNested}`,
      )
    }

    const toSrc = (f: string) =>
      '/' + path.relative(dist, f).replace(/\\/g, '/')
    const runtimeDomSrc = toSrc(runtimeDom)
    const wcAllSrc = toSrc(wcAll)
    const wcShadowAllSrc = toSrc(wcShadowAll)
    const wcNestedSrc = toSrc(wcNested)

    await fs.writeFile(
      path.join(dist, 'runtime.html'),
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/component-host.css" />
    <script type="module" src="${runtimeDomSrc}"></script>
    <script type="module" src="${wcAllSrc}"></script>
    <script type="module" src="${wcShadowAllSrc}"></script>
    <script type="module" src="${wcNestedSrc}"></script>
    <script type="module" src="/__bench_runner.js"></script>
  </head>
  <body></body>
</html>
`,
    )
    await fs.writeFile(path.join(dist, '__bench_runner.js'), buildRunner())
    await fs.writeFile(
      path.join(dist, 'runtime-cold.html'),
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script>
      window.__BENCH_FIRST_INTERACTION_STARTED_AT__ = performance.now();
      window.__BENCH_CSS_READY__ = new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/component-host.css';
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', reject, { once: true });
        document.head.appendChild(link);
      });
    </script>
    <script type="module">
      try {
        await window.__BENCH_CSS_READY__;
        const { defineCustomElement } = await import('/wc/z-bench-button.js');
        defineCustomElement();
        window.__BENCH_COLD_REGISTERED__ = true;
      } catch (error) {
        window.__BENCH_COLD_ERROR__ = String(error?.message ?? error);
      }
    </script>
  </head>
  <body></body>
</html>
`,
    )

    server = await createStaticServer(componentHostBenchConfig.dist)

    const firstInteraction = await runFirstInteractionBench(browser, server.url)

    const page = await browser.newPage()

    const consoleLogs: string[] = []
    page.on('console', msg => {
      consoleLogs.push(`[puppeteer] ${msg.type()}: ${msg.text()}`)
    })

    await page.goto(`${server.url}/runtime.html`, {
      waitUntil: 'load',
    })

    await page
      .waitForFunction(
        () =>
          (window as unknown as Record<string, unknown>).__BENCH_RESULTS__ !==
          undefined,
        { timeout: 30000 },
      )
      .catch(err => {
        console.error(`  [runtime] failed: ${err.message}`)
        console.error(`  console logs: ${consoleLogs.join(' | ') || 'none'}`)
        throw err
      })

    const raw = await page.evaluate(() => {
      const r = (window as unknown as Record<string, unknown>).__BENCH_RESULTS__
      return {
        results: r,
        err: (window as unknown as Record<string, unknown>).__bench_err,
      }
    })

    if (!raw.results || (raw.results as unknown[]).length === 0) {
      throw new Error(
        `[runtime] empty results. Window state: ${JSON.stringify(raw)}`,
      )
    }

    if (raw.err) {
      throw new Error(`[runtime] runner failed: ${String(raw.err)}`)
    }

    const results = validateRuntimeBenchResults(raw.results)
    const combined = requireRuntimeBenchResults([firstInteraction, ...results])
    console.log(`  [runtime] got ${combined.length} entries`)
    return combined
  } finally {
    try {
      if (browser) await browser.close()
    } finally {
      if (server) await server.close()
    }
  }
}

async function runFirstInteractionBench(
  browser: Browser,
  serverUrl: string,
): Promise<RuntimeBenchEntry> {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)

  const consoleLogs: string[] = []
  page.on('console', msg => {
    consoleLogs.push(`[puppeteer] ${msg.type()}: ${msg.text()}`)
  })

  try {
    await page.goto(`${serverUrl}/runtime-cold.html`, {
      waitUntil: 'load',
    })

    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>)
          .__BENCH_COLD_REGISTERED__ === true ||
        (window as unknown as Record<string, unknown>).__BENCH_COLD_ERROR__ !==
          undefined,
      { timeout: 30000 },
    )

    const target = await page.evaluate(async () => {
      const state = window as unknown as Record<string, unknown>
      if (state.__BENCH_COLD_ERROR__) {
        throw new Error(String(state.__BENCH_COLD_ERROR__))
      }
      if (state.__BENCH_COLD_REGISTERED__ !== true) {
        throw new Error('z-bench-button lazy registration did not complete')
      }

      const startedAt = state.__BENCH_FIRST_INTERACTION_STARTED_AT__
      if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) {
        throw new Error('first interaction timer was not initialized')
      }
      const element = document.createElement(
        'z-bench-button',
      ) as HTMLElement & {
        componentOnReady?: () => Promise<HTMLElement>
      }
      if (typeof element.componentOnReady !== 'function') {
        throw new Error('z-bench-button does not expose componentOnReady()')
      }

      state.__BENCH_FIRST_INTERACTION__ = new Promise<RuntimeBenchEntry>(
        (resolve, reject) => {
          const timeout = window.setTimeout(() => {
            reject(new Error('first click handler did not fire within 30s'))
          }, 30000)

          element.addEventListener(
            'press',
            event => {
              const nativeEvent = (
                event as CustomEvent<{ nativeEvent?: MouseEvent }>
              ).detail?.nativeEvent
              if (!nativeEvent?.isTrusted) {
                window.clearTimeout(timeout)
                reject(new Error('first click was not a trusted browser click'))
                return
              }

              window.clearTimeout(timeout)
              resolve({
                name: 'wc.firstInteraction.z-bench-button',
                ms: Math.round((performance.now() - startedAt) * 100) / 100,
              })
            },
            { once: true },
          )
        },
      )

      document.body.appendChild(element)
      await element.componentOnReady()

      const button = element.querySelector('button')
      if (!button) {
        throw new Error('z-bench-button did not render its native button')
      }

      const rect = button.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        throw new Error('z-bench-button native button has no clickable area')
      }

      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    })

    await page.mouse.click(target.x, target.y)

    const entry = await page.evaluate(() => {
      const promise = (window as unknown as Record<string, unknown>)[
        '__BENCH_FIRST_INTERACTION__'
      ] as Promise<RuntimeBenchEntry> | undefined
      if (!promise) {
        throw new Error('first interaction measurement was not initialized')
      }
      return promise
    })

    return requireRuntimeBenchResults([entry])[0]!
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[runtime] first interaction benchmark failed: ${reason}. Console logs: ${consoleLogs.join(' | ') || 'none'}`,
    )
  } finally {
    await page.close()
  }
}

export function requireRuntimeBenchResults(
  value: unknown,
): RuntimeBenchEntry[] {
  const results = validateRuntimeBenchResults(value)

  if (!results.some(result => result.name === FIRST_INTERACTION_METRIC)) {
    throw new Error(
      `[runtime] required metric ${FIRST_INTERACTION_METRIC} is missing`,
    )
  }

  return results
}

function validateRuntimeBenchResults(value: unknown): RuntimeBenchEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('[runtime] benchmark returned no results')
  }

  const results = value as RuntimeBenchEntry[]
  for (const result of results) {
    if (
      !result ||
      typeof result.name !== 'string' ||
      !result.name ||
      typeof result.ms !== 'number' ||
      !Number.isFinite(result.ms) ||
      result.ms < 0
    ) {
      throw new Error('[runtime] benchmark returned an invalid result entry')
    }
  }

  return results
}

async function findBrowser(): Promise<Browser | null> {
  try {
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  } catch {
    const executablePath = findSystemBrowser()
    if (!executablePath) return null

    try {
      return await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    } catch {
      return null
    }
  }
}

function findSystemBrowser(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && existsSync(candidate),
  )
}

function buildRunner(): string {
  return `(async () => {
  try {
    console.log('[bench] runner started');
    await new Promise(r => setTimeout(r, 100));
    console.log('[bench] runner continuing after delay');

    const round = (value) => Math.round(value * 100) / 100;
    function measure(name, fn) {
      const start = performance.now();
      fn();
      return { name, ms: round(performance.now() - start) };
    }
    const results = [];

    // Light DOM (baseline)
    results.push(measure('wc.mount.1000', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      for (let i = 0; i < 1000; i++) {
        const el = document.createElement('z-bench-counter');
        el.count = i;
        root.appendChild(el);
      }
      root.remove();
    }));

    {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const els = [];
      for (let i = 0; i < 1000; i++) {
        const el = document.createElement('z-bench-counter');
        container.appendChild(el);
        els.push(el);
      }
      results.push(measure('wc.propUpdate.1000', () => {
        for (let i = 0; i < els.length; i++) els[i].count = i + 1;
      }));
      container.remove();
    }

    {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const els = [];
      for (let i = 0; i < 1000; i++) {
        const el = document.createElement('z-bench-counter');
        container.appendChild(el);
        els.push(el);
      }
      results.push(measure('wc.attributeUpdate.1000', () => {
        for (let i = 0; i < els.length; i++) els[i].setAttribute('count', String(i + 2));
      }));
      container.remove();
    }

    {
      const btn = document.createElement('z-bench-button');
      document.body.appendChild(btn);
      results.push(measure('wc.click.1000', () => {
        for (let i = 0; i < 1000; i++) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }));
      btn.remove();
    }

    {
      const root = document.createElement('div');
      document.body.appendChild(root);
      results.push(measure('wc.slotProjection.100', () => {
        for (let i = 0; i < 100; i++) {
          const card = document.createElement('z-bench-card');
          const header = document.createElement('span');
          header.setAttribute('slot', 'header');
          header.textContent = 'H';
          const body = document.createElement('span');
          body.textContent = 'B';
          const footer = document.createElement('span');
          footer.setAttribute('slot', 'footer');
          footer.textContent = 'F';
          card.appendChild(header);
          card.appendChild(body);
          card.appendChild(footer);
          root.appendChild(card);
        }
      }));
      root.remove();
    }

    // Shadow DOM
    results.push(measure('wc-shadow.mount.1000', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      for (let i = 0; i < 1000; i++) {
        const el = document.createElement('z-bench-counter-shadow');
        el.count = i;
        root.appendChild(el);
      }
      root.remove();
    }));

    {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const els = [];
      for (let i = 0; i < 1000; i++) {
        const el = document.createElement('z-bench-counter-shadow');
        container.appendChild(el);
        els.push(el);
      }
      results.push(measure('wc-shadow.propUpdate.1000', () => {
        for (let i = 0; i < els.length; i++) els[i].count = i + 1;
      }));
      container.remove();
    }

    {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const els = [];
      for (let i = 0; i < 1000; i++) {
        const el = document.createElement('z-bench-counter-shadow');
        container.appendChild(el);
        els.push(el);
      }
      results.push(measure('wc-shadow.attributeUpdate.1000', () => {
        for (let i = 0; i < els.length; i++) els[i].setAttribute('count', String(i + 2));
      }));
      container.remove();
    }

    {
      const btn = document.createElement('z-bench-button-shadow');
      document.body.appendChild(btn);
      results.push(measure('wc-shadow.click.1000', () => {
        for (let i = 0; i < 1000; i++) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }));
      btn.remove();
    }

    {
      const root = document.createElement('div');
      document.body.appendChild(root);
      results.push(measure('wc-shadow.slotProjection.100', () => {
        for (let i = 0; i < 100; i++) {
          const card = document.createElement('z-bench-card-shadow');
          const header = document.createElement('span');
          header.setAttribute('slot', 'header');
          header.textContent = 'H';
          const body = document.createElement('span');
          body.textContent = 'B';
          const footer = document.createElement('span');
          footer.setAttribute('slot', 'footer');
          footer.textContent = 'F';
          card.appendChild(header);
          card.appendChild(body);
          card.appendChild(footer);
          root.appendChild(card);
        }
      }));
      root.remove();
    }

    // Nested
    results.push(measure('wc-nested.mountNested.100', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      for (let i = 0; i < 100; i++) {
        const el = document.createElement('z-bench-nested');
        el.depth = 3;
        el.leafCount = 4;
        root.appendChild(el);
      }
      root.remove();
    }));

    results.push(measure('wc-nested.mountNestedLeaf.500', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      for (let i = 0; i < 500; i++) {
        const el = document.createElement('z-bench-nested-leaf');
        root.appendChild(el);
      }
      root.remove();
    }));

    {
      const root = document.createElement('div');
      document.body.appendChild(root);
      results.push(measure('wc-nested.slotProjection.100', () => {
        for (let i = 0; i < 100; i++) {
          const host = document.createElement('z-bench-card');
          const header = document.createElement('span');
          header.setAttribute('slot', 'header');
          header.textContent = 'H' + i;
          const body = document.createElement('span');
          body.textContent = 'B' + i;
          const footer = document.createElement('span');
          footer.setAttribute('slot', 'footer');
          footer.textContent = 'F' + i;
          host.appendChild(header);
          host.appendChild(body);
          host.appendChild(footer);
          root.appendChild(host);
        }
      }));
      root.remove();
    }

    {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const els = [];
      for (let i = 0; i < 50; i++) {
        const el = document.createElement('z-bench-nested');
        el.depth = 3;
        el.leafCount = 4;
        container.appendChild(el);
        els.push(el);
      }
      results.push(measure('wc-nested.propUpdateNested.50', () => {
        for (let i = 0; i < els.length; i++) els[i].depth = 4;
      }));
      container.remove();
    }

    (window).__BENCH_RESULTS__ = results;
    console.log('[bench] runner done, results:', results.length);
  } catch (err) {
    console.error('[bench] runner error:', err?.message ?? err);
    (window).__BENCH_RESULTS__ = [];
    (window).__bench_err = String(err?.message ?? err);
  }
})();
`
}

async function createStaticServer(root: string): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(req.url?.split('?')[0] ?? '/')
    const safePath = pathname === '/' ? '/runtime.html' : pathname
    const file = path.join(root, safePath)

    try {
      const content = await fs.readFile(file)
      res.writeHead(200, { 'content-type': getContentType(file) })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start static server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

function getContentType(file: string): string {
  if (file.endsWith('.html')) return 'text/html'
  if (file.endsWith('.js')) return 'text/javascript'
  if (file.endsWith('.css')) return 'text/css'
  return 'application/octet-stream'
}

async function collectJsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(full)))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full)
    }
  }
  return files
}
