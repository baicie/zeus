import { createSignal } from '@zeus-js/signal'
import { effectScope } from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Transition, mountTransition, transition } from '../src'

describe('Transition', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('Element', dom.window.Element)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('applies and removes an enter class around an asynchronous duration', async () => {
    const node = document.createElement('div')
    let resolveDuration!: (value: number) => void
    const duration = new Promise<number>(resolve => {
      resolveDuration = resolve
    })

    const handle = transition(node, 'enter', {
      enter: 'fade-enter',
      duration,
    })

    expect(node.classList.contains('fade-enter')).toBe(true)
    resolveDuration(0)
    await handle.promise
    expect(node.classList.contains('fade-enter')).toBe(false)
  })

  it('supports callback-style hooks and idempotent done/cancel cleanup', async () => {
    const node = document.createElement('div')
    const cleanup = vi.fn()
    const onEnter = vi.fn((nodes: readonly Node[], done: () => void) => {
      expect(nodes).toEqual([node])
      done()
      done()
      return cleanup
    })

    const handle = transition(node, 'enter', { onEnter })
    await handle.promise
    handle.cancel()

    expect(onEnter).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('waits for a returned Promise and removes leave classes after duration', async () => {
    const node = document.createElement('div')
    const cleanup = vi.fn()
    let resolveHook!: () => void
    const hook = new Promise<void>(resolve => {
      resolveHook = resolve
    })

    const handle = transition(node, 'leave', {
      leave: 'fade-leave',
      onLeave: () => hook.then(() => cleanup),
    })

    expect(node.classList.contains('fade-leave')).toBe(true)
    resolveHook()
    await handle.promise
    expect(cleanup).toHaveBeenCalledOnce()
    expect(node.classList.contains('fade-leave')).toBe(false)
  })

  it('keeps a leaving branch mounted, cancels it on re-entry, and disposes it on completion', async () => {
    const root = document.createElement('main')
    const marker = document.createComment('marker')
    root.append(marker)
    const [visible, setVisible] = createSignal(true)
    let resolveLeave!: (value: number) => void
    const leaveDuration = new Promise<number>(resolve => {
      resolveLeave = resolve
    })
    const scope = effectScope(true)

    scope.run(() => {
      mountTransition(
        root,
        marker,
        visible,
        () => {
          const node = document.createElement('span')
          node.textContent = 'content'
          return node
        },
        { leave: 'fade-leave', duration: { leave: leaveDuration } },
      )
    })

    const node = root.querySelector('span')!
    expect(node).not.toBeNull()

    setVisible(false)
    expect(root.querySelector('span')).toBe(node)
    expect(node.classList.contains('fade-leave')).toBe(true)

    setVisible(true)
    expect(root.querySelector('span')).toBe(node)
    expect(node.classList.contains('fade-leave')).toBe(false)

    setVisible(false)
    resolveLeave(0)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(root.querySelector('span')).toBeNull()

    scope.stop()
    expect(root.firstChild).toBe(marker)
  })

  it('cancels pending transitions when the owning scope is disposed', () => {
    const root = document.createElement('main')
    const marker = document.createComment('marker')
    root.append(marker)
    const scope = effectScope(true)
    let resolveLeave!: (value: number) => void
    const leaveDuration = new Promise<number>(resolve => {
      resolveLeave = resolve
    })

    scope.run(() => {
      mountTransition(
        root,
        marker,
        () => true,
        () => document.createElement('span'),
        { duration: { enter: leaveDuration } },
      )
    })

    scope.stop()
    resolveLeave(0)
    expect(root.firstChild).toBe(marker)
  })

  it('keeps the explicit value form separate from runtime lowering', () => {
    expect(Transition({ when: true, children: 'shown' })).toBe('shown')
    expect(Transition({ when: false, children: 'hidden' })).toBeNull()
    expect(() =>
      Transition({ when: (() => true) as unknown as boolean }),
    ).toThrow('Transition `when` must be a value')
  })
})
