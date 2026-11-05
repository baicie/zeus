import { describe, expect, it } from 'vitest'

import {
  decideAcceptance,
  DEPLOYMENT_MANIFEST_SCHEMA,
  isAllowedDeploymentUrl,
  validateDeploymentManifest,
  type DeploymentProductResult,
} from '../deployment-acceptance'

const core = 'a'.repeat(40)
const ui = 'b'.repeat(40)

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schema: DEPLOYMENT_MANIFEST_SCHEMA,
    coreCommit: core,
    uiCommit: ui,
    products: [
      {
        product: 'webc-studio',
        url: 'https://zeus.example.com/webc.html',
        commit: core,
        repository: 'baicie/zeus',
      },
      {
        product: 'native-lab',
        url: 'https://zeus.example.com/',
        commit: core,
        repository: 'baicie/zeus',
      },
      {
        product: 'admin',
        url: 'https://admin.example.com/',
        commit: core,
        repository: 'baicie/zeus',
      },
      {
        product: 'ai-workbench',
        url: 'https://ai.example.com/',
        commit: ui,
        repository: 'baicie/zeus-ui',
      },
    ],
    ...overrides,
  }
}

function result(
  product: DeploymentProductResult['product'],
  status: DeploymentProductResult['status'],
): DeploymentProductResult {
  return {
    product,
    url: 'https://example.com/',
    commit: core,
    repository: 'baicie/zeus',
    status,
    evidence: [],
  }
}

describe('validateDeploymentManifest', () => {
  it('accepts four products bound to the core and UI commits', () => {
    const validated = validateDeploymentManifest(manifest(), core, ui, 'online')

    expect(validated.errors).toEqual([])
    expect(validated.manifest?.products).toHaveLength(4)
  })

  it('rejects HTTP URLs for online acceptance but allows loopback locally', () => {
    const local = manifest({
      products: [
        {
          product: 'webc-studio',
          url: 'http://127.0.0.1:8080/webc.html',
          commit: core,
          repository: 'baicie/zeus',
        },
        {
          product: 'native-lab',
          url: 'http://localhost:8080/',
          commit: core,
          repository: 'baicie/zeus',
        },
        {
          product: 'admin',
          url: 'http://127.0.0.1:8082/',
          commit: core,
          repository: 'baicie/zeus',
        },
        {
          product: 'ai-workbench',
          url: 'http://localhost:8083/',
          commit: ui,
          repository: 'baicie/zeus-ui',
        },
      ],
    })

    expect(validateDeploymentManifest(local, core, ui, 'local').errors).toEqual(
      [],
    )
    expect(
      validateDeploymentManifest(local, core, ui, 'online').errors,
    ).toEqual([
      'products[0].url must be an HTTPS URL without credentials',
      'products[1].url must be an HTTPS URL without credentials',
      'products[2].url must be an HTTPS URL without credentials',
      'products[3].url must be an HTTPS URL without credentials',
    ])
    expect(isAllowedDeploymentUrl('http://example.com/', 'local')).toBe(false)
    expect(
      isAllowedDeploymentUrl('https://user:pass@example.com/', 'online'),
    ).toBe(false)
    expect(isAllowedDeploymentUrl('https://example.com/', 'online')).toBe(true)
    expect(isAllowedDeploymentUrl('https://127.0.0.1/', 'online')).toBe(false)
    expect(isAllowedDeploymentUrl('https://192.168.1.4/', 'online')).toBe(false)
    expect(isAllowedDeploymentUrl('https://127.0.0.1/', 'local')).toBe(true)
  })

  it('binds core products to the core commit and the workbench to the UI commit', () => {
    const wrongCore = manifest({
      products: [
        {
          product: 'webc-studio',
          url: 'https://zeus.example.com/webc.html',
          commit: ui,
          repository: 'baicie/zeus',
        },
        {
          product: 'native-lab',
          url: 'https://zeus.example.com/',
          commit: core,
          repository: 'baicie/zeus',
        },
        {
          product: 'admin',
          url: 'https://admin.example.com/',
          commit: core,
          repository: 'baicie/zeus',
        },
        {
          product: 'ai-workbench',
          url: 'https://ai.example.com/',
          commit: core,
          repository: 'baicie/zeus-ui',
        },
      ],
    })

    expect(
      validateDeploymentManifest(wrongCore, core, ui, 'online').errors,
    ).toEqual([
      `products[0].commit ${ui} does not match the Core source`,
      `products[3].commit ${core} does not match the UI source`,
    ])
  })

  it('rejects stale commits, duplicates and missing products', () => {
    expect(
      validateDeploymentManifest(
        manifest({ coreCommit: 'c'.repeat(40) }),
        core,
        ui,
        'online',
      ).errors,
    ).toContain(`coreCommit ${'c'.repeat(40)} does not match ${core}`)

    const duplicate = manifest()
    duplicate.products[1] = { ...duplicate.products[1], product: 'webc-studio' }
    expect(
      validateDeploymentManifest(duplicate, core, ui, 'online').errors,
    ).toContain('products contains duplicate webc-studio')

    const missing = manifest({ products: manifest().products.slice(0, 3) })
    expect(
      validateDeploymentManifest(missing, core, ui, 'online').errors,
    ).toEqual([
      'products is missing ai-workbench',
      'products must contain exactly 4 entries',
    ])
  })
})

describe('decideAcceptance', () => {
  it('only accepts a complete passing matrix', () => {
    const passing = [
      result('webc-studio', 'ONLINE_PASS'),
      result('native-lab', 'ONLINE_PASS'),
      result('admin', 'ONLINE_PASS'),
      result('ai-workbench', 'ONLINE_PASS'),
    ]
    expect(decideAcceptance('online', passing)).toBe('ONLINE_ACCEPTED')
    expect(decideAcceptance('local', passing)).toBe('LOCAL_VALIDATED')
    expect(
      decideAcceptance('online', [
        ...passing.slice(0, 3),
        result('ai-workbench', 'NOT_RUN'),
      ]),
    ).toBe('NOT_ACCEPTED')
    expect(
      decideAcceptance('online', [
        ...passing.slice(0, 3),
        result('ai-workbench', 'FAIL'),
      ]),
    ).toBe('NOT_ACCEPTED')
  })
})
