export function escapeHTML(value: string, attr = false): string {
  const delimiter = attr ? '"' : '<'
  const escapedDelimiter = attr ? '&quot;' : '&lt;'

  let result = ''
  let lastIndex = 0

  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    let escaped: string | undefined

    if (char === '&') {
      escaped = '&amp;'
    } else if (char === delimiter) {
      escaped = escapedDelimiter
    }

    if (escaped) {
      result += value.slice(lastIndex, i) + escaped
      lastIndex = i + 1
    }
  }

  return lastIndex === 0 ? value : result + value.slice(lastIndex)
}

export function trimJSXText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
}
