import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { ZeusVitePluginOptions } from '../src'
import type { Plugin as RollupPlugin, TransformResult } from 'rollup'
import type { HookHandler, Plugin } from 'vite'

type TransformHook = NonNullable<HookHandler<Plugin['transform']>>
type TransformOutput = Awaited<ReturnType<TransformHook>>

const source = 'const App = () => <div>hello</div>'
const eventSource =
  'const App = () => <button onClick={() => {}}>click</button>'

const statefulPatterns: [string, () => RegExp][] = [
  ['global', () => /\.tsx$/g],
  ['sticky', () => /\/src\/App\.tsx/y],
]

function getTransformHook(plugin: Plugin): TransformHook {
  const hook = plugin.transform
  if (!hook) throw new Error('Expected transform hook')
  return typeof hook === 'function' ? hook : hook.handler
}

function createTransformHarness(options: ZeusVitePluginOptions = {}) {
  const hook = getTransformHook(createZeus(options))
  const context = {
    error(error: string | { message: string }): never {
      if (typeof error === 'string') throw new Error(error)
      throw Object.assign(new Error(error.message), error)
    },
  } as ThisParameterType<TransformHook>

  return (code: string, id: string) => hook.call(context, code, id)
}

function getCode(result: TransformOutput): string | null {
  if (result == null) return null
  const code = typeof result === 'string' ? result : result.code
  if (typeof code !== 'string') throw new Error('Expected transform code')
  return code
}

describe('vite-plugin-zeus transform', () => {
  it('exposes pre-transform plugin metadata', () => {
    const plugin = createZeus()

    expect(plugin.name).toBe('vite-plugin-zeus')
    expect(plugin.enforce).toBe('pre')
  })

  it.each(['/src/App.tsx', '/src/App.jsx'])(
    'transforms JSX modules by default: %s',
    async id => {
      const result = await createTransformHarness()(source, id)
      const code = getCode(result)

      expect(code).toContain('_template')
      expect(result).toEqual(
        expect.objectContaining({
          map: expect.objectContaining({
            mappings: expect.any(String),
            version: 3,
          }),
        }),
      )
    },
  )

  it.each(['/src/App.tsx?direct', '/src/App.jsx#fragment'])(
    'ignores query and hash suffixes when filtering: %s',
    async id => {
      const result = await createTransformHarness()(source, id)

      expect(getCode(result)).toContain('_template')
    },
  )

  it.each(['/src/App.ts', '/src/App.js', '/src/App.css'])(
    'skips non-JSX modules by default: %s',
    async id => {
      const result = await createTransformHarness()(source, id)

      expect(result).toBeNull()
    },
  )

  it('excludes node_modules by default', async () => {
    const result = await createTransformHarness()(
      source,
      '/workspace/node_modules/pkg/App.tsx',
    )

    expect(result).toBeNull()
  })

  it('supports a custom include pattern', async () => {
    const transform = createTransformHarness({ include: /\.view\.tsx$/ })

    expect(await transform(source, '/src/App.tsx')).toBeNull()
    expect(getCode(await transform(source, '/src/App.view.tsx'))).toContain(
      '_template',
    )
  })

  it('supports multiple include patterns', async () => {
    const transform = createTransformHarness({
      include: [/\.view\.tsx$/, /\.component\.jsx$/],
    })

    expect(getCode(await transform(source, '/src/App.view.tsx'))).toContain(
      '_template',
    )
    expect(
      getCode(await transform(source, '/src/App.component.jsx')),
    ).toContain('_template')
  })

  it('applies exclude patterns before include patterns', async () => {
    const transform = createTransformHarness({
      include: /\.tsx$/,
      exclude: /App\.tsx$/,
    })

    expect(await transform(source, '/src/App.tsx')).toBeNull()
  })

  it('uses the DOM runtime and delegated events by default', async () => {
    const code = getCode(
      await createTransformHarness()(eventSource, '/src/App.tsx'),
    )

    expect(code).toContain('from "@zeus-js/runtime-dom"')
    expect(code).toContain('_delegateEvents(["click"])')
  })

  it('supports a custom runtime module name', async () => {
    const code = getCode(
      await createTransformHarness({
        compiler: { moduleName: 'virtual:test-runtime' },
      })(source, '/src/App.tsx'),
    )

    expect(code).toContain('from "virtual:test-runtime"')
  })

  it('propagates structured compiler diagnostics through Vite errors', async () => {
    const invalidHostSource = [
      "import { Host } from '@zeus-js/runtime-dom'",
      '',
      'const App = () => <Host />',
    ].join('\n')

    await expect(
      createTransformHarness()(invalidHostSource, '/src/App.tsx?direct'),
    ).rejects.toMatchObject({
      id: '/src/App.tsx',
      pluginCode: 'ZEUS_INVALID_BUILTIN_USAGE',
      loc: {
        line: 3,
        column: 18,
      },
      cause: expect.objectContaining({
        name: 'ZeusCompilerError',
        code: 'ZEUS_INVALID_BUILTIN_USAGE',
        diagnostic: expect.objectContaining({
          code: 'ZEUS_INVALID_BUILTIN_USAGE',
          severity: 'error',
        }),
      }),
      meta: {
        zeusDiagnostic: {
          code: 'ZEUS_INVALID_BUILTIN_USAGE',
          severity: 'error',
          filename: '/src/App.tsx',
          span: {
            start: {
              line: 3,
              column: 18,
            },
          },
        },
      },
    })
  })

  it('preserves structured compiler diagnostics through Rollup', async () => {
    const id = '/src/App.tsx'
    const invalidHostSource = [
      "import { Host } from '@zeus-js/runtime-dom'",
      '',
      'const App = () => <Host />',
    ].join('\n')
    const zeusPlugin = createZeus()
    const rollupZeusPlugin: RollupPlugin = {
      name: zeusPlugin.name,
      async transform(code, resolvedId) {
        return (await getTransformHook(zeusPlugin).call(
          this as unknown as ThisParameterType<TransformHook>,
          code,
          resolvedId,
        )) as unknown as TransformResult
      },
    }

    await expect(
      rollup({
        input: id,
        plugins: [
          {
            name: 'diagnostic-fixture',
            resolveId(source) {
              return source === id ? id : null
            },
            load(resolvedId) {
              return resolvedId === id ? invalidHostSource : null
            },
          },
          rollupZeusPlugin,
        ],
      }),
    ).rejects.toMatchObject({
      code: 'PLUGIN_ERROR',
      plugin: 'vite-plugin-zeus',
      pluginCode: 'ZEUS_INVALID_BUILTIN_USAGE',
      id,
      loc: {
        line: 3,
        column: 18,
      },
      cause: expect.objectContaining({
        name: 'ZeusCompilerError',
        code: 'ZEUS_INVALID_BUILTIN_USAGE',
      }),
      meta: {
        zeusDiagnostic: expect.objectContaining({
          code: 'ZEUS_INVALID_BUILTIN_USAGE',
          severity: 'error',
          filename: id,
        }),
      },
    })
  })

  it.each(statefulPatterns)(
    'keeps %s include patterns deterministic',
    async (_, createPattern) => {
      const transform = createTransformHarness({ include: createPattern() })

      expect(await transform(source, '/src/App.tsx')).not.toBeNull()
      expect(await transform(source, '/src/App.tsx')).not.toBeNull()
    },
  )

  it.each(statefulPatterns)(
    'keeps %s exclude patterns deterministic',
    async (_, createPattern) => {
      const transform = createTransformHarness({ exclude: createPattern() })

      expect(await transform(source, '/src/App.tsx')).toBeNull()
      expect(await transform(source, '/src/App.tsx')).toBeNull()
    },
  )
})
