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
type TransformOptions = Parameters<TransformHook>[2]

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
const coverageSource = `const Child = props => <article data-child={props.childAttribute}>{props.childText}</article>
export const App = props => (
  <section {...props.spreadAttributes} data-title={props.dynamicAttribute}>
    <Child childAttribute={props.nestedAttribute} childText={props.nestedText} />
    <input prop:value={props.dynamicProperty} />
    {props.rows.map((row, index) => <button data-row={row.id} onClick={() => props.onRow(row, index)}>{row.label}</button>)}
  </section>
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

  it('maps spread, nested JSX, dynamic attributes, and higher-order callbacks', async () => {
    const result = await transform(coverageSource, '/src/Coverage.tsx')

    expectCoverageExpressionMappings(result.code, result.map)
  })

  it('uses clean source names for queried module ids', async () => {
    const result = await transform(source, '/src/App.tsx?direct')
    const map = new TraceMap(result.map)

    expect(map.sources).toEqual(['App.tsx'])
    expectExpressionMapping(result.code, result.map)
  })

  it('maps dynamic expressions through SSR transforms', async () => {
    const result = await transform(source, '/src/App.tsx', {
      moduleType: 'tsx',
      ssr: true,
    })

    expectExpressionMapping(result.code, result.map, '$zeusSsrText')
  })

  it('maps the coverage fixture through SSR transforms', async () => {
    const result = await transform(coverageSource, '/src/Coverage.tsx', {
      moduleType: 'tsx',
      ssr: true,
    })

    expectCoverageExpressionMappings(
      result.code,
      result.map,
      /Coverage\.tsx$/,
      [
        'props.childAttribute',
        'props.childText',
        'props.spreadAttributes',
        'props.dynamicAttribute',
        'props.nestedAttribute',
        'props.nestedText',
        'props.dynamicProperty',
        'props.rows',
        'row.id',
        'row.label',
      ],
    )
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

  it('preserves coverage mappings through Vite dev transforms and builds', async () => {
    const fixture = createFixture(coverageSource)
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

      expectCoverageExpressionMappings(
        result.code,
        result.map as SourceMapInput,
        /App\.tsx$/,
      )
    } finally {
      await server.close()
    }

    const buildResult = await build({
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

    const outputs = Array.isArray(buildResult) ? buildResult : [buildResult]
    const chunk = outputs
      .flatMap(output => {
        if (!('output' in output)) throw new Error('Expected Vite build output')
        return output.output
      })
      .find(output => output.type === 'chunk')

    if (!chunk?.map) throw new Error('Expected Vite build source map')
    expectCoverageExpressionMappings(
      chunk.code,
      chunk.map as SourceMapInput,
      /App\.tsx$/,
    )
  })
})

async function transform(code: string, id: string, options?: TransformOptions) {
  const plugin = createZeus()
  const hook = plugin.transform
  if (!hook) throw new Error('Expected transform hook')
  const handler: TransformHook =
    typeof hook === 'function' ? hook : hook.handler
  const result = await handler.call(
    {} as ThisParameterType<TransformHook>,
    code,
    id,
    options,
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
  runtimeCall = '$zeusBindText',
): void {
  const bindingIndex = Math.max(
    generatedCode.lastIndexOf(runtimeCall),
    runtimeCall === '$zeusBindText'
      ? generatedCode.lastIndexOf('bindText')
      : -1,
  )
  if (bindingIndex < 0) {
    throw new Error(`Expected ${runtimeCall} in generated code`)
  }

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

function createFixture(code = source): { root: string; entry: string } {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'zeus-vite-source-map-')),
  )
  const sourceDir = join(root, 'src')
  const entry = join(sourceDir, 'App.tsx')
  tempDirs.push(root)

  mkdirSync(sourceDir)
  writeFileSync(entry, code)

  return { root, entry }
}

function expectCoverageExpressionMappings(
  generatedCode: string,
  map: SourceMapInput,
  sourceSuffix: RegExp = /Coverage\.tsx$/,
  names: readonly string[] = [
    'props.childAttribute',
    'props.childText',
    'props.spreadAttributes',
    'props.dynamicAttribute',
    'props.nestedAttribute',
    'props.nestedText',
    'props.dynamicProperty',
    'props.rows',
    'row.id',
    'props.onRow(row, index)',
    'row.label',
  ],
): void {
  const traceMap = new TraceMap(map)
  for (const name of names) {
    const generated = positionOf(generatedCode, name, 0)
    const original = positionOf(coverageSource, name, 0)
    const traced = originalPositionFor(traceMap, generated)

    expect(traced).toMatchObject({
      line: original.line,
      column: original.column,
    })
    expect(traced.source).toMatch(sourceSuffix)
  }
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
