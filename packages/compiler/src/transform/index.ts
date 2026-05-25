import { transformNode } from './node'
import { emitDOM } from '../codegen/dom'
import { createTemplate } from '../codegen/template'
import { getCompilerContext } from '../context'
import { lowerJSX } from '../lower'
import { isDynamicResult, isElementResult } from '../parse/jsx'
import {
  analyzeBindings,
  assignDomPaths,
  collectTemplates,
  normalizeChildren,
  validateBuiltins,
} from '../passes'
import { logger } from '../utils'

import type { BabelJSXPath, BabelState, CompilerOptions } from '../types'

export function transformJSX(
  path: BabelJSXPath,
  state: BabelState,
  config: CompilerOptions,
) {
  if (state.get('skip')) return
  if (!path.isJSXElement() && !path.isJSXFragment()) return

  if (config.irPipeline) {
    const context = getCompilerContext(path, config)
    const ir = lowerJSX(path, context)

    normalizeChildren(ir)
    validateBuiltins(ir)
    assignDomPaths(ir)
    analyzeBindings(ir)
    collectTemplates(ir, context)

    path.replaceWith(emitDOM(ir, context))
    return
  }

  const result = transformNode(path, state)
  if (!result) return

  logger.info(result)

  if (isElementResult(result)) {
    path.replaceWith(createTemplate(path, result))
    return
  }

  if (isDynamicResult(result)) {
    path.replaceWith(result.expr)
  }
}
