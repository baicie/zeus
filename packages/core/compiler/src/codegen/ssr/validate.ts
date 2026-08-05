import { isSSRPropertySupported } from './property'
import { getSSRRawTextTag } from './rawText'
import { CompilerError, CompilerErrorCode } from '../../diagnostics'

import type { SSRRawTextTag } from './rawText'
import type {
  ComponentIR,
  ElementIR,
  HostIR,
  PropBindingIR,
  SlotIR,
  ZeusIRNode,
} from '@zeus-js/compiler-shared'

export function assertSSRSupported(
  node: ZeusIRNode,
  filename?: string,
  rawTextTag?: SSRRawTextTag,
): void {
  if (rawTextTag && (node.kind === 'Element' || node.kind === 'Component')) {
    throwUnsupportedSSRRawTextChild(node, rawTextTag, filename)
  }

  switch (node.kind) {
    case 'Host':
    case 'Slot':
      throwUnsupportedSSRBuiltin(node, filename)

    case 'Element':
      for (const attribute of node.attrs) {
        if (
          attribute.kind === 'PropBinding' &&
          !isSSRPropertySupported(node.tagName, attribute.name)
        ) {
          throwUnsupportedSSRProperty(node, attribute, filename)
        }
      }
      const childRawTextTag = getSSRRawTextTag(node.tagName)
      for (const child of node.children) {
        assertSSRSupported(child, filename, childRawTextTag)
      }
      return

    case 'Fragment':
      for (const child of node.children) {
        assertSSRSupported(child, filename, rawTextTag)
      }
      return

    case 'Component':
      for (const prop of node.props) {
        if (!Array.isArray(prop.value)) continue
        for (const child of prop.value) {
          assertSSRSupported(child, filename)
        }
      }
      return

    case 'Show':
      for (const child of node.children) {
        assertSSRSupported(child, filename, rawTextTag)
      }
      if (Array.isArray(node.fallback)) {
        for (const child of node.fallback) {
          assertSSRSupported(child, filename, rawTextTag)
        }
      }
      return

    case 'For':
      for (const child of node.body) {
        assertSSRSupported(child, filename, rawTextTag)
      }
      return

    case 'Text':
    case 'DynamicText':
      return
  }
}

function throwUnsupportedSSRRawTextChild(
  node: ElementIR | ComponentIR,
  tag: SSRRawTextTag,
  filename?: string,
): never {
  throw new CompilerError({
    code: CompilerErrorCode.UNSUPPORTED_SSR_RAW_TEXT_CHILD,
    message: `${node.kind} children are not supported inside <${tag}> SSR raw text.`,
    hint: 'Use text expressions, Fragment, Show, or For directly inside the raw-text element.',
    filename,
    span: node.span,
  })
}

function throwUnsupportedSSRProperty(
  element: ElementIR,
  property: PropBindingIR,
  filename?: string,
): never {
  throw new CompilerError({
    code: CompilerErrorCode.UNSUPPORTED_SSR_PROPERTY,
    message: `Property "${property.name}" on <${element.tagName}> cannot be serialized by SSR codegen.`,
    hint: 'Use an equivalent HTML attribute binding or move this DOM-only property update to client code.',
    filename,
    span: property.span ?? property.expr.span ?? element.span,
  })
}

export function throwUnsupportedSSRBuiltin(
  node: HostIR | SlotIR,
  filename?: string,
): never {
  throw new CompilerError({
    code: CompilerErrorCode.UNSUPPORTED_SSR_BUILTIN,
    message: `<${node.kind}> is not supported by SSR codegen.`,
    hint: 'Render Web Components on the client; the SSR baseline supports DOM components only.',
    filename,
    span: node.span,
  })
}
