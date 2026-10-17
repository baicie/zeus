import { describe, expect, it, vi } from 'vitest'

import * as published from '../jsx-runtime.js'
import * as source from '../src/jsx-runtime'

describe.each([
  ['source', source],
  ['published', published],
] as const)('@zeus-js/zeus/jsx-runtime %s entry', (name, runtime) => {
  it('rejects uncompiled JSX before calling components, props, or DOM APIs', () => {
    const component = vi.fn()
    const formatter = vi.fn()
    for (const create of [runtime.jsx, runtime.jsxs, runtime.jsxDEV]) {
      expect(() => create(component, { 'prop:formatter': formatter })).toThrow(
        '[ZEUS_JSX_COMPILATION_REQUIRED]',
      )
      expect(() => create('button', { children: 'Save' })).toThrow(
        '@zeus-js/vite-plugin',
      )
      expect(() => create(runtime.Fragment, { children: 'Save' })).toThrow(
        '[ZEUS_JSX_COMPILATION_REQUIRED]',
      )
    }
    expect(component).not.toHaveBeenCalled()
    expect(formatter).not.toHaveBeenCalled()
  })
})
