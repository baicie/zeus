// @ts-nocheck

export function isInvalidMarkup(
  html: string,
): { html: string; browser: string } | undefined {
  html = html
    .replaceAll('<!>', '<!---->')
    .replaceAll('<!$>', '<!--$-->')
    .replaceAll('<!/>', '<!--/-->')
    .replace(/^[^<]+/, '#text')
    .replace(/[^>]+$/, '#text')
    .replace(/>[^<]+</gi, '>#text<')
    .replace(/&lt;([^>]+)>/gi, '&lt;$1&gt;')

  if (/^<(td|th)>/.test(html))
    html = `<table><tbody><tr>${html}</tr></tbody></table>`
  if (/^<tr>/.test(html)) html = `<table><tbody>${html}</tbody></table>`
  if (/^<col>/.test(html)) html = `<table><colgroup>${html}</colgroup></table>`
  if (/^<(thead|tbody|tfoot|colgroup|caption)>/.test(html))
    html = `<table>${html}</table>`

  switch (html) {
    case '<table></table>':
    case '<table><thead></thead></table>':
    case '<table><tbody></tbody></table>':
    case '<table><thead></thead><tbody></tbody></table>':
      return
  }

  return undefined
}
