import { describe, expect, it } from 'vitest'

import {
  classifyPlaygroundHmrUpdate,
  compileProject,
  parseProjectSnapshot,
} from '../src'

describe('playground HMR classification', () => {
  it('preserves state only for comment-only edits', () => {
    const previous = `// old note
import { createSignal } from '@zeus-js/zeus'
export const Counter = () => {
  const [count] = createSignal(0)
  return <button>{count()}</button>
}
`
    const next = previous.replace('// old note', '// new note')

    expect(
      classifyPlaygroundHmrUpdate('src/counter.tsx', previous, next),
    ).toEqual({
      kind: 'comment-only',
      strategy: 'preserve-state',
      preserveState: true,
    })
  })

  it('classifies executable changes and styles for remount diagnostics', () => {
    expect(
      classifyPlaygroundHmrUpdate(
        'src/counter.tsx',
        'const a = 1',
        'const a = 2',
      ),
    ).toMatchObject({
      kind: 'unknown',
      strategy: 'dispose-remount',
    })
    expect(
      classifyPlaygroundHmrUpdate(
        'src/counter.tsx',
        'const [count] = createSignal(0)',
        'const [count] = createSignal(1)',
      ),
    ).toMatchObject({
      kind: 'signal-initialization',
      strategy: 'dispose-remount',
    })
    expect(
      classifyPlaygroundHmrUpdate('src/theme.css', undefined, 'button {}'),
    ).toEqual({
      kind: 'style-only',
      strategy: 'vite-style',
      preserveState: false,
    })
  })

  it('classifies JSX text edits as template changes', () => {
    const previous = `export const Counter = () => (
  <button onClick={() => count()}>
    Count: {count()}
  </button>
)
`
    const next = previous.replace('Count:', 'Live:')

    expect(
      classifyPlaygroundHmrUpdate('src/counter.tsx', previous, next),
    ).toEqual({
      kind: 'template-structure',
      strategy: 'dispose-remount',
      preserveState: false,
    })
  })
})

describe('playground HMR build metadata', () => {
  it('attaches compiler plans and previous-source classification', async () => {
    const previous = parseProjectSnapshot({
      schemaVersion: 2,
      entryPath: 'src/main.tsx',
      compilerVersion: 'wasm:test',
      files: [
        {
          path: 'src/main.tsx',
          content:
            'export const App = () => (\n  <p>\n    <span>Count</span>\n  </p>\n)\n// previous comment\n',
        },
      ],
    })
    const next = parseProjectSnapshot({
      schemaVersion: 2,
      entryPath: 'src/main.tsx',
      compilerVersion: 'wasm:test',
      files: [
        {
          path: 'src/main.tsx',
          content:
            'export const App = () => (\n  <p>\n    <span>Live</span>\n  </p>\n)\n// next comment\n',
        },
      ],
    })
    const build = await compileProject(
      next,
      {
        async transformModule(options) {
          return {
            code: options.source,
            map: null,
            diagnostics: [],
            hmrPlan: {
              version: 1,
              signature: 'plan',
              bindings: [{ id: 1, kind: 'text', value: 'Live' }],
            },
          }
        },
      },
      {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
        hmr: true,
        previousSnapshot: previous,
      },
    )

    expect(build.modules[0]?.hmr).toMatchObject({
      initial: false,
      plan: {
        version: 1,
        signature: 'plan',
        bindings: [{ id: 1, kind: 'text', value: 'Live' }],
      },
      classification: {
        kind: 'template-structure',
        strategy: 'dispose-remount',
      },
    })
  })
})
