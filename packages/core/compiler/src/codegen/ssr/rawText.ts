export type SSRRawTextTag = 'script' | 'style'

export function getSSRRawTextTag(tagName: string): SSRRawTextTag | undefined {
  const normalized = tagName.toLowerCase()
  return normalized === 'script' || normalized === 'style'
    ? normalized
    : undefined
}
