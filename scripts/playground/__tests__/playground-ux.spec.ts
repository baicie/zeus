import { describe, expect, it } from 'vitest'

import { validatePersistedWorkspace } from '../../../examples/playground-editor/src/playground/persistence'
import {
  decodeShare,
  encodeShare,
} from '../../../examples/playground-editor/src/playground/share'

const files = [
  { path: 'src/main.tsx', content: 'export const App = () => <p>Hello</p>\n' },
  { path: 'src/style.css', content: 'button { color: teal; }\n' },
]

describe('Playground project validation', () => {
  it('accepts a bounded workspace and rejects traversal', () => {
    expect(
      validatePersistedWorkspace({
        schemaVersion: 1,
        product: 'native-lab',
        files,
        activePath: 'src/main.tsx',
        savedAt: new Date(0).toISOString(),
      }),
    ).toBe(true)
    expect(
      validatePersistedWorkspace({
        schemaVersion: 1,
        product: 'native-lab',
        files: [{ path: '../escape.tsx', content: 'x' }],
        activePath: '../escape.tsx',
        savedAt: new Date(0).toISOString(),
      }),
    ).toBe(false)
  })

  it('rejects wrong schemas, duplicate paths and missing entry points', () => {
    const base = {
      schemaVersion: 1,
      product: 'native-lab',
      files,
      activePath: 'src/main.tsx',
      savedAt: new Date(0).toISOString(),
    }
    expect(validatePersistedWorkspace({ ...base, schemaVersion: 2 })).toBe(
      false,
    )
    expect(
      validatePersistedWorkspace({ ...base, files: [files[0], files[0]] }),
    ).toBe(false)
    expect(
      validatePersistedWorkspace({ ...base, activePath: 'src/nope.tsx' }),
    ).toBe(false)
  })

  it('rejects a file set larger than the project budget', () => {
    expect(
      validatePersistedWorkspace({
        schemaVersion: 1,
        product: 'native-lab',
        files: [{ path: 'src/main.tsx', content: 'x'.repeat(1_600_000) }],
        activePath: 'src/main.tsx',
        savedAt: new Date(0).toISOString(),
      }),
    ).toBe(false)
  })
})

describe('Playground share links', () => {
  it('round-trips a project without settings or credentials', async () => {
    const encoded = await encodeShare({
      product: 'native-lab',
      files,
      activePath: 'src/style.css',
    })
    expect(encoded).toBeTruthy()
    const decoded = await decodeShare(encoded!)
    expect(decoded?.product).toBe('native-lab')
    expect(decoded?.activePath).toBe('src/style.css')
    expect(decoded?.files).toEqual(files)
  })

  it('rejects malformed and unsafe share payloads', async () => {
    expect(await decodeShare('g.not-base64')).toBeUndefined()
    expect(
      await decodeShare('u.' + btoa('{"schemaVersion":1}')),
    ).toBeUndefined()
  })

  it('rejects a gzip bomb before expanding past the project budget', async () => {
    const bomb = new Uint8Array(8_000_000).fill(65)
    const compressed = await new Response(
      new Blob([bomb]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()
    const encoded = `g.${Buffer.from(compressed).toString('base64url')}`
    expect(encoded.length).toBeLessThan(18_000)
    expect(await decodeShare(encoded)).toBeUndefined()
  })
})
