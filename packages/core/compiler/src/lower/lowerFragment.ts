import { lowerChildren } from './lowerChildren'
import { fragmentIR } from '../ir/semanticBuilders'

import type { CompilerContext } from '../context'
import type { FragmentIR } from '../ir/nodes'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'

export function lowerFragment(
  path: NodePath<t.JSXFragment>,
  context: CompilerContext,
): FragmentIR {
  return fragmentIR(lowerChildren(path.get('children'), context))
}
