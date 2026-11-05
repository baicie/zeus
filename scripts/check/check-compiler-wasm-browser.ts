// Runs the WebAssembly compiler in a module Worker in Chromium, Firefox and
// WebKit and requires every result to equal the native compiler's output.
// Build first: `pnpm --filter @zeus-js/compiler-native build:native` and
// `pnpm --filter @zeus-js/compiler-wasm build:wasm`.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

import { chromium, firefox, webkit } from '@playwright/test'

import type { TransformModuleOptions } from '../../packages/core/compiler-wasm/index'

const root = path.resolve(import.meta.dirname, '../..')
const packageDirectory = path.join(root, 'packages/core/compiler-wasm')
const output = path.join(root, 'temp/compiler-wasm')
const require = createRequire(import.meta.url)
const native = require('../../packages/core/compiler-native/index.js') as {
  transformModule(options: TransformModuleOptions): unknown
}

const files: Record<string, { type: string; body: Buffer }> = {
  '/index.js': {
    type: 'text/javascript',
    body: await fs.readFile(path.join(packageDirectory, 'index.js')),
  },
  '/worker.js': {
    type: 'text/javascript',
    body: await fs.readFile(path.join(packageDirectory, 'worker.js')),
  },
  '/zeus-compiler.wasm': {
    type: 'application/wasm',
    body: await fs.readFile(path.join(packageDirectory, 'zeus-compiler.wasm')),
  },
}

const sources = [
  ...(
    await Promise.all(
      [
        'examples/todo/src/main.tsx',
        'examples/counter/src/main.tsx',
        'scripts/playground/fixtures/counter.tsx',
      ].map(async filename => ({
        filename,
        source: await fs.readFile(path.join(root, filename), 'utf8'),
      })),
    )
  ).filter(entry => entry.source.length > 0),
  {
    filename: 'browser-fixture.tsx',
    source: `import { For, Show } from '@zeus-js/zeus'
export const App = props => <main title={props.title}>
  <Show when={props.open} fallback={<i>closed</i>}>
    <For each={props.items}>{item => <li onClick={() => props.pick(item)}>{item.name}</li>}</For>
  </Show>
  <textarea>{props.text}</textarea>
  <z-field on:value-change={props.change} prop:model={props.model} />
</main>
`,
  },
  {
    filename: 'browser-diagnostics.tsx',
    source:
      'export const App = async props => <div prop:innerHTML={props.html} />\n',
  },
]
const requests: TransformModuleOptions[] = sources.flatMap(
  ({ filename, source }) => [
    {
      source,
      filename,
      target: 'dom',
      runtimeModule: '@zeus-js/runtime-dom',
      delegateEvents: true,
      sourceMap: true,
    },
    {
      source,
      filename,
      target: 'ssr',
      runtimeModule: '@zeus-js/runtime-ssr',
      delegateEvents: false,
      sourceMap: true,
    },
  ],
)

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, (item as Record<string, unknown>)[key]]),
        )
      : item,
  )
}

const expected = requests.map(request =>
  canonical(native.transformModule(request)),
)

const page = `<!doctype html><meta charset="utf-8"><title>Zeus WASM compiler</title>
<script type="module">
import { compileCompilerModule, createWorkerCompiler, loadCompiler } from '/index.js'
window.runCompilerFixture = async (requests, canonicalSource) => {
  const canonical = new Function('return ' + canonicalSource)()
  const module = await compileCompilerModule(fetch('/zeus-compiler.wasm'))
  const worker = createWorkerCompiler(new Worker('/worker.js', { type: 'module' }), module)
  const inWorker = []
  for (const request of requests) inWorker.push(canonical(await worker.transformModule(request)))

  const deep = { ...requests[0], source: 'export const App = () => ' + '<div>'.repeat(20000) + 'x' + '</div>'.repeat(20000) }
  let trap = ''
  try { await worker.transformModule(deep) } catch (error) { trap = error.message }
  const recovered = canonical(await worker.transformModule(requests[0]))
  worker.terminate()

  const mainThread = await loadCompiler(module)
  const onMainThread = canonical(await mainThread.transformModule(requests[0]))
  return { inWorker, trap, recovered, onMainThread }
}
</script>`

const server = http.createServer((request, response) => {
  const file = request.url === '/' ? undefined : files[request.url ?? '']
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(page)
  } else if (file) {
    response.setHeader('Content-Type', file.type)
    response.end(file.body)
  } else {
    response.writeHead(404).end()
  }
})
await fs.mkdir(output, { recursive: true })
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`

interface FixtureResult {
  inWorker: string[]
  trap: string
  recovered: string
  onMainThread: string
}
declare global {
  interface Window {
    runCompilerFixture(
      requests: TransformModuleOptions[],
      canonicalSource: string,
    ): Promise<FixtureResult>
  }
}

const results: Array<{ browser: string; status: string; error?: string }> = []
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser
    try {
      browser = await engine.launch({
        headless: true,
        ...(name === 'chromium' ? { channel: 'chromium' } : {}),
      })
      const tab = await browser.newPage()
      const errors: string[] = []
      tab.on('pageerror', error => errors.push(error.message))
      await tab.goto(origin)
      await tab.waitForFunction(
        () => typeof window.runCompilerFixture === 'function',
      )
      const result = await tab.evaluate(
        ([requests, canonicalSource]) =>
          window.runCompilerFixture(requests, canonicalSource),
        [requests, canonical.toString()] as const,
      )

      result.inWorker.forEach((actual, index) =>
        assert.equal(
          actual,
          expected[index],
          `${requests[index].filename} (${requests[index].target})`,
        ),
      )
      assert.match(result.trap, /^\[ZEUS_COMPILER_WASM_TRAP\]/)
      assert.equal(result.recovered, expected[0])
      assert.equal(result.onMainThread, expected[0])
      assert.deepEqual(errors, [])
      results.push({ browser: name, status: 'passed' })
    } catch (error) {
      results.push({ browser: name, status: 'failed', error: String(error) })
    } finally {
      await browser?.close()
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify({ scope: 'WASM compiler in a module Worker vs native output', transforms: requests.length, results }, null, 2)}\n`,
  )
}

console.log(JSON.stringify(results, null, 2))
assert(
  results.length === 3 && results.every(result => result.status === 'passed'),
  'Every browser engine must match the native compiler.',
)
