import SyntaxJSX from '@babel/plugin-syntax-jsx'
import { transformJSX } from './shared/transform'
import postprocess from './shared/postprocess'
import preprocess from './shared/preprocess'
import type * as BabelCore from '@babel/core'

export default (): {
  name: string
  inherits: any
  visitor: BabelCore.Visitor
} => {
  return {
    name: '@zeus-js/compiler',
    inherits: SyntaxJSX.default,
    visitor: {
      JSXElement: transformJSX,
      JSXFragment: transformJSX,
      Program: {
        enter: preprocess,
        exit: postprocess,
      },
    },
  }
}
