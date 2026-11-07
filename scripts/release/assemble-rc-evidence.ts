/**
 * Assembles the RC evidence document from a real Stage 2 online deployment
 * and a signed approval artifact. The four product URLs are copied from the
 * deployment-acceptance report (which checked TLS, DNS, build-info, browser
 * behavior and cryptographic file hashes); they are never hand-written here.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const RC_EVIDENCE_SCHEMA = 'zeus.rc-evidence/v3'
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
  readonly baseFile?: string
  readonly outDir: string
  readonly checkedAt?: string
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

  const base = input.baseFile
    ? readJson(input.baseFile, 'approval base evidence', errors)
    : undefined
  const crossPlatform = isRecord(base?.crossPlatform)
    ? base.crossPlatform
    : {
        platforms: [],
        report: 'NOT_RUN',
        commit: core,
      }
  const releaseApproval = isRecord(base?.releaseApproval)
    ? base.releaseApproval
    : { approver: 'NOT_RUN', commit: core }
  if (crossPlatform.commit !== core) {
    errors.push('crossPlatform.commit does not match the source')
  }
  if (releaseApproval.commit !== core) {
    errors.push('releaseApproval.commit does not match the source')
  }

  if (errors.length > 0) return { errors }

  const document = {
    schema: RC_EVIDENCE_SCHEMA,
    commit: core,
    uiCommit: ui,
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
    releaseApproval,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function main(): void {
  const { values } = parseArgs({
    options: {
      acceptance: { type: 'string' },
      transaction: { type: 'string' },
      provenance: { type: 'string' },
      pair: { type: 'string' },
      base: { type: 'string' },
      out: { type: 'string', default: 'temp/release' },
    },
  })
  for (const key of [
    'acceptance',
    'transaction',
    'provenance',
    'pair',
  ] as const) {
    if (!values[key]) throw new Error(`--${key} is required`)
  }
  const result = assembleRcEvidence({
    acceptanceFile: path.resolve(values.acceptance!),
    transactionFile: path.resolve(values.transaction!),
    provenanceFile: path.resolve(values.provenance!),
    pairFile: path.resolve(values.pair!),
    ...(values.base ? { baseFile: path.resolve(values.base) } : {}),
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
