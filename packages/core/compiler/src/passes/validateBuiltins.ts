import { CompilerError, CompilerErrorCode } from '../diagnostics'

import type { ZeusIRNode } from '@zeus-js/compiler-shared'

export interface ValidateBuiltinsOptions {
  isDefineElementRenderRoot: boolean
  filename?: string
}

export function validateBuiltins(
  node: ZeusIRNode,
  options: ValidateBuiltinsOptions,
): void {
  visit(node, {
    isDefineElementRenderRoot: options.isDefineElementRenderRoot,
    filename: options.filename,
    insideHost: false,
    root: true,
  })
}

type ValidateState = {
  isDefineElementRenderRoot: boolean
  filename?: string
  insideHost: boolean
  root: boolean
}

function visit(node: ZeusIRNode, state: ValidateState): void {
  switch (node.kind) {
    case 'Host':
      if (!state.isDefineElementRenderRoot || !state.root) {
        throw new CompilerError({
          code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
          message: '<Host> can only be used as a defineElement root boundary.',
          filename: state.filename,
          span: node.span,
          hint: 'Return <Host> directly from the defineElement setup function.',
        })
      }

      if (node.child) {
        visit(node.child, { ...state, insideHost: true, root: false })
      }
      return

    case 'Slot':
      if (!state.insideHost) {
        throw new CompilerError({
          code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
          message:
            '<Slot> can only be used inside the defineElement Host boundary.',
          filename: state.filename,
          span: node.span,
          hint: 'Place <Slot> inside the root <Host> returned by defineElement setup.',
        })
      }

      for (const child of node.fallback) {
        visit(child, { ...state, root: false })
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
