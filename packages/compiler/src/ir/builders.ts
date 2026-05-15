/**
 * IR builder utilities.
 *
 * Factory functions for creating typed IR nodes without going through
 * the full transform pipeline. Useful for codegen helpers and test fixtures.
 */
import * as t from '@babel/types'

import {
  createElementIR,
  createTextIR,
  createDynamicIR,
  type ElementIRNode,
  type TextIRNode,
  type DynamicIRNode,
  type IRNode,
} from './types'

import type { BabelExpression, BabelIdentifier } from '../types'

export { createElementIR, createTextIR, createDynamicIR }
export type { ElementIRNode, TextIRNode, DynamicIRNode, IRNode }

/**
 * Builds an element IR node with an open tag and optional children.
 */
export function buildElement(
  tagName: string,
  options?: {
    children?: IRNode[]
    attrs?: Array<{ key: string; value: string | BabelExpression }>
    id?: BabelIdentifier
  },
): ElementIRNode {
  const id = options?.id ?? t.identifier(`_el${tagName.replace('-', '_')}`)
  const ir = createElementIR(tagName, id)

  if (options?.attrs) {
    for (const attr of options.attrs) {
      if (typeof attr.value === 'string') {
        ir.template += ` ${attr.key}="${attr.value}"`
        ir.templateWithClosingTags += ` ${attr.key}="${attr.value}"`
      }
    }
  }

  ir.template += '>'
  ir.templateWithClosingTags += '>'

  if (options?.children) {
    for (const child of options.children) {
      ir.template += child.template
      ir.templateWithClosingTags +=
        child.templateWithClosingTags || child.template
      ir.declarations.push(...child.declarations)
      ir.exprs.push(...child.exprs)
      ir.dynamics.push(...child.dynamics)
      ir.postExprs.push(...child.postExprs)
      ir.isSVG ||= child.isSVG
      ir.hasCustomElement ||= child.hasCustomElement
      ir.isImportNode ||= child.isImportNode
    }
  }

  const voidTags = [
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]
  if (!voidTags.includes(tagName)) {
    ir.template += `</${tagName}>`
    ir.templateWithClosingTags += `</${tagName}>`
  }

  return ir
}

/**
 * Builds a text IR node from a raw string (will be HTML-escaped).
 */
export function buildText(text: string): TextIRNode {
  return createTextIR(
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  )
}

/**
 * Builds a dynamic IR node from an expression.
 */
export function buildDynamic(expr: BabelExpression): DynamicIRNode {
  return createDynamicIR(expr)
}
