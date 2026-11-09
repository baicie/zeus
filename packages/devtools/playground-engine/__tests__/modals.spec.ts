import { describe, expect, it, vi } from 'vitest'

import {
  PLAYGROUND_MODAL_NAMES,
  formatPlaygroundModalCall,
  installPlaygroundModalGuard,
} from '../src'

import type { PlaygroundModalCall } from '../src'

/**
 * Stands in for the sandbox realm's global object. The signatures mirror the
 * DOM ones so `installPlaygroundModalGuard` can patch them in place, and the
 * `calls` array records anything that reaches the original implementations —
 * after installation it must stay empty.
 */
interface ModalHost {
  calls: string[]
  alert(message?: unknown): void
  confirm(message?: unknown): boolean
  prompt(message?: unknown, defaultValue?: string): string | null
  print(): void
}

function createModalHost(): ModalHost {
  const host: ModalHost = {
    calls: [],
    alert(message?: unknown) {
      host.calls.push(`alert:${String(message)}`)
    },
    confirm(message?: unknown) {
      host.calls.push(`confirm:${String(message)}`)
      return true
    },
    prompt(message?: unknown) {
      host.calls.push(`prompt:${String(message)}`)
      return 'typed'
    },
    print() {
      host.calls.push('print')
    },
  }
  return host
}

describe('installPlaygroundModalGuard', () => {
  it('suppresses every modal API and reports each call once', () => {
    const host = createModalHost()
    const reported: PlaygroundModalCall[] = []
    const guard = installPlaygroundModalGuard({
      target: host,
      onCall: call => reported.push(call),
    })

    const alertResult = host.alert('hello')
    const confirmResult = host.confirm('sure?')
    const promptResult = host.prompt('name', 'default')
    const printResult = host.print()

    expect(host.calls).toEqual([])
    expect(alertResult).toBeUndefined()
    expect(confirmResult).toBe(false)
    expect(promptResult).toBeNull()
    expect(printResult).toBeUndefined()
    expect(reported).toEqual([
      { name: 'alert', args: ['hello'] },
      { name: 'confirm', args: ['sure?'] },
      { name: 'prompt', args: ['name', 'default'] },
      { name: 'print', args: [] },
    ])
    guard.dispose()
  })

  it('returns the values the browser returns when modals are blocked', () => {
    const host = createModalHost()
    const guard = installPlaygroundModalGuard({
      target: host,
      onCall: () => {},
    })

    // `confirm` is documented to return false and `prompt` null when the
    // browser suppresses the dialog, so preview code keeps its own branches.
    expect(Boolean(host.confirm('proceed?'))).toBe(false)
    expect(host.prompt('value?') ?? 'fallback').toBe('fallback')
    guard.dispose()
  })

  it('restores the original modal functions on dispose', () => {
    const host = createModalHost()
    const originals = {
      alert: host.alert,
      confirm: host.confirm,
      prompt: host.prompt,
      print: host.print,
    }
    const guard = installPlaygroundModalGuard({
      target: host,
      onCall: () => {},
    })
    expect(host.alert).not.toBe(originals.alert)

    guard.dispose()

    expect(host.alert).toBe(originals.alert)
    expect(host.confirm).toBe(originals.confirm)
    expect(host.prompt).toBe(originals.prompt)
    expect(host.print).toBe(originals.print)
  })

  it('leaves a later replacement of a modal API untouched', () => {
    const host = createModalHost()
    const guard = installPlaygroundModalGuard({
      target: host,
      onCall: () => {},
    })
    const previewOwnHandler = vi.fn(() => true)
    host.confirm = previewOwnHandler

    guard.dispose()

    expect(host.confirm).toBe(previewOwnHandler)
  })

  it('covers every documented modal name', () => {
    expect([...PLAYGROUND_MODAL_NAMES]).toEqual([
      'alert',
      'confirm',
      'prompt',
      'print',
    ])
  })
})

describe('formatPlaygroundModalCall', () => {
  it('names the API, quotes arguments and points at the fix', () => {
    const message = formatPlaygroundModalCall({
      name: 'confirm',
      args: ['delete this?'],
    })

    expect(message).toContain('[ZEUS_PLAYGROUND_NO_MODALS]')
    expect(message).toContain('confirm("delete this?")')
    expect(message).toContain('render the message in the DOM')
  })

  it('handles a call without arguments', () => {
    expect(formatPlaygroundModalCall({ name: 'print', args: [] })).toContain(
      'print() was ignored',
    )
  })

  it('truncates oversized arguments so the console bridge stays bounded', () => {
    const message = formatPlaygroundModalCall({
      name: 'alert',
      args: ['x'.repeat(1_000)],
    })

    expect(message).toContain('...')
    expect(message).toContain('was ignored')
    expect(message.length).toBeLessThan(450)
  })

  it('does not throw on values JSON cannot serialize', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() =>
      formatPlaygroundModalCall({ name: 'alert', args: [circular] }),
    ).not.toThrow()
  })
})
