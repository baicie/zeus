import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from '@babel/parser'

const root = path.resolve(import.meta.dirname, '../..')
const staticTemplateHtml = '<div class="shared">same</div>'

export type CompilerOptimizationReport = {
  generatedBytes: number
  templateFactories: number
  staticTemplateConsumers: number
  staticTemplateFactories: number
  bindingCalls: number
  reactiveEffects: number
  onceBindings: number
  eventBindingCalls: number
  delegatedEventSetupCalls: number
  diagnostics: number
}

export const compilerOptimizationBudget = {
  staticTemplateFactories: 1,
  minStaticTemplateConsumers: 2,
  reactiveEffects: 2,
  eventBindingCalls: 1,
  delegatedEventSetupCalls: 1,
} as const

type TransformOptions = {
  source: string
  filename: string
  target: 'dom'
  runtimeModule: string
  delegateEvents: boolean
  sourceMap: boolean
}

type TransformResult = {
  code: string
  diagnostics: readonly unknown[]
}

type TransformModule = (options: TransformOptions) => TransformResult
type AstNode = Record<string, unknown> & { type: string }

const source = `const StaticA = () => <div class="shared">same</div>
const StaticB = () => <div class="shared">same</div>
export const App = props => <main><button title={props.title} onClick={props.onClick}>{props.label}</button><span>{once(props.initial)}</span></main>
`
export function collectCompilerOptimizationReport(
  transformModule: TransformModule = loadNativeTransform(),
): CompilerOptimizationReport {
  const staticTemplateProbe = transformModule({
    source: `const StaticA = () => <div class="shared">same</div>
const StaticB = () => <div class="shared">same</div>
`,
    filename: 'compiler-static-template-benchmark.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
  })
  const result = transformModule({
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

  const program = parse(result.code, { sourceType: 'module' })
    .program as unknown as AstNode
  const staticTemplateProgram = parse(staticTemplateProbe.code, {
    sourceType: 'module',
  }).program as unknown as AstNode
  const staticTemplateFactoryNames = findTemplateFactoryNames(
    staticTemplateProgram,
    '@zeus-js/runtime-dom',
    staticTemplateHtml,
  )
  const bindingNames = new Set([
    'bindTextContent',
    'bindText',
    'bindAttr',
    'bindClass',
    'bindStyle',
    'bindProp',
  ])
  const bindingCalls = countImportedCalls(
    program,
    '@zeus-js/runtime-dom',
    bindingNames,
  )
  const onceBindings = countOnceBindings(
    program,
    '@zeus-js/runtime-dom',
    bindingNames,
  )
  const templateFactoryCalls = countImportedCalls(
    program,
    '@zeus-js/runtime-dom',
    new Set(['template']),
  )

  return {
    generatedBytes: Buffer.byteLength(result.code),
    templateFactories: templateFactoryCalls,
    staticTemplateConsumers: countIdentifierCalls(
      staticTemplateProgram,
      new Set(staticTemplateFactoryNames),
    ),
    staticTemplateFactories: staticTemplateFactoryNames.length,
    bindingCalls,
    reactiveEffects: bindingCalls - onceBindings,
    onceBindings,
    eventBindingCalls: countImportedCalls(
      program,
      '@zeus-js/runtime-dom',
      new Set(['bindEvent']),
    ),
    delegatedEventSetupCalls: countImportedCalls(
      program,
      '@zeus-js/runtime-dom',
      new Set(['delegateEvents']),
    ),
    diagnostics: result.diagnostics.length,
  }
}

export function assertCompilerOptimizationBudget(
  report: CompilerOptimizationReport,
  budget = compilerOptimizationBudget,
): void {
  const failures: string[] = []
  if (report.staticTemplateFactories !== budget.staticTemplateFactories) {
    failures.push(
      `static template factories ${report.staticTemplateFactories} != ${budget.staticTemplateFactories}`,
    )
  }
  if (report.staticTemplateConsumers < budget.minStaticTemplateConsumers) {
    failures.push(
      `static template consumers ${report.staticTemplateConsumers} < ${budget.minStaticTemplateConsumers}`,
    )
  }
  if (report.reactiveEffects !== budget.reactiveEffects) {
    failures.push(
      `reactive effects ${report.reactiveEffects} != ${budget.reactiveEffects}`,
    )
  }
  if (report.eventBindingCalls !== budget.eventBindingCalls) {
    failures.push(
      `event binding calls ${report.eventBindingCalls} != ${budget.eventBindingCalls}`,
    )
  }
  if (report.delegatedEventSetupCalls !== budget.delegatedEventSetupCalls) {
    failures.push(
      `delegated event setup calls ${report.delegatedEventSetupCalls} != ${budget.delegatedEventSetupCalls}`,
    )
  }
  if (failures.length > 0) {
    throw new Error(
      `compiler optimization budget failed: ${failures.join('; ')}`,
    )
  }
}

function loadNativeTransform(): TransformModule {
  const require = createRequire(import.meta.url)
  const native = require(path.join(root, 'packages/core/compiler-native')) as {
    transformModule: TransformModule
  }
  return native.transformModule
}

function importedLocalNames(
  program: AstNode,
  runtimeModule: string,
  importedNames: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>()
  const body = program.body
  if (!Array.isArray(body)) return names

  for (const statement of body) {
    if (!isNode(statement, 'ImportDeclaration')) continue
    if (readString(statement.source) !== runtimeModule) continue
    if (!Array.isArray(statement.specifiers)) continue
    for (const specifier of statement.specifiers) {
      if (!isNode(specifier, 'ImportSpecifier')) continue
      const imported = readIdentifier(specifier.imported)
      const local = readIdentifier(specifier.local)
      if (importedNames.has(imported) && local) names.add(local)
    }
  }
  return names
}

function countImportedCalls(
  program: AstNode,
  runtimeModule: string,
  importedNames: ReadonlySet<string>,
): number {
  return countIdentifierCalls(
    program,
    importedLocalNames(program, runtimeModule, importedNames),
  )
}

function countOnceBindings(
  program: AstNode,
  runtimeModule: string,
  importedNames: ReadonlySet<string>,
): number {
  const localNames = importedLocalNames(program, runtimeModule, importedNames)
  let count = 0
  visit(program, node => {
    if (!isNode(node, 'CallExpression')) return
    if (!localNames.has(readIdentifier(node.callee))) return
    const args = node.arguments
    if (!Array.isArray(args)) return
    const last = args[args.length - 1]
    if (isNode(last, 'BooleanLiteral') && last.value === true) count++
  })
  return count
}

function findTemplateFactoryNames(
  program: AstNode,
  runtimeModule: string,
  html: string,
): string[] {
  const templateNames = importedLocalNames(
    program,
    runtimeModule,
    new Set(['template']),
  )
  const names: string[] = []
  if (!Array.isArray(program.body)) return names

  for (const statement of program.body) {
    if (!isNode(statement, 'VariableDeclaration')) continue
    if (!Array.isArray(statement.declarations)) continue
    for (const declaration of statement.declarations) {
      if (!isNode(declaration, 'VariableDeclarator')) continue
      if (!isNode(declaration.init, 'CallExpression')) continue
      if (!templateNames.has(readIdentifier(declaration.init.callee))) continue
      const args = declaration.init.arguments
      const id = readIdentifier(declaration.id)
      if (
        id &&
        Array.isArray(args) &&
        isNode(args[0], 'StringLiteral') &&
        args[0].value === html
      ) {
        names.push(id)
      }
    }
  }
  return names
}

function countIdentifierCalls(
  program: AstNode,
  names: ReadonlySet<string>,
): number {
  let count = 0
  visit(program, node => {
    if (
      isNode(node, 'CallExpression') &&
      names.has(readIdentifier(node.callee))
    ) {
      count++
    }
  })
  return count
}

function visit(value: unknown, callback: (node: AstNode) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) visit(child, callback)
    return
  }
  if (typeof value !== 'object' || value === null) return
  const object = value as Record<string, unknown>
  if (typeof object.type === 'string') callback(object as AstNode)
  for (const [key, child] of Object.entries(object)) {
    if (key !== 'loc' && key !== 'comments' && key !== 'tokens') {
      visit(child, callback)
    }
  }
}

function isNode(value: unknown, type: string): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === type
  )
}

function readIdentifier(value: unknown): string {
  return isNode(value, 'Identifier') && typeof value.name === 'string'
    ? value.name
    : ''
}

function readString(value: unknown): string {
  return isNode(value, 'StringLiteral') && typeof value.value === 'string'
    ? value.value
    : ''
}

function writeReport(report: CompilerOptimizationReport): void {
  const output = path.join(root, 'temp/bench/compiler-optimization.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const report = collectCompilerOptimizationReport()
  assertCompilerOptimizationBudget(report)
  writeReport(report)
  console.log(JSON.stringify(report, null, 2))
}
