// Slot transformation

import type { SlotBindingIR, BindingIR } from '@zeusjs/compiler-shared'

export interface SlotTransformContext {
  bindings: BindingIR[]
  insideHost: boolean
}

export function visitSlot(
  attributes: any[],
  ctx: SlotTransformContext,
  path: number[],
): BindingIR | null {
  // Validate Slot usage
  if (!ctx.insideHost) {
    // This should trigger a diagnostic error
    // Slot can only be used inside Host
    return null
  }

  // Extract slot name
  let slotName: string | undefined

  for (const attr of attributes) {
    if (attr.type === 'JSXAttribute') {
      const name = attr.name?.name
      const value = attr.value

      if (name === 'name') {
        if (value.type === 'JSXExpressionContainer') {
          slotName = value.expression.value
        } else if (value.type === 'StringLiteral') {
          slotName = value.value
        }
      }
    }
  }

  return {
    type: 'slot',
    path,
    name: slotName,
  } as SlotBindingIR
}

export function generateSlotCode(binding: SlotBindingIR): string {
  if (binding.name) {
    return `createSlotMarker("${binding.name}")`
  }
  return 'createSlotMarker(null)'
}
