import net from 'node:net'

/** Shared address classification for online deployment acceptance. */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 18) ||
      (a === 198 && b === 19) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    )
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice('::ffff:'.length)
      if (net.isIPv4(tail)) return isPrivateAddress(tail)
      const parts = tail.split(':')
      if (parts.length === 2) {
        const high = Number.parseInt(parts[0] ?? '', 16)
        const low = Number.parseInt(parts[1] ?? '', 16)
        if (Number.isFinite(high) && Number.isFinite(low)) {
          return isPrivateAddress(
            `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
          )
        }
      }
    }
    return (
      /^f[cd]/.test(lower) ||
      /^fe[89ab]/.test(lower) ||
      /^ff/.test(lower) ||
      lower.startsWith('2001:db8:') ||
      lower.startsWith('64:ff9b:')
    )
  }
  return true
}

export function isLoopbackAddress(address: string): boolean {
  if (net.isIPv4(address)) return address.startsWith('127.')
  return address === '::1' || address === '0:0:0:0:0:0:0:1'
}

export function isLoopbackHostname(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
}
