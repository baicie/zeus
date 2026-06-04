import { describe, expect, it } from 'vitest'

import { componentLibrary } from '../src'

describe('componentLibrary', () => {
  it('adds wc output when react wrappers are requested', () => {
    const plugins = componentLibrary({
      styles: false,
      targets: ['react'],
    })

    expect(plugins.map(plugin => plugin.name)).toEqual([
      'zeus-output-wc',
      'zeus-output-react-wrapper',
    ])
  })

  it('adds wc output when vue wrappers are requested', () => {
    const plugins = componentLibrary({
      styles: false,
      targets: ['vue'],
    })

    expect(plugins.map(plugin => plugin.name)).toEqual([
      'zeus-output-wc',
      'zeus-output-vue-wrapper',
    ])
  })
})
