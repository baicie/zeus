import { describe, expect, it } from 'vitest'

import webC, { componentLibrary, css, react, vue, wc } from '../src/index'
import rolldown, {
  componentLibrary as rolldownComponentLibrary,
  defineZeusRolldownConfig,
} from '../src/rolldown'
import rollup, { defineZeusRollupConfig } from '../src/rollup'
import vite, { createZeusVitePlugin } from '../src/vite'

describe('@zeus-js/web-c aggregate package', () => {
  it('re-exports component library outputs', () => {
    expect(componentLibrary).toBeTypeOf('function')
    expect(css).toBeTypeOf('function')
    expect(react).toBeTypeOf('function')
    expect(vue).toBeTypeOf('function')
    expect(wc).toBeTypeOf('function')
    expect(webC.componentLibrary).toBe(componentLibrary)
  })

  it('re-exports bundler entry helpers', () => {
    expect(vite).toBeTypeOf('function')
    expect(rollup).toBeTypeOf('function')
    expect(rolldown).toBeTypeOf('function')
    expect(createZeusVitePlugin).toBe(vite)
    expect(defineZeusRollupConfig).toBeTypeOf('function')
    expect(defineZeusRolldownConfig).toBeTypeOf('function')
    expect(rolldownComponentLibrary).toBe(componentLibrary)
  })
})
