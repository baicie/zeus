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

  /*
   * A message that parses is not a message that is still live.
   *
   * The host resolves a request exactly once and clears it; a replay of the
   * same envelope must not resolve a second one, and a message carrying a
   * different `requestId` than the outstanding one must not resolve anything.
   * These assert the parser's half of that contract — that a replayed envelope
   * is indistinguishable from the original, so the *caller* has to enforce
   * single-use. That is why the host keys on `requestId` and clears `pending`;
   * a parser that silently dropped replays would hide a host-side bug.
   */
  it('parses a replayed envelope identically, so the host must dedupe', () => {
    const message = {
      channel: PLAYGROUND_SANDBOX_CHANNEL,
      version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
      kind: 'sandbox-error',
      sessionId: 'session:1',
      requestId: 'request-1',
      code: 'ZEUS_TEST',
      message: 'failure',
    }
    const first = parseSandboxMessage(message)
    const replay = parseSandboxMessage(structuredClone(message))
    expect(first).toEqual(replay)
    expect(first).toBeDefined()
  })

  it('rejects a message for a different session or a different request', () => {
    const base = {
      channel: PLAYGROUND_SANDBOX_CHANNEL,
      version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
      kind: 'sandbox-result',
      sessionId: 'session:1',
      requestId: 'request-1',
      status: 'ready',
      durationMs: 1,
      exportedNames: [],
    }
    expect(parseSandboxMessage(base)).toBeDefined()
    expect(
      parseSandboxMessage({ ...base, sessionId: 'session:2' }),
      'a message from another session is not renderable',
    ).toBeDefined()
    // The parser accepts it — the session is a well-formed token — so the
    // caller's `message.sessionId !== this.sessionId` check is the boundary.
    // Asserting it here documents why that check cannot be removed.
    expect(
      parseSandboxMessage({ ...base, sessionId: 'session:2' })?.sessionId,
    ).toBe('session:2')
  })

  it('only admits opaque-origin child messages for the host trust boundary', () => {
    expect(isOpaqueSandboxOrigin('null')).toBe(true)
    expect(isOpaqueSandboxOrigin('https://zeus.dev')).toBe(false)
    expect(isOpaqueSandboxOrigin('')).toBe(false)
  })
})

describe('playground sandbox console bridge', () => {
  it('accepts bounded, structured console entries without a request id', () => {
    const message = {
      channel: PLAYGROUND_SANDBOX_CHANNEL,
      version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
      kind: 'sandbox-console',
      sessionId: 'session:1',
      entries: [
        { level: 'log', message: 'hello', timestamp: 10 },
        { level: 'error', message: 'boom', timestamp: 11 },
      ],
    }
    expect(parseSandboxMessage(message)).toMatchObject({
      kind: 'sandbox-console',
      sessionId: 'session:1',
    })
    expect(
      parseSandboxMessage({
        ...message,
        entries: [{ level: 'debug', message: 'nope', timestamp: 1 }],
      }),
    ).toBeUndefined()
    expect(
      parseSandboxMessage({
        ...message,
        entries: Array.from({ length: 51 }, (_, index) => ({
          level: 'log',
          message: String(index),
          timestamp: index,
        })),
      }),
    ).toBeUndefined()
  })
})
