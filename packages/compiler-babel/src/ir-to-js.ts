// IR to JS code generation

import type { TemplateIR, BindingIR, TextBindingIR, AttrBindingIR, PropBindingIR, EventBindingIR, ShowBindingIR, ForBindingIR } from '@zeusjs/compiler-shared'

export interface CodegenOptions {
  format?: 'compact' | 'readable'
  generateSourceMaps?: boolean
}

export function generateComponentCode(
  fnPath: any,
  ir: TemplateIR,
  state: any,
  options: CodegenOptions = {}
): any {
  const { format = 'readable' } = options

  // Generate template declaration
  const templateName = ir.name || `_tmpl$${state.templateCounter || 0}`

  // Build the code
  const lines: string[] = []

  // Template creation
  lines.push(`const ${templateName} = createTemplate(\`${ir.html}\`);`)

  // Function body
  lines.push('')
  lines.push(`function ${fnPath.node.id?.name || 'Component'}() {`)

  // Variable declarations
  const varDeclarations: string[] = []
  const bindings: string[] = []

  // Generate binding code
  for (const binding of ir.bindings) {
    if (binding.type === 'text') {
      const textBinding = binding as TextBindingIR
      const anchorVar = `_anchor$${binding.path.join('')}`
      const textVar = `_text$${binding.path.join('')}`

      varDeclarations.push(`const ${anchorVar} = getNode(_root, [${textBinding.path.join(', ')}])`)
      varDeclarations.push(`const ${textVar} = createTextPlaceholder(${anchorVar})`)
      bindings.push(`bindText(${textVar}, ${printExpr(textBinding.expr)})`)
    }

    if (binding.type === 'attr') {
      const attrBinding = binding as AttrBindingIR
      bindings.push(`bindAttr(_el$${binding.path.join('')}, "${attrBinding.name}", ${printExpr(attrBinding.expr)})`)
    }

    if (binding.type === 'prop') {
      const propBinding = binding as PropBindingIR
      bindings.push(`bindProp(_el$${binding.path.join('')}, "${propBinding.name}", ${printExpr(propBinding.expr)})`)
    }

    if (binding.type === 'event') {
      const eventBinding = binding as EventBindingIR
      bindings.push(`bindEvent(_el$${binding.path.join('')}, "${eventBinding.name}", ${printExpr(eventBinding.handler)})`)
    }

    if (binding.type === 'show') {
      const showBinding = binding as ShowBindingIR
      bindings.push(`mountCondition(_showStart, _showEnd, ${printExpr(showBinding.when)}, () => ${templateName}())`)
    }

    if (binding.type === 'for') {
      const forBinding = binding as ForBindingIR
      bindings.push(`mountList(_forStart, _forEnd, ${printExpr(forBinding.each)}, (${forBinding.itemName}, ${forBinding.indexName}) => ${templateName}())`)
    }
  }

  // Add variable declarations
  lines.push(`  const _root = ${templateName}();`)
  for (const decl of varDeclarations) {
    lines.push(`  ${decl}`)
  }

  // Add bindings
  for (const binding of bindings) {
    lines.push(`  ${binding}`)
  }

  lines.push('')
  lines.push('  return _root')
  lines.push('}')

  return lines.join(format === 'readable' ? '\n' : '')
}

function printExpr(expr: any): string {
  if (!expr || !expr.node) return 'undefined'
  return printNode(expr.node)
}

function printNode(node: any): string {
  if (!node) return ''

  switch (node.type) {
    case 'Identifier':
      return node.name
    case 'StringLiteral':
      return `"${node.value}"`
    case 'NumericLiteral':
      return String(node.value)
    case 'BooleanLiteral':
      return String(node.value)
    case 'NullLiteral':
      return 'null'
    case 'CallExpression':
      const callee = printNode(node.callee)
      const args = node.arguments.map(printNode).join(', ')
      return `${callee}(${args})`
    case 'MemberExpression':
      const obj = printNode(node.object)
      const prop = node.computed ? `[${printNode(node.property)}]` : `.${node.property.name || printNode(node.property)}`
      return `${obj}${prop}`
    case 'BinaryExpression':
      const left = printNode(node.left)
      const right = printNode(node.right)
      return `${left} ${node.operator} ${right}`
    case 'UnaryExpression':
      return `${node.operator}${printNode(node.argument)}`
    case 'ConditionalExpression':
      const test = printNode(node.test)
      const consequent = printNode(node.consequent)
      const alternate = printNode(node.alternate)
      return `${test} ? ${consequent} : ${alternate}`
    case 'ArrowFunctionExpression':
      const params = node.params.map((p: any) => p.name).join(', ')
      const body = printNode(node.body)
      return `(${params}) => ${body}`
    default:
      return node.name || ''
  }
}
