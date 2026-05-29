export function escapeHTML(value: string, attr = false): string {
  let result = value.replace(/&/g, '&amp;')

  if (attr) {
    return result.replace(/"/g, '&quot;').replace(/>/g, '&gt;')
  }

  return result.replace(/</g, '&lt;')
}

export function trimJSXText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
}

const rawTextElements = new Set(['script', 'style', 'textarea', 'title'])

export function isRawTextElement(tagName: string): boolean {
  return rawTextElements.has(tagName)
}
