import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createOnlineManifest,
  readLayout,
  resolveTrustedDeploymentFile,
  sha256File,
  validateLayout,
  verifyLayoutDigest,
  type DeploymentLayout,
} from '../deployment-layout'
import {
  acquireDeploymentLock,
  assertCaddyUpstreams,
  assertCredentialSeparation,
  createLocalLayout,
  healthUrls,
  readProductionSecrets,
  type TransactionOptions,
} from '../deployment-transaction'

const roots: string[] = []
const core = 'a'.repeat(40)
const ui = 'b'.repeat(40)
const digest = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-layout-'))
  roots.push(root)
  return root
}

function productionLayout(): Record<string, unknown> {
  return {
    schema: 'zeus.deployment-layout/v1',
    environment: 'production',
    allowedHosts: [
      'playground.moonbyte.top',
      'panel.moonbyte.top',
      'admin.moonbyte.top',
      'ai.moonbyte.top',
    ],
    allowedPorts: ['8443'],
    sandboxUrl: 'https://panel.moonbyte.top:8443/zeus-sandbox/sandbox.html',
    products: {
      'webc-studio': 'https://playground.moonbyte.top:8443/webc.html',
      'native-lab': 'https://playground.moonbyte.top:8443/',
      admin: 'https://admin.moonbyte.top:8443/',
      'ai-workbench': 'https://ai.moonbyte.top:8443/',
    },
    containers: {
      playground: 'zeus-playground',
      admin: 'zeus-admin',
      aiHost: 'zeus-ai-host',
      workbench: 'zeus-ai-workbench',
    },
    ports: {
      playgroundHost: 18080,
      playgroundSandbox: 18081,
      admin: 18090,
      workbench: 18091,
    },
    dataDirs: {
      admin: '/home/ubuntu/zeus-admin/data',
      ai: '/home/ubuntu/zeus-ai/data',
    },
    caddyFile: '/home/ubuntu/caddy/Caddyfile',
    caddyUpstreams: {
      'playground.moonbyte.top': '127.0.0.1:18080',
      'panel.moonbyte.top': '127.0.0.1:18081',
      'admin.moonbyte.top': '127.0.0.1:18090',
      'ai.moonbyte.top': '127.0.0.1:18091',
    },
  }
}

function candidateImages() {
  return Object.fromEntries(
    ['playground', 'admin', 'aiHost', 'workbench'].map(key => [
      key,
      {
        image: `zeus-${key}:stage1`,
        imageDigest: digest(`image-${key}`),
        artifactDigest: digest(`artifact-${key}`),
      },
    ]),
  )
}

const options = {
  mode: 'online' as const,
  environment: 'production',
  coreCommit: core,
  uiCommit: ui,
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('deployment layout', () => {
  it('accepts the checked-in production layout', () => {
    const file = path.join(
      process.cwd(),
      'deploy/host-validation/production.layout.json',
    )
    const result = validateLayout(readLayout(file), options)
    expect(result.errors).toEqual([])
    expect(result.layout?.ports.admin).toBe(18090)
    expect(result.layout?.legacyContainers?.admin).toBe('zeus-admin-r43')
  })

  it('rejects wrong environments, IP hosts, ports and origins', () => {
    const wrongEnvironment = validateLayout(productionLayout(), {
      ...options,
      environment: 'staging',
    })
    expect(wrongEnvironment.errors).toContain(
      'layout environment production does not match staging',
    )

    const ipHost = productionLayout()
    ;(ipHost.allowedHosts as string[]).push('127.0.0.1')
    expect(validateLayout(ipHost, options).errors).toContain(
      'layout allowedHosts entry 127.0.0.1 must be a DNS name',
    )

    const badPort = productionLayout()
    ;(badPort.allowedPorts as string[]).push('8080')
    expect(validateLayout(badPort, options).errors).toContain(
      'layout allowedPorts entry 8080 is not approved HTTPS',
    )

    const sameOrigin = productionLayout()
    sameOrigin.sandboxUrl = 'https://playground.moonbyte.top:8443/sandbox.html'
    expect(validateLayout(sameOrigin, options).errors).toContain(
      'sandboxUrl must not share the native-lab origin',
    )
  })

  it('rejects unsafe containers, duplicate ports and missing Caddy checks', () => {
    const badContainer = productionLayout()
    ;(badContainer.containers as Record<string, string>).admin = '../root'
    expect(validateLayout(badContainer, options).errors).toContain(
      'layout container admin is not a safe container name',
    )

    const duplicatePort = productionLayout()
    ;(duplicatePort.ports as Record<string, number>).admin = 18080
    expect(validateLayout(duplicatePort, options).errors).toContain(
      'layout ports must be unique',
    )

    const noCaddy = productionLayout()
    delete noCaddy.caddyFile
    delete noCaddy.caddyUpstreams
    const errors = validateLayout(noCaddy, options).errors
    expect(errors).toContain(
      'online layout must name the host Caddyfile for conflict checks',
    )
    expect(errors).toContain(
      'online layout must declare expected Caddy upstreams',
    )
  })

  it('rejects a Caddy host outside allowedHosts and an unsafe data directory', () => {
    const caddy = productionLayout()
    ;(caddy.caddyUpstreams as Record<string, string>)['evil.test'] =
      '127.0.0.1:18090'
    expect(validateLayout(caddy, options).errors).toContain(
      'layout Caddy host evil.test is not in allowedHosts',
    )

    const data = productionLayout()
    ;(data.dataDirs as Record<string, string>).admin = '/'
    expect(validateLayout(data, options).errors).toContain(
      'layout data directory admin is not a safe absolute path',
    )
  })
})

describe('online manifest', () => {
  const layout = validateLayout(productionLayout(), options).layout!

  it('binds every product to the candidate images and approved URLs', () => {
    const created = createOnlineManifest({
      layout,
      coreCommit: core,
      uiCommit: ui,
      images: candidateImages(),
      provenanceFile: '/tmp/provenance.json',
    })
    expect(created.errors).toEqual([])
    expect(created.manifest?.allowedHosts).toEqual(layout.allowedHosts)
    expect(created.manifest?.sandboxUrl).toBe(layout.sandboxUrl)
    expect(
      created.manifest?.products.find(product => product.product === 'admin')
        ?.artifactDigest,
    ).toBe(digest('artifact-admin'))
    expect(
      created.manifest?.products.find(
        product => product.product === 'ai-workbench',
      )?.commit,
    ).toBe(ui)
  })

  it('rejects a missing candidate image', () => {
    const images = candidateImages()
    delete images.admin
    expect(
      createOnlineManifest({
        layout,
        coreCommit: core,
        uiCommit: ui,
        images,
        provenanceFile: '/tmp/provenance.json',
      }).errors,
    ).toContain('candidate is missing the admin image')
  })
})

describe('trusted deployment files', () => {
  it('accepts a regular file under deploy/ and rejects artifacts and symlinks', () => {
    const root = temporary()
    const deploy = path.join(root, 'deploy', 'host-validation')
    fs.mkdirSync(deploy, { recursive: true })
    const file = path.join(deploy, 'compose.yml')
    fs.writeFileSync(file, 'services: {}\n')
    const artifact = path.join(root, 'artifact')
    fs.mkdirSync(artifact)
    const artifactFile = path.join(artifact, 'compose.yml')
    fs.writeFileSync(artifactFile, 'services: {}\n')

    expect(
      resolveTrustedDeploymentFile({
        root,
        value: file,
        artifactDir: artifact,
      }),
    ).toBe(fs.realpathSync(file))
    expect(() =>
      resolveTrustedDeploymentFile({
        root,
        value: artifactFile,
        artifactDir: artifact,
      }),
    ).toThrow('must not come from the artifact bundle')
    expect(() =>
      resolveTrustedDeploymentFile({ root, value: artifactFile }),
    ).toThrow('must live under the repository deploy/')

    const link = path.join(deploy, 'link.yml')
    fs.symlinkSync(file, link)
    expect(() =>
      resolveTrustedDeploymentFile({
        root,
        value: link,
        artifactDir: artifact,
      }),
    ).toThrow('must not be a symlink')
  })

  it('verifies the layout digest', () => {
    const root = temporary()
    const file = path.join(root, 'layout.json')
    fs.writeFileSync(file, '{}\n')
    expect(() => verifyLayoutDigest(file, sha256File(file))).not.toThrow()
    expect(() => verifyLayoutDigest(file, digest('other'))).toThrow(
      'does not match the approved revision',
    )
    expect(() => verifyLayoutDigest(file, 'sha256:short')).toThrow(
      'must be sha256',
    )
  })
})

describe('production secrets', () => {
  function writeSecrets(content: string, mode = 0o600): string {
    const root = temporary()
    const file = path.join(root, 'admin.env')
    fs.writeFileSync(file, content, { mode })
    fs.chmodSync(file, mode)
    return file
  }

  it('reads a private env file and rejects group-readable files', () => {
    const file = writeSecrets(
      [
        'ZEUS_ADMIN_EMAIL=admin@example.test',
        'ZEUS_ADMIN_PASSWORD=admin-password-123',
        "ZEUS_ADMIN_VIEWER_PASSWORD='viewer-password-123'",
        'ZEUS_ADMIN_HOST=0.0.0.0',
      ].join('\n'),
    )
    expect(readProductionSecrets(file)).toMatchObject({
      ZEUS_ADMIN_EMAIL: 'admin@example.test',
      ZEUS_ADMIN_PASSWORD: 'admin-password-123',
      ZEUS_ADMIN_VIEWER_PASSWORD: 'viewer-password-123',
    })

    const publicFile = writeSecrets(
      'ZEUS_ADMIN_EMAIL=a@b.c\nZEUS_ADMIN_PASSWORD=password-1234\nZEUS_ADMIN_VIEWER_PASSWORD=password-5678\n',
      0o644,
    )
    expect(() => readProductionSecrets(publicFile)).toThrow(
      'must not be readable by group or others',
    )
  })

  it('rejects duplicate and missing keys', () => {
    const duplicate = writeSecrets(
      [
        'ZEUS_ADMIN_EMAIL=a@example.test',
        'ZEUS_ADMIN_EMAIL=b@example.test',
        'ZEUS_ADMIN_PASSWORD=admin-password-123',
        'ZEUS_ADMIN_VIEWER_PASSWORD=viewer-password-123',
      ].join('\n'),
    )
    expect(() => readProductionSecrets(duplicate)).toThrow('duplicates')
    const missing = writeSecrets('ZEUS_ADMIN_EMAIL=a@example.test\n')
    expect(() => readProductionSecrets(missing)).toThrow(
      'missing ZEUS_ADMIN_PASSWORD',
    )
  })

  it('enforces credential separation', () => {
    const base = {
      adminEmail: 'admin@example.test',
      adminPassword: 'admin-password-123',
      viewerPassword: 'viewer-password-123',
      acceptanceEmail: 'acceptance@example.test',
      acceptancePassword: 'acceptance-password-123',
    }
    expect(() => assertCredentialSeparation(base)).not.toThrow()
    expect(() =>
      assertCredentialSeparation({
        ...base,
        viewerPassword: base.adminPassword,
      }),
    ).toThrow('admin and viewer passwords must differ')
    expect(() =>
      assertCredentialSeparation({
        ...base,
        acceptanceEmail: 'ADMIN@example.test',
      }),
    ).toThrow('must not be the production admin')
    expect(() =>
      assertCredentialSeparation({
        ...base,
        acceptancePassword: base.adminPassword,
      }),
    ).toThrow('must differ from the admin password')
  })
})

describe('transaction helpers', () => {
  it('builds an isolated local layout with four distinct ports', () => {
    const options = {
      mode: 'local',
      stateDir: path.join(temporary(), 'state'),
      tenant: 'stage2-local',
    } as TransactionOptions
    const layout = createLocalLayout(options)
    expect(layout.environment).toBe('local')
    expect(new Set(Object.values(layout.ports)).size).toBe(4)
    expect(layout.containers.admin).toContain('stage2-local')
    expect(healthUrls(layout)).toEqual([
      'http://127.0.0.1:8080/',
      'http://127.0.0.1:8081/sandbox.html',
      'http://127.0.0.1:8082/api/health',
      'http://127.0.0.1:8083/ai-host/health',
    ])
  })

  it('checks the Caddyfile upstreams without modifying it', () => {
    const root = temporary()
    const file = path.join(root, 'Caddyfile')
    fs.writeFileSync(
      file,
      [
        'https://admin.moonbyte.top:8443 {',
        '  reverse_proxy 127.0.0.1:18090',
        '}',
      ].join('\n'),
    )
    const layout = {
      caddyFile: file,
      caddyUpstreams: { 'admin.moonbyte.top': '127.0.0.1:18090' },
    } as unknown as DeploymentLayout
    expect(() => assertCaddyUpstreams(layout)).not.toThrow()
    const wrong = {
      caddyFile: file,
      caddyUpstreams: { 'admin.moonbyte.top': '127.0.0.1:18091' },
    } as unknown as DeploymentLayout
    expect(() => assertCaddyUpstreams(wrong)).toThrow(
      'does not route admin.moonbyte.top',
    )
  })

  it('refuses concurrent deployments but recovers a stale lock', () => {
    const state = path.join(temporary(), 'state')
    const first = acquireDeploymentLock(state)
    expect(() => acquireDeploymentLock(state)).toThrow(
      'another deployment holds the lock',
    )
    first.release()
    const second = acquireDeploymentLock(state)
    second.release()

    const stale = path.join(state, 'deployment.lock')
    fs.writeFileSync(
      stale,
      JSON.stringify({ pid: 999_999, hostname: os.hostname() }),
    )
    const third = acquireDeploymentLock(state)
    third.release()
  })
})
