import { describe, expect, it } from 'vitest'

import {
  decideAcceptance,
  DEPLOYMENT_MANIFEST_SCHEMA,
  isAllowedDeploymentUrl,
  isPrivateAddress,
  validateDeploymentManifest,
  type DeploymentProductResult,
} from '../deployment-acceptance'

const core = 'a'.repeat(40)
const ui = 'b'.repeat(40)
const digest = `sha256:${'c'.repeat(64)}`

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schema: DEPLOYMENT_MANIFEST_SCHEMA,
    coreCommit: core,
    uiCommit: ui,
    allowedHosts: [
      'studio.example.com',
      'sandbox.example.com',
      'admin.example.com',
      'ai.example.com',
    ],
    sandboxUrl: 'https://sandbox.example.com/sandbox.html',
    products: [
      {
        product: 'webc-studio',
        url: 'https://studio.example.com/webc.html',
        commit: core,
        repository: 'baicie/zeus',
        artifactDigest: digest,
      },
      {
        product: 'native-lab',
        url: 'https://studio.example.com/',
        commit: core,
        repository: 'baicie/zeus',
        artifactDigest: digest,
      },
      {
        product: 'admin',
        url: 'https://admin.example.com/',
        commit: core,
        repository: 'baicie/zeus',
        artifactDigest: digest,
      },
      {
        product: 'ai-workbench',
        url: 'https://ai.example.com/',
        commit: ui,
        repository: 'baicie/zeus-ui',
        artifactDigest: digest,
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
    expect(validated.manifest?.allowedHosts).toEqual([
      'studio.example.com',
      'sandbox.example.com',
      'admin.example.com',
      'ai.example.com',
    ])
  })

  it('rejects HTTP, unlisted hosts, IP literals and missing digests online', () => {
    const invalid = manifest({
      products: [
        {
          product: 'webc-studio',
          url: 'http://studio.example.com/webc.html',
          commit: core,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'native-lab',
          url: 'https://evil.example.com/',
          commit: core,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'admin',
          url: 'https://127.0.0.1/',
          commit: core,
          repository: 'baicie/zeus',
        },
        {
          product: 'ai-workbench',
          url: 'https://ai.example.com/',
          commit: ui,
          repository: 'baicie/zeus-ui',
          artifactDigest: digest,
        },
      ],
    })

    const errors = validateDeploymentManifest(
      invalid,
      core,
      ui,
      'online',
    ).errors
    expect(errors).toContain(
      'products[0].url must be an allowlisted HTTPS URL without credentials',
    )
    expect(errors).toContain(
      'products[1].url must be an allowlisted HTTPS URL without credentials',
    )
    expect(errors).toContain(
      'products[2].url must be an allowlisted HTTPS URL without credentials',
    )
    expect(errors).toContain(
      'products[2].artifactDigest must be sha256:<64 hex>',
    )
  })

  it('allows loopback HTTP only for local acceptance', () => {
    const local = manifest({
      allowedHosts: [],
      sandboxUrl: 'http://localhost:8081/sandbox.html',
      products: [
        {
          product: 'webc-studio',
          url: 'http://127.0.0.1:8080/webc.html',
          commit: core,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'native-lab',
          url: 'http://localhost:8080/',
          commit: core,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'admin',
          url: 'http://127.0.0.1:8082/',
          commit: core,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'ai-workbench',
          url: 'http://localhost:8083/',
          commit: ui,
          repository: 'baicie/zeus-ui',
          artifactDigest: digest,
        },
      ],
    })

    expect(validateDeploymentManifest(local, core, ui, 'local').errors).toEqual(
      [],
    )
    expect(
      validateDeploymentManifest(local, core, ui, 'online').errors,
    ).not.toEqual([])
    expect(isAllowedDeploymentUrl('http://example.com/', 'local')).toBe(false)
    expect(isAllowedDeploymentUrl('https://127.0.0.1/', 'local')).toBe(true)
  })

  it('binds core products to the core commit and the workbench to the UI commit', () => {
    const wrongCore = manifest({
      products: [
        {
          product: 'webc-studio',
          url: 'https://studio.example.com/webc.html',
          commit: ui,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'native-lab',
          url: 'https://studio.example.com/',
          commit: core,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'admin',
          url: 'https://admin.example.com/',
          commit: core,
          repository: 'baicie/zeus',
          artifactDigest: digest,
        },
        {
          product: 'ai-workbench',
          url: 'https://ai.example.com/',
          commit: core,
          repository: 'baicie/zeus-ui',
          artifactDigest: digest,
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

describe('private address policy', () => {
  it('rejects loopback, private, link-local and reserved addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it('accepts public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700::1']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })
})

describe('decideAcceptance', () => {
  const passing = [
    result('webc-studio', 'ONLINE_PASS'),
    result('native-lab', 'ONLINE_PASS'),
    result('admin', 'ONLINE_PASS'),
    result('ai-workbench', 'ONLINE_PASS'),
  ]

  it('only accepts a complete passing matrix', () => {
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

  it('reports blocked write smoke separately from a failure', () => {
    expect(
      decideAcceptance('online', [
        ...passing.slice(0, 3),
        result('ai-workbench', 'BLOCKED'),
      ]),
    ).toBe('BLOCKED')
  })
})

describe('approved 8443 deployment origins', () => {
  const sandbox = 'https://panel.example.com:8443/zeus-sandbox/sandbox.html'
  const host = 'https://studio.example.com:8443/'

  it('accepts explicitly approved 8443 origins and a distinct sandbox URL', () => {
    const value = manifest({
      allowedHosts: [
        'studio.example.com',
        'panel.example.com',
        'admin.example.com',
        'ai.example.com',
      ],
      allowedPorts: ['443', '8443'],
      sandboxUrl: sandbox,
      products: manifest().products.map(entry =>
        entry.product === 'webc-studio' || entry.product === 'native-lab'
          ? { ...entry, url: host }
          : entry,
      ),
    })
    const validated = validateDeploymentManifest(value, core, ui, 'online')
    expect(validated.errors).toEqual([])
    expect(validated.manifest?.allowedPorts).toEqual(['443', '8443'])
    expect(validated.manifest?.sandboxUrl).toBe(sandbox)
  })

  it('keeps 8443 rejected unless it is explicitly listed', () => {
    const value = manifest({
      allowedHosts: ['studio.example.com', 'panel.example.com'],
      sandboxUrl: sandbox,
      products: manifest().products.map(entry =>
        entry.product === 'webc-studio' || entry.product === 'native-lab'
          ? { ...entry, url: host }
          : entry,
      ),
    })
    const validated = validateDeploymentManifest(value, core, ui, 'online')
    expect(validated.errors.some(error => error.includes('URL'))).toBe(true)
  })

  it('rejects unapproved ports and a sandbox sharing the host origin', () => {
    const value = manifest({
      allowedHosts: ['studio.example.com', 'panel.example.com'],
      allowedPorts: ['9443'],
      sandboxUrl: 'https://studio.example.com:8443/sandbox.html',
      products: manifest().products.map(entry =>
        entry.product === 'webc-studio' || entry.product === 'native-lab'
          ? { ...entry, url: host }
          : entry,
      ),
    })
    const validated = validateDeploymentManifest(value, core, ui, 'online')
    expect(validated.errors.some(error => error.includes('approved'))).toBe(
      true,
    )
  })
})
