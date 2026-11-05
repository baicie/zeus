import { describe, expect, it } from 'vitest'

import { createSbom, sbomComponentsMatch } from '../check-sbom'

describe('SBOM generation', () => {
  it('is deterministic, sorted and records MIT licenses', async () => {
    const packages = [
      {
        name: '@zeus-js/zeta',
        shortName: 'zeta',
        dir: '/repo/packages/core/zeta',
        packageJson: {
          name: '@zeus-js/zeta',
          version: '1.0.0',
          license: 'MIT',
        },
      },
      {
        name: '@zeus-js/alpha',
        shortName: 'alpha',
        dir: '/repo/packages/core/alpha',
        packageJson: {
          name: '@zeus-js/alpha',
          version: '2.0.0',
          license: 'MIT',
        },
      },
    ] as never

    const sbom = await createSbom(packages)

    expect(sbom).toMatchObject({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: { timestamp: '1970-01-01T00:00:00.000Z' },
    })
    expect(sbom.components.map(component => component['bom-ref'])).toEqual([
      '@zeus-js/alpha@2.0.0',
      '@zeus-js/zeta@1.0.0',
    ])
    expect(sbom.components[0]?.licenses?.[0]?.license.id).toBe('MIT')
  })

  it('rejects a stale SBOM with the same component count', async () => {
    const packages = [
      {
        name: '@zeus-js/alpha',
        shortName: 'alpha',
        dir: '/repo/packages/core/alpha',
        packageJson: { name: '@zeus-js/alpha', version: '2.0.0' },
      },
      {
        name: '@zeus-js/beta',
        shortName: 'beta',
        dir: '/repo/packages/core/beta',
        packageJson: { name: '@zeus-js/beta', version: '1.0.0' },
      },
    ] as never
    const sbom = await createSbom(packages)

    expect(
      sbomComponentsMatch(
        {
          components: [
            { 'bom-ref': '@zeus-js/alpha@2.0.0' },
            { 'bom-ref': '@zeus-js/old@1.0.0' },
          ],
        },
        sbom,
      ),
    ).toBe(false)
  })
})
