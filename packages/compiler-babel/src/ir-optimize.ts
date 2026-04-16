// IR optimizer - optimizes the IR before code generation

import type { TemplateIR, BindingIR, TextBindingIR, AttrBindingIR, PropBindingIR, EventBindingIR, ShowBindingIR, ForBindingIR } from '@zeusjs/compiler-shared'

export interface OptimizerOptions {
  removeEmptyBindings?: boolean
  mergeStaticBindings?: boolean
  optimizeTemplates?: boolean
}

export function optimizeIR(ir: TemplateIR, options: OptimizerOptions = {}): TemplateIR {
  const {
    removeEmptyBindings = true,
    mergeStaticBindings = true,
    optimizeTemplates = true,
  } = options

  let bindings = ir.bindings

  if (removeEmptyBindings) {
    bindings = removeEmptyBindingsFn(bindings)
  }

  if (mergeStaticBindings) {
    bindings = mergeStaticBindingsFn(bindings)
  }

  if (optimizeTemplates) {
    ir = optimizeTemplate(ir)
  }

  return {
    ...ir,
    bindings,
  }
}

function removeEmptyBindingsFn(bindings: BindingIR[]): BindingIR[] {
  return bindings.filter(binding => {
    if (binding.type === 'show') {
      return binding.body !== null
    }
    if (binding.type === 'for') {
      return binding.body !== null
    }
    return true
  })
}

function mergeStaticBindingsFn(bindings: BindingIR[]): BindingIR[] {
  // Group consecutive static text bindings that could be merged
  const merged: BindingIR[] = []
  let i = 0

  while (i < bindings.length) {
    const current = bindings[i]

    // Look ahead for consecutive static text bindings
    if (current.type === 'text' && isStaticExpr(current.expr)) {
      const staticParts: string[] = []
      const paths: number[][] = []

      while (i < bindings.length && current.type === 'text' && isStaticExpr(current.expr)) {
        const value = getStaticValue(current.expr)
        if (value !== undefined) {
          staticParts.push(String(value))
          paths.push(current.path)
        }
        i++
        if (i < bindings.length) {
          continue
        }
      }

      // If we found multiple consecutive static bindings, keep them separate for now
      // In a more advanced version, we could merge them into the template HTML
      merged.push(current)
    } else {
      merged.push(current)
      i++
    }
  }

  return merged
}

function optimizeTemplate(ir: TemplateIR): TemplateIR {
  // Remove unnecessary whitespace in templates
  let html = ir.html

  // Remove empty attributes
  html = html.replace(/\s+(\w+)=""/g, ' $1')

  return {
    ...ir,
    html,
  }
}

function isStaticExpr(expr: any): boolean {
  return expr.reactiveHint === 'static'
}

function getStaticValue(expr: any): any {
  if (expr.node?.type === 'StringLiteral') return expr.node.value
  if (expr.node?.type === 'NumericLiteral') return expr.node.value
  if (expr.node?.type === 'BooleanLiteral') return expr.node.value
  return undefined
}
