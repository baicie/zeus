import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { assembleRcEvidence } from '../assemble-rc-evidence'

const roots: string[] = []
const core = 'a'.repeat(40)
const ui = 'b'.repeat(40)
const digest = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

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
  } = {},
) {
  const root = temporary()
  const images = {
    playground: { imageDigest: digest('playground') },
    admin: { imageDigest: digest('admin') },
    aiHost: { imageDigest: digest('aiHost') },
    workbench: { imageDigest: digest('workbench') },
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
    coreCommit: core,
    uiCommit: ui,
    checkedAt: new Date().toISOString(),
    decision: overrides.decision ?? 'ONLINE_ACCEPTED',
    products: products.map(([product, image]) => ({
      product,
      url: `https://${product}.example.test/`,
      commit: product === 'ai-workbench' ? ui : core,
      repository: product === 'ai-workbench' ? 'baicie/zeus-ui' : 'baicie/zeus',
      status: 'ONLINE_PASS',
      artifactDigest: digest(`artifact-${product}`),
      imageDigest:
        overrides.imageDigest && product === 'admin'
          ? overrides.imageDigest
          : images[image].imageDigest,
    })),
  }
  const transaction = {
    schema: 'zeus.deployment-transaction/v1',
    status: overrides.transactionStatus ?? 'PASS',
    coreCommit: core,
    uiCommit: ui,
    images,
  }
  const provenance = {
    schema: 'zeus.provenance/v1',
    coreCommit: core,
    uiCommit: ui,
    products: acceptance.products.map(product => ({
      product: product.product,
      artifactDigest: product.artifactDigest,
      imageDigest: product.imageDigest,
    })),
  }
  const pair = { coreCommit: core, uiCommit: ui }
  const files = {
    'acceptance.json': JSON.stringify(acceptance),
    'transaction.json': JSON.stringify(transaction),
    'provenance.json': JSON.stringify(provenance),
    'pair.json': JSON.stringify(pair),
    'source.json': JSON.stringify({
      schema: 'zeus.deployment-evidence-source/v1',
      repository: 'baicie/zeus',
      workflow: 'Host Deployment Stage 2',
      runId: '12345',
      coreCommit: core,
      uiCommit: ui,
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
    sourceFile: path.join(root, 'source.json'),
  }
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('RC evidence assembly', () => {
  it('binds the four products to a real online acceptance and transaction', () => {
    const input = fixture()
    const result = assembleRcEvidence({ ...input, outDir: input.root })
    expect(result.errors).toEqual([])
    const document = JSON.parse(
      fs.readFileSync(result.evidenceFile!, 'utf8'),
    ) as {
      schema: string
      commit: string
      uiCommit: string
      products: Array<{ imageDigest: string }>
      deployment: {
        decision: string
        transactionStatus: string
        acceptanceSha256: string
        products: Array<{ status: string }>
      }
    }
    expect(document.schema).toBe('zeus.rc-evidence/v3')
    expect(document.commit).toBe(core)
    expect(document.uiCommit).toBe(ui)
    expect(document.products).toHaveLength(4)
    expect(document.deployment).toMatchObject({
      decision: 'ONLINE_ACCEPTED',
      transactionStatus: 'PASS',
    })
    expect(document.deployment.acceptanceSha256).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    )
    expect(
      document.deployment.products.every(p => p.status === 'ONLINE_PASS'),
    ).toBe(true)
    expect(JSON.parse(fs.readFileSync(result.pairFile!, 'utf8'))).toEqual({
      coreCommit: core,
      uiCommit: ui,
    })
  })

  it('rejects local, non-accepted and failed transactions', () => {
    const local = fixture({ mode: 'local' })
    expect(
      assembleRcEvidence({ ...local, outDir: local.root }).errors,
    ).toContain('RC evidence requires an online deployment acceptance')
    const rejected = fixture({ decision: 'NOT_ACCEPTED' })
    expect(
      assembleRcEvidence({ ...rejected, outDir: rejected.root }).errors,
    ).toContain('deployment acceptance is not ONLINE_ACCEPTED')
    const failed = fixture({ transactionStatus: 'ROLLED_BACK' })
    expect(
      assembleRcEvidence({ ...failed, outDir: failed.root }).errors,
    ).toContain('deployment transaction is not PASS')
  })

  it('rejects a product whose image digest does not match the transaction', () => {
    const input = fixture({ imageDigest: digest('other') })
    expect(
      assembleRcEvidence({ ...input, outDir: input.root }).errors,
    ).toContain('admin image digest does not match the transaction')
  })

  it('binds the evidence to the trusted Stage 2 run and rejects stale data', () => {
    const input = fixture()
    const valid = assembleRcEvidence({
      ...input,
      sourceFile: input.sourceFile,
      expectedRunId: '12345',
      outDir: input.root,
    })
    expect(valid.errors).toEqual([])

    const wrongRun = assembleRcEvidence({
      ...input,
      sourceFile: input.sourceFile,
      expectedRunId: '99999',
      outDir: input.root,
    })
    expect(wrongRun.errors).toContain(
      'deployment evidence source run id does not match',
    )

    const stale = fixture()
    const staleAcceptance = JSON.parse(
      fs.readFileSync(stale.acceptanceFile, 'utf8'),
    ) as Record<string, unknown>
    staleAcceptance.checkedAt = '2020-01-01T00:00:00.000Z'
    fs.writeFileSync(stale.acceptanceFile, JSON.stringify(staleAcceptance))
    expect(
      assembleRcEvidence({
        ...stale,
        sourceFile: stale.sourceFile,
        expectedRunId: '12345',
        outDir: stale.root,
      }).errors,
    ).toContain('deployment acceptance evidence is stale')
  })

  it('merges a signed base approval and rejects stale approval commits', () => {
    const input = fixture()
    const base = {
      crossPlatform: {
        platforms: ['linux', 'win32'],
        report: 'artifact://rc/cross-platform',
        commit: core,
      },
      releaseApproval: { approver: 'release-owner', commit: core },
    }
    fs.writeFileSync(path.join(input.root, 'base.json'), JSON.stringify(base))
    const result = assembleRcEvidence({
      ...input,
      baseFile: path.join(input.root, 'base.json'),
      outDir: input.root,
    })
    expect(result.errors).toEqual([])
    expect(
      (result.document as { releaseApproval: { approver: string } })
        .releaseApproval.approver,
    ).toBe('release-owner')

    fs.writeFileSync(
      path.join(input.root, 'base.json'),
      JSON.stringify({
        ...base,
        releaseApproval: { approver: 'release-owner', commit: 'old' },
      }),
    )
    expect(
      assembleRcEvidence({
        ...input,
        baseFile: path.join(input.root, 'base.json'),
        outDir: input.root,
      }).errors,
    ).toContain('releaseApproval.commit does not match the source')
  })
})
