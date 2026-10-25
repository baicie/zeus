import { describe, expect, it } from 'vitest'

import {
  findUnpublishedTemplateDependencies,
  getTemplateVersionPolicyErrors,
} from './check-template-dependencies'

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

describe('template version policy', () => {
  it('rejects ranges even when a published stable version satisfies them', () => {
    expect(
      getTemplateVersionPolicyErrors([
        {
          template: 'application-ts',
          packageName: '@zeus-js/zeus',
          range: '^0.1.0',
        },
      ]),
    ).toEqual([
      'application-ts: @zeus-js/zeus must pin an exact published version, got ^0.1.0',
    ])
  })

  it('rejects mixing framework runtime and toolchain versions', () => {
    expect(
      getTemplateVersionPolicyErrors([
        {
          template: 'application-ts',
          packageName: '@zeus-js/zeus',
          range: '0.1.1-beta.18',
        },
        {
          template: 'component-library-ts',
          packageName: '@zeus-js/web-c',
          range: '0.1.0',
        },
      ]),
    ).toEqual([
      'Templates must use one Zeus framework version, got 0.1.1-beta.18, 0.1.0',
    ])
  })

  it('allows the independently versioned Vite plugin with a pinned framework', () => {
    expect(
      getTemplateVersionPolicyErrors([
        {
          template: 'application-ts',
          packageName: '@zeus-js/zeus',
          range: '0.1.1-beta.18',
        },
        {
          template: 'application-ts',
          packageName: '@zeus-js/vite-plugin',
          range: '0.0.5',
        },
        {
          template: 'component-library-ts',
          packageName: '@zeus-js/runtime-dom',
          range: '0.1.1-beta.18',
        },
      ]),
    ).toEqual([])
  })
})
