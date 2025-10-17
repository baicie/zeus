import * as t from '@babel/types'
import { decode } from 'html-entities'
import { filterChildren, trimWhitespace } from './utils'
import { getCreateTemplate, transformNode } from './transform'
import type { NodePath } from '@babel/core'
import type { NodePathHub } from '../type'

export default function transformFragmentChildren(
  children: NodePath<any>[],
  results: any,
  config: any,
): void {
  const filteredChildren = filterChildren(children),
    childNodes = filteredChildren.reduce((memo, path) => {
      if (t.isJSXText(path.node)) {
        const v = decode(trimWhitespace(path.node.extra!.raw as string))
        if (v.length) memo.push(t.stringLiteral(v))
      } else {
        const child = transformNode(path as NodePathHub, {
          topLevel: true,
          fragmentChild: true,
          lastElement: true,
        })
        memo.push(
          getCreateTemplate(config, path as any, child!)(
            path as any,
            child!,
            true,
          ),
        )
      }
      return memo
    }, [] as any[])
  results.exprs.push(
    childNodes.length === 1 ? childNodes[0] : t.arrayExpression(childNodes),
  )
}
