import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { TransformInfo, TransformResult } from '../shared/types'
import { getTagName, isComponent } from '../shared/dynamic'
import { transformElementDOM } from './dom/element'
import { transformComponent } from './component'
import { transformFragmentNode } from './fragment'

export function transformSubtree(
  path: NodePath<t.JSXElement | t.JSXFragment>,
  info: TransformInfo,
): TransformResult {
  const node = path.node
  if (node.type === 'JSXElement') {
    const tag = getTagName(node)
    if (isComponent(tag)) {
      return transformComponent(path as NodePath<t.JSXElement>)
    }
    return transformElementDOM(path as NodePath<t.JSXElement>, info)
  }
  if (node.type === 'JSXFragment') {
    return transformFragmentNode(path as NodePath<t.JSXFragment>, info)
  }
  return emptyResult()
}

function emptyResult(): TransformResult {
  return {
    template: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
  }
}
