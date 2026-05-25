import { CompilerError, CompilerErrorCode } from '../diagnostics'

import type { ZeusIRNode } from '../ir/nodes'

export function validateBuiltins(node: ZeusIRNode): void {
  visit(node, {
    insideHost: false,
    root: true,
  })
}

type ValidateState = {
  insideHost: boolean
  root: boolean
}

function visit(node: ZeusIRNode, state: ValidateState): void {
  switch (node.kind) {
    case 'Host':
      if (!state.root) {
        throw new CompilerError({
          code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
          message: '<Host> can only be used as a root host boundary.',
        })
      }

      for (const child of node.children) {
        visit(child, { insideHost: true, root: false })
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
        visit(child, { ...state, root: false })
      }
      return

    case 'Component':
      for (const prop of node.props) {
        if (!Array.isArray(prop.value)) continue
        for (const child of prop.value) {
          visit(child, { ...state, root: false })
        }
      }
      return

    case 'Show':
      for (const child of node.children) {
        visit(child, { ...state, root: false })
      }
      if (Array.isArray(node.fallback)) {
        for (const child of node.fallback) {
          visit(child, { ...state, root: false })
        }
      }
      return

    case 'For':
      for (const child of node.body) {
        visit(child, { ...state, root: false })
      }
      return

    default:
      return
  }
}
