const templateEscapes = new Map([
  ['\\', '\\\\'],
  ['`', '\\`'],
  ['\n', '\\n'],
  ['\t', '\\t'],
  ['\b', '\\b'],
  ['\f', '\\f'],
  ['\v', '\\v'],
  ['\r', '\\r'],
  ['\u2028', '\\u2028'],
  ['\u2029', '\\u2029'],
])

export function escapeHTML(str: string, isAttr: boolean = false): string {
  if (typeof str !== 'string') {
    return str as unknown as string
  }

  const delim = isAttr ? '"' : '<'
  const escDelim = isAttr ? '&quot;' : '&lt;'

  let iDelim = str.indexOf(delim)
  let iAmp = str.indexOf('&')

  if (iDelim < 0 && iAmp < 0) {
    return str
  }

  let left = 0
  let out = ''

  while (iDelim >= 0 && iAmp >= 0) {
    if (iDelim < iAmp) {
      if (left < iDelim) {
        out += str.substring(left, iDelim)
      }
      out += escDelim
      left = iDelim + 1
      iDelim = str.indexOf(delim, left)
    } else {
      if (left < iAmp) {
        out += str.substring(left, iAmp)
      }
      out += '&amp;'
      left = iAmp + 1
      iAmp = str.indexOf('&', left)
    }
  }

  if (iDelim >= 0) {
    do {
      if (left < iDelim) {
        out += str.substring(left, iDelim)
      }
      out += escDelim
      left = iDelim + 1
      iDelim = str.indexOf(delim, left)
    } while (iDelim >= 0)
  } else {
    while (iAmp >= 0) {
      if (left < iAmp) {
        out += str.substring(left, iAmp)
      }
      out += '&amp;'
      left = iAmp + 1
      iAmp = str.indexOf('&', left)
    }
  }

  return left < str.length ? out + str.substring(left) : out
}

export function escapeForTemplate(str: string): string {
  return str.replace(/[\\`\n\t\b\f\v\r\u2028\u2029]/g, char => {
    return templateEscapes.get(char) || char
  })
}

export function trimWhitespace(text: string): string {
  let t = text.replace(/\r/g, '')
  if (/\n/g.test(t)) {
    t = t
      .split('\n')
      .map((line, i) => (i ? line.replace(/^\s*/g, '') : line))
      .filter(s => !/^\s*$/.test(s))
      .join(' ')
  }
  return t.replace(/\s+/g, ' ')
}
