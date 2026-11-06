import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  resolveArtifactFile,
  validateReleaseIdentity,
  validateStage2Input,
  validateTenant,
  verifyFileSha256,
  verifyStage2Artifacts,
  type Stage2Input,
} from '../deployment-stage2'

const roots: string[] = []
const sha = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-stage2-'))
  roots.push(root)
  return root
}

function input(overrides: Partial<Stage2Input> = {}): Stage2Input {
  return {
    artifactDir: '/tmp',
    manifestName: 'deployment.json',
    provenanceName: 'provenance.json',
    candidateName: 'deployment-candidate.json',
    tenant: 'acceptance-2026-11-06',
    expectedCore: 'a'.repeat(40),
    expectedUi: 'b'.repeat(40),
    manifestSha256: sha('m'),
    provenanceSha256: sha('p'),
    candidateSha256: sha('c'),
    enabled: 'true',
    ingressVerified: 'true',
    adminEmail: 'acceptance@example.test',
    adminPassword: 'password-123456',
    simulate: true,
    ...overrides,
  }
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('Stage 2 input security', () => {
  it('rejects shell metacharacters, newlines and traversal in tenant ids', () => {
    for (const tenant of [
      '',
      'A',
      'ab',
      'acceptance; rm -rf /',
      '$(whoami)',
      '`id`',
      'line\nbreak',
      '../production',
      'acceptance/tenant',
      'acceptance tenant',
      'ACCEPTANCE',
    ]) {
      expect(() => validateTenant(tenant), tenant).toThrow()
    }
    expect(validateTenant('acceptance-2026-11-06')).toBe(
      'acceptance-2026-11-06',
    )
  })

  it('rejects absolute paths, traversal and symlink escapes', () => {
    const root = temporary()
    fs.writeFileSync(path.join(root, 'manifest.json'), '{}')
    expect(resolveArtifactFile(root, 'manifest.json')).toBe(
      path.join(fs.realpathSync(root), 'manifest.json'),
    )
    expect(() => resolveArtifactFile(root, '../manifest.json')).toThrow()
    expect(() => resolveArtifactFile(root, '/etc/passwd')).toThrow()
    expect(() => resolveArtifactFile(root, 'a/../../x')).toThrow()
    fs.symlinkSync('/etc/passwd', path.join(root, 'escape.json'))
    expect(() => resolveArtifactFile(root, 'escape.json')).toThrow()
    const nested = path.join(root, 'oci')
    fs.mkdirSync(nested)
    fs.writeFileSync(path.join(nested, 'image.tar'), 'oci')
    expect(resolveArtifactFile(root, 'oci/image.tar')).toBe(
      path.join(fs.realpathSync(root), 'oci/image.tar'),
    )
  })

  it('rejects missing gates, unverified ingress and credentials', () => {
    expect(validateStage2Input(input({ enabled: 'false' }))).toContain(
      'deployment gate is not enabled',
    )
    expect(
      validateStage2Input(input({ simulate: false, ingressVerified: 'false' })),
    ).toContain('TLS ingress has not been verified')
    expect(validateStage2Input(input({ adminPassword: '' }))).toContain(
      'acceptance credentials are missing',
    )
    expect(validateStage2Input(input())).toEqual([])
  })

  it('rejects a release commit outside main ancestry', () => {
    const errors = validateReleaseIdentity({
      head: 'c'.repeat(40),
      main: 'd'.repeat(40),
      expectedCore: 'c'.repeat(40),
      expectedUi: 'b'.repeat(40),
      manifestCore: 'c'.repeat(40),
      manifestUi: 'b'.repeat(40),
    })
    expect(errors).toContain('deployment commit is not an ancestor of main')
  })

  it('rejects digest mismatches before reading artifacts', () => {
    const root = temporary()
    const file = path.join(root, 'artifact.json')
    fs.writeFileSync(file, 'artifact')
    expect(() => verifyFileSha256(file, sha('other'))).toThrow(
      'artifact digest mismatch',
    )
    expect(() => verifyFileSha256(file, 'sha256:not-a-digest')).toThrow(
      'expected artifact digest',
    )
  })

  it('verifies manifest, provenance and OCI files together', () => {
    const root = temporary()
    fs.mkdirSync(path.join(root, 'oci'))
    const core = 'a'.repeat(40)
    const ui = 'b'.repeat(40)
    const artifactDigest = sha('artifact')
    const imageDigest = sha('image')
    const manifest = {
      schema: 'zeus.deployment-manifest/v2',
      coreCommit: core,
      uiCommit: ui,
      products: [
        {
          product: 'native-lab',
          artifactDigest,
          imageDigest,
        },
      ],
    }
    const provenance = {
      schema: 'zeus.provenance/v1',
      coreCommit: core,
      uiCommit: ui,
      runId: '1',
      runUrl: 'https://example.test/run/1',
      createdAt: new Date(0).toISOString(),
      products: [
        {
          product: 'native-lab',
          artifactDigest,
          imageDigest,
          buildInfo: {},
        },
      ],
    }
    const candidate = {
      images: {
        playground: {
          ociArchive: 'oci/playground.tar',
          ociSha256: sha('oci'),
        },
      },
    }
    const files = {
      'deployment.json': JSON.stringify(manifest),
      'provenance.json': JSON.stringify(provenance),
      'deployment-candidate.json': JSON.stringify(candidate),
      'oci/playground.tar': 'oci',
    }
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(root, name), content)
    }
    const verified = verifyStage2Artifacts({
      artifactDir: root,
      input: input({
        artifactDir: root,
        manifestSha256: sha(files['deployment.json']),
        provenanceSha256: sha(files['provenance.json']),
        candidateSha256: sha(files['deployment-candidate.json']),
      }),
    })
    expect(verified.files.playground).toBe(
      path.join(fs.realpathSync(root), 'oci/playground.tar'),
    )
  })
})
