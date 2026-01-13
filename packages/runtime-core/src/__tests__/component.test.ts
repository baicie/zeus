import { describe, expect, it } from 'vitest'
import { h } from '../component'

describe('Component System', () => {
  it('should create virtual nodes', () => {
    const vnode = h('div', { className: 'test' }, 'Hello')
    expect(vnode.type).toBe('div')
    expect(vnode.props?.className).toBe('test')
    expect(vnode.children).toEqual(['Hello'])
  })
})
