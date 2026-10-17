import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const native = require(path.join(root, 'packages/core/compiler-native')) as {
  transformModule(options: {
    source: string
    filename: string
    target: 'dom'
    runtimeModule: string
    delegateEvents: boolean
    sourceMap: boolean
  }): { code: string; diagnostics: { code: string; message: string }[] }
}

const source = `const StaticA = () => <div class="shared">same</div>
const StaticB = () => <div class="shared">same</div>
export const App = props => <main><button title={props.title} onClick={props.onClick}>{props.label}</button><span>{once(props.initial)}</span></main>
`
const staticTemplateProbe = native.transformModule({
  source: `const StaticA = () => <div class="shared">same</div>
const StaticB = () => <div class="shared">same</div>
`,
  filename: 'compiler-static-template-benchmark.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: false,
  sourceMap: false,
})
const result = native.transformModule({
  source,
  filename: 'compiler-optimization-benchmark.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: false,
})

if (
  staticTemplateProbe.diagnostics.length > 0 ||
  result.diagnostics.length > 0
) {
  throw new Error(
    JSON.stringify(
      [...staticTemplateProbe.diagnostics, ...result.diagnostics],
      null,
      2,
    ),
  )
}

const bindingCalls = [
  ...result.code.matchAll(
    /\b[\w$]*(bindTextContent|bindText|bindAttr|bindClass|bindStyle|bindProp)\(/gi,
  ),
]
const onceBindings = bindingCalls.filter(match => {
  const end = result.code.indexOf(');', match.index ?? 0)
  return result.code.slice(match.index, end).trimEnd().endsWith(', true')
}).length
const report = {
  generatedBytes: Buffer.byteLength(result.code),
  templateFactories: (result.code.match(/\b[\w$]*template\(/gi) ?? []).length,
  staticTemplateConsumers: 2,
  staticTemplateFactories: (
    staticTemplateProbe.code.match(/\b[\w$]*template\(/gi) ?? []
  ).length,
  bindingCalls: bindingCalls.length,
  reactiveEffects: bindingCalls.length - onceBindings,
  onceBindings,
  eventBindingCalls: (result.code.match(/\b[\w$]*bindEvent\(/gi) ?? []).length,
  delegatedEventSetupCalls: (
    result.code.match(/\b[\w$]*delegateEvents\(/gi) ?? []
  ).length,
  diagnostics: result.diagnostics.length,
}

const output = path.join(root, 'temp/bench/compiler-optimization.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
