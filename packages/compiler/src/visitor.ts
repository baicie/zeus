import { createProgramVisitor } from './program'
import { transformJSX } from './transform'

import type { BabelVisitor, CompilerOptions } from './types'

export function createVisitor(config: CompilerOptions): BabelVisitor {
  return {
    JSXElement(path, state) {
      transformJSX(path, state, config)
    },
    JSXFragment(path, state) {
      transformJSX(path, state, config)
    },
    Program: createProgramVisitor(config),
  }
}
