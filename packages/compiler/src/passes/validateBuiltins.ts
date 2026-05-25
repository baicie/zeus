import { CompilerError, CompilerErrorCode } from '../diagnostics'

import type { ZeusIRNode } from '../ir/nodes'

export function validateBuiltins(node: ZeusIRNode): void {
  visit(node, {
    insideHost: false,
  })
}

type ValidateState = {
  insideHost: boolean
}

function visit(node: ZeusIRNode, state: ValidateState): void {
  switch (node.kind) {
    case 'Host':
      for (const child of node.children) {
        visit(child, { insideHost: true })
      }
      return

    case 'Slot':
      if (!state.insideHost) {
        throw new CompilerError({
          code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
          message: '<Slot> can only be used inside <Host>.',
        })
      }
      return

    case 'Element':
    case 'Fragment':
      for (const child of node.children) {
        visit(child, state)
      }
      return

    default:
      return
  }
}
