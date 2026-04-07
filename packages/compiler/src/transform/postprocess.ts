import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { Program } from '@babel/types'
import {
  arrayExpression,
  callExpression,
  expressionStatement,
  identifier,
  importDeclaration,
  importSpecifier,
  stringLiteral,
  variableDeclaration,
  variableDeclarator,
} from '@babel/types'
import { getProgramScopeData } from '../babel-cast'
import type { ZeusPluginPass } from './preprocess'
import { registerImportMethod } from '../shared/utils'

export function postprocess(
  path: NodePath<Program>,
  state: ZeusPluginPass,
): void {
  if (state.skip) {
    return
  }

  const data = getProgramScopeData(path)
  if (!data || !data.config) {
    return
  }

  const config = data.config
  const body = path.node.body

  if (data.templates && data.templates.length) {
    registerImportMethod(path, 'template')
  }

  if (config.delegateEvents && data.events && data.events.size) {
    registerImportMethod(path, 'delegateEvents')
  }

  const prelude: t.Statement[] = []

  if (data.imports) {
    const sources = Array.from(data.imports.keys())
    for (let s = 0; s < sources.length; s++) {
      const source = sources[s]
      const map = data.imports.get(source)
      if (!map || !map.size) {
        continue
      }
      const specifiers: t.ImportSpecifier[] = []
      const names = Array.from(map.keys())
      for (let n = 0; n < names.length; n++) {
        const name = names[n]
        const local = map.get(name)
        if (!local) {
          continue
        }
        specifiers.push(importSpecifier(local, identifier(name)))
      }
      if (specifiers.length) {
        prelude.push(importDeclaration(specifiers, stringLiteral(source)))
      }
    }
  }

  if (data.templates && data.templates.length) {
    let templateFn: t.Identifier | undefined
    if (data.imports) {
      const modMap = data.imports.get(config.moduleName)
      if (modMap) {
        templateFn = modMap.get('template')
      }
    }
    if (!templateFn) {
      throw new Error('[zeus-jsx] internal: template import missing')
    }
    for (let i = 0; i < data.templates.length; i++) {
      const info = data.templates[i]
      const call = callExpression(templateFn, [stringLiteral(info.template)])
      const decl = variableDeclaration('const', [
        variableDeclarator(info.id, call),
      ])
      prelude.push(decl)
    }
  }

  if (prelude.length) {
    for (let i = prelude.length - 1; i >= 0; i--) {
      body.unshift(prelude[i])
    }
  }

  if (config.delegateEvents && data.events && data.events.size) {
    let delegateFn: t.Identifier | undefined
    if (data.imports) {
      const modMap = data.imports.get(config.moduleName)
      if (modMap) {
        delegateFn = modMap.get('delegateEvents')
      }
    }
    if (!delegateFn) {
      throw new Error('[zeus-jsx] internal: delegateEvents import missing')
    }
    const names = Array.from(data.events)
    const elems: t.StringLiteral[] = []
    for (let i = 0; i < names.length; i++) {
      elems.push(stringLiteral(names[i]))
    }
    path.pushContainer(
      'body',
      expressionStatement(callExpression(delegateFn, [arrayExpression(elems)])),
    )
  }
}
