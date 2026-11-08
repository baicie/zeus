import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { assembleRcEvidence } from '../assemble-rc-evidence'
import { crossPlatformDigest } from '../rc-approval'
import {
  APPROVER,
  CORE,
  UI,
  VERSION,
  approvalDocument,
  crossPlatformEvidence,
  sha,
  trustedRun,
} from './rc-evidence-fixtures'

const roots: string[] = []

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-rc-evidence-'))
  roots.push(root)
  return root
}

function fixture(
  overrides: {
    decision?: string
    mode?: string
    imageDigest?: string
    transactionStatus?: string
    approval?: Record<string, unknown>
    crossPlatform?: Record<string, unknown>
    trust?: Record<string, unknown>
  } = {},
) {
  const root = temporary()
  const images = {
    playground: { imageDigest: sha('playground') },
    admin: { imageDigest: sha('admin') },
    aiHost: { imageDigest: sha('aiHost') },
    workbench: { imageDigest: sha('workbench') },
  }
  const products = [
    ['webc-studio', 'playground'],
    ['native-lab', 'playground'],
    ['admin', 'admin'],
    ['ai-workbench', 'workbench'],
  ] as const
  const acceptance = {
    schema: 'zeus.deployment-acceptance/v1',
    mode: overrides.mode ?? 'online',
    coreCommit: CORE,
    uiCommit: UI,
    checkedAt: new Date().toISOString(),
    decision: overrides.decision ?? 'ONLINE_ACCEPTED',
    products: products.map(([product, image]) => ({
      product,
      url: `https://${product}.example.test/`,
      commit: product === 'ai-workbench' ? UI : CORE,
      repository: product === 'ai-workbench' ? 'baicie/zeus-ui' : 'baicie/zeus',
      status: 'ONLINE_PASS',
      artifactDigest: sha(`artifact-${product}`),
      imageDigest:
        overrides.imageDigest && product === 'admin'
          ? overrides.imageDigest
          : images[image].imageDigest,
    })),
  }
  const transaction = {
    schema: 'zeus.deployment-transaction/v1',
    status: overrides.transactionStatus ?? 'PASS',
    coreCommit: CORE,
    uiCommit: UI,
    images,
  }
  const provenance = {
    schema: 'zeus.provenance/v1',
    coreCommit: CORE,
    uiCommit: UI,
    products: acceptance.products.map(product => ({
      product: product.product,
      artifactDigest: product.artifactDigest,
      imageDigest: product.imageDigest,
    })),
  }
  const pair = { coreCommit: CORE, uiCommit: UI }
  const crossPlatform = overrides.crossPlatform ?? crossPlatformEvidence()
  const approval = overrides.approval ?? approvalDocument(crossPlatform)
  const files = {
    'acceptance.json': JSON.stringify(acceptance),
    'transaction.json': JSON.stringify(transaction),
    'provenance.json': JSON.stringify(provenance),
    'pair.json': JSON.stringify(pair),
    'approval.json': JSON.stringify(approval),
    'cross-platform.json': JSON.stringify(crossPlatform),
    'trust.json': JSON.stringify(overrides.trust ?? trustedRun()),
    'source.json': JSON.stringify({
      schema: 'zeus.deployment-evidence-source/v1',
      repository: 'baicie/zeus',
      workflow: 'Host Deployment Stage 2',
      runId: '12345',
      coreCommit: CORE,
      uiCommit: UI,
      environment: 'production',
      mode: 'production',
    }),
  }
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), content)
  }
  return {
    root,
    acceptanceFile: path.join(root, 'acceptance.json'),
    transactionFile: path.join(root, 'transaction.json'),
    provenanceFile: path.join(root, 'provenance.json'),
    pairFile: path.join(root, 'pair.json'),
    approvalFile: path.join(root, 'approval.json'),
    crossPlatformFile: path.join(root, 'cross-platform.json'),
    trustFile: path.join(root, 'trust.json'),
    sourceFile: path.join(root, 'source.json'),
    version: VERSION,
    authorizedApprovers: [APPROVER],
  }
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('RC evidence assembly', () => {
  it('binds the four products, cross-platform evidence and approval', () => {
    const input = fixture()
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toEqual([])
    const document = JSON.parse(
      fs.readFileSync(path.join(input.root, 'rc-evidence.json'), 'utf8'),
    ) as Record<string, unknown>

    expect(document.schema).toBe('zeus.rc-evidence/v4')
    expect(document.commit).toBe(CORE)
    expect(document.uiCommit).toBe(UI)
    expect(document.version).toBe(VERSION)
    expect(document.crossPlatform).toBeDefined()
    expect(document.releaseApproval).toBeDefined()
    expect(document.approvalPolicy).toEqual({
      authorizedApprovers: [APPROVER],
    })
    expect(
      (document.deployment as { acceptanceSha256: string }).acceptanceSha256,
    ).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('rejects a NOT_RUN approval', () => {
    const base = fixture()
    const approval = JSON.parse(
      fs.readFileSync(base.approvalFile, 'utf8'),
    ) as Record<string, unknown>
    const input = fixture({
      approval: { ...approval, decision: 'NOT_RUN', approver: 'NOT_RUN' },
    })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain(
      'release approval decision must be APPROVED',
    )
    expect(result.errors).toContain(
      'release approval approver must be an object',
    )
  })

  it('rejects a forged approver that is not on the authorised list', () => {
    const base = fixture()
    const approval = JSON.parse(
      fs.readFileSync(base.approvalFile, 'utf8'),
    ) as Record<string, unknown>
    const input = fixture({
      approval: {
        ...approval,
        approver: { login: 'attacker', id: 1, permission: 'admin' },
      },
    })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain(
      'release approval approver attacker is not authorised',
    )
    expect(result.errors).toContain(
      'approval run actor does not match the approver identity',
    )
  })

  it('rejects the wrong Core or UI commit', () => {
    const base = fixture()
    const approval = JSON.parse(
      fs.readFileSync(base.approvalFile, 'utf8'),
    ) as Record<string, unknown>
    for (const [field, message] of [
      [
        'coreCommit',
        'release approval coreCommit does not match the Core commit',
      ],
      ['uiCommit', 'release approval uiCommit does not match the UI commit'],
    ] as const) {
      const input = fixture({
        approval: { ...approval, [field]: 'c'.repeat(40) },
      })
      const result = assembleRcEvidence({ ...input, outDir: input.root })
      expect(result.errors).toContain(message)
    }
  })

  it('rejects a stale or expired approval', () => {
    const base = fixture()
    const approval = JSON.parse(
      fs.readFileSync(base.approvalFile, 'utf8'),
    ) as Record<string, unknown>
    const stale = fixture({
      approval: {
        ...approval,
        approvedAt: new Date(Date.now() - 90 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    })
    const staleResult = assembleRcEvidence({ ...stale, outDir: stale.root })
    expect(staleResult.errors).toContain('release approval is stale')
    expect(staleResult.errors).toContain('release approval has expired')
  })

  it('rejects an approval signed for different evidence', () => {
    const base = fixture()
    const approval = JSON.parse(
      fs.readFileSync(base.approvalFile, 'utf8'),
    ) as Record<string, unknown>
    const input = fixture({
      approval: { ...approval, evidenceDigest: sha('other-evidence') },
    })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain(
      'release approval evidenceDigest does not match the evidence',
    )
  })

  it('rejects a mismatched approval run id', () => {
    const base = fixture()
    const approval = JSON.parse(
      fs.readFileSync(base.approvalFile, 'utf8'),
    ) as Record<string, unknown>
    const input = fixture({
      approval: {
        ...approval,
        source: {
          ...(approval.source as Record<string, unknown>),
          runId: '999',
        },
      },
    })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain(
      'approval run id does not match the downloaded artifact run',
    )
  })

  it('rejects the wrong workflow or environment', () => {
    const base = fixture()
    const approval = JSON.parse(
      fs.readFileSync(base.approvalFile, 'utf8'),
    ) as Record<string, unknown>
    const run = JSON.parse(fs.readFileSync(base.trustFile, 'utf8')) as Record<
      string,
      unknown
    >
    const metadata = run.run as Record<string, unknown>

    const wrongWorkflow = fixture({
      approval: {
        ...approval,
        source: {
          ...(approval.source as Record<string, unknown>),
          workflowPath: '.github/workflows/release.yml',
        },
      },
      trust: {
        ...run,
        run: {
          ...metadata,
          workflowPath: '.github/workflows/release.yml',
        },
      },
    })
    const workflowResult = assembleRcEvidence({
      ...wrongWorkflow,
      outDir: wrongWorkflow.root,
    })
    expect(workflowResult.errors).toContain(
      'approval run was not produced by the RC Approval workflow',
    )

    const wrongEnvironment = fixture({
      trust: { ...run, run: { ...metadata, environment: 'staging' } },
    })
    const environmentResult = assembleRcEvidence({
      ...wrongEnvironment,
      outDir: wrongEnvironment.root,
    })
    expect(environmentResult.errors).toContain(
      'approval run is not protected by the Release environment',
    )
  })

  it('rejects a modified approval artifact', () => {
    const base = fixture()
    const run = JSON.parse(fs.readFileSync(base.trustFile, 'utf8')) as Record<
      string,
      unknown
    >
    const metadata = run.run as Record<string, unknown>
    const payloadArtifact = metadata.payloadArtifact as Record<string, unknown>
    const input = fixture({
      trust: {
        ...run,
        run: {
          ...metadata,
          payloadArtifact: { ...payloadArtifact, digest: sha('tampered') },
        },
      },
    })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain(
      'approval payload artifact digest does not match the approval document',
    )
  })

  it('rejects a missing or unverified attestation', () => {
    const base = fixture()
    const run = JSON.parse(fs.readFileSync(base.trustFile, 'utf8')) as Record<
      string,
      unknown
    >
    const input = fixture({
      trust: {
        ...run,
        attestation: { verified: false, errors: ['bundle invalid'] },
      },
    })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain(
      'release approval artifact attestation did not verify',
    )
    expect(result.errors).toContain(
      'release approval attestation: bundle invalid',
    )
  })

  it('rejects Linux PASS with Windows NOT_RUN', () => {
    const crossPlatform = crossPlatformEvidence()
    const platforms = crossPlatform.platforms as Record<string, unknown>
    const input = fixture({
      crossPlatform: {
        ...crossPlatform,
        digest: crossPlatformDigest({
          ...crossPlatform,
          digest: undefined,
        }),
        platforms: {
          ...platforms,
          win32: {
            ...(platforms.win32 as Record<string, unknown>),
            status: 'NOT_RUN',
          },
        },
      },
    })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain('cross-platform win32 status must be PASS')
  })

  it('rejects a local deployment acceptance', () => {
    const input = fixture({ mode: 'local', decision: 'LOCAL_ACCEPTED' })
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toContain(
      'RC evidence requires an online deployment acceptance',
    )
    expect(result.errors).toContain(
      'deployment acceptance is not ONLINE_ACCEPTED',
    )
  })

  it('rejects a failed transaction and a drifted image digest', () => {
    const failed = fixture({ transactionStatus: 'FAIL' })
    const failedResult = assembleRcEvidence({
      ...failed,
      outDir: failed.root,
    })
    expect(failedResult.errors).toContain('deployment transaction is not PASS')

    const drifted = fixture({ imageDigest: sha('other') })
    const driftedResult = assembleRcEvidence({
      ...drifted,
      outDir: drifted.root,
    })
    expect(driftedResult.errors).toContain(
      'admin image digest does not match the transaction',
    )
  })

  it('rejects a deployment evidence source from another run', () => {
    const input = fixture()
    const result = assembleRcEvidence({
      ...input,
      outDir: input.root,
      expectedRunId: '99999',
    })
    expect(result.errors).toContain(
      'deployment evidence source run id does not match',
    )
  })
})
