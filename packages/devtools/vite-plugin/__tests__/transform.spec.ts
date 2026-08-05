import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { ZeusVitePluginOptions } from '../src'
import type { Plugin as RollupPlugin, TransformResult } from 'rollup'
import type { HookHandler, Plugin, ResolvedConfig } from 'vite'

type TransformHook = NonNullable<HookHandler<Plugin['transform']>>
type ConfigResolvedHook = NonNullable<HookHandler<Plugin['configResolved']>>
type TransformOutput = Awaited<ReturnType<TransformHook>>
type TransformOptions = Parameters<TransformHook>[2]

interface RootHMRTestState {
  events: string[]
  disposers: Array<() => void>
  hot: {
    accept(): void
    dispose(callback: () => void): void
  }
}

const source = 'const App = () => <div>hello</div>'
const eventSource =
  'const App = () => <button onClick={() => {}}>click</button>'
const rootSource = [
  "import { render as mount } from '@zeus-js/zeus'",
  '',
  "mount('view', document.body)",
].join('\n')

const statefulPatterns: [string, () => RegExp][] = [
  ['global', () => /\.tsx$/g],
  ['sticky', () => /\/src\/App\.tsx/y],
]

function getTransformHook(plugin: Plugin): TransformHook {
  const hook = plugin.transform
  if (!hook) throw new Error('Expected transform hook')
  return typeof hook === 'function' ? hook : hook.handler
}

function createTransformHarness(
  options: ZeusVitePluginOptions = {},
  command?: 'serve' | 'build',
  buildSSR: boolean | string = false,
) {
  const plugin = createZeus(options)

  if (command) {
    runConfigResolved(plugin, command, buildSSR)
  }

  const hook = getTransformHook(plugin)
  const context = {
    error(error: string | { message: string }): never {
      if (typeof error === 'string') throw new Error(error)
      throw Object.assign(new Error(error.message), error)
    },
  } as ThisParameterType<TransformHook>

  return (code: string, id: string, transformOptions?: TransformOptions) =>
    hook.call(context, code, id, transformOptions)
}

function runConfigResolved(
  plugin: Plugin,
  command: 'serve' | 'build',
  buildSSR: boolean | string,
): void {
  const hook = plugin.configResolved
  if (!hook) throw new Error('Expected configResolved hook')

  const handler: ConfigResolvedHook =
    typeof hook === 'function' ? hook : hook.handler

  handler.call(
    {} as ThisParameterType<ConfigResolvedHook>,
    {
      command,
      build: { ssr: buildSSR },
    } as ResolvedConfig,
  )
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

  it('preserves an explicit DOM event delegation setting', async () => {
    const code = getCode(
      await createTransformHarness({ compiler: { delegateEvents: false } })(
        eventSource,
        '/src/App.tsx',
      ),
    )

    expect(code).not.toContain('_delegateEvents')
  })

  it('supports a custom runtime module name', async () => {
    const code = getCode(
      await createTransformHarness({
        compiler: { moduleName: 'virtual:test-runtime' },
      })(source, '/src/App.tsx'),
    )

    expect(code).toContain('from "virtual:test-runtime"')
  })

  it('selects the SSR compiler target for Vite SSR transforms', async () => {
    const code = getCode(
      await createTransformHarness()(eventSource, '/src/App.tsx', {
        moduleType: 'tsx',
        ssr: true,
      }),
    )

    expect(code).toContain('from "@zeus-js/runtime-ssr"')
    expect(code).not.toContain('@zeus-js/runtime-dom')
    expect(code).not.toContain('_template')
    expect(code).not.toContain('_delegateEvents')
  })

  it('supports an independent SSR runtime module name', async () => {
    const transform = createTransformHarness({
      compiler: { moduleName: 'virtual:dom-runtime' },
      ssrModuleName: 'virtual:ssr-runtime',
    })
    const ssrCode = getCode(
      await transform(source, '/src/App.tsx', {
        moduleType: 'tsx',
        ssr: true,
      }),
    )
    const domCode = getCode(await transform(source, '/src/App.tsx'))

    expect(ssrCode).toContain('from "virtual:ssr-runtime"')
    expect(domCode).toContain('from "virtual:dom-runtime"')
  })

  it('adds a disposal HMR boundary to top-level render roots in serve mode', async () => {
    const code = getCode(
      await createTransformHarness({}, 'serve')(rootSource, '/src/main.tsx'),
    )

    expect(code).toContain('const _dispose = mount')
    expect(code).toContain('import.meta.hot.accept()')
    expect(code).toContain('import.meta.hot.dispose')
    expect(code).toContain('_dispose()')
  })

  it('reuses an explicitly captured top-level render disposer', async () => {
    const capturedSource = [
      "import { render } from '@zeus-js/zeus'",
      '',
      "export const disposeApp = render('view', document.body)",
    ].join('\n')
    const code = getCode(
      await createTransformHarness({}, 'serve')(
        capturedSource,
        '/src/main.tsx',
      ),
    )

    expect(code).toContain('export const disposeApp = render')
    expect(code).toContain('disposeApp()')
    expect(code).not.toContain('const _dispose')
  })

  it('does not add an HMR boundary to production builds', async () => {
    const code = getCode(
      await createTransformHarness({}, 'build')(rootSource, '/src/main.tsx'),
    )

    expect(code).not.toContain('import.meta.hot')
  })

  it('does not make component-only modules self-accepting', async () => {
    const code = getCode(
      await createTransformHarness({}, 'serve')(source, '/src/App.tsx'),
    )

    expect(code).not.toContain('import.meta.hot')
  })

  it('does not add a browser HMR boundary to SSR transforms', async () => {
    const code = getCode(
      await createTransformHarness({}, 'serve')(rootSource, '/src/main.tsx', {
        moduleType: 'tsx',
        ssr: true,
      }),
    )

    expect(code).not.toContain('import.meta.hot')
  })

  it('keeps client HMR enabled when the project also configures an SSR build', async () => {
    const code = getCode(
      await createTransformHarness({}, 'serve', '/src/server.ts')(
        rootSource,
        '/src/main.tsx',
        { moduleType: 'tsx', ssr: false },
      ),
    )

    expect(code).toContain('import.meta.hot.accept()')
  })

  it('leaves modules with an explicit HMR boundary under user control', async () => {
    const manualSource = [
      rootSource,
      '',
      'if (import.meta.hot) {',
      '  import.meta.hot.accept()',
      '}',
    ].join('\n')
    const code = getCode(
      await createTransformHarness({}, 'serve')(manualSource, '/src/main.tsx'),
    )
    if (!code) throw new Error('Expected transformed manual HMR module')

    expect(code).not.toContain('const _dispose')
    expect(code.match(/import\.meta\.hot\.accept\(\)/g)).toHaveLength(1)
  })

  it('disposes the old root before an accepted module mounts again', async () => {
    const lifecycleSource = [
      "import { render as mount } from '@zeus-js/zeus'",
      '',
      "mount('first', document.body)",
      "mount('second', document.body)",
    ].join('\n')
    const code = getCode(
      await createTransformHarness({}, 'serve')(
        lifecycleSource,
        '/src/main.tsx',
      ),
    )
    if (!code) throw new Error('Expected transformed root module')

    const globalState = globalThis as typeof globalThis & {
      __zeusRootHMRTest?: RootHMRTestState
    }
    const state: RootHMRTestState = {
      events: [],
      disposers: [],
      hot: {
        accept() {
          state.events.push('accept')
        },
        dispose(callback) {
          state.events.push('register-dispose')
          state.disposers.push(callback)
        },
      },
    }
    globalState.__zeusRootHMRTest = state

    const runtimeURL = toDataURL(
      [
        'export function render(label) {',
        '  globalThis.__zeusRootHMRTest.events.push(`mount:${label}`)',
        '  return () => {',
        '    globalThis.__zeusRootHMRTest.events.push(`dispose:${label}`)',
        '  }',
        '}',
      ].join('\n'),
    )
    const executableCode = code
      .replace(
        /from ['"]@zeus-js\/zeus['"]/,
        `from ${JSON.stringify(runtimeURL)}`,
      )
      .replace('document.body', 'undefined')
      .split('import.meta.hot')
      .join('globalThis.__zeusRootHMRTest.hot')

    try {
      await import(`${toDataURL(executableCode)}#initial`)
      expect(state.events).toEqual([
        'mount:first',
        'mount:second',
        'accept',
        'register-dispose',
      ])

      const dispose = state.disposers.shift()
      if (!dispose) throw new Error('Expected registered HMR disposer')
      dispose()

      await import(`${toDataURL(executableCode)}#updated`)
      expect(state.events).toEqual([
        'mount:first',
        'mount:second',
        'accept',
        'register-dispose',
        'dispose:second',
        'dispose:first',
        'mount:first',
        'mount:second',
        'accept',
        'register-dispose',
      ])
    } finally {
      delete globalState.__zeusRootHMRTest
    }
  })

  it('allows automatic root HMR boundaries to be disabled', async () => {
    const code = getCode(
      await createTransformHarness({ hmr: false }, 'serve')(
        rootSource,
        '/src/main.tsx',
      ),
    )

    expect(code).not.toContain('import.meta.hot')
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

function toDataURL(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}
