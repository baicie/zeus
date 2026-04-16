// JSX-related types and constants

export const JSX_COMPONENTS = {
  Show: 'zeus.internal.show',
  For: 'zeus.internal.for',
  Host: 'zeus.internal.host',
  Slot: 'zeus.internal.slot',
  Fragment: 'zeus.internal.fragment',
} as const

export type JSXComponentName = keyof typeof JSX_COMPONENTS

export function isBuiltInComponent(tagName: string): boolean {
  return tagName in JSX_COMPONENTS
}

export function isShow(tagName: string): boolean {
  return tagName === 'Show' || tagName === JSX_COMPONENTS.Show
}

export function isFor(tagName: string): boolean {
  return tagName === 'For' || tagName === JSX_COMPONENTS.For
}

export function isHost(tagName: string): boolean {
  return tagName === 'Host' || tagName === JSX_COMPONENTS.Host
}

export function isSlot(tagName: string): boolean {
  return tagName === 'Slot' || tagName === JSX_COMPONENTS.Slot
}

export function isFragment(tagName: string | null): boolean {
  if (!tagName) return false
  return tagName === 'Fragment' ||
         tagName === JSX_COMPONENTS.Fragment ||
         tagName === ''
}

export interface JSXElementInfo {
  tagName: string
  isComponent: boolean
  isBuiltIn: boolean
  isSelfClosing: boolean
}

export function analyzeJSXElement(tagName: string, hasChildren: boolean): JSXElementInfo {
  const normalizedTag = tagName.trim()

  if (isFragment(normalizedTag)) {
    return {
      tagName: normalizedTag,
      isComponent: false,
      isBuiltIn: false,
      isSelfClosing: false,
    }
  }

  const isComponent = /^[A-Z]/.test(normalizedTag) || normalizedTag.includes('.')

  return {
    tagName: normalizedTag,
    isComponent,
    isBuiltIn: isBuiltInComponent(normalizedTag),
    isSelfClosing: !hasChildren,
  }
}

export function getTagName(node: any): string | null {
  if (node.openingElement) {
    const name = node.openingElement.name
    if (name.type === 'JSXIdentifier') return name.name
    if (name.type === 'JSXNamespacedName') return `${name.namespace}:${name.name}`
    if (name.type === 'JSXMemberExpression') {
      return [name.object, name.property].map(n => n.name).join('.')
    }
  }
  return null
}
