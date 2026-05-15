/**
 * IR composition helpers.
 *
 * Utilities for composing IR nodes — merging children into parents and
 * converting between IR shapes. These are the single authoritative place
 * for parent-child IR composition logic.
 */
import type { IRNode, IRResults } from './types'

/**
 * Convert a typed IR node back to the legacy flat TransformResults shape.
 */
export function toTransformResults(node: IRNode): IRResults {
  return node as unknown as IRResults
}

/**
 * Create an IR node from an existing TransformResults (for incremental migration).
 */
export function fromTransformResults(results: IRResults): IRNode {
  return results as unknown as IRNode
}

/**
 * Collects transformed children into the parent IR node.
 * Used by both element and fragment transforms to avoid duplication.
 */
export function appendChildIR(parent: IRResults, child: IRResults): void {
  parent.template += child.template
  parent.templateWithClosingTags +=
    child.templateWithClosingTags || child.template

  parent.declarations.push(...child.declarations)
  parent.exprs.push(...child.exprs)
  parent.dynamics.push(...child.dynamics)
  parent.postExprs.push(...child.postExprs)

  parent.isSVG ||= child.isSVG
  parent.hasCustomElement ||= child.hasCustomElement
  parent.isImportNode ||= child.isImportNode
  parent.hasHydratableEvent ||= child.hasHydratableEvent
}

/** Filters out empty JSX children (whitespace-only text, empty expressions). */
export function filterChildrenPaths(
  children: Array<{
    isJSXText: () => boolean
    isJSXExpressionContainer: () => boolean
    node: { value?: string; expression?: unknown }
  }>,
): typeof children {
  return children.filter(child => {
    if (child.isJSXText()) {
      return child.node.value?.trim() !== ''
    }
    if (child.isJSXExpressionContainer()) {
      return child.node.expression != null
    }
    return true
  })
}
