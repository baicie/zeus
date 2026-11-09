import { describe, expect, it } from 'vitest'

import {
  isTrustedSandboxParentOrigin,
  parseSandboxParentOrigins,
  resolveSandboxUrl,
  sandboxSessionFromLocation,
  withSandboxSession,
} from '../src'

describe('resolveSandboxUrl', () => {
  it('preserves a complete sandbox URL including path, port, query and hash', () => {
    const url = resolveSandboxUrl({
      hostUrl: 'https://mail.moonbyte.top:8443/',
      sandboxUrl:
        'https://panel.moonbyte.top:8443/zeus-sandbox/sandbox.html?theme=dark#panel',
    })

    expect(url).toBe(
      'https://panel.moonbyte.top:8443/zeus-sandbox/sandbox.html?theme=dark#panel',
    )
  })

  it('appends sandbox.html to a directory URL', () => {
    expect(
      resolveSandboxUrl({
        hostUrl: 'https://mail.moonbyte.top:8443/',
        sandboxUrl: 'https://panel.moonbyte.top:8443/zeus-sandbox/',
      }),
    ).toBe('https://panel.moonbyte.top:8443/zeus-sandbox/sandbox.html')
  })

  it('keeps legacy origin-only configuration working', () => {
    expect(
      resolveSandboxUrl({
        hostUrl: 'https://mail.moonbyte.top:8443/',
        sandboxOrigin: 'https://panel.moonbyte.top:8443/zeus-sandbox',
      }),
    ).toBe('https://panel.moonbyte.top:8443/sandbox.html')
  })

  it('uses the alternate loopback origin for local development', () => {
    expect(resolveSandboxUrl({ hostUrl: 'http://127.0.0.1:5173/' })).toBe(
      'http://localhost:5173/sandbox.html',
    )
    expect(resolveSandboxUrl({ hostUrl: 'http://localhost:4173/' })).toBe(
      'http://127.0.0.1:4173/sandbox.html',
    )
  })

  it('allows a same-origin sandbox only when explicitly opted in', () => {
    // Static hosts such as GitHub Pages expose one origin per account. The
    // iframe still gets an opaque origin because it is embedded without
    // allow-same-origin, so the escape hatch is safe when asked for.
    expect(
      resolveSandboxUrl({
        hostUrl: 'https://baicie.github.io/zeus-playground/',
        sandboxUrl: '/zeus-playground/sandbox.html',
        allowSameOrigin: true,
      }),
    ).toBe('https://baicie.github.io/zeus-playground/sandbox.html')
  })

  it('still enforces the origin check for a root-relative path', () => {
    expect(() =>
      resolveSandboxUrl({
        hostUrl: 'https://baicie.github.io/zeus-playground/',
        sandboxUrl: '/zeus-playground/sandbox.html',
      }),
    ).toThrow(/different origin/)
  })

  it('rejects sharing the host origin', () => {
    expect(() =>
      resolveSandboxUrl({
        hostUrl: 'https://mail.moonbyte.top:8443/',
        sandboxUrl: 'https://mail.moonbyte.top:8443/zeus-sandbox/sandbox.html',
      }),
    ).toThrow(/different origin/)
  })

  it('rejects unsafe protocols, credentials, and public HTTP', () => {
    for (const sandboxUrl of [
      'http://panel.moonbyte.top:8443/sandbox.html',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://user:pass@panel.moonbyte.top:8443/sandbox.html',
    ]) {
      expect(() =>
        resolveSandboxUrl({
          hostUrl: 'https://mail.moonbyte.top:8443/',
          sandboxUrl,
        }),
      ).toThrow()
    }
  })

  it('requires explicit configuration outside loopback', () => {
    expect(() =>
      resolveSandboxUrl({ hostUrl: 'https://mail.moonbyte.top:8443/' }),
    ).toThrow(/VITE_ZEUS_SANDBOX_URL/)
  })
})

describe('sandbox session transport', () => {
  it('adds the session without dropping query or hash', () => {
    const url = withSandboxSession(
      'https://panel.moonbyte.top:8443/zeus-sandbox/sandbox.html?theme=dark#panel',
      'session-1',
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.get('theme')).toBe('dark')
    expect(parsed.searchParams.get('zeus-sandbox-session')).toBe('session-1')
    expect(parsed.hash).toBe('#panel')
  })

  it('reads the query transport and legacy fragment transport', () => {
    expect(
      sandboxSessionFromLocation({
        search: '?zeus-sandbox-session=session-2',
        hash: '#ignored',
      }),
    ).toBe('session-2')
    expect(
      sandboxSessionFromLocation({ search: '', hash: '#legacy%20id' }),
    ).toBe('legacy id')
  })

  it('rejects session ids with unsafe characters', () => {
    expect(() =>
      withSandboxSession('https://panel.moonbyte.top/sandbox.html', '../x'),
    ).toThrow(/unsupported/)
  })
})

describe('sandbox parent policy', () => {
  it('normalizes and deduplicates explicit origins', () => {
    expect(
      parseSandboxParentOrigins(
        'https://mail.moonbyte.top:8443/, https://mail.moonbyte.top:8443 https://staging.example.test',
      ),
    ).toEqual([
      'https://mail.moonbyte.top:8443',
      'https://staging.example.test',
    ])
  })

  it('fails closed for malformed or non-HTTP entries', () => {
    expect(() => parseSandboxParentOrigins('javascript:alert(1)')).toThrow()
    expect(() => parseSandboxParentOrigins('not a url')).toThrow()
    expect(() =>
      parseSandboxParentOrigins('http://playground.example.com'),
    ).toThrow(/HTTPS/)
    expect(parseSandboxParentOrigins('http://localhost:5173')).toEqual([
      'http://localhost:5173',
    ])
  })

  it('admits only exact configured origins and optional loopback', () => {
    const allowed = ['https://mail.moonbyte.top:8443']
    expect(
      isTrustedSandboxParentOrigin('https://mail.moonbyte.top:8443', allowed),
    ).toBe(true)
    expect(
      isTrustedSandboxParentOrigin(
        'https://mail.moonbyte.top:8443.evil.test',
        allowed,
      ),
    ).toBe(false)
    expect(isTrustedSandboxParentOrigin('https://evil.test', allowed)).toBe(
      false,
    )
    expect(isTrustedSandboxParentOrigin('http://localhost:5173', [])).toBe(
      false,
    )
    expect(
      isTrustedSandboxParentOrigin('http://localhost:5173', [], {
        allowLoopback: true,
      }),
    ).toBe(true)
    expect(isTrustedSandboxParentOrigin('', allowed)).toBe(false)
  })
})
