import { fragmentIR } from '@zeus-js/compiler-shared'

import { lowerChildren } from './lowerChildren'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { FragmentIR } from '@zeus-js/compiler-shared'

export function lowerFragment(
  path: NodePath<t.JSXFragment>,
  context: CompilerContext,
): FragmentIR {
  return fragmentIR(lowerChildren(path.get('children'), context))
}
