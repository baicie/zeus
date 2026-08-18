'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { transformModule } = require('../index.js')

const fixture = `export const App = (props: { name: string }) => (
  <div class="greeting">Hello {props.name}</div>
)
`

function options(source = fixture) {
  return {
    source,
    filename: 'App.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: true,
  }
}

test('transformModule returns code, source map, and diagnostics', () => {
  const result = transformModule(options())

  assert.deepEqual(result.diagnostics, [])
  assert.match(result.code, /bindText/)
  assert.doesNotMatch(result.code, /=>\s*\(\s*<div/)
  assert.equal(result.map.version, 3)
  assert.deepEqual(result.map.sources, ['App.tsx'])
  assert.deepEqual(result.map.sourcesContent, [fixture])
})

test('compiler diagnostics remain structured data', () => {
  const result = transformModule(
    options('export const App = props => <div {...props} />'),
  )

  assert.equal(result.code, '')
  assert.equal(result.map, null)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, 'ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE')
  assert.equal(result.diagnostics[0].filename, 'App.tsx')
  assert.equal(result.diagnostics[0].severity, 'error')
  assert.equal(typeof result.diagnostics[0].span.start.offset, 'number')
})

test('explicit @once bindings use the runtime flag and invalid targets fail', () => {
  const result = transformModule(
    options(`export const App = props => (
  <div title={/* @once */ props.title}>
    {/* @once */ props.label}
    {props.detail}
  </div>
)`),
  )

  assert.deepEqual(result.diagnostics, [])
  assert.match(result.code, /props\.title\), true\)/)
  assert.match(result.code, /props\.label\), true\)/)
  assert.match(result.code, /props\.detail\)\)/)
  assert.doesNotMatch(result.code, /props\.detail\), true\)/)

  const invalid = transformModule(
    options(
      'export const App = props => <button onClick={/* @once */ props.onClick} />',
    ),
  )

  assert.equal(invalid.code, '')
  assert.equal(invalid.diagnostics.length, 1)
  assert.equal(invalid.diagnostics[0].code, 'ZEUS_INVALID_ONCE_TARGET')
})

test('invalid ABI options throw instead of becoming compiler diagnostics', () => {
  assert.throws(
    () => transformModule({ ...options(), target: 'wasm' }),
    /target must be "dom" or "ssr"/,
  )
})

test('generated declarations preserve the transform contract', () => {
  const declarations = readFileSync(
    path.resolve(__dirname, '../index.d.ts'),
    'utf8',
  )

  assert.match(declarations, /target: 'dom' \| 'ssr'/)
  assert.match(declarations, /severity: 'error' \| 'warning'/)
  assert.match(declarations, /sourcesContent: Array<string \| null>/)
  assert.match(declarations, /map: RawSourceMap \| null/)
})
