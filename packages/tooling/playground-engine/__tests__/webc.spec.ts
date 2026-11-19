import { describe, expect, it } from 'vitest'

import { parseProjectSnapshot } from '../src/project'
import { analyzeWebCProject } from '../src/webc'

describe('WebC project metadata', () => {
  it('derives manifest, CEM view and component declarations from defineElement', () => {
    const snapshot = parseProjectSnapshot({
      schemaVersion: 2,
      entryPath: 'src/counter.tsx',
      frameworkTarget: 'webc',
      compilerVersion: 'wasm:test',
      dependencies: [],
      options: {
        delegateEvents: true,
        sourceMap: true,
        sandboxTimeoutMs: 2_000,
      },
      files: [
        {
          path: 'src/counter.tsx',
          language: 'tsx',
          content: `import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZeCounter = defineElement(
  'z-counter',
  { shadow: false, props: { count: Number, label: String } },
  () => (
    <Host>
      <button>{'count'}</button>
      <Slot />
    </Host>
  ),
)
`,
        },
      ],
    })
    const result = analyzeWebCProject(snapshot)
    expect(result.diagnostics).toEqual([])
    expect(result.manifest.schemaVersion).toBe(1)
    expect(result.manifest.components).toHaveLength(1)
    expect(result.manifest.components[0]?.tag).toBe('z-counter')
    expect(result.manifest.components[0]?.props.count?.type).toBe('number')
    expect(result.declarations['z-counter']).toContain('defineCustomElement')
    expect(JSON.parse(result.customElements)[0]).toMatchObject({
      tag: 'z-counter',
      shadow: false,
    })
  })

  it('rejects non-webc snapshots', () => {
    const snapshot = parseProjectSnapshot({
      schemaVersion: 2,
      entryPath: 'src/main.tsx',
      frameworkTarget: 'native',
      compilerVersion: 'wasm:test',
      dependencies: [],
      options: {
        delegateEvents: true,
        sourceMap: true,
        sandboxTimeoutMs: 2_000,
      },
      files: [
        { path: 'src/main.tsx', content: 'export const App = () => <p />' },
      ],
    })
    expect(() => analyzeWebCProject(snapshot)).toThrow(/webc/)
  })
})
