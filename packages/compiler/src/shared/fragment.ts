import * as t from '@babel/types'
import { decode } from 'html-entities'
import { filterChildren, trimWhitespace } from './utils'
import { transformNode, getCreateTemplate } from './transform'

export default function transformFragmentChildren(children: any[], results: any, config: any): void {
  const filteredChildren = filterChildren(children)
  const childNodes = filteredChildren.reduce((memo: any[], path: any) => {
    if (t.isJSXText(path.node)) {
      const v = decode(trimWhitespace(path.node.extra.raw))
      if (v.length) memo.push(t.stringLiteral(v))
    } else {
      const child = transformNode(path, { topLevel: true, fragmentChild: true, lastElement: true })
      memo.push(getCreateTemplate(config, path, child)(path, child, true))
    }
    return memo
  }, [])
  results.exprs.push(childNodes.length === 1 ? childNodes[0] : t.arrayExpression(childNodes))
}
