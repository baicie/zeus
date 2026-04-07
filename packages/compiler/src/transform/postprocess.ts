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
import {
  buildHydrationEventMeta,
  hydrationEventMetaToAst,
} from '../shared/hydration'
import { registerImportMethod } from '../shared/utils'

function toStringLiterals(values: string[]): t.StringLiteral[] {
  const elems: t.StringLiteral[] = []
  for (let i = 0; i < values.length; i++) {
    elems.push(stringLiteral(values[i]))
  }
  return elems
}

function appendCall(
  path: NodePath<Program>,
  fn: t.Identifier,
  values: string[],
): void {
  path.pushContainer(
    'body',
    expressionStatement(
      callExpression(fn, [arrayExpression(toStringLiterals(values))]),
    ),
  )
}

function appendHydrationCall(
  path: NodePath<Program>,
  fn: t.Identifier,
  values: string[],
  defaultStrategy: 'delegate' | 'native',
  eventStrategies?: Record<string, 'delegate' | 'native'>,
): void {
  const meta = buildHydrationEventMeta(values, defaultStrategy, eventStrategies)
  const args = hydrationEventMetaToAst(meta)
  path.pushContainer(
    'body',
    expressionStatement(callExpression(fn, [arrayExpression(args)])),
  )
}

function registerImportMethodForSource(
  path: NodePath<Program>,
  source: string,
  name: string,
): t.Identifier {
  const data = getProgramScopeData(path)
  if (!data) {
    throw new Error(
      '[zeus-jsx] internal: scope data missing before ssr import register',
    )
  }
  if (!data.imports) {
    data.imports = new Map()
  }
  let modMap = data.imports.get(source)
  if (!modMap) {
    modMap = new Map()
    data.imports.set(source, modMap)
  }
  const existing = modMap.get(name)
  if (existing) {
    return existing
  }
  const id = path.scope.generateUidIdentifier(name)
  modMap.set(name, id)
  return id
}

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
  if (
    config.generate === 'ssr' &&
    config.hydratable &&
    data.hydratableEvents &&
    data.hydratableEvents.size
  ) {
    const ssrSource = config.ssrModuleName || config.moduleName
    registerImportMethodForSource(path, ssrSource, 'ssrHydrationEvents')
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

  if (
    config.generate !== 'ssr' &&
    config.delegateEvents &&
    data.events &&
    data.events.size
  ) {
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
    appendCall(path, delegateFn, names)
  }

  if (
    config.generate === 'ssr' &&
    config.hydratable &&
    data.hydratableEvents &&
    data.hydratableEvents.size
  ) {
    let hydrateFn: t.Identifier | undefined
    if (data.imports) {
      const ssrSource = config.ssrModuleName || config.moduleName
      const modMap = data.imports.get(ssrSource)
      if (modMap) {
        hydrateFn = modMap.get('ssrHydrationEvents')
      }
    }
    if (!hydrateFn) {
      throw new Error('[zeus-jsx] internal: ssrHydrationEvents import missing')
    }
    const names = Array.from(data.hydratableEvents)
    appendHydrationCall(
      path,
      hydrateFn,
      names,
      config.hydrationEventStrategy,
      config.hydrationEventStrategies,
    )
  }
}
