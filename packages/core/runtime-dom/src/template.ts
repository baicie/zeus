import type { TemplateFactory } from './types'

export function template<T extends Node = Node>(
  html: string,
  _isImportNode = false,
  _isSVG = false,
  _isMathML = false,
): TemplateFactory<T> {
  const t = document.createElement('template')
  t.innerHTML = html

  return function clone(): T {
    return t.content.cloneNode(true) as T
  }
}
