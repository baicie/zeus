import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeusCompilerRaw from '../src'

const zeusCompiler = zeusCompilerRaw as unknown as (
  api: object,
  opts: object,
) => object

describe('compiler JSX parser plugin', () => {
  it('enables JSX syntax without @babel/plugin-syntax-jsx', () => {
    const result = transformSync('const view = <div id="app">hello</div>', {
      filename: 'input.jsx',
      babelrc: false,
      configFile: false,
      plugins: [[zeusCompiler, {}]],
    })

    expect(result?.code).toBeTruthy()
    // Verify JSX was compiled to template() call — <div only appears inside
    // template literal strings, not as raw JSX element syntax.
    expect(result?.code).toContain('_template(')
  })

  it('does not duplicate existing jsx parser plugin', () => {
    const result = transformSync('const view = <span />', {
      filename: 'input.jsx',
      babelrc: false,
      configFile: false,
      parserOpts: {
        plugins: ['jsx'],
      },
      plugins: [[zeusCompiler, {}]],
    })

    expect(result?.code).toBeTruthy()
    expect(result?.code).toContain('_template(')
  })

  it('works without any pre-configured parser plugins', () => {
    const result = transformSync('const el = <section><p /></section>', {
      filename: 'input.tsx',
      babelrc: false,
      configFile: false,
      plugins: [[zeusCompiler, {}]],
      parserOpts: {},
    })

    expect(result?.code).toBeTruthy()
    // Verify compilation happened — <section only inside template string
    expect(result?.code).toContain('_template(')
  })
})
