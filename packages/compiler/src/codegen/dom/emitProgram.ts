import { emitDOM } from './index'

import type { CompilerContext } from '../../context'
import type { ProgramIR } from '../../ir/nodes'
import type * as t from '@babel/types'

export function emitProgram(
  program: ProgramIR,
  context: CompilerContext,
): t.Expression[] {
  return program.body.map(node => emitDOM(node, context))
}
