/**
 * Host-deployment Stage 2. It is dependency-free at validation time (the
 * workflow runs `pnpm install --ignore-scripts` only after the source guard)
 * and never interpolates workflow inputs into shell text. Paths, tenant ids,
 * digests and release ancestry are validated before any Docker operation.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { verifyProvenance } from './build-info'
import {
  PRODUCT_IMAGES,
  REQUIRED_IMAGES,
  readLayout,
  resolveTrustedDeploymentFile,
  validateLayout,
  verifyLayoutDigest,
} from './deployment-layout'
import {
  assertCredentialSeparation,
  readProductionSecrets,
  runDeploymentTransaction,
  type FailureInjection,
  type TransactionImage,
} from './deployment-transaction'

export { REQUIRED_IMAGES } from './deployment-layout'

export const TENANT_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/
const SHA_PATTERN = /^[0-9a-f]{40}$/i
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/i
const SAFE_FILE = /^[A-Za-z0-9._-]+$/
const SAFE_PROJECT = /^[a-z0-9][a-z0-9_.-]{1,62}$/
const FAILURE_INJECTIONS: readonly FailureInjection[] = [
  'none',
  'before-up',
  'after-up',
  'after-health',
  'after-acceptance',
  'after-backup',
]

export interface Stage2Input {
  readonly artifactDir: string
  readonly manifestName: string
  readonly provenanceName: string
  readonly candidateName: string
  readonly tenant: string
  readonly expectedCore: string
  readonly expectedUi: string
  readonly manifestSha256: string
  readonly provenanceSha256: string
  readonly candidateSha256: string
  readonly prepareRunJson: string
  readonly prepareArtifactsJson: string
  readonly prepareArtifactSha256: string
  readonly pairName: string
  readonly enabled: string
  readonly ingressVerified: string
  /** Dedicated acceptance account; never the production administrator. */
  readonly adminEmail: string
  readonly adminPassword: string
  readonly simulate: boolean
  readonly localIntegration?: boolean
  readonly composeFile: string
  readonly layoutFile: string
  readonly layoutSha256: string
  readonly productionEnvFile: string
  readonly stateDir: string
  readonly projectName: string
  readonly environment: string
  readonly failureInjection: string
  readonly browsers: string
  readonly keepLocal: boolean
  readonly localPorts: string
}

export function validateTenant(value: string): string {
  if (!TENANT_PATTERN.test(value)) {
    throw new Error(
      'tenant must be 3-32 lowercase letters, digits or hyphens, starting and ending alphanumeric',
    )
  }
  return value
}

export function resolveArtifactFile(root: string, name: string): string {
  const segments = name.split('/')
  if (
    segments.length === 0 ||
    segments.some(
      segment =>
        !SAFE_FILE.test(segment) || segment === '.' || segment === '..',
    ) ||
    path.isAbsolute(name)
  ) {
    throw new Error('artifact path must be a safe relative path')
  }
  const absoluteRoot = fs.realpathSync(root)
  const candidate = path.resolve(absoluteRoot, ...segments)
  if (!candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error('artifact file escapes the approved artifact directory')
  }
  const stat = fs.lstatSync(candidate)
  if (stat.isSymbolicLink()) {
    throw new Error('artifact file must not be a symlink')
  }
  const real = fs.realpathSync(candidate)
  if (real !== candidate || !real.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error('artifact file resolves outside the approved directory')
  }
  if (!stat.isFile()) throw new Error('artifact path must be a regular file')
  return candidate
}

export function validateReleaseIdentity(input: {
  readonly head: string
  readonly main: string
  readonly expectedCore: string
  readonly expectedUi: string
  readonly manifestCore: string
  readonly manifestUi: string
}): string[] {
  const errors: string[] = []
  if (!SHA_PATTERN.test(input.expectedCore)) {
    errors.push('expected Core SHA must be a full commit')
  }
  if (!SHA_PATTERN.test(input.expectedUi)) {
    errors.push('expected UI SHA must be a full commit')
  }
  if (input.head !== input.expectedCore) {
    errors.push('checked-out HEAD does not match the expected Core SHA')
  }
  if (input.manifestCore !== input.expectedCore) {
    errors.push('manifest Core commit does not match the expected Core SHA')
  }
  if (input.manifestUi !== input.expectedUi) {
    errors.push('manifest UI commit does not match the expected UI SHA')
  }
  if (!isAncestor(input.head, input.main)) {
    errors.push('deployment commit is not an ancestor of main')
  }
  return errors
}

export function verifyFileSha256(file: string, expected: string): void {
  if (!DIGEST_PATTERN.test(expected)) {
    throw new Error('expected artifact digest must be sha256:<64 hex>')
  }
  const actual = `sha256:${createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')}`
  if (actual !== expected) {
    throw new Error(`artifact digest mismatch for ${path.basename(file)}`)
  }
}

export function validateStage2Input(input: Stage2Input): string[] {
  const errors: string[] = []
  if (input.enabled !== 'true') errors.push('deployment gate is not enabled')
  if (
    !input.simulate &&
    !input.localIntegration &&
    input.ingressVerified !== 'true'
  ) {
    errors.push('TLS ingress has not been verified')
  }
  try {
    validateTenant(input.tenant)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  for (const [label, value] of [
    ['Core SHA', input.expectedCore],
    ['UI SHA', input.expectedUi],
    ['manifest digest', input.manifestSha256],
    ['provenance digest', input.provenanceSha256],
    ['candidate digest', input.candidateSha256],
  ] as const) {
    if (!SHA_PATTERN.test(value) && !DIGEST_PATTERN.test(value)) {
      errors.push(`${label} has an invalid format`)
    }
  }
  if (!input.localIntegration && (!input.adminEmail || !input.adminPassword)) {
    errors.push('acceptance credentials are missing')
  }
  if (input.simulate) return errors
  if (!input.composeFile) {
    errors.push('a trusted Compose file is required')
  }
  if (!input.stateDir || !path.isAbsolute(input.stateDir)) {
    errors.push('deployment state directory must be absolute')
  }
  if (!SAFE_PROJECT.test(input.projectName)) {
    errors.push('deployment project name is invalid')
  }
  if (
    !FAILURE_INJECTIONS.includes(input.failureInjection as FailureInjection)
  ) {
    errors.push('failure injection mode is invalid')
  }
  if (!input.localIntegration && input.failureInjection !== 'none') {
    errors.push(
      'failure injection is only allowed for local integration drills',
    )
  }
  if (input.localIntegration) {
    const ports = input.localPorts
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isInteger(value) && value > 0 && value < 65536)
    if (ports.length !== 4) {
      errors.push('local integration requires four distinct TCP ports')
    }
    if (new Set(ports).size !== ports.length) {
      errors.push('local integration ports must be distinct')
    }
    return errors
  }
  if (!input.layoutFile)
    errors.push('an approved deployment layout is required')
  if (!input.layoutSha256) {
    errors.push('the deployment layout digest is required')
  } else if (!DIGEST_PATTERN.test(input.layoutSha256)) {
    errors.push('the deployment layout digest is invalid')
  }
  if (!input.productionEnvFile) {
    errors.push('the production secrets file is required')
  }
  if (!input.environment) {
    errors.push('the deployment environment is required')
  }
  return errors
}

export function readJson(file: string): Record<string, unknown> {
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path.basename(file)} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

export function validateCandidateIdentity(
  manifest: Record<string, unknown>,
  provenance: Record<string, unknown>,
  candidate: Record<string, unknown>,
  input: Stage2Input,
): string[] {
  const errors: string[] = []
  if (candidate.coreCommit !== manifest.coreCommit) {
    errors.push('candidate Core commit does not match the manifest')
  }
  if (candidate.uiCommit !== manifest.uiCommit) {
    errors.push('candidate UI commit does not match the manifest')
  }
  if (candidate.coreCommit !== input.expectedCore) {
    errors.push('candidate Core commit does not match the expected SHA')
  }
  if (candidate.uiCommit !== input.expectedUi) {
    errors.push('candidate UI commit does not match the expected UI SHA')
  }
  if (provenance.coreCommit !== manifest.coreCommit) {
    errors.push('provenance Core commit does not match the manifest')
  }
  if (provenance.uiCommit !== manifest.uiCommit) {
    errors.push('provenance UI commit does not match the manifest')
  }
  const images =
    typeof candidate.images === 'object' && candidate.images !== null
      ? (candidate.images as Record<string, unknown>)
      : {}
  const keys = Object.keys(images).sort()
  if (keys.length !== REQUIRED_IMAGES.length) {
    errors.push(
      `candidate must contain exactly ${REQUIRED_IMAGES.length} images`,
    )
  }
  for (const key of REQUIRED_IMAGES) {
    if (!keys.includes(key)) errors.push(`candidate is missing image ${key}`)
  }
  for (const key of keys) {
    if (!REQUIRED_IMAGES.includes(key as (typeof REQUIRED_IMAGES)[number])) {
      errors.push(`candidate contains unexpected image ${key}`)
    }
  }
  const products = Array.isArray(manifest.products) ? manifest.products : []
  const seen = new Set<string>()
  for (const product of products) {
    if (typeof product !== 'object' || product === null) {
      errors.push('manifest product must be an object')
      continue
    }
    const entry = product as Record<string, unknown>
    const name = String(entry.product)
    if (seen.has(name)) errors.push(`manifest product ${name} is duplicated`)
    seen.add(name)
    const imageKey = PRODUCT_IMAGES[name]
    if (!imageKey) {
      errors.push(`unexpected manifest product ${name}`)
      continue
    }
    const image = images[imageKey]
    if (typeof image !== 'object' || image === null) {
      errors.push(`manifest product ${name} has no candidate image`)
      continue
    }
    const candidateImage = image as Record<string, unknown>
    if (entry.artifactDigest !== candidateImage.artifactDigest) {
      errors.push(`product ${name} artifact digest does not match ${imageKey}`)
    }
    if (entry.imageDigest !== candidateImage.imageDigest) {
      errors.push(`product ${name} image digest does not match ${imageKey}`)
    }
    const buildInfo = candidateImage.buildInfo
    if (typeof buildInfo !== 'object' || buildInfo === null) {
      errors.push(`candidate image ${imageKey} is missing buildInfo`)
    } else {
      const info = buildInfo as Record<string, unknown>
      if (info.artifactDigest !== candidateImage.artifactDigest) {
        errors.push(`candidate image ${imageKey} buildInfo digest mismatch`)
      }
      if (info.coreCommit !== input.expectedCore) {
        errors.push(`candidate image ${imageKey} buildInfo Core mismatch`)
      }
      if (info.uiCommit !== input.expectedUi) {
        errors.push(`candidate image ${imageKey} buildInfo UI mismatch`)
      }
    }
    if (!DIGEST_PATTERN.test(String(candidateImage.imageDigest))) {
      errors.push(`candidate image ${imageKey} has an invalid image digest`)
    }
    if (!DIGEST_PATTERN.test(String(candidateImage.ociSha256))) {
      errors.push(`candidate image ${imageKey} has an invalid archive digest`)
    }
    if (
      typeof candidateImage.image !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_./:@-]{0,200}$/.test(candidateImage.image)
    ) {
      errors.push(`candidate image ${imageKey} has an unsafe image reference`)
    }
    if (
      typeof candidateImage.ociArchive !== 'string' ||
      candidateImage.ociArchive.length === 0 ||
      candidateImage.ociArchive.includes('\n')
    ) {
      errors.push(`candidate image ${imageKey} has an unsafe archive path`)
    }
  }
  for (const name of Object.keys(PRODUCT_IMAGES)) {
    if (!seen.has(name)) errors.push(`manifest is missing product ${name}`)
  }
  // The AI Host is not a user-facing manifest product, but it is deployed and
  // must still be bound to the same Core/UI sources.
  const aiHost = images.aiHost as Record<string, unknown> | undefined
  if (
    !aiHost ||
    typeof aiHost.buildInfo !== 'object' ||
    aiHost.buildInfo === null
  ) {
    errors.push('candidate image aiHost is missing buildInfo')
  } else {
    const info = aiHost.buildInfo as Record<string, unknown>
    if (info.artifactDigest !== aiHost.artifactDigest) {
      errors.push('candidate image aiHost buildInfo digest mismatch')
    }
    if (info.coreCommit !== input.expectedCore) {
      errors.push('candidate image aiHost buildInfo Core mismatch')
    }
    if (info.uiCommit !== input.expectedUi) {
      errors.push('candidate image aiHost buildInfo UI mismatch')
    }
  }
  return errors
}

export function verifyStage2Artifacts(input: {
  readonly artifactDir: string
  readonly input: Stage2Input
}): {
  manifest: Record<string, unknown>
  provenance: Record<string, unknown>
  candidate: Record<string, unknown>
  files: Record<string, string>
} {
  const manifestFile = resolveArtifactFile(
    input.artifactDir,
    input.input.manifestName,
  )
  const provenanceFile = resolveArtifactFile(
    input.artifactDir,
    input.input.provenanceName,
  )
  const candidateFile = resolveArtifactFile(
    input.artifactDir,
    input.input.candidateName,
  )
  verifyFileSha256(manifestFile, input.input.manifestSha256)
  verifyFileSha256(provenanceFile, input.input.provenanceSha256)
  verifyFileSha256(candidateFile, input.input.candidateSha256)
  const manifest = readJson(manifestFile)
  const provenance = readJson(provenanceFile)
  const candidate = readJson(candidateFile)
  const pair = readJson(
    resolveArtifactFile(input.artifactDir, input.input.pairName),
  )
  if (pair.coreCommit !== input.input.expectedCore) {
    throw new Error('pair Core commit does not match the approved SHA')
  }
  if (pair.uiCommit !== input.input.expectedUi) {
    throw new Error('pair UI commit does not match the approved SHA')
  }
  if (manifest.schema !== 'zeus.deployment-manifest/v2') {
    throw new Error('manifest schema is not zeus.deployment-manifest/v2')
  }
  if (provenance.schema !== 'zeus.provenance/v1') {
    throw new Error('provenance schema is not zeus.provenance/v1')
  }
  if (candidate.schema !== 'zeus.deployment-candidate/v1') {
    throw new Error('candidate schema is not zeus.deployment-candidate/v1')
  }
  const products = Array.isArray(manifest.products) ? manifest.products : []
  const provenanceResult = verifyProvenance(provenance, {
    coreCommit: String(manifest.coreCommit),
    uiCommit: String(manifest.uiCommit),
    products: products.map(product => ({
      product: String((product as Record<string, unknown>).product),
      artifactDigest: String(
        (product as Record<string, unknown>).artifactDigest,
      ),
      ...(typeof (product as Record<string, unknown>).imageDigest === 'string'
        ? {
            imageDigest: String(
              (product as Record<string, unknown>).imageDigest,
            ),
          }
        : {}),
    })),
  })
  if (provenanceResult.errors.length > 0) {
    throw new Error(provenanceResult.errors.join('; '))
  }
  const identityErrors = validateCandidateIdentity(
    manifest,
    provenance,
    candidate,
    input.input,
  )
  if (identityErrors.length > 0) throw new Error(identityErrors.join('; '))
  const candidateImages = candidate.images as Record<
    string,
    Record<string, unknown>
  >
  const files: Record<string, string> = {}
  for (const key of REQUIRED_IMAGES) {
    const image = candidateImages[key]!
    const archive = resolveArtifactFile(
      input.artifactDir,
      String(image.ociArchive),
    )
    verifyFileSha256(archive, String(image.ociSha256))
    files[key] = archive
  }
  return { manifest, provenance, candidate, files }
}

export function verifyPrepareRunMetadata(
  run: Record<string, unknown>,
  artifacts: Record<string, unknown>,
  expected: {
    readonly core: string
    readonly ui: string
    readonly artifactSha256: string
  },
): string[] {
  const errors: string[] = []
  const repository = run.repository as Record<string, unknown> | undefined
  if (repository?.full_name !== 'baicie/zeus') {
    errors.push('prepare run does not belong to baicie/zeus')
  }
  if (run.path !== '.github/workflows/host-deployment-prepare.yml') {
    errors.push('prepare run is not the Host Deployment Prepare workflow')
  }
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    errors.push('prepare run is not a successful completed run')
  }
  if (run.head_sha !== expected.core) {
    errors.push('prepare run head SHA does not match the approved Core SHA')
  }
  const list = Array.isArray(artifacts.artifacts) ? artifacts.artifacts : []
  const bundle = list.find(
    entry =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>).name === 'host-deployment-stage1',
  ) as Record<string, unknown> | undefined
  if (!bundle) {
    errors.push('prepare run has no host-deployment-stage1 artifact')
  } else {
    if (bundle.expired === true) errors.push('prepare artifact is expired')
    if (bundle.digest !== expected.artifactSha256) {
      errors.push('prepare artifact digest does not match the approved digest')
    }
  }
  return errors
}

export async function runStage2(
  input: Stage2Input,
  options: { readonly simulate: boolean },
): Promise<void> {
  const errors = validateStage2Input(input)
  if (errors.length > 0) throw new Error(errors.join('; '))
  const head = git(['rev-parse', 'HEAD'])
  const main = git(['rev-parse', 'origin/main'])
  const artifacts = verifyStage2Artifacts({
    artifactDir: input.artifactDir,
    input,
  })
  const composeFile = resolveTrustedDeploymentFile({
    root: process.cwd(),
    value: input.composeFile,
    artifactDir: input.artifactDir,
  })
  if (!input.localIntegration) {
    if (!input.layoutFile) {
      throw new Error('an approved deployment layout is required')
    }
    const layoutFile = resolveTrustedDeploymentFile({
      root: process.cwd(),
      value: input.layoutFile,
      artifactDir: input.artifactDir,
    })
    if (input.layoutSha256) verifyLayoutDigest(layoutFile, input.layoutSha256)
    const validated = validateLayout(readLayout(layoutFile), {
      mode: 'online',
      environment: input.environment,
      coreCommit: input.expectedCore,
      uiCommit: input.expectedUi,
    })
    if (!validated.layout) throw new Error(validated.errors.join('; '))
  }
  if (input.productionEnvFile) {
    fs.accessSync(input.productionEnvFile, fs.constants.R_OK)
    if (!input.localIntegration) {
      const secrets = readProductionSecrets(input.productionEnvFile)
      assertCredentialSeparation({
        adminEmail: secrets.ZEUS_ADMIN_EMAIL!,
        adminPassword: secrets.ZEUS_ADMIN_PASSWORD!,
        viewerPassword: secrets.ZEUS_ADMIN_VIEWER_PASSWORD!,
        acceptanceEmail: input.adminEmail,
        acceptancePassword: input.adminPassword,
      })
    }
  }
  if (!input.simulate && !input.localIntegration) {
    if (!input.prepareRunJson || !input.prepareArtifactsJson) {
      throw new Error('trusted prepare run metadata is required')
    }
    const run = readJson(
      resolveArtifactFile(input.artifactDir, input.prepareRunJson),
    )
    const runArtifacts = readJson(
      resolveArtifactFile(input.artifactDir, input.prepareArtifactsJson),
    )
    const prepareErrors = verifyPrepareRunMetadata(run, runArtifacts, {
      core: input.expectedCore,
      ui: input.expectedUi,
      artifactSha256: input.prepareArtifactSha256,
    })
    if (prepareErrors.length > 0) throw new Error(prepareErrors.join('; '))
  }
  const manifest = artifacts.manifest
  if (!input.localIntegration) {
    const releaseErrors = validateReleaseIdentity({
      head,
      main,
      expectedCore: input.expectedCore,
      expectedUi: input.expectedUi,
      manifestCore: String(manifest.coreCommit),
      manifestUi: String(manifest.uiCommit),
    })
    if (releaseErrors.length > 0) throw new Error(releaseErrors.join('; '))
  }
  if (options.simulate) {
    console.log('STAGE2_SIMULATED_OK')
    return
  }
  const candidateImages = (artifacts.candidate.images ?? {}) as Record<
    string,
    TransactionImage
  >
  const images = Object.fromEntries(
    Object.entries(candidateImages).map(([key, image]) => [
      key,
      {
        ...image,
        ociArchive: artifacts.files[key] ?? image.ociArchive,
      },
    ]),
  ) as Record<string, TransactionImage>
  await runDeploymentTransaction({
    mode: input.localIntegration ? 'local' : 'online',
    composeFile,
    ...(input.layoutFile ? { layoutFile: path.resolve(input.layoutFile) } : {}),
    layoutSha256: input.layoutSha256,
    expectedEnvironment: input.environment,
    ...(input.productionEnvFile
      ? { productionEnvFile: path.resolve(input.productionEnvFile) }
      : {}),
    acceptanceEmail: input.adminEmail,
    acceptancePassword: input.adminPassword,
    stateDir: path.resolve(input.stateDir),
    // A unique Compose project per transaction keeps `compose down` from
    // touching containers that were renamed for rollback in an earlier run.
    projectName: `${input.projectName}-${Date.now().toString(36)}`,
    tenant: input.tenant,
    coreCommit: input.expectedCore,
    uiCommit: input.expectedUi,
    artifactDir: fs.realpathSync(input.artifactDir),
    provenanceFile: resolveArtifactFile(
      input.artifactDir,
      input.provenanceName,
    ),
    images,
    browsers: input.browsers
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    keepLocal: input.keepLocal,
    failureInjection: input.failureInjection as FailureInjection,
    localPorts: input.localPorts
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isInteger(value)),
  })
}

function isAncestor(commit: string, main: string): boolean {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', commit, main],
    { encoding: 'utf8' },
  )
  return result.status === 0
}

function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function main(): void {
  const { values } = parseArgs({
    options: {
      simulate: { type: 'boolean', default: false },
      'local-integration': { type: 'boolean', default: false },
    },
  })
  const simulate =
    values.simulate === true || process.env.ZEUS_DEPLOY_SIMULATE === 'true'
  const input: Stage2Input = {
    artifactDir: process.env.ZEUS_DEPLOY_ARTIFACT_DIR ?? '',
    manifestName: process.env.ZEUS_DEPLOY_MANIFEST ?? '',
    provenanceName: process.env.ZEUS_DEPLOY_PROVENANCE ?? '',
    candidateName:
      process.env.ZEUS_DEPLOY_CANDIDATE ?? 'deployment-candidate.json',
    tenant: process.env.ZEUS_DEPLOY_TENANT ?? '',
    expectedCore: process.env.ZEUS_DEPLOY_EXPECTED_CORE ?? '',
    expectedUi: process.env.ZEUS_DEPLOY_EXPECTED_UI ?? '',
    manifestSha256: process.env.ZEUS_DEPLOY_MANIFEST_SHA256 ?? '',
    provenanceSha256: process.env.ZEUS_DEPLOY_PROVENANCE_SHA256 ?? '',
    candidateSha256: process.env.ZEUS_DEPLOY_CANDIDATE_SHA256 ?? '',
    prepareRunJson: process.env.ZEUS_DEPLOY_PREPARE_RUN_JSON ?? '',
    prepareArtifactsJson: process.env.ZEUS_DEPLOY_PREPARE_ARTIFACTS_JSON ?? '',
    prepareArtifactSha256:
      process.env.ZEUS_DEPLOY_PREPARE_ARTIFACT_SHA256 ?? '',
    pairName: process.env.ZEUS_DEPLOY_PAIR ?? 'pair.json',
    enabled: process.env.ZEUS_HOST_DEPLOY_ENABLED ?? '',
    ingressVerified: process.env.ZEUS_DEPLOY_INGRESS_VERIFIED ?? '',
    adminEmail: process.env.ZEUS_ACCEPTANCE_ADMIN_EMAIL ?? '',
    adminPassword: process.env.ZEUS_ACCEPTANCE_ADMIN_PASSWORD ?? '',
    simulate,
    localIntegration: values['local-integration'] === true,
    composeFile: process.env.ZEUS_DEPLOY_COMPOSE_FILE ?? '',
    layoutFile: process.env.ZEUS_DEPLOY_LAYOUT ?? '',
    layoutSha256: process.env.ZEUS_DEPLOY_LAYOUT_SHA256 ?? '',
    productionEnvFile: process.env.ZEUS_DEPLOY_PRODUCTION_ENV_FILE ?? '',
    stateDir:
      process.env.ZEUS_DEPLOY_STATE_DIR ??
      path.join(process.cwd(), 'temp/deploy/stage2-state'),
    projectName: process.env.ZEUS_DEPLOY_PROJECT ?? 'zeus-host-validation',
    environment: process.env.ZEUS_DEPLOY_ENVIRONMENT ?? 'production',
    failureInjection: process.env.ZEUS_DEPLOY_FAILURE_INJECTION ?? 'none',
    browsers: process.env.ZEUS_DEPLOY_BROWSERS ?? '',
    keepLocal: process.env.ZEUS_DEPLOY_KEEP_LOCAL === 'true',
    localPorts: process.env.ZEUS_DEPLOY_LOCAL_PORTS ?? '8080,8081,8082,8083',
  }
  void runStage2(input, { simulate: input.simulate })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
