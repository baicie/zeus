import { fragmentIR, type ZeusIRNode } from '../ir'
import { lowerChildren } from './lowerChildren'
import { lowerComponent } from './lowerComponent'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'

export function isBuiltinTag(tagName: string): boolean {
  return (
    tagName === 'Show' ||
    tagName === 'For' ||
    tagName === 'Host' ||
    tagName === 'Slot'
  )
}

export function lowerBuiltin(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const tagName = path.node.openingElement.name

  if (tagName.type !== 'JSXIdentifier') {
    return lowerComponent(path, context)
  }

  if (tagName.name === 'Host' || tagName.name === 'Slot') {
    return fragmentIR(lowerChildren(path.get('children'), context))
  }

  return lowerComponent(path, context)
}
