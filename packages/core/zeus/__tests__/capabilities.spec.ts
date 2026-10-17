import { describe, expect, it } from 'vitest'

import * as zeus from '../src'
import { ZEUS_CAPABILITIES } from '../src/capabilities'
import * as jsxDevRuntime from '../src/jsx-dev-runtime'
import * as jsxRuntime from '../src/jsx-runtime'

describe('@zeus-js/zeus capabilities', () => {
  it('advertises only application and private stability boundaries', () => {
    expect(ZEUS_CAPABILITIES.stability).toEqual({
      main: 'stable',
      internal: 'private',
    })
  })

  it('publicApi capabilities match exported APIs', () => {
    for (const [name, enabled] of Object.entries(ZEUS_CAPABILITIES.publicApi)) {
      if (!enabled) continue
      expect(zeus).toHaveProperty(name)
    }
  })

  it('webComponents capabilities match exported APIs', () => {
    const wcCapabilities: Record<string, boolean> = {
      ...ZEUS_CAPABILITIES.webComponents,
    }

    if (wcCapabilities.defineElement) {
      expect(zeus).toHaveProperty('defineElement')
    }
    if (wcCapabilities.Host) {
      expect(zeus).toHaveProperty('Host')
    }
    if (wcCapabilities.Slot) {
      expect(zeus).toHaveProperty('Slot')
    }
  })

  it('jsx capabilities are consistent with package exports', () => {
    const jsxCapabilities: Record<string, boolean> = {
      ...ZEUS_CAPABILITIES.jsx,
    }

    if (jsxCapabilities.jsxRuntime) {
      expect(jsxRuntime).toHaveProperty('jsx')
    }
    if (jsxCapabilities.fragment) {
      expect(jsxRuntime).toHaveProperty('Fragment')
    }
    if (jsxCapabilities.jsxDevRuntime) {
      expect(jsxDevRuntime).toHaveProperty('jsxDEV')
    }
  })
})
