import { createHash } from 'node:crypto'

import { generateZeusComponentsManifest } from '../../../packages/web-c/output-wc/src/generateManifest'
import { verifyGoldenComponentManifest } from '../golden-component-manifest'

import type { ComponentManifest } from '@zeus-js/component-analyzer'

const packageName = '@zeus-web/button'
const manifest: ComponentManifest = {
  schemaVersion: 1,
  components: [
    {
      tag: 'zw-button',
      name: 'Button',
      exportName: 'Button',
      source: 'src/button.tsx',
      props: {},
      runtimeProps: {},
      events: {},
      methods: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
      meta: { shadow: false },
    },
  ],
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

describe('Golden published Component Manifest verification', () => {
  it('accepts the manifest emitted by the Web Components output target', () => {
    const content = generateZeusComponentsManifest(manifest)
    const expected = sha256(content)

    expect(verifyGoldenComponentManifest(content, packageName, expected)).toBe(
      expected,
    )
  })

  it('rejects a legacy version field even when its content hash matches', () => {
    const content = JSON.stringify({
      version: 1,
      components: manifest.components,
    })

    expect(() =>
      verifyGoldenComponentManifest(content, packageName, sha256(content)),
    ).toThrow('does not contain a valid Component Manifest v1')
  })

  it('rejects an otherwise valid published manifest changed after freezing', () => {
    const frozen = generateZeusComponentsManifest(manifest)
    const changed = generateZeusComponentsManifest({
      ...manifest,
      components: [{ ...manifest.components[0], exportName: 'ChangedButton' }],
    })

    expect(() =>
      verifyGoldenComponentManifest(changed, packageName, sha256(frozen)),
    ).toThrow('Component Manifest differs from the frozen Golden contract')
  })
})
