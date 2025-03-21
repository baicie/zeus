import { type ParseResult, parse as babelParse } from '@babel/parser'
import type { File } from '@babel/types'
import type { AttributeNode, ElementNode, RootNode } from './ast'
import { NodeTypes } from './ast'

export interface ParserOptions {
  isVoidTag?: (tag: string) => boolean
  isNativeTag?: (tag: string) => boolean
  isPreTag?: (tag: string) => boolean
}

export function parse(template: string, options: ParserOptions = {}): RootNode {
  // 使用 Babel 解析 JSX
  const ast = babelParse(template, {
    plugins: ['jsx', 'typescript'],
  })

  // 转换 Babel AST 到我们的 AST
  return transformBabelAst(ast)
}

function transformBabelAst(babelAst: ParseResult<File>): RootNode {
  return {
    type: NodeTypes.ROOT,
    children: babelAst.program.body
      .filter(node => node.type === 'JSXElement')
      .map(transformJSXElement),
    helpers: [],
    loc: babelAst.loc,
  }
}
