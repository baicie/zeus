import { describe, expect, it, vi } from 'vitest'

import {
  compileProject,
  parseProjectSnapshot,
  type PlaygroundCompiler,
} from '../src'

function project(files: Array<{ path: string; content: string }>) {
  return parseProjectSnapshot({
    schemaVersion: 2,
    entryPath: 'src/main.tsx',
    compilerVersion: 'wasm:test',
    files,
  })
}

describe('playground project compiler', () => {
  it('compiles the reachable module graph and orders dependencies first', async () => {
    const transformModule = vi.fn(
      async (
        options: Parameters<PlaygroundCompiler['transformModule']>[0],
      ) => ({
        code:
          options.filename === 'src/main.tsx'
            ? `import { Counter } from './counter'\nimport './theme.css'\nexport { Counter }\n`
            : `import { createSignal } from '@zeus-js/zeus'\nexport const Counter = () => createSignal(0)\n`,
        map: {
          version: 3,
          mappings: '',
          names: [],
          sources: [options.filename],
          sourcesContent: [options.source],
        },
        diagnostics: [],
      }),
    )
    const build = await compileProject(
      project([
        {
          path: 'src/main.tsx',
          content:
            "import { Counter } from './counter'\nimport './theme.css'\nexport { Counter }\n",
        },
        {
          path: 'src/counter.tsx',
          content:
            "import { createSignal } from '@zeus-js/zeus'\nexport const Counter = () => createSignal(0)\n",
        },
        { path: 'src/theme.css', content: 'button { color: green; }' },
      ]),
      { transformModule },
      {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
      },
    )

    expect(transformModule).toHaveBeenCalledTimes(2)
    expect(build.modules.map(module => module.path)).toEqual([
      'src/counter.tsx',
      'src/main.tsx',
    ])
    expect(build.modules[1].imports).toMatchObject([
      {
        specifier: './counter',
        resolvedPath: 'src/counter.tsx',
        kind: 'local',
      },
      {
        specifier: './theme.css',
        resolvedPath: 'src/theme.css',
        kind: 'style',
      },
    ])
    expect(build.styles).toEqual([
      { path: 'src/theme.css', content: 'button { color: green; }' },
    ])
    expect(build.meta.moduleCount).toBe(2)
    expect(build.diagnostics).toEqual([])
  })

  it('reports unsupported runtime dependencies before preview execution', async () => {
    const build = await compileProject(
      project([
        {
          path: 'src/main.tsx',
          content:
            "import { format } from 'date-fns'\nexport const App = () => format(new Date())\n",
        },
      ]),
      {
        async transformModule(options) {
          return {
            code: options.source,
            map: null,
            diagnostics: [],
          }
        },
      },
      {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
      },
    )

    expect(build.diagnostics).toMatchObject([
      {
        code: 'ZEUS_PLAYGROUND_UNSUPPORTED_DEPENDENCY',
        filename: 'src/main.tsx',
        severity: 'error',
      },
    ])
  })

  it('rejects cyclic module graphs for linked browser previews', async () => {
    const build = await compileProject(
      project([
        {
          path: 'src/main.tsx',
          content: "import './cycle'\nexport const App = () => null\n",
        },
        {
          path: 'src/cycle.ts',
          content: "import './main'\nexport const cycle = true\n",
        },
      ]),
      {
        async transformModule(options) {
          return {
            code: options.source,
            map: null,
            diagnostics: [],
          }
        },
      },
      {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
      },
    )

    expect(build.diagnostics).toMatchObject([
      {
        code: 'ZEUS_PLAYGROUND_IMPORT_CYCLE',
        severity: 'error',
      },
    ])
  })
})
