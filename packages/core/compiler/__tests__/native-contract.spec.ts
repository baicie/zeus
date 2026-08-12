import { describe, expect, it } from 'vitest'

import compiler, { transformModule } from '../src'

describe('@zeus-js/compiler native contract', () => {
  it('exposes the Rust transform as the default and named entry', () => {
    expect(compiler).toBe(transformModule)
  })

  it('returns native DOM code and structured diagnostics', () => {
    const result = transformModule({
      source: 'export const App = () => <button>ok</button>',
      filename: 'App.tsx',
      target: 'dom',
      runtimeModule: '@zeus-js/runtime-dom',
      delegateEvents: true,
      sourceMap: true,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain('template')
    expect(result.code).not.toContain('=> <button>')
    expect(result.map?.version).toBe(3)
  })
})
