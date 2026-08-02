import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  originalPositionFor,
  TraceMap,
  type SourceMapInput,
} from '@jridgewell/trace-mapping'
import { build, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { HookHandler, Plugin } from 'vite'

type TransformHook = NonNullable<HookHandler<Plugin['transform']>>

const runtimeId = 'virtual:zeus-source-map-runtime'
const expressionNames = ['condition', 'consequent', 'alternate'] as const
const source = `export const App = (condition, consequent, alternate) => (
  <div>
    {condition
      ? consequent
      : alternate}
  </div>
)
`
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('vite-plugin-zeus source maps', () => {
  it('maps dynamic expressions through the plugin transform', async () => {
    const result = await transform(source, '/src/App.tsx')

    expectExpressionMapping(result.code, result.map)
  })

  it('uses clean source names for queried module ids', async () => {
    const result = await transform(source, '/src/App.tsx?direct')
    const map = new TraceMap(result.map)

    expect(map.sources).toEqual(['App.tsx'])
    expectExpressionMapping(result.code, result.map)
  })

  it('preserves expression mappings through Vite dev transforms', async () => {
    const fixture = createFixture()
    const server = await createServer({
      root: fixture.root,
      configFile: false,
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true },
      plugins: [
        createZeus({ compiler: { moduleName: runtimeId } }),
        createVirtualRuntime(),
      ],
      server: { middlewareMode: true },
    })

    try {
      const result = await server.transformRequest('/src/App.tsx')
      if (!result?.map) throw new Error('Expected Vite dev source map')

      expectExpressionMapping(result.code, result.map as SourceMapInput)
    } finally {
      await server.close()
    }
  })

  it('preserves expression mappings through Vite builds', async () => {
    const fixture = createFixture()
    const result = await build({
      root: fixture.root,
      configFile: false,
      logLevel: 'silent',
      plugins: [createZeus({ compiler: { moduleName: runtimeId } })],
      build: {
        lib: {
          entry: fixture.entry,
          formats: ['es'],
        },
        minify: false,
        write: false,
        sourcemap: true,
        rolldownOptions: {
          external: [runtimeId],
        },
      },
    })

    const outputs = Array.isArray(result) ? result : [result]
    const chunk = outputs
      .flatMap(output => {
        if (!('output' in output)) throw new Error('Expected Vite build output')
        return output.output
      })
      .find(output => output.type === 'chunk')

    if (!chunk?.map) throw new Error('Expected Vite build source map')
    expectExpressionMapping(chunk.code, chunk.map as SourceMapInput)
  })
})

async function transform(code: string, id: string) {
  const plugin = createZeus()
  const hook = plugin.transform
  if (!hook) throw new Error('Expected transform hook')
  const handler: TransformHook =
    typeof hook === 'function' ? hook : hook.handler
  const result = await handler.call(
    {} as ThisParameterType<TransformHook>,
    code,
    id,
  )

  if (
    !result ||
    typeof result === 'string' ||
    typeof result.code !== 'string' ||
    !result.map
  ) {
    throw new Error('Expected plugin transform result with source map')
  }

  return { code: result.code, map: result.map as SourceMapInput }
}

function expectExpressionMapping(
  generatedCode: string,
  map: SourceMapInput,
): void {
  const bindingIndex = generatedCode.lastIndexOf('bindText')
  if (bindingIndex < 0) throw new Error('Expected bindText in generated code')

  const traceMap = new TraceMap(map)
  const sourceExpressionIndex = source.indexOf('{condition')

  for (const name of expressionNames) {
    const generated = positionOf(generatedCode, name, bindingIndex)
    const original = positionOf(source, name, sourceExpressionIndex)
    const traced = originalPositionFor(traceMap, generated)

    expect(traced).toMatchObject({
      line: original.line,
      column: original.column,
    })
    expect(traced.source).toMatch(/App\.tsx$/)
  }
}

function positionOf(code: string, needle: string, fromIndex: number) {
  const index = code.indexOf(needle, fromIndex)
  if (index < 0) throw new Error(`Expected ${needle} in generated code`)

  const lines = code.slice(0, index).split('\n')
  return {
    line: lines.length,
    column: lines[lines.length - 1]?.length ?? 0,
  }
}

function createFixture(): { root: string; entry: string } {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'zeus-vite-source-map-')),
  )
  const sourceDir = join(root, 'src')
  const entry = join(sourceDir, 'App.tsx')
  tempDirs.push(root)

  mkdirSync(sourceDir)
  writeFileSync(entry, source)

  return { root, entry }
}

function createVirtualRuntime(): Plugin {
  const resolvedId = `\0${runtimeId}`

  return {
    name: 'zeus-source-map-test-runtime',
    resolveId(id) {
      if (id === runtimeId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return null
      return [
        'export const template = () => () => ({ firstChild: {} })',
        'export const bindText = () => {}',
      ].join('\n')
    },
  }
}
