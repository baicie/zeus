import { createProgramVisitor } from './program'
import { transformJSX } from './transform'

import type { BabelVisitor, CompilerOptions } from './utils/types'

export function createVisitor(config: CompilerOptions): BabelVisitor {
  return {
    JSXElement: transformJSX,
    JSXFragment: transformJSX,
    Program: createProgramVisitor(config),
  }
}
