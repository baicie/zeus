import { emitDOM } from '../codegen/dom'
import { getCompilerContext } from '../context'
import { lowerJSX } from '../lower'
import {
  analyzeBindings,
  assignDomPaths,
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
  validateBuiltins(ir)
  assignDomPaths(ir)
  analyzeBindings(ir)
  collectTemplates(ir, context)

  path.replaceWith(emitDOM(ir, context))
}
