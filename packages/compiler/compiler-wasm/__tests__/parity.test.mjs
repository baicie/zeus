// Requires `zeus-compiler.wasm` (build:wasm) and the native binding
// (`@zeus-js/compiler-native` build:native). Both run the same Rust compiler,
// so every result must be identical, not merely equivalent.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { loadCompiler } from '../index.js'

const require = createRequire(import.meta.url)
const native = require('../../compiler-native/index.js')
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const wasmBytes = readFileSync(
  new URL('../zeus-compiler.wasm', import.meta.url),
)

const corpusRoots = ['examples', 'benchmarks', 'scripts/playground/fixtures']

function collectSources(directory, sources = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const file = path.join(directory, entry)
    if (statSync(file).isDirectory()) collectSources(file, sources)
    else if (file.endsWith('.tsx')) {
      sources.push({
        filename: path.relative(root, file),
        source: readFileSync(file, 'utf8'),
      })
    }
  }
  return sources
}

const inlineSources = [
  {
    filename: 'hmr-literal-bindings.tsx',
    source: `import { render, createSignal, For } from '@zeus-js/zeus'
const [rows] = createSignal([1, 2])
render(() => <main class={'muted'} style={'color: blue'}><For each={rows()}>{row => <p>{'😀 Hello'} {row}</p>}</For></main>, document.body)
`,
  },
  {
    filename: 'unicode-crlf.tsx',
    source:
      '// \u{1f600}中\r\nconst helper = (n: number) => n * 2\r\nexport const App = props => <p title={props.t}>{helper(props.n)} &amp; {props.label}</p>\r\n',
  },
  {
    filename: 'control-flow.tsx',
    source: `import { For, Show } from '@zeus-js/zeus'
export const App = props => <main>
  <Show when={props.open} fallback={<i>closed</i>}>
    <For each={props.items}>{(item, index) => <li onClick={() => props.pick(item)}>{index()}: {item.name}</li>}</For>
  </Show>
  {props.flag ? <b>yes</b> : null}
  {props.rows.map(row => <span>{row}</span>)}
  <textarea>{props.text}</textarea>
  <div onMouseEnter={props.enter} on:value-change={props.change} />
</main>
`,
  },
  {
    filename: 'define-element.tsx',
    source: `import { defineElement, Host, Slot } from '@zeus-js/zeus'
export const Card = defineElement('z-parity-card', { shadow: true, props: { heading: String } }, props => (
  <Host role="group"><header><Slot name="title">Untitled</Slot></header><p>{props.heading}</p><Slot /></Host>
))
`,
  },
  {
    filename: 'diagnostics.tsx',
    source:
      'export const App = async props => <div prop:innerHTML={props.html}>{() => props.t}</div>\n',
  },
  {
    filename: 'ssr-property.tsx',
    source: 'export const App = props => <div prop:textContent={props.t} />\n',
  },
  { filename: 'parse-error.tsx', source: 'export const App = () => <div>\n' },
  { filename: 'plain.ts', source: 'export const value = 1\n' },
  {
    filename: 'deep.tsx',
    source: `export const App = () => ${'<div>'.repeat(500)}x${'</div>'.repeat(500)}\n`,
  },
]

const corpus = [
  ...corpusRoots.flatMap(directory =>
    collectSources(path.join(root, directory)),
  ),
  ...inlineSources,
]

const variants = [
  {
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: true,
    sourceMap: true,
    hmr: true,
  },
  {
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    pureDefineElement: true,
  },
  {
    target: 'ssr',
    runtimeModule: '@zeus-js/runtime-ssr',
    delegateEvents: false,
    sourceMap: true,
  },
]

/** JSON with sorted keys, so property order differences cannot hide or fake a mismatch. */
function canonical(value) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]]),
        )
      : item,
  )
}

test('the WASM compiler matches the native compiler on every corpus module', async t => {
  const compiler = await loadCompiler(wasmBytes)
  let nativeTime = 0
  let wasmTime = 0
  let compared = 0

  assert.ok(corpus.length > 60, `corpus has ${corpus.length} modules`)
  for (const { filename, source } of corpus) {
    for (const variant of variants) {
      const options = { source, filename, ...variant }

      let started = performance.now()
      const expected = native.transformModule(options)
      nativeTime += performance.now() - started

      started = performance.now()
      const actual = await compiler.transformModule(options)
      wasmTime += performance.now() - started

      assert.equal(
        canonical(actual),
        canonical(expected),
        `${filename} (${variant.target}, delegateEvents: ${variant.delegateEvents})`,
      )
      compared++
    }
  }

  t.diagnostic(
    `${compared} transforms identical; native ${nativeTime.toFixed(1)} ms, wasm ${wasmTime.toFixed(1)} ms`,
  )
})

test('invalid options fail with the native messages', async () => {
  const compiler = await loadCompiler(wasmBytes)
  const base = {
    source: 'export const App = () => <div />',
    filename: 'App.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: true,
    sourceMap: false,
  }

  for (const override of [
    { target: 'wasm' },
    { filename: '' },
    { runtimeModule: '' },
  ]) {
    const options = { ...base, ...override }
    let nativeMessage
    try {
      native.transformModule(options)
    } catch (error) {
      nativeMessage = error.message
    }
    assert.ok(nativeMessage, `native rejects ${JSON.stringify(override)}`)
    await assert.rejects(compiler.transformModule(options), {
      name: 'TypeError',
      message: nativeMessage,
    })
  }
})

test('deep input is diagnosed without trapping or discarding the instance', async () => {
  const compiler = await loadCompiler(wasmBytes)
  const deep = (source, filename) => ({
    source,
    filename,
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: true,
    sourceMap: false,
  })
  const cases = [
    [
      `export const App = () => ${'<div>'.repeat(20_000)}x${'</div>'.repeat(20_000)}\n`,
      'deep.tsx',
    ],
    [
      `export const id = <T>(x: T) => x\nconst v = ${'('.repeat(50_000)}1${')'.repeat(50_000)}\n`,
      'deep.ts',
    ],
  ]

  for (const [source, filename] of cases) {
    const options = deep(source, filename)
    const expected = native.transformModule(options)
    assert.deepEqual(
      expected.diagnostics.map(diagnostic => diagnostic.code),
      ['ZEUS_INPUT_TOO_DEEP'],
    )
    const actual = await compiler.transformModule(options)
    assert.deepEqual(
      actual.diagnostics.map(diagnostic => diagnostic.code),
      expected.diagnostics.map(diagnostic => diagnostic.code),
      `${filename} preflight parity`,
    )
    assert.equal(actual.code, expected.code)
    assert.deepEqual(actual.hydrationPlan, expected.hydrationPlan)
    assert.deepEqual(actual.hmrPlan, expected.hmrPlan)
  }

  // The same WebAssembly instance must remain usable: preflight runs before
  // the parser, so no trap can poison it.
  const recovered = await compiler.transformModule(
    deep('export const App = () => <div>ok</div>\n', 'recovered.tsx'),
  )
  assert.deepEqual(recovered.diagnostics, [])
  assert.match(recovered.code, /template/)
})

test('the binary is self-contained', t => {
  const module = new WebAssembly.Module(wasmBytes)

  assert.deepEqual(WebAssembly.Module.imports(module), [])
  assert.deepEqual(
    WebAssembly.Module.exports(module)
      .filter(entry => entry.kind === 'function')
      .map(entry => entry.name)
      .sort(),
    ['zeus_alloc', 'zeus_free', 'zeus_transform'],
  )
  t.diagnostic(
    `zeus-compiler.wasm: ${wasmBytes.length} B raw, ${gzipSync(wasmBytes, { level: 9 }).length} B gzip, ${brotliCompressSync(wasmBytes).length} B brotli`,
  )
})
