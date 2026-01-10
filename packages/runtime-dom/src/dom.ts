// packages/runtime-dom/src/dom.ts

export function createElement(
  tag: string,
  props?: any,
  ...children: any[]
): Element {
  const el = document.createElement(tag)

  if (props) {
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'className') {
        el.className = value as string
      } else if (key.startsWith('on') && typeof value === 'function') {
        // @ts-expect-error
        el.addEventListener(key.slice(2).toLowerCase(), value)
      } else {
        el.setAttribute(key, String(value))
      }
    })
  }

  children.forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child))
    } else if (child) {
      el.appendChild(child)
    }
  })

  return el
}

export function createText(text: string): Text {
  return document.createTextNode(text)
}

export function createFragment(children: (Element | Text)[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  children.forEach(child => fragment.appendChild(child))
  return fragment
}
