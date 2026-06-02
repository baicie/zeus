import type { ZeusIRNode } from '../ir/nodes'

export type BindingAnalysis = {
  dynamicText: number
  dynamicAttrs: number
  events: number
  components: number
}

export function analyzeBindings(node: ZeusIRNode): BindingAnalysis {
  const analysis: BindingAnalysis = {
    dynamicText: 0,
    dynamicAttrs: 0,
    events: 0,
    components: 0,
  }

  visit(node, analysis)
  return analysis
}

function visit(node: ZeusIRNode, analysis: BindingAnalysis): void {
  switch (node.kind) {
    case 'Element':
      for (const attr of node.attrs) {
        if (attr.kind === 'AttrBinding' || attr.kind === 'PropBinding') {
          analysis.dynamicAttrs++
        }

        if (attr.kind === 'EventBinding') {
          analysis.events++
        }
      }

      for (const child of node.children) visit(child, analysis)
      return

    case 'DynamicText':
      analysis.dynamicText++
      return

    case 'Component':
      analysis.components++
      for (const prop of node.props) {
        if (!Array.isArray(prop.value)) continue
        for (const child of prop.value) visit(child, analysis)
      }
      return

    case 'Fragment':
      for (const child of node.children) visit(child, analysis)
      return

    case 'Host':
      if (node.child) visit(node.child, analysis)
      return

    case 'Slot':
      for (const child of node.fallback) visit(child, analysis)
      return

    case 'Show':
      for (const child of node.children) visit(child, analysis)
      if (Array.isArray(node.fallback)) {
        for (const child of node.fallback) visit(child, analysis)
      }
      return

    case 'For':
      for (const child of node.body) visit(child, analysis)
      return

    case 'Text':
      return
  }
}
