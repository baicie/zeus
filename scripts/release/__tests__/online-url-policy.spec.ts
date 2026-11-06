import { describe, expect, it } from 'vitest'

import {
  assertApprovedHttpsUrl,
  createApprovedPorts,
  normalizeOnlinePort,
} from '../online-url-policy'

const policy = {
  allowedHosts: ['mail.moonbyte.top', 'panel.moonbyte.top'],
  allowedPorts: ['8443'],
}

describe('online URL policy', () => {
  it('accepts an explicitly approved 8443 origin', () => {
    const url = assertApprovedHttpsUrl(
      'https://mail.moonbyte.top:8443/',
      policy,
    )
    expect(url.host).toBe('mail.moonbyte.top:8443')
    expect(normalizeOnlinePort(url.port)).toBe('8443')
  })

  it('rejects every other port even when it is HTTPS', () => {
    for (const port of ['4443', '8444', '9443', '80']) {
      expect(() =>
        assertApprovedHttpsUrl(`https://mail.moonbyte.top:${port}/`, policy),
      ).toThrow(/port/)
    }
  })

  it('rejects unapproved hosts, plain HTTP, IP literals and credentials', () => {
    for (const value of [
      'https://evil.example:8443/',
      'http://mail.moonbyte.top:8443/',
      'https://203.0.113.10:8443/',
      'https://user:pass@mail.moonbyte.top:8443/',
    ]) {
      expect(() => assertApprovedHttpsUrl(value, policy)).toThrow()
    }
  })

  it('revalidates redirect targets with the same policy', () => {
    expect(() =>
      assertApprovedHttpsUrl(new URL('https://evil.example:8443/next'), policy),
    ).toThrow(/approved host/)
  })

  it('only builds port lists from the approved 443/8443 set', () => {
    expect(createApprovedPorts([])).toEqual(['443'])
    expect(createApprovedPorts(['443,8443'])).toEqual(['443', '8443'])
    expect(() => createApprovedPorts(['8444'])).toThrow(/not an approved/)
    expect(() => createApprovedPorts(['9443'])).toThrow(/not an approved/)
  })
})
