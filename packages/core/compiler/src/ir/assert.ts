import { CompilerError, CompilerErrorCode } from '../diagnostics'

import type { ElementIR, ZeusIRNode } from './nodes'

export function assertElementIR(node: ZeusIRNode): asserts node is ElementIR {
  if (node.kind !== 'Element') {
    throw new CompilerError({
      code: CompilerErrorCode.INVALID_TRANSFORM_RESULT,
      message: `Expected Element IR, received ${node.kind}.`,
    })
  }
}

export function assertNeverIR(node: never): never {
  throw new CompilerError({
    code: CompilerErrorCode.INVALID_TRANSFORM_RESULT,
    message: `Unhandled IR node ${(node as ZeusIRNode).kind}.`,
  })
}
