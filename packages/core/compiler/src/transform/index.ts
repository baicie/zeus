import { emitDOM } from '../codegen/dom'
import { assertSSRSupported, emitSSR } from '../codegen/ssr'
import { getCompilerContext, isDefineElementRenderRoot } from '../context'
import { lowerJSX } from '../lower'
import {
  analyzeBindings,
  assignDomPaths,
  assignPhysicalDomPaths,
  collectTemplates,
  normalizeChildren,
  validateBuiltins,
} from '../passes'

import type { BabelJSXPath, BabelState, CompilerOptions } from '../types'

export function transformJSX(
  path: BabelJSXPath,
  state: BabelState,
  config: CompilerOptions,
) {
  if (state.get('skip')) return
  if (!path.isJSXElement() && !path.isJSXFragment()) return

  const context = getCompilerContext(path, config)
  const ir = lowerJSX(path, context)

  normalizeChildren(ir)

  if (config.generate === 'ssr') {
    assertSSRSupported(ir, state.filename)
  }

  validateBuiltins(ir, {
    isDefineElementRenderRoot: isDefineElementRenderRoot(path),
    filename: state.filename,
  })
  analyzeBindings(ir)

  if (config.generate === 'ssr') {
    path.replaceWith(emitSSR(ir, context))
    return
  }

  assignDomPaths(ir)
  assignPhysicalDomPaths(ir)
  collectTemplates(ir, context)
  path.replaceWith(emitDOM(ir, context))
}
