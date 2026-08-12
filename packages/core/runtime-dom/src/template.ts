import type { TemplateFactory } from './types'

export function template<T extends Node = Node>(
  html: string,
  _isImportNode = false,
  isSVG = false,
  _isMathML = false,
): TemplateFactory<T> {
  const content = isSVG ? createSvgContent(html) : createHtmlContent(html)

  return function clone(): T {
    return content.cloneNode(true) as T
  }
}

function createHtmlContent(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

function createSvgContent(html: string): DocumentFragment {
  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  wrapper.innerHTML = html

  const content = document.createDocumentFragment()
  while (wrapper.firstChild) {
    content.appendChild(wrapper.firstChild)
  }
  return content
}
