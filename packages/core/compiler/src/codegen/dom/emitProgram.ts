import { emitDOM } from './index'

import type { CompilerContext } from '../../context'
import type * as t from '@babel/types'
import type { ProgramIR } from '@zeus-js/compiler-shared'

export function emitProgram(
  program: ProgramIR,
  context: CompilerContext,
): t.Expression[] {
  return program.body.map(node => emitDOM(node, context))
}
