import { lowerElement } from './lowerElement'
import { lowerFragment } from './lowerFragment'

import type { CompilerContext } from '../context'
import type { ZeusIRNode } from '../ir/nodes'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'

export function lowerJSX(
  path: NodePath<t.JSXElement | t.JSXFragment>,
  context: CompilerContext,
): ZeusIRNode {
  if (path.isJSXElement()) {
    return lowerElement(path, context)
  }

  if (path.isJSXFragment()) {
    return lowerFragment(path, context)
  }

  throw new Error('Unsupported JSX node')
}
