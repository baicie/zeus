import { elementIR, ref } from '@zeus-js/compiler-shared'

import { lowerAttribute } from './lowerAttribute'
import { isBuiltinTag, lowerBuiltin } from './lowerBuiltin'
import { lowerChildren } from './lowerChildren'
import { lowerComponent } from './lowerComponent'
import { sourceSpanFromBabelNode } from '../adapters/babel/expression'
import { getTagName, isComponentTag } from '../parse/jsx'
import { VoidElements } from '../utils'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { ElementIR, ZeusIRNode } from '@zeus-js/compiler-shared'

export function lowerElement(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const tagName = getTagName(path.node)

  if (isBuiltinTag(tagName)) {
    return lowerBuiltin(path, context)
  }

  if (isComponentTag(tagName)) {
    return lowerComponent(path, context)
  }

  const attrs = path
    .get('openingElement')
    .get('attributes')
    .map(attr => lowerAttribute(attr, context))
    .filter(Boolean) as ElementIR['attrs']

  return elementIR({
    ref: ref(context.uid('el$').name),
    tagName,
    attrs,
    children: VoidElements.includes(tagName)
      ? []
      : lowerChildren(path.get('children'), context),
    span: sourceSpanFromBabelNode(path.node),
    flags: {
      isVoid: VoidElements.includes(tagName),
      isCustomElement: tagName.includes('-'),
    },
  })
}
