export interface ParsedSvg {
  viewBox: string
  innerSvg: string
}

export function parseSvg(source: string): ParsedSvg {
  const safe = sanitizeSvg(source)
  const svgMatch = safe.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i)

  if (!svgMatch) {
    throw new Error('Invalid SVG source. Expected <svg>...</svg>.')
  }

  const attrs = svgMatch[1] ?? ''
  const innerSvg = svgMatch[2]?.trim() ?? ''
  const viewBox =
    readAttribute(attrs, 'viewBox') ??
    readAttribute(attrs, 'viewbox') ??
    '0 0 24 24'

  return {
    viewBox,
    innerSvg,
  }
}

export function sanitizeSvg(source: string): string {
  return source
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*\{[^}]*\}/gi, '')
}

function readAttribute(attrs: string, name: string): string | undefined {
  const doubleQuote = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)
  if (doubleQuote) return doubleQuote[1]

  const singleQuote = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(attrs)
  if (singleQuote) return singleQuote[1]

  return undefined
}

export function escapeTemplateLiteral(value: string): string {
  return value.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

export function svgToDataSource(svg: string): string {
  return svg.trim()
}
