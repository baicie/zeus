import type { ElementIR, ZeusIRNode } from './nodes'

export function assertElementIR(node: ZeusIRNode): asserts node is ElementIR {
  if (node.kind !== 'Element') {
    throw new Error(`Expected Element IR, received ${node.kind}.`)
  }
}

export function assertNeverIR(node: never): never {
  throw new Error(`Unhandled IR node ${(node as ZeusIRNode).kind}.`)
}
