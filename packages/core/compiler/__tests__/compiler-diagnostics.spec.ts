import { transformAsync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeusRaw, * as compiler from '../src'

const zeus = zeusRaw as unknown as (api: object, opts: object) => object
const invalidBuiltinCode = 'ZEUS_INVALID_BUILTIN_USAGE'

async function compile(code: string) {
  const result = await transformAsync(code, {
    filename: '/fixtures/compiler-diagnostics.fixture.tsx',
    plugins: [zeus],
    parserOpts: {
      plugins: ['typescript', 'jsx'],
    },
  })

  if (!result?.code) {
    throw new Error('Transform failed')
  }

  return result.code
}

describe('compiler diagnostics', () => {
  it('exports the structured diagnostic contract', () => {
    expect(compiler).toMatchObject({
      CompilerError: expect.any(Function),
      CompilerErrorCode: expect.objectContaining({
        INVALID_BUILTIN_USAGE: invalidBuiltinCode,
      }),
    })
  })

  it('formats CompilerError from its public diagnostic fields', () => {
    const span = {
      start: { line: 4, column: 8, offset: 42 },
      end: { line: 4, column: 16, offset: 50 },
    }
    const error = new compiler.CompilerError({
      code: compiler.CompilerErrorCode.INVALID_BUILTIN_USAGE,
      message: 'Invalid Host boundary.',
      hint: 'Return <Host> directly.',
      filename: '/src/card.tsx',
      span,
    })

    expect(error).toMatchObject({
      name: 'ZeusCompilerError',
      message:
        '[ZEUS_INVALID_BUILTIN_USAGE] Invalid Host boundary.\nHint: Return <Host> directly.',
      code: invalidBuiltinCode,
      severity: 'error',
      hint: 'Return <Host> directly.',
      filename: '/src/card.tsx',
      span,
      loc: { line: 4, column: 8 },
      diagnostic: {
        code: invalidBuiltinCode,
        severity: 'error',
        message: 'Invalid Host boundary.',
        hint: 'Return <Host> directly.',
        filename: '/src/card.tsx',
        span,
      },
    })
    expect(compiler.formatCompilerDiagnostic(error.diagnostic)).toBe(
      error.message,
    )
  })

  it('rejects Host outside a defineElement setup with a structured source diagnostic', async () => {
    const compilation = compile(
      [
        "import { Host } from '@zeus-js/runtime-dom'",
        '',
        'const App = () => <Host><div /></Host>',
      ].join('\n'),
    )

    await expect(compilation).rejects.toMatchObject({
      name: 'ZeusCompilerError',
      code: invalidBuiltinCode,
      diagnostic: {
        code: invalidBuiltinCode,
        severity: 'error',
        message: '<Host> can only be used as a defineElement root boundary.',
        filename: '/fixtures/compiler-diagnostics.fixture.tsx',
        span: {
          start: { line: 3, column: 18 },
          end: { line: 3, column: 38 },
        },
      },
      span: {
        start: { line: 3, column: 18 },
        end: { line: 3, column: 38 },
      },
      loc: { line: 3, column: 18 },
    })
  })

  it('keeps lowering diagnostics serializable and free of Babel paths', async () => {
    let error: unknown

    try {
      await compile('const App = props => <div {...props} />')
    } catch (caught) {
      error = caught
    }

    expect(error).toMatchObject({
      code: 'ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE',
      diagnostic: {
        code: 'ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE',
        severity: 'error',
        filename: '/fixtures/compiler-diagnostics.fixture.tsx',
        span: {
          start: { line: 1, column: 26 },
          end: { line: 1, column: 36 },
        },
      },
      loc: { line: 1, column: 26 },
    })

    const diagnostic = (error as { diagnostic: object }).diagnostic
    expect(diagnostic).not.toHaveProperty('path')
    expect(() => JSON.stringify(diagnostic)).not.toThrow()
  })

  it('rejects a nested Host inside a defineElement setup', async () => {
    const compilation = compile(`
      import { defineElement, Host } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        {},
        () => <div><Host /></div>,
      )
    `)

    await expect(compilation).rejects.toMatchObject({
      code: invalidBuiltinCode,
      diagnostic: {
        code: invalidBuiltinCode,
        severity: 'error',
        message: '<Host> can only be used as a defineElement root boundary.',
        span: expect.any(Object),
      },
    })
  })

  it('rejects Slot outside the defineElement Host subtree', async () => {
    const compilation = compile(`
      import { defineElement, Slot } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        {},
        () => <main><Slot /></main>,
      )
    `)

    await expect(compilation).rejects.toMatchObject({
      code: invalidBuiltinCode,
      diagnostic: {
        code: invalidBuiltinCode,
        severity: 'error',
        message:
          '<Slot> can only be used inside the defineElement Host boundary.',
        span: expect.any(Object),
      },
    })
  })

  it('accepts an inline defineElement setup with a Host root and Slot child', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      export const ZCard = defineElement(
        'z-card',
        {},
        () => <Host><main><Slot /></main></Host>,
      )
    `)

    expect(code).toContain('defineElement')
    expect(code).toContain('_Host')
    expect(code).toContain('_createSlot')
  })

  it('accepts a named defineElement setup function with a Host root', async () => {
    const code = await compile(`
      import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

      function setup() {
        return <Host><main><Slot /></main></Host>
      }

      export const ZCard = defineElement('z-card', {}, setup)
    `)

    expect(code).toContain('function setup()')
    expect(code).toContain('_Host')
    expect(code).toContain('_createSlot')
  })

  it.each([
    ['type assertion', 'setup as Setup'],
    ['satisfies expression', 'setup satisfies Setup'],
    ['non-null assertion', 'setup!'],
  ])(
    'accepts a %s around a defineElement setup',
    async (_, setupExpression) => {
      const code = await compile(`
        import { defineElement, Host } from '@zeus-js/runtime-dom'

        type Setup = () => unknown
        const setup = () => <Host />

        export const ZCard = defineElement('z-card', {}, ${setupExpression})
      `)

      expect(code).toContain('defineElement')
      expect(code).toContain('_Host')
    },
  )

  it('recognizes an aliased defineElement import for a named setup function', async () => {
    const code = await compile(`
      import {
        defineElement as registerElement,
        Host,
        Slot,
      } from '@zeus-js/zeus'

      const setup = () => <Host><main><Slot /></main></Host>

      export const ZCard = registerElement('z-card', {}, setup)
    `)

    expect(code).toContain('registerElement')
    expect(code).toContain('_Host')
    expect(code).toContain('_createSlot')
  })

  it('rejects Host when defineElement is a local same-name function', async () => {
    const compilation = compile(`
      import { Host } from '@zeus-js/runtime-dom'

      function defineElement(_tag, _options, setup) {
        return setup
      }

      const ZCard = defineElement('z-card', {}, () => <Host />)
    `)

    await expect(compilation).rejects.toMatchObject({
      code: invalidBuiltinCode,
      diagnostic: {
        code: invalidBuiltinCode,
        message: '<Host> can only be used as a defineElement root boundary.',
      },
    })
  })
})
