import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { transformJSX } from './shared/transform'
import postprocess from './shared/postprocess'
import preprocess from './shared/preprocess'
import type { Visitor } from '@babel/core'

export default function plugin(
  _options?: any,
  _state?: any,
): {
  name: string
  inherits: any
  visitor: Visitor<{ opts: any; skip?: boolean }>
} {
  return {
    name: 'JSX DOM Expressions',
    inherits: (SyntaxJSX as any).default,
    visitor: {
      JSXElement: transformJSX as any,
      JSXFragment: transformJSX as any,
      Program: {
        enter: preprocess as any,
        exit: postprocess as any,
      },
    },
  }
}
