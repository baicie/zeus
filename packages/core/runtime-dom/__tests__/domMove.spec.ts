import { describe, expect, it, vi } from 'vitest'

import { moveNodeBefore } from '../src/domMove'

describe('moveNodeBefore', () => {
  it('uses insertBefore while assembling an unattached DocumentFragment', () => {
    const node = {}
    const insertBefore = vi.fn()
    const moveBefore = vi.fn(() => {
      throw new Error('DocumentFragment.moveBefore must not be used')
    })
    const fragment = {
      nodeType: 11,
      insertBefore,
      moveBefore,
    } as unknown as Node

    moveNodeBefore(fragment, node as Node, null)

    expect(moveBefore).not.toHaveBeenCalled()
    expect(insertBefore).toHaveBeenCalledWith(node, null)
  })

  it('uses insertBefore when moving between different connection states', () => {
    const node = { isConnected: false }
    const insertBefore = vi.fn()
    const moveBefore = vi.fn(() => {
      throw new Error('moveBefore cannot change connection state')
    })
    const parent = {
      nodeType: 1,
      isConnected: true,
      insertBefore,
      moveBefore,
    } as unknown as Node

    moveNodeBefore(parent, node as Node, null)

    expect(moveBefore).not.toHaveBeenCalled()
    expect(insertBefore).toHaveBeenCalledWith(node, null)
  })

  it('uses moveBefore when both nodes remain connected', () => {
    const node = { isConnected: true }
    const insertBefore = vi.fn()
    const moveBefore = vi.fn()
    const parent = {
      nodeType: 1,
      isConnected: true,
      insertBefore,
      moveBefore,
    } as unknown as Node

    moveNodeBefore(parent, node as Node, null)

    expect(moveBefore).toHaveBeenCalledWith(node, null)
    expect(insertBefore).not.toHaveBeenCalled()
  })
})
