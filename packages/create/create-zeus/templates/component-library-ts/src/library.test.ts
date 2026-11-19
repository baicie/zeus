import { componentLibrary } from '@zeus-js/web-c'
import { describe, expect, it } from 'vitest'

describe('component library template', () => {
  it('uses the public preset to configure WC and framework outputs', () => {
    const plugins = componentLibrary({
      styles: false,
      targets: ['react', 'vue'],
    })

    expect(plugins.map(plugin => plugin.name)).toEqual([
      'zeus-output-wc',
      'zeus-output-react-wrapper',
      'zeus-output-vue-wrapper',
    ])
  })
})
