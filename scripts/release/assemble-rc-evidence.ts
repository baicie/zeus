/**
 * Assembles the RC evidence document from a real Stage 2 online deployment,
 * a cross-platform test evidence artifact and a structured, attestation-backed
 * release approval.
 *
 * Nothing in this document is hand-written: the four product URLs are copied
 * from the deployment-acceptance report, the cross-platform section is the
 * verified CI artifact, and the approval section is the protected RC Approval
 * workflow document re-validated against GitHub run metadata.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  RC_APPROVAL_SCHEMA,
  CROSS_PLATFORM_SCHEMA,
  crossPlatformDigest,
  isRecord,
  validateCrossPlatformEvidence,
  validateRcApproval,
  type AttestationVerification,
  type RcApprovalDocument,
  type TrustedApprovalArtifact,
  type TrustedApprovalRun,
} from './rc-approval'

export const RC_EVIDENCE_SCHEMA = 'zeus.rc-evidence/v4'

const PRODUCTS = ['webc-studio', 'native-lab', 'admin', 'ai-workbench'] as const
const PRODUCT_IMAGE: Record<string, string> = {
  'webc-studio': 'playground',
  'native-lab': 'playground',
  admin: 'admin',
  'ai-workbench': 'workbench',
}
const SHA256 = /^sha256:[0-9a-f]{64}$/i

export interface AssembleRcEvidenceInput {
  readonly acceptanceFile: string
  readonly transactionFile: string
  readonly provenanceFile: string
  readonly pairFile: string
  readonly approvalFile: string
  readonly crossPlatformFile: string
  readonly trustFile: string
  readonly version: string
  readonly authorizedApprovers: readonly string[]
  readonly sourceFile?: string
  readonly expectedRunId?: string
  readonly maxAgeHours?: number
  readonly outDir: string
  readonly checkedAt?: string
  readonly now?: number
}

export interface AssembleRcEvidenceResult {
  readonly document?: Record<string, unknown>
  readonly errors: readonly string[]
  readonly evidenceFile?: string
  readonly pairFile?: string
}

export function assembleRcEvidence(
  input: AssembleRcEvidenceInput,
): AssembleRcEvidenceResult {
  const errors: string[] = []
  const acceptance = readJson(
    input.acceptanceFile,
    'deployment acceptance',
    errors,
  )
  const transaction = readJson(
    input.transactionFile,
    'deployment transaction',
    errors,
  )
  const provenance = readJson(input.provenanceFile, 'provenance', errors)
  const pair = readJson(input.pairFile, 'release pair', errors)
  const approval = readJson(input.approvalFile, 'release approval', errors)
  const crossPlatform = readJson(
    input.crossPlatformFile,
    'cross-platform evidence',
    errors,
  )
  const trust = readJson(input.trustFile, 'approval trust metadata', errors)
  const source = input.sourceFile
    ? readJson(input.sourceFile, 'deployment evidence source', errors)
    : undefined
  if (errors.length > 0) return { errors }

  const core = stringValue(acceptance.coreCommit)
  const ui = stringValue(acceptance.uiCommit)
  if (!/^[0-9a-f]{40}$/i.test(core))
    errors.push('acceptance coreCommit is invalid')
  if (!/^[0-9a-f]{40}$/i.test(ui)) errors.push('acceptance uiCommit is invalid')
  if (acceptance.schema !== 'zeus.deployment-acceptance/v1') {
    errors.push('acceptance schema is not zeus.deployment-acceptance/v1')
  }
  if (acceptance.mode !== 'online') {
    errors.push('RC evidence requires an online deployment acceptance')
  }
  if (acceptance.decision !== 'ONLINE_ACCEPTED') {
    errors.push('deployment acceptance is not ONLINE_ACCEPTED')
  }
  if (transaction.schema !== 'zeus.deployment-transaction/v1') {
    errors.push('transaction schema is not zeus.deployment-transaction/v1')
  }
  if (transaction.status !== 'PASS') {
    errors.push('deployment transaction is not PASS')
  }
  if (transaction.coreCommit !== core || transaction.uiCommit !== ui) {
    errors.push('transaction commits do not match the acceptance')
  }
  if (provenance.schema !== 'zeus.provenance/v1') {
    errors.push('provenance schema is not zeus.provenance/v1')
  }
  if (provenance.coreCommit !== core || provenance.uiCommit !== ui) {
    errors.push('provenance commits do not match the acceptance')
  }
  if (pair.coreCommit !== core || pair.uiCommit !== ui) {
    errors.push('release pair does not match the acceptance commits')
  }
  if (approval.version !== input.version) {
    errors.push('release approval version does not match the release version')
  }
  if (input.sourceFile) {
    if (source?.schema !== 'zeus.deployment-evidence-source/v1') {
      errors.push('deployment evidence source schema is invalid')
    }
    if (source?.repository !== 'baicie/zeus') {
      errors.push('deployment evidence source repository is not baicie/zeus')
    }
    if (source?.workflow !== 'Host Deployment Stage 2') {
      errors.push('deployment evidence source workflow is not Stage 2')
    }
    if (source?.coreCommit !== core || source?.uiCommit !== ui) {
      errors.push('deployment evidence source commits do not match')
    }
    if (source?.environment !== 'production') {
      errors.push(
        'deployment evidence source is not the production environment',
      )
    }
    if (source?.mode !== 'production') {
      errors.push('deployment evidence source is not a production deployment')
    }
    if (
      input.expectedRunId &&
      String(source?.runId ?? '') !== input.expectedRunId
    ) {
      errors.push('deployment evidence source run id does not match')
    }
  } else if (input.expectedRunId) {
    errors.push('deployment evidence source is required for a run id')
  }
  const checkedAt = Date.parse(stringValue(acceptance.checkedAt))
  const maxAgeHours = input.maxAgeHours ?? 168
  if (!Number.isFinite(checkedAt)) {
    errors.push('acceptance checkedAt is missing or invalid')
  } else if (
    (input.now ?? Date.now()) - checkedAt >
    maxAgeHours * 60 * 60 * 1000
  ) {
    errors.push('deployment acceptance evidence is stale')
  }

  const products = Array.isArray(acceptance.products) ? acceptance.products : []
  const byProduct = new Map<string, Record<string, unknown>>()
  for (const entry of products) {
    if (!isRecord(entry)) continue
    if (typeof entry.product === 'string') {
      byProduct.set(entry.product, entry)
    }
  }
  const transactionImages = isRecord(transaction.images)
    ? (transaction.images as Record<string, unknown>)
    : {}
  const provenanceProducts = Array.isArray(provenance.products)
    ? provenance.products
    : []

  const evidenceProducts: Array<Record<string, unknown>> = []
  const deploymentProducts: Array<Record<string, unknown>> = []
  for (const product of PRODUCTS) {
    const entry = byProduct.get(product)
    if (!entry) {
      errors.push(`acceptance is missing ${product}`)
      continue
    }
    const commit = product === 'ai-workbench' ? ui : core
    if (entry.status !== 'ONLINE_PASS') {
      errors.push(`${product} is not ONLINE_PASS`)
    }
    if (entry.commit !== commit) {
      errors.push(`${product} commit does not match the source`)
    }
    const url = stringValue(entry.url)
    if (!isHttpsUrl(url)) {
      errors.push(`${product} URL is not HTTPS`)
    }
    const artifactDigest = stringValue(entry.artifactDigest)
    const imageDigest = stringValue(entry.imageDigest)
    if (!SHA256.test(artifactDigest)) {
      errors.push(`${product} artifactDigest is invalid`)
    }
    if (!SHA256.test(imageDigest)) {
      errors.push(`${product} imageDigest is invalid`)
    }
    const imageKey = PRODUCT_IMAGE[product]!
    const image = isRecord(transactionImages[imageKey])
      ? (transactionImages[imageKey] as Record<string, unknown>)
      : undefined
    if (!image || image.imageDigest !== imageDigest) {
      errors.push(`${product} image digest does not match the transaction`)
    }
    const provenanceProduct = provenanceProducts.find(
      entry =>
        isRecord(entry) &&
        entry.product === product &&
        entry.artifactDigest === artifactDigest,
    )
    if (!provenanceProduct) {
      errors.push(`${product} is not bound to the provenance`)
    }
    evidenceProducts.push({
      product,
      url,
      commit,
      artifactDigest,
      imageDigest,
    })
    deploymentProducts.push({
      product,
      status: 'ONLINE_PASS',
      artifactDigest,
      imageDigest,
    })
  }

  const crossPlatformResult = validateCrossPlatformEvidence(crossPlatform, {
    commit: core,
    ...(input.now !== undefined ? { now: input.now } : {}),
  })
  errors.push(...crossPlatformResult.errors)
  const crossPlatformDigestValue =
    crossPlatformResult.digest ?? crossPlatformDigest(crossPlatform)

  if (crossPlatform.schema !== CROSS_PLATFORM_SCHEMA) {
    errors.push(`cross-platform schema must be ${CROSS_PLATFORM_SCHEMA}`)
  }

  const run = readApprovalRun(trust, errors)
  const attestationValue = readAttestation(trust, errors)
  const payloadDigest =
    typeof trust.payloadDigest === 'string' ? trust.payloadDigest : undefined

  const approvalResult = validateRcApproval(approval, {
    coreCommit: core,
    uiCommit: ui,
    version: input.version,
    evidenceDigest: crossPlatformDigestValue,
    payloadDigest,
    run,
    attestation: attestationValue,
    authorizedApprovers: input.authorizedApprovers,
    ...(input.now !== undefined ? { now: input.now } : {}),
  })
  errors.push(...approvalResult.errors)
  if (approval.schema !== RC_APPROVAL_SCHEMA) {
    errors.push(`release approval schema must be ${RC_APPROVAL_SCHEMA}`)
  }

  if (errors.length > 0) return { errors }

  const document = {
    schema: RC_EVIDENCE_SCHEMA,
    commit: core,
    uiCommit: ui,
    version: input.version,
    products: evidenceProducts,
    deployment: {
      decision: 'ONLINE_ACCEPTED',
      transactionStatus: 'PASS',
      coreCommit: core,
      uiCommit: ui,
      acceptanceSha256: sha256File(input.acceptanceFile),
      transactionSha256: sha256File(input.transactionFile),
      provenanceSha256: sha256File(input.provenanceFile),
      products: deploymentProducts,
    },
    crossPlatform,
    releaseApproval: approval,
    approvalRun: run,
    approvalAttestation: attestationValue,
    approvalPolicy: {
      authorizedApprovers: [...input.authorizedApprovers],
    },
  }
  fs.mkdirSync(input.outDir, { recursive: true })
  const evidenceFile = path.join(input.outDir, 'rc-evidence.json')
  const pairFile = path.join(input.outDir, 'pair.json')
  fs.writeFileSync(evidenceFile, `${JSON.stringify(document, null, 2)}\n`, {
    mode: 0o644,
  })
  fs.writeFileSync(
    pairFile,
    `${JSON.stringify({ coreCommit: core, uiCommit: ui }, null, 2)}\n`,
    { mode: 0o644 },
  )
  return { document, errors: [], evidenceFile, pairFile }
}

function readApprovalRun(
  value: Record<string, unknown>,
  errors: string[],
): TrustedApprovalRun | undefined {
  if (!isRecord(value.run)) {
    errors.push('approval trust metadata must contain a run object')
    return undefined
  }
  const run = value.run
  const artifact = readArtifact(run.artifact)
  const payloadArtifact = readArtifact(run.payloadArtifact)
  return {
    repository: stringValue(run.repository),
    runId: stringValue(run.runId),
    runAttempt: stringValue(run.runAttempt),
    workflowId: stringValue(run.workflowId),
    workflowPath: stringValue(run.workflowPath),
    workflowName: stringValue(run.workflowName),
    event: stringValue(run.event),
    status: stringValue(run.status),
    conclusion: stringValue(run.conclusion),
    headSha: stringValue(run.headSha),
    actor: stringValue(run.actor),
    environment: stringValue(run.environment),
    artifact,
    payloadArtifact,
  }
}

function readArtifact(value: unknown): TrustedApprovalArtifact | undefined {
  if (!isRecord(value)) return undefined
  return {
    id: stringValue(value.id),
    name: stringValue(value.name),
    digest: stringValue(value.digest),
    expired: value.expired === true,
  }
}

function readAttestation(
  value: Record<string, unknown>,
  errors: string[],
): AttestationVerification | undefined {
  if (!isRecord(value.attestation)) {
    errors.push('approval trust metadata must contain an attestation object')
    return undefined
  }
  const attestation = value.attestation
  const errorList = Array.isArray(attestation.errors)
    ? attestation.errors.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  return {
    verified: attestation.verified === true,
    ...(typeof attestation.signerWorkflow === 'string'
      ? { signerWorkflow: attestation.signerWorkflow }
      : {}),
    ...(typeof attestation.sourceDigest === 'string'
      ? { sourceDigest: attestation.sourceDigest }
      : {}),
    errors: errorList,
  }
}

function readJson(
  file: string,
  label: string,
  errors: string[],
): Record<string, unknown> {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (!isRecord(value)) {
      errors.push(`${label} must be a JSON object`)
      return {}
    }
    return value
  } catch (error) {
    errors.push(
      `${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    )
    return {}
  }
}

function sha256File(file: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.username.length === 0 &&
      url.password.length === 0
    )
  } catch {
    return false
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function main(): void {
  const { values } = parseArgs({
    options: {
      acceptance: { type: 'string' },
      transaction: { type: 'string' },
      provenance: { type: 'string' },
      pair: { type: 'string' },
      approval: { type: 'string' },
      'cross-platform': { type: 'string' },
      trust: { type: 'string' },
      version: { type: 'string' },
      approvers: { type: 'string' },
      source: { type: 'string' },
      'run-id': { type: 'string' },
      'max-age-hours': { type: 'string' },
      out: { type: 'string', default: 'temp/release' },
    },
  })
  for (const key of [
    'acceptance',
    'transaction',
    'provenance',
    'pair',
    'approval',
    'cross-platform',
    'trust',
    'version',
    'approvers',
  ] as const) {
    if (!values[key]) throw new Error(`--${key} is required`)
  }
  const approvers = values
    .approvers!.split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
  const result = assembleRcEvidence({
    acceptanceFile: path.resolve(values.acceptance!),
    transactionFile: path.resolve(values.transaction!),
    provenanceFile: path.resolve(values.provenance!),
    pairFile: path.resolve(values.pair!),
    approvalFile: path.resolve(values.approval!),
    crossPlatformFile: path.resolve(values['cross-platform']!),
    trustFile: path.resolve(values.trust!),
    version: values.version!,
    authorizedApprovers: approvers,
    ...(values.source ? { sourceFile: path.resolve(values.source) } : {}),
    ...(values['run-id'] ? { expectedRunId: values['run-id'] } : {}),
    ...(values['max-age-hours']
      ? { maxAgeHours: Number(values['max-age-hours']) }
      : {}),
    outDir: path.resolve(values.out ?? 'temp/release'),
  })
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`BLOCKER ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`RC_EVIDENCE_WRITTEN: ${result.evidenceFile}`)
  console.log(`RC_PAIR_WRITTEN: ${result.pairFile}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

export type { RcApprovalDocument }
