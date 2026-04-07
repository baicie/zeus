import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { TransformInfo, TransformResult } from '../shared/types'
import { getTagName, isComponent } from '../shared/dynamic'
import { getConfig } from '../shared/utils'
import { transformElementDOM } from './dom/element'
import { transformComponent } from './component'
import { transformFragmentNode } from './fragment'
import { transformElementSSR } from './ssr/element'

export function transformSubtree(
  path: NodePath<t.JSXElement | t.JSXFragment>,
  info: TransformInfo,
): TransformResult {
  const node = path.node
  if (node.type === 'JSXElement') {
    const config = getConfig(path)
    const tag = getTagName(node)
    if (isComponent(tag)) {
      return transformComponent(path as NodePath<t.JSXElement>)
    }
    if (config.generate === 'ssr') {
      return transformElementSSR(path as NodePath<t.JSXElement>, info)
    }
    if (config.generate === 'universal') {
      return transformElementDOM(path as NodePath<t.JSXElement>, info)
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
