import { describe, expect, it } from 'vitest'

import {
  PLAYGROUND_SANDBOX_CHANNEL,
  PLAYGROUND_SANDBOX_MESSAGE_VERSION,
  isOpaqueSandboxOrigin,
  parseSandboxMessage,
} from '../src'

describe('playground sandbox message schema', () => {
  it('accepts a bounded preview load and freezes exported names', () => {
    const message = {
      channel: PLAYGROUND_SANDBOX_CHANNEL,
      version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
      kind: 'sandbox-load',
      sessionId: 'session:1',
      requestId: 'request-1',
      timeoutMs: 3_000,
      payload: {
        entryPath: 'src/main.tsx',
        modules: [
          {
            path: 'src/main.tsx',
            code: 'export const App = () => null',
            imports: [],
          },
        ],
        styles: [],
        runtimeModules: ['@zeus-js/zeus'],
      },
    }

    expect(parseSandboxMessage(message)).toMatchObject({
      kind: 'sandbox-load',
      sessionId: 'session:1',
      requestId: 'request-1',
    })
    const result = parseSandboxMessage({
      channel: PLAYGROUND_SANDBOX_CHANNEL,
      version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
      kind: 'sandbox-result',
      sessionId: 'session:1',
      requestId: 'request-1',
      status: 'ready',
      durationMs: 12.5,
      exportedNames: ['App'],
    })
    expect(
      Object.isFrozen(
        result?.kind === 'sandbox-result' ? result.exportedNames : undefined,
      ),
    ).toBe(true)
  })

  it('rejects oversized, malformed, and cross-session payloads', () => {
    const message = {
      channel: PLAYGROUND_SANDBOX_CHANNEL,
      version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
      kind: 'sandbox-error',
      sessionId: 'session:1',
      requestId: 'request-1',
      code: 'ZEUS_TEST',
      message: 'failure',
    }

    expect(parseSandboxMessage(message, 20)).toBeUndefined()
    expect(parseSandboxMessage({ ...message, sessionId: '../escape' })).toBe(
      undefined,
    )
    expect(parseSandboxMessage({ ...message, version: 2 })).toBeUndefined()
  })

  it('only admits opaque-origin child messages for the host trust boundary', () => {
    expect(isOpaqueSandboxOrigin('null')).toBe(true)
    expect(isOpaqueSandboxOrigin('https://zeus.dev')).toBe(false)
    expect(isOpaqueSandboxOrigin('')).toBe(false)
  })
})
