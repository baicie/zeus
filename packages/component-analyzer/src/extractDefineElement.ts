import * as t from '@babel/types'

import { walk } from './ast'

export interface DefineElementCallRecord {
  name: string
  exportName: string
  tag: string
  propsTypeName?: string
  options?: t.ObjectExpression
  setup?: t.Expression | t.SpreadElement | t.ArgumentPlaceholder
  call: t.CallExpression
}

export function extractDefineElementCalls(
  ast: t.File,
): DefineElementCallRecord[] {
  const defineElementLocalNames = collectDefineElementLocalNames(ast)
  const exportedNames = collectExportedNames(ast)
  const records: DefineElementCallRecord[] = []

  walk(ast.program, node => {
    if (!t.isVariableDeclarator(node)) return
    if (!t.isIdentifier(node.id)) return
    if (!t.isCallExpression(node.init)) return

    const call = node.init

    if (!isDefineElementCall(call, defineElementLocalNames)) return

    const tag = extractTag(call)
    if (!tag) return

    const name = node.id.name
    const options = extractOptions(call)
    const setup = call.arguments[2]
    const propsTypeName = extractPropsTypeName(call)

    const isExported = exportedNames.has(name)

    if (!isExported) return

    records.push({
      name,
      exportName: name,
      tag,
      propsTypeName,
      options,
      setup,
      call,
    })
  })

  return records
}

function collectDefineElementLocalNames(ast: t.File): Set<string> {
  const names = new Set<string>()

  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue

    const source = node.source.value

    if (source !== '@zeus-js/zeus' && source !== '@zeus-js/runtime-dom') {
      continue
    }

    for (const spec of node.specifiers) {
      if (!t.isImportSpecifier(spec)) continue

      const imported = spec.imported

      if (
        (t.isIdentifier(imported) && imported.name === 'defineElement') ||
        (t.isStringLiteral(imported) && imported.value === 'defineElement')
      ) {
        names.add(spec.local.name)
      }
    }
  }

  return names
}

function collectExportedNames(ast: t.File): Set<string> {
  const names = new Set<string>()

  for (const node of ast.program.body) {
    if (t.isExportNamedDeclaration(node)) {
      if (t.isVariableDeclaration(node.declaration)) {
        for (const declarator of node.declaration.declarations) {
          if (t.isIdentifier(declarator.id)) {
            names.add(declarator.id.name)
          }
        }
      }

      for (const spec of node.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.local)) {
          names.add(spec.local.name)
        }
      }
    }
  }

  return names
}

function isDefineElementCall(
  call: t.CallExpression,
  localNames: Set<string>,
): boolean {
  return t.isIdentifier(call.callee) && localNames.has(call.callee.name)
}

function extractTag(call: t.CallExpression): string | undefined {
  const first = call.arguments[0]

  if (t.isStringLiteral(first)) {
    return first.value
  }

  return undefined
}

function extractOptions(
  call: t.CallExpression,
): t.ObjectExpression | undefined {
  const second = call.arguments[1]

  if (t.isObjectExpression(second)) {
    return second
  }

  return undefined
}

function extractPropsTypeName(call: t.CallExpression): string | undefined {
  const first = call.typeParameters?.params[0]

  if (!first) return undefined

  if (t.isTSTypeReference(first) && t.isIdentifier(first.typeName)) {
    return first.typeName.name
  }

  return undefined
}
