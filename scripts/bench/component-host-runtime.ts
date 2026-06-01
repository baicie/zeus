// scripts/bench/component-host-runtime.ts

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

export async function runComponentHostRuntimeBench(): Promise<
  RuntimeBenchEntry[]
> {
  const browser = await findBrowser()
  if (!browser) {
    console.warn(
      '  [runtime] Chrome not found, skipping browser benchmarks. ' +
        'Install Chrome or run: npx puppeteer browsers install chrome',
    )
    return []
  }

  buildComponentHostFixture('all')

  const dist = componentHostBenchConfig.dist

  const jsFiles = await collectJsFiles(dist)
  const runtimeDom = jsFiles.find(f => f.includes('runtime-dom'))
  const wcAll = jsFiles.find(f => f.includes('/assets/wc-all-'))
  const wcShadowAll = jsFiles.find(f => f.includes('/assets/wc-shadow-all-'))
  const wcNested = jsFiles.find(f => f.includes('/assets/wc-nested-'))

  if (!runtimeDom || !wcAll || !wcShadowAll || !wcNested) {
    throw new Error(
      `[runtime] missing: runtimeDom=${!!runtimeDom}, wcAll=${!!wcAll}, wcShadowAll=${!!wcShadowAll}, wcNested=${!!wcNested}`,
    )
  }

  const toSrc = (f: string) => '/' + path.relative(dist, f).replace(/\\/g, '/')
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

  const server = await createStaticServer(componentHostBenchConfig.dist)

  try {
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
      console.error(
        `  [runtime] empty results. Window state: ${JSON.stringify(raw)}`,
      )
    } else {
      console.log(
        `  [runtime] got ${(raw.results as RuntimeBenchEntry[]).length} entries`,
      )
    }

    return (raw.results as RuntimeBenchEntry[]) || []
  } finally {
    await browser.close()
    await server.close()
  }
}

async function findBrowser(): Promise<Browser | null> {
  try {
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  } catch {
    return null
  }
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
