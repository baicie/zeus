import { describe, expect, it } from 'vitest'

import { findUnpublishedTemplateDependencies } from './check-template-dependencies'

describe('findUnpublishedTemplateDependencies', () => {
  const requirements = [
    {
      template: 'basic-ts',
      packageName: '@zeus-js/zeus',
      range: '^0.1.0',
    },
    {
      template: 'basic-ts',
      packageName: '@zeus-js/vite-plugin',
      range: '^0.0.5',
    },
  ]

  it('accepts template ranges satisfied by published versions', () => {
    expect(
      findUnpublishedTemplateDependencies(
        requirements,
        new Map([
          ['@zeus-js/zeus', ['0.1.0']],
          ['@zeus-js/vite-plugin', ['0.0.4', '0.0.5']],
        ]),
      ),
    ).toEqual([])
  })

  it('reports template ranges with no published match', () => {
    expect(
      findUnpublishedTemplateDependencies(
        requirements,
        new Map([
          ['@zeus-js/zeus', ['0.1.0']],
          ['@zeus-js/vite-plugin', ['0.0.4']],
        ]),
      ),
    ).toEqual([requirements[1]])
  })
})
