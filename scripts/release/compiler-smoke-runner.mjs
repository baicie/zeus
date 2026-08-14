import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const esmCompiler = await import('@zeus-js/compiler')
const cjsCompiler = require('@zeus-js/compiler')
const source = `
export function View(props) {
  return <main class="view">Hello {props.name}</main>
}
`

for (const [format, compiler] of [
  ['ESM', esmCompiler],
  ['CJS', cjsCompiler],
]) {
  assert.equal(typeof compiler.transformModule, 'function')

  for (const target of ['dom', 'ssr']) {
    const result = compiler.transformModule({
      source,
      filename: `${format.toLowerCase()}-${target}.tsx`,
      target,
      runtimeModule:
        target === 'dom' ? '@zeus-js/runtime-dom' : '@zeus-js/runtime-ssr',
      delegateEvents: true,
      sourceMap: true,
    })

    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.map?.version, 3)
    assert.match(
      result.code,
      target === 'dom' ? /@zeus-js\/runtime-dom/ : /@zeus-js\/runtime-ssr/,
    )
    assert.match(result.code, /props\.name/)
  }
}

console.log(
  `[release] compiler smoke passed (Node ${process.version}, ${process.platform}-${process.arch}, ESM+CJS, DOM+SSR)`,
)
