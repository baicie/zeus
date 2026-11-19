const assert = require('node:assert/strict')
const test = require('node:test')
const { TraceMap, originalPositionFor } = require('@jridgewell/trace-mapping')
const { transformModule } = require('../index.js')

test('HMR literal cells retain the original expression source map and use one disposer', () => {
  const source =
    "import { render } from '@zeus-js/zeus'\r\nconst _zeusHmrState = 'user binding'\r\nrender(() => <p class={'muted'}>{'😀 Hello'}</p>, document.body)\r\n"
  const result = transformModule({
    source,
    filename: '/src/main.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: true,
    sourceMap: true,
    hmr: true,
  })
  assert.equal(result.diagnostics.length, 0)
  assert.equal(result.hmrPlan.bindings[1].value, '😀 Hello')
  assert.equal((result.code.match(/\.hot\.dispose\(/g) || []).length, 1)
  assert.match(result.code, /\.dispose\(\)/)
  const access = [...result.code.matchAll(/(_zeusHmrState\w*)\.read\(/g)].at(-1)
  assert.ok(access)
  assert.notEqual(
    access[1],
    '_zeusHmrState',
    'compiler avoids the user binding name',
  )
  const offset = access.index
  const prefix = result.code.slice(0, offset)
  const mapped = originalPositionFor(new TraceMap(result.map), {
    line: prefix.split('\n').length,
    column: prefix.length - prefix.lastIndexOf('\n') - 1,
  })
  const original = source.slice(0, source.indexOf("'😀 Hello'"))
  assert.equal(mapped.line, original.split('\n').length)
  assert.equal(mapped.column, original.length - original.lastIndexOf('\n') - 1)
})
