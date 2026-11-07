import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  resolveArtifactFile,
  validateCandidateIdentity,
  validateReleaseIdentity,
  validateStage2Input,
  validateTenant,
  verifyFileSha256,
  verifyPrepareRunMetadata,
  verifyStage2Artifacts,
  type Stage2Input,
} from '../deployment-stage2'

const roots: string[] = []
const core = 'a'.repeat(40)
const ui = 'b'.repeat(40)
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
    expectedCore: core,
    expectedUi: ui,
    manifestSha256: sha('m'),
    provenanceSha256: sha('p'),
    candidateSha256: sha('c'),
    prepareRunJson: 'prepare-run.json',
    prepareArtifactsJson: 'prepare-artifacts.json',
    prepareArtifactSha256: sha('zip'),
    pairName: 'pair.json',
    enabled: 'true',
    ingressVerified: 'true',
    adminEmail: 'acceptance@example.test',
    adminPassword: 'password-123456',
    simulate: true,
    composeFile: '/repo/deploy/host-validation/compose.yml',
    layoutFile: '',
    layoutSha256: '',
    productionEnvFile: '',
    stateDir: '/tmp/zeus-stage2-state',
    projectName: 'zeus-host-validation',
    environment: 'production',
    failureInjection: 'none',
    browsers: '',
    keepLocal: false,
    localPorts: '9080,9081,9082,9083',
    ...overrides,
  }
}

const imageKeys = ['playground', 'admin', 'aiHost', 'workbench'] as const

function image(
  key: (typeof imageKeys)[number],
  artifactDigest = sha(`artifact-${key}`),
) {
  return {
    image: `zeus-${key}`,
    imageDigest: sha(`image-${key}`),
    artifactDigest,
    buildInfo: { artifactDigest, coreCommit: core, uiCommit: ui },
    ociArchive: `oci/${key}.tar`,
    ociSha256: sha(`oci-${key}`),
  }
}

function fixture(
  overrides: {
    images?: Record<string, unknown>
    core?: string
    ui?: string
  } = {},
) {
  const root = temporary()
  fs.mkdirSync(path.join(root, 'oci'))
  const images = overrides.images ?? {
    playground: image('playground'),
    admin: image('admin'),
    aiHost: image('aiHost'),
    workbench: image('workbench'),
  }
  const fallback = {
    artifactDigest: sha('missing-artifact'),
    imageDigest: sha('missing-image'),
  }
  const playground =
    (images.playground as ReturnType<typeof image> | undefined) ?? fallback
  const admin =
    (images.admin as ReturnType<typeof image> | undefined) ?? fallback
  const workbench =
    (images.workbench as ReturnType<typeof image> | undefined) ?? fallback
  const candidate = {
    schema: 'zeus.deployment-candidate/v1',
    coreCommit: overrides.core ?? core,
    uiCommit: overrides.ui ?? ui,
    images,
  }
  const manifest = {
    schema: 'zeus.deployment-manifest/v2',
    coreCommit: core,
    uiCommit: ui,
    products: [
      {
        product: 'webc-studio',
        artifactDigest: playground.artifactDigest,
        imageDigest: playground.imageDigest,
      },
      {
        product: 'native-lab',
        artifactDigest: playground.artifactDigest,
        imageDigest: playground.imageDigest,
      },
      {
        product: 'admin',
        artifactDigest: admin.artifactDigest,
        imageDigest: admin.imageDigest,
      },
      {
        product: 'ai-workbench',
        artifactDigest: workbench.artifactDigest,
        imageDigest: workbench.imageDigest,
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
    products: ['webc-studio', 'native-lab', 'admin', 'ai-workbench'].map(
      product => ({
        product,
        artifactDigest:
          product === 'admin'
            ? admin.artifactDigest
            : product === 'ai-workbench'
              ? workbench.artifactDigest
              : playground.artifactDigest,
        imageDigest:
          product === 'admin'
            ? admin.imageDigest
            : product === 'ai-workbench'
              ? workbench.imageDigest
              : playground.imageDigest,
        buildInfo: {},
      }),
    ),
  }
  const files: Record<string, string> = {
    'deployment.json': JSON.stringify(manifest),
    'provenance.json': JSON.stringify(provenance),
    'deployment-candidate.json': JSON.stringify(candidate),
    'pair.json': JSON.stringify({ coreCommit: core, uiCommit: ui }),
  }
  for (const key of imageKeys) {
    if (images[key]) files[`oci/${key}.tar`] = `oci-${key}`
  }
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return { root, manifest, provenance, candidate, images, files }
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
    fs.mkdirSync(path.join(root, 'oci'))
    fs.writeFileSync(path.join(root, 'oci/image.tar'), 'oci')
    expect(resolveArtifactFile(root, 'oci/image.tar')).toBe(
      path.join(fs.realpathSync(root), 'oci/image.tar'),
    )
  })

  it('rejects missing gates, ingress and credentials', () => {
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
      expectedUi: ui,
      manifestCore: 'c'.repeat(40),
      manifestUi: ui,
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
})

describe('artifact completeness', () => {
  it('requires exactly the four expected images', () => {
    const empty = fixture({ images: {} })
    const errors = validateCandidateIdentity(
      empty.manifest,
      empty.provenance,
      empty.candidate,
      input(),
    )
    expect(errors).toContain('candidate must contain exactly 4 images')
    for (const key of imageKeys) {
      expect(errors).toContain(`candidate is missing image ${key}`)
    }

    const withoutHost = fixture()
    delete (withoutHost.images as Record<string, unknown>).aiHost
    const missing = validateCandidateIdentity(
      withoutHost.manifest,
      withoutHost.provenance,
      { ...withoutHost.candidate, images: withoutHost.images },
      input(),
    )
    expect(missing).toContain('candidate is missing image aiHost')

    const extra = fixture()
    ;(extra.images as Record<string, unknown>).extra = image('admin')
    const extraErrors = validateCandidateIdentity(
      extra.manifest,
      extra.provenance,
      { ...extra.candidate, images: extra.images },
      input(),
    )
    expect(extraErrors).toContain('candidate contains unexpected image extra')
  })

  it('rejects wrong product mapping, commits and build-info digests', () => {
    const wrongMap = fixture()
    const wrongProduct = {
      ...wrongMap.manifest,
      products: wrongMap.manifest.products.map(product =>
        product.product === 'admin'
          ? {
              ...product,
              artifactDigest: (
                wrongMap.images.playground as ReturnType<typeof image>
              ).artifactDigest,
            }
          : product,
      ),
    }
    expect(
      validateCandidateIdentity(
        wrongProduct,
        wrongMap.provenance,
        wrongMap.candidate,
        input(),
      ),
    ).toContain('product admin artifact digest does not match admin')

    const wrongCommit = fixture({ core: 'c'.repeat(40) })
    expect(
      validateCandidateIdentity(
        wrongCommit.manifest,
        wrongCommit.provenance,
        wrongCommit.candidate,
        input(),
      ),
    ).toContain('candidate Core commit does not match the expected SHA')

    const badInfo = fixture()
    ;(
      badInfo.images.playground as ReturnType<typeof image>
    ).buildInfo.artifactDigest = sha('bad')
    expect(
      validateCandidateIdentity(
        badInfo.manifest,
        badInfo.provenance,
        { ...badInfo.candidate, images: badInfo.images },
        input(),
      ),
    ).toContain('candidate image playground buildInfo digest mismatch')
  })

  it('verifies all four archives and rejects a replaced archive', () => {
    const valid = fixture()
    const verified = verifyStage2Artifacts({
      artifactDir: valid.root,
      input: input({
        artifactDir: valid.root,
        manifestSha256: sha(valid.files['deployment.json']),
        provenanceSha256: sha(valid.files['provenance.json']),
        candidateSha256: sha(valid.files['deployment-candidate.json']),
      }),
    })
    expect(Object.keys(verified.files).sort()).toEqual([...imageKeys].sort())

    fs.writeFileSync(path.join(valid.root, 'oci/admin.tar'), 'replaced')
    expect(() =>
      verifyStage2Artifacts({
        artifactDir: valid.root,
        input: input({
          artifactDir: valid.root,
          manifestSha256: sha(valid.files['deployment.json']),
          provenanceSha256: sha(valid.files['provenance.json']),
          candidateSha256: sha(valid.files['deployment-candidate.json']),
        }),
      }),
    ).toThrow('artifact digest mismatch')
  })
})

describe('trusted prepare run', () => {
  const run = {
    repository: { full_name: 'baicie/zeus' },
    path: '.github/workflows/host-deployment-prepare.yml',
    status: 'completed',
    conclusion: 'success',
    head_sha: core,
  }
  const artifacts = {
    artifacts: [
      {
        name: 'host-deployment-stage1',
        expired: false,
        digest: sha('zip'),
      },
    ],
  }

  it('accepts a successful prepare run with an unexpired artifact', () => {
    expect(
      verifyPrepareRunMetadata(run, artifacts, {
        core,
        ui,
        artifactSha256: sha('zip'),
      }),
    ).toEqual([])
  })

  it('rejects wrong repository, workflow, conclusion, SHA and digest', () => {
    expect(
      verifyPrepareRunMetadata(
        { ...run, repository: { full_name: 'evil/zeus' } },
        artifacts,
        { core, ui, artifactSha256: sha('zip') },
      ),
    ).toContain('prepare run does not belong to baicie/zeus')
    expect(
      verifyPrepareRunMetadata({ ...run, conclusion: 'failure' }, artifacts, {
        core,
        ui,
        artifactSha256: sha('zip'),
      }),
    ).toContain('prepare run is not a successful completed run')
    expect(
      verifyPrepareRunMetadata(
        { ...run, head_sha: 'c'.repeat(40) },
        artifacts,
        {
          core,
          ui,
          artifactSha256: sha('zip'),
        },
      ),
    ).toContain('prepare run head SHA does not match the approved Core SHA')
    expect(
      verifyPrepareRunMetadata(run, artifacts, {
        core,
        ui,
        artifactSha256: sha('other'),
      }),
    ).toContain('prepare artifact digest does not match the approved digest')
  })
})
