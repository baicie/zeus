// eslint-disable-next-line @typescript-eslint/no-require-imports
const parse5 = require('parse5')

const bodyElement = parse5.parse('<!DOCTYPE html><html><head></head><body></body></html>').childNodes[1]
  .childNodes[1]

function innerHTML(htmlFragment: string): string {
  const parsedFragment = parse5.parseFragment(bodyElement, htmlFragment)
  return parse5.serialize(parsedFragment)
}

export function isInvalidMarkup(html: string): { html: string; browser: string } | undefined {
  html = html
    .replaceAll('<!>', '<!---->')
    .replaceAll('<!$>', '<!--$-->')
    .replaceAll('<!/>', '<!--/-->')
    .replace(/^[^<]+/, '#text')
    .replace(/[^>]+$/, '#text')
    .replace(/>[^<]+</gi, '>#text<')
    .replace(/&lt;([^>]+)>/gi, '&lt;$1&gt;')

  if (/^<(td|th)>/.test(html)) html = `<table><tbody><tr>${html}</tr></tbody></table>`
  if (/^<tr>/.test(html)) html = `<table><tbody>${html}</tbody></table>`
  if (/^<col>/.test(html)) html = `<table><colgroup>${html}</colgroup></table>`
  if (/^<(thead|tbody|tfoot|colgroup|caption)>/.test(html)) html = `<table>${html}</table>`

  switch (html) {
    case '<table></table>':
    case '<table><thead></thead></table>':
    case '<table><tbody></tbody></table>':
    case '<table><thead></thead><tbody></tbody></table>':
      return
  }

  const browser = innerHTML(html)
  if (html.toLowerCase() !== browser.toLowerCase()) return { html, browser }
}
