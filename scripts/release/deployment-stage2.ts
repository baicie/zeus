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
import { runDeploymentAcceptance } from './deployment-acceptance'

export const TENANT_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/
const SHA_PATTERN = /^[0-9a-f]{40}$/i
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/i
const SAFE_FILE = /^[A-Za-z0-9._-]+$/
export const REQUIRED_IMAGES = [
  'playground',
  'admin',
  'aiHost',
  'workbench',
] as const
const PRODUCT_IMAGES: Record<string, string> = {
  'webc-studio': 'playground',
  'native-lab': 'playground',
  admin: 'admin',
  'ai-workbench': 'workbench',
}

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
  readonly adminEmail: string
  readonly adminPassword: string
  readonly simulate: boolean
  readonly localIntegration?: boolean
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
  if (!input.adminEmail || !input.adminPassword) {
    errors.push('acceptance credentials are missing')
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
  }
  for (const name of Object.keys(PRODUCT_IMAGES)) {
    if (!seen.has(name)) errors.push(`manifest is missing product ${name}`)
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
  const releaseErrors = validateReleaseIdentity({
    head,
    main,
    expectedCore: input.expectedCore,
    expectedUi: input.expectedUi,
    manifestCore: String(manifest.coreCommit),
    manifestUi: String(manifest.uiCommit),
  })
  if (releaseErrors.length > 0) throw new Error(releaseErrors.join('; '))
  if (options.simulate) {
    console.log('STAGE2_SIMULATED_OK')
    return
  }
  for (const archive of Object.values(artifacts.files)) {
    run('docker', ['load', '--input', archive])
  }
  verifyLoadedImageIds(artifacts.candidate)
  await runDeploymentTransaction(
    input,
    artifacts.candidate,
    input.localIntegration ? 'local' : 'online',
  )
}

async function runDeploymentTransaction(
  input: Stage2Input,
  candidate: Record<string, unknown>,
  mode: 'local' | 'online',
): Promise<void> {
  const composeFile = process.env.ZEUS_DEPLOY_COMPOSE_FILE
  if (!composeFile || !fs.existsSync(composeFile)) {
    throw new Error('local integration requires ZEUS_DEPLOY_COMPOSE_FILE')
  }
  const images = candidate.images as Record<string, Record<string, unknown>>
  const envFile = path.join(input.artifactDir, 'runtime.env')
  const lines = [
    `ZEUS_PLAYGROUND_IMAGE=${images.playground!.image}`,
    `ZEUS_ADMIN_IMAGE=${images.admin!.image}`,
    `ZEUS_AI_HOST_IMAGE=${images.aiHost!.image}`,
    `ZEUS_AI_WORKBENCH_IMAGE=${images.workbench!.image}`,
    'ZEUS_PLAYGROUND_BIND=127.0.0.1',
    'ZEUS_PLAYGROUND_HOST_PORT=8080',
    'ZEUS_PLAYGROUND_SANDBOX_PORT=8081',
    'ZEUS_ADMIN_BIND=127.0.0.1',
    'ZEUS_ADMIN_PORT=8082',
    'ZEUS_AI_WORKBENCH_BIND=127.0.0.1',
    'ZEUS_AI_WORKBENCH_PORT=8083',
    `ZEUS_ADMIN_EMAIL=${input.adminEmail}`,
    `ZEUS_ADMIN_PASSWORD=${input.adminPassword}`,
    `ZEUS_ADMIN_VIEWER_PASSWORD=${input.adminPassword}`,
    `ZEUS_AI_WORKSPACE_ID=${input.tenant}`,
    'ZEUS_AI_ORIGINS=http://127.0.0.1:8083',
  ]
  fs.writeFileSync(envFile, `${lines.join('\n')}\n`, { mode: 0o600 })
  const compose = (args: string[]) =>
    run('docker', [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      ...args,
    ])
  try {
    compose(['up', '-d', '--wait', '--wait-timeout', '180'])
    if (process.env.ZEUS_DEPLOY_FAIL_AFTER_UP === 'true') {
      throw new Error('injected deployment failure')
    }
    for (const url of [
      'http://127.0.0.1:8080/',
      'http://127.0.0.1:8081/sandbox.html',
      'http://127.0.0.1:8082/api/health',
      'http://127.0.0.1:8083/ai-host/health',
    ]) {
      let ok = false
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          const response = await fetch(url)
          if (response.ok) {
            ok = true
            break
          }
        } catch {
          // wait
        }
        await new Promise(resolve => setTimeout(resolve, 2_000))
      }
      if (!ok) throw new Error(`health check failed: ${url}`)
    }
    const manifestFile = resolveArtifactFile(
      input.artifactDir,
      input.manifestName,
    )
    process.env.ZEUS_ACCEPTANCE_ADMIN_EMAIL = input.adminEmail
    process.env.ZEUS_ACCEPTANCE_ADMIN_PASSWORD = input.adminPassword
    process.env.ZEUS_ACCEPTANCE_AI_REPLAY = 'true'
    process.env.ZEUS_ACCEPTANCE_TENANT = input.tenant
    const report = await runDeploymentAcceptance({
      manifestFile,
      mode,
      coreCommit: input.expectedCore,
      uiCommit: input.expectedUi,
      engines: ['chromium'],
      writeMode: 'isolated',
      tenant: input.tenant,
    })
    const reportName =
      mode === 'local'
        ? 'stage2-local-acceptance.json'
        : 'deployment-acceptance.json'
    fs.writeFileSync(
      path.join(input.artifactDir, reportName),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    const expectedDecision =
      mode === 'local' ? 'LOCAL_VALIDATED' : 'ONLINE_ACCEPTED'
    if (report.decision !== expectedDecision) {
      throw new Error(`deployment acceptance failed: ${report.decision}`)
    }
    console.log(
      mode === 'local'
        ? 'STAGE2_LOCAL_INTEGRATION_PASS'
        : 'STAGE2_ONLINE_TRANSACTION_PASS',
    )
  } finally {
    compose(['down', '--remove-orphans'])
    fs.rmSync(envFile, { force: true })
  }
}

function verifyLoadedImageIds(candidate: Record<string, unknown>): void {
  const images =
    typeof candidate.images === 'object' && candidate.images !== null
      ? (candidate.images as Record<string, Record<string, unknown>>)
      : {}
  for (const key of REQUIRED_IMAGES) {
    const image = images[key]
    if (!image) throw new Error(`loaded image ${key} is missing`)
    const actual = runCapture('docker', [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      String(image.imageDigest),
    ])
    if (actual !== image.imageDigest) {
      throw new Error(`loaded image ${key} identity does not match candidate`)
    }
  }
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

function runCapture(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} failed`)
  return result.stdout.trim()
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} failed`)
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
  }
  void runStage2(input, { simulate: input.simulate })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
