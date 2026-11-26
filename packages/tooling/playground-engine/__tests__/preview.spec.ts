import { describe, expect, it } from 'vitest'

import {
  PlaygroundPreviewError,
  compileProject,
  createPlaygroundPreview,
  parseProjectSnapshot,
  previewModulePlaceholder,
} from '../src'

async function buildPreviewProject(mainSource: string) {
  const snapshot = parseProjectSnapshot({
    schemaVersion: 2,
    entryPath: 'src/main.tsx',
    compilerVersion: 'wasm:test',
    files: [
      { path: 'src/main.tsx', content: mainSource },
      {
        path: 'src/counter.tsx',
        content:
          "import { createSignal } from '@zeus-js/zeus'\nexport const Counter = () => createSignal(0)\n",
      },
      { path: 'src/theme.css', content: 'button { color: green; }' },
    ],
  })
  return compileProject(
    snapshot,
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
}

describe('playground preview linker', () => {
  it('rewrites project imports and runtime imports into sandbox-safe code', async () => {
    const build = await buildPreviewProject(
      "import { Counter } from './counter'\nimport './theme.css'\nexport { Counter }\n",
    )
    const payload = await createPlaygroundPreview(build)

    expect(payload.modules.map(module => module.path)).toEqual([
      'src/counter.tsx',
      'src/main.tsx',
    ])
    expect(payload.modules[0].code).toContain(
      'const { createSignal } = globalThis.__ZEUS_PLAYGROUND_RUNTIME__["@zeus-js/zeus"]',
    )
    expect(payload.modules[1].code).toContain(previewModulePlaceholder(0))
    expect(payload.modules[1].code).not.toContain("'./theme.css'")
    expect(payload.styles).toEqual([
      { path: 'src/theme.css', content: 'button { color: green; }' },
    ])
  })

  it('supports literal dynamic imports between project modules', async () => {
    const build = await buildPreviewProject(
      "export const load = () => import('./counter')\n",
    )
    const payload = await createPlaygroundPreview(build)

    expect(payload.modules.map(module => module.path)).toEqual([
      'src/counter.tsx',
      'src/main.tsx',
    ])
    expect(payload.modules[1].code).toContain(previewModulePlaceholder(0))
  })

  it('rejects non-literal dynamic imports before creating blob modules', async () => {
    const build = await buildPreviewProject(
      'export const load = name => import(name)\n',
    )

    await expect(createPlaygroundPreview(build)).rejects.toThrow(
      'non-literal dynamic import',
    )
  })

  it('refuses builds with compiler diagnostics', async () => {
    const build = await buildPreviewProject('export const App = () => null\n')
    const failed = {
      ...build,
      diagnostics: [
        {
          code: 'ZEUS_PARSE_ERROR',
          message: 'invalid syntax',
          severity: 'error' as const,
          filename: 'src/main.tsx',
        },
      ],
    }

    await expect(createPlaygroundPreview(failed)).rejects.toThrow(
      PlaygroundPreviewError,
    )
  })

  it('links a runtime module the host registered', async () => {
    const build = await buildPreviewProject(
      "import { createSignal } from '@zeus-js/zeus'\nexport const App = () => null\n",
    )

    const linked = await createPlaygroundPreview(build, {
      runtimeModules: { '@zeus-js/zeus': '@zeus-js/zeus' },
    })

    expect(linked.runtimeModules).toEqual(['@zeus-js/zeus'])
    expect(linked.modules[linked.modules.length - 1]?.code).toContain(
      'const { createSignal } = globalThis.__ZEUS_PLAYGROUND_RUNTIME__["@zeus-js/zeus"]',
    )
  })

  it('refuses a runtime module a caller left out of its registry', async () => {
    /*
     * A host that names some modules but not others gets an error naming what
     * was missing, rather than generated code that destructures `undefined`
     * inside the sandbox — which surfaces as an opaque TypeError from the
     * user's own module with no mention of which module was at fault.
     *
     * The Playground host passes no registry at all and relies on the default
     * list, which is why that path is covered by the case above.
     */
    const build = await buildPreviewProject(
      "import { createQuery } from '@zeus-js/query'\nexport const App = () => null\n",
    )

    await expect(
      createPlaygroundPreview(build, {
        runtimeModules: { '@zeus-js/zeus': '@zeus-js/zeus' },
      }),
    ).rejects.toThrow(/@zeus-js\/query/)
  })

  it('does not offer a runtime module no browser preview can link', async () => {
    /*
     * `@zeus-js/runtime-ssr` was in the default list while no host registered
     * it. It is not a browser-preview capability — it belongs to the SSR
     * target — so it is not in the list, and importing it from user code is a
     * compiler diagnostic naming the module rather than a runtime TypeError.
     */
    const build = await buildPreviewProject(
      "import { renderToString } from '@zeus-js/runtime-ssr'\nexport const App = () => null\n",
    )

    expect(build.diagnostics.map(d => d.message).join('\n')).toMatch(
      /@zeus-js\/runtime-ssr/,
    )
    await expect(createPlaygroundPreview(build)).rejects.toThrow(/diagnostic/)
  })

  it('instruments loops with the sandbox CPU budget', async () => {
    const build = await buildPreviewProject(
      'export const App = () => { while (true) {} }\n',
    )
    const payload = await createPlaygroundPreview(build)

    expect(payload.modules[payload.modules.length - 1]?.code).toContain(
      'ZEUS_PLAYGROUND_LOOP_BUDGET',
    )
  })
})
