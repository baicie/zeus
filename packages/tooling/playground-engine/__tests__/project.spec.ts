import { describe, expect, it, vi } from 'vitest'

import {
  PLAYGROUND_CHANNEL,
  PLAYGROUND_MESSAGE_VERSION,
  PlaygroundProjectError,
  compileProject,
  parsePlaygroundMessage,
  parseProjectSnapshot,
} from '../src'

const projectInput = {
  schemaVersion: 2,
  entryPath: 'src/main.tsx',
  frameworkTarget: 'native',
  compilerVersion: 'wasm:test',
  dependencies: [{ name: '@zeus-js/zeus', version: '0.1.1-beta.20' }],
  files: [
    { path: 'src/main.tsx', content: 'export const App = () => <p>Hi</p>' },
    { path: 'src/style.css', content: 'p { color: green; }' },
  ],
  options: {
    delegateEvents: true,
    sourceMap: true,
    sandboxTimeoutMs: 2500,
  },
}

describe('playground ProjectSnapshot', () => {
  it('normalizes language metadata and freezes the accepted snapshot', () => {
    const project = parseProjectSnapshot(projectInput)

    expect(project.files).toMatchObject([
      { path: 'src/main.tsx', language: 'tsx' },
      { path: 'src/style.css', language: 'css' },
    ])
    expect(Object.isFrozen(project)).toBe(true)
    expect(Object.isFrozen(project.files)).toBe(true)
    expect(Object.isFrozen(project.files[0])).toBe(true)
    expect(project).toMatchObject({
      frameworkTarget: 'native',
      compilerVersion: 'wasm:test',
      dependencies: [{ name: '@zeus-js/zeus' }],
      options: { sandboxTimeoutMs: 2500 },
    })
  })

  it('rejects unsafe paths and duplicate files', () => {
    expect(() =>
      parseProjectSnapshot({ ...projectInput, entryPath: '../main.tsx' }),
    ).toThrow(PlaygroundProjectError)
    expect(() =>
      parseProjectSnapshot({
        ...projectInput,
        files: [
          projectInput.files[0],
          projectInput.files[0],
          projectInput.files[1],
        ],
      }),
    ).toThrow(PlaygroundProjectError)
  })

  it('rejects unsupported languages and invalid metadata', () => {
    expect(() =>
      parseProjectSnapshot({
        ...projectInput,
        files: [{ path: 'src/main.tsx', content: 'x', language: 'ts' }],
      }),
    ).toThrow(PlaygroundProjectError)
    expect(() =>
      parseProjectSnapshot({
        ...projectInput,
        files: [{ path: 'src/run.sh', content: 'echo bad' }],
      }),
    ).toThrow(PlaygroundProjectError)
  })

  it('enforces UTF-8 byte limits and entry presence', () => {
    expect(() =>
      parseProjectSnapshot(
        {
          ...projectInput,
          files: [{ path: 'src/main.tsx', content: '😀😀' }],
        },
        { maxFileBytes: 4 },
      ),
    ).toThrow(PlaygroundProjectError)
    expect(() =>
      parseProjectSnapshot({
        ...projectInput,
        files: [projectInput.files[1]],
      }),
    ).toThrow(PlaygroundProjectError)
  })

  it('compiles the entry and returns a versioned build result', async () => {
    const transformModule = vi.fn(async options => ({
      code: `compiled:${options.filename}`,
      map: null,
      diagnostics: [],
    }))
    const result = await compileProject(
      parseProjectSnapshot(projectInput),
      { transformModule },
      {
        target: 'dom',
        runtimeModule: '@zeus-js/runtime-dom',
        sourceMap: false,
      },
    )

    expect(transformModule).toHaveBeenCalledWith({
      source: projectInput.files[0].content,
      filename: 'src/main.tsx',
      target: 'dom',
      runtimeModule: '@zeus-js/runtime-dom',
      delegateEvents: true,
      sourceMap: false,
      hmr: undefined,
    })
    expect(result).toEqual({
      target: 'dom',
      entryPath: 'src/main.tsx',
      compilerVersion: 'wasm:test',
      modules: [
        {
          path: 'src/main.tsx',
          language: 'tsx',
          code: 'compiled:src/main.tsx',
          map: null,
          diagnostics: [],
          imports: [],
        },
      ],
      styles: [],
      diagnostics: [],
      meta: {
        durationMs: expect.any(Number),
        moduleCount: 1,
        byteCount: 21,
      },
    })
  })
})

describe('playground message schema', () => {
  it('accepts versioned compile requests and rejects malformed records', () => {
    const message = {
      channel: PLAYGROUND_CHANNEL,
      version: PLAYGROUND_MESSAGE_VERSION,
      kind: 'compile-request',
      requestId: 'request-1',
      target: 'dom',
      snapshot: projectInput,
    }

    expect(parsePlaygroundMessage(message)).toMatchObject({
      kind: 'compile-request',
      requestId: 'request-1',
      snapshot: { entryPath: 'src/main.tsx' },
    })
    expect(parsePlaygroundMessage({ ...message, version: 2 })).toBeUndefined()
    expect(
      parsePlaygroundMessage({ ...message, requestId: '' }),
    ).toBeUndefined()
    expect(
      parsePlaygroundMessage({
        ...message,
        snapshot: { ...projectInput, entryPath: '../escape.tsx' },
      }),
    ).toBeUndefined()
  })
})
