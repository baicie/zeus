const templateCache = new Map<string, HTMLTemplateElement>()

export function createTemplate(html: string): () => Node {
  let tpl = templateCache.get(html)
  if (!tpl) {
    tpl = document.createElement('template')
    tpl.innerHTML = html
    templateCache.set(html, tpl)
  }
  return () => tpl!.content.firstChild!.cloneNode(true)
}

export function createTemplateFragment(html: string): () => DocumentFragment {
  let tpl = templateCache.get(html)
  if (!tpl) {
    tpl = document.createElement('template')
    tpl.innerHTML = html
    templateCache.set(html, tpl)
  }
  return () => tpl!.content.cloneNode(true) as DocumentFragment
}
