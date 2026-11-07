/**
 * Stage 2 deployment transaction.
 *
 * The transaction is explicit so that a failed deployment never leaves the
 * host in a half-replaced state:
 *
 *   lock → verify artifact → snapshot → database preflight → backup →
 *   stop/rename the previous containers → compose up → health → acceptance →
 *   keep running, or roll back the containers and the database snapshot.
 *
 * Production never runs `compose down` on success and never deletes a data
 * directory. Local integration runs an isolated Compose project and removes
 * only its own containers, volumes and data directories. Fault injection is
 * environment-driven and always exercises the real rollback path.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { verifyProvenance } from './build-info'
import { runDeploymentAcceptance } from './deployment-acceptance'
import { createAiDeploymentEnvironment } from './deployment-ai'
import {
  createOnlineManifest,
  readLayout,
  resolveTrustedDeploymentFile,
  sha256File,
  validateLayout,
  verifyLayoutDigest,
  type CandidateImage,
  type DeploymentLayout,
} from './deployment-layout'

export const TRANSACTION_REPORT_SCHEMA = 'zeus.deployment-transaction/v1'
const SHA_PATTERN = /^sha256:[0-9a-f]{64}$/i
const SAFE_PASSWORD = /^[\x20-\x7e]{12,200}$/

export type FailureInjection =
  | 'none'
  | 'before-up'
  | 'after-up'
  | 'after-health'
  | 'after-acceptance'
  | 'after-backup'

export interface TransactionImage extends CandidateImage {
  readonly image: string
  readonly ociArchive: string
  readonly ociSha256: string
}

export interface TransactionOptions {
  readonly mode: 'local' | 'online'
  readonly composeFile: string
  readonly layoutFile?: string
  readonly layoutSha256?: string
  readonly expectedEnvironment?: string
  readonly productionEnvFile?: string
  readonly acceptanceEmail: string
  readonly acceptancePassword: string
  readonly stateDir: string
  readonly projectName: string
  readonly tenant: string
  readonly coreCommit: string
  readonly uiCommit: string
  readonly artifactDir: string
  readonly provenanceFile: string
  readonly images: Record<string, TransactionImage>
  readonly browsers: readonly string[]
  readonly keepLocal: boolean
  readonly failureInjection: FailureInjection
  readonly localPorts?: readonly number[]
}

export interface TransactionReport {
  readonly schema: typeof TRANSACTION_REPORT_SCHEMA
  readonly mode: 'local' | 'online'
  readonly deployId: string
  readonly coreCommit: string
  readonly uiCommit: string
  readonly startedAt: string
  readonly finishedAt?: string
  readonly status:
    | 'PASS'
    | 'FAILED'
    | 'ROLLED_BACK'
    | 'ROLLBACK_FAILED'
    | 'ALREADY_DEPLOYED'
  readonly layoutDigest?: string
  readonly composeDigest: string
  readonly projectName: string
  readonly images: Record<string, string>
  readonly previous?: PreviousStateSummary
  readonly backups?: BackupSummary
  readonly acceptance?: {
    readonly decision: string
    readonly file: string
  }
  readonly rollback?: RollbackSummary
  readonly failure?: string
}

interface PreviousContainer {
  readonly key: string
  readonly name: string
  readonly image: string
  readonly imageId: string
  readonly running: boolean
  readonly health?: string
  readonly mounts: readonly string[]
  readonly env: Record<string, string>
}

interface PreviousState {
  readonly containers: Record<string, PreviousContainer>
  readonly buildInfos: Record<string, string>
  readonly renamed: Array<{ from: string; to: string }>
}

interface PreviousStateSummary {
  readonly containers: Record<
    string,
    { name: string; imageId: string; running: boolean; health?: string }
  >
  readonly buildInfoDigests: Record<string, string>
}

interface BackupSummary {
  readonly directory: string
  admin?: { file: string; sha256: string; sqliteCheck: string }
  ai?: { file: string; sha256: string; sqliteCheck: string }
  aiWorkspace?: { file: string; sha256: string; entries: number }
}

interface RollbackSummary {
  readonly startedAt: string
  readonly finishedAt: string
  readonly restoredContainers: readonly string[]
  readonly restoredDatabases: readonly string[]
  readonly restoredWorkspaces: readonly string[]
  readonly health: string
  readonly buildInfoVerified: boolean
  readonly error?: string
}

interface RuntimeConfiguration {
  readonly layout: DeploymentLayout
  readonly envFile: string
  readonly production: boolean
  readonly adminEmail: string
  readonly adminPassword: string
  readonly viewerPassword: string
  readonly acceptanceEmail: string
  readonly acceptancePassword: string
}

export async function runDeploymentTransaction(
  options: TransactionOptions,
): Promise<TransactionReport> {
  const startedAt = new Date().toISOString()
  const composeDigest = sha256File(options.composeFile)
  const imageDigests = Object.fromEntries(
    Object.entries(options.images).map(([key, image]) => [
      key,
      image.imageDigest,
    ]),
  )
  const deployId = `${options.coreCommit.slice(0, 12)}-${options.uiCommit.slice(0, 12)}-${Date.now()}`
  const reportBase = {
    schema: TRANSACTION_REPORT_SCHEMA,
    mode: options.mode,
    deployId,
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
    startedAt,
    composeDigest,
    projectName: options.projectName,
    images: imageDigests,
  } as const

  assertSafeStateDirectory(options)
  fs.mkdirSync(options.stateDir, { recursive: true, mode: 0o700 })
  const lock = acquireDeploymentLock(options.stateDir)
  let report: TransactionReport | undefined
  try {
    const runtime = createRuntimeConfiguration(options)
    const layout = runtime.layout
    const layoutDigest = options.layoutFile
      ? sha256File(options.layoutFile)
      : undefined
    for (const [key, image] of Object.entries(options.images)) {
      if (!SHA_PATTERN.test(image.imageDigest)) {
        throw new Error(`candidate image ${key} has an invalid image digest`)
      }
    }
    if (
      options.mode === 'online' &&
      options.productionEnvFile &&
      options.layoutFile &&
      options.layoutSha256
    ) {
      verifyLayoutDigest(options.layoutFile, options.layoutSha256)
    }

    const previous = capturePreviousState(layout, options)
    assertPortOwnership(layout, previous)
    assertCaddyUpstreams(layout)
    loadAndVerifyImages(options.images)
    preflightAdminDatabase(previous, layout)
    preflightAiDatabase(previous, layout)

    const acceptanceManifestFile = writeAcceptanceManifest(
      options,
      layout,
      runtime.envFile,
    )

    if (isAlreadyDeployed(options, layout, previous)) {
      const acceptance = await runAcceptance(
        options,
        layout,
        acceptanceManifestFile,
        'already-deployed',
        runtime,
      )
      report = {
        ...reportBase,
        finishedAt: new Date().toISOString(),
        status: 'ALREADY_DEPLOYED',
        layoutDigest,
        previous: summarizePrevious(previous),
        acceptance,
      }
      writeTransactionReport(options, report)
      console.log('STAGE2_ALREADY_DEPLOYED')
      return report
    }

    const backups = backupDatabases(previous, layout, options.stateDir)
    injectFailure(options.failureInjection, 'after-backup')

    let rollback: RollbackSummary | undefined
    try {
      stopPreviousContainers(previous)
      injectFailure(options.failureInjection, 'before-up')
      composeUp(options, runtime.envFile)
      injectFailure(options.failureInjection, 'after-up')
      await waitForHealth(layout, options)
      injectFailure(options.failureInjection, 'after-health')
      const acceptance = await runAcceptance(
        options,
        layout,
        acceptanceManifestFile,
        'candidate',
        runtime,
      )
      removeAcceptanceUser(layout)
      stripAcceptanceEnvironment(runtime.envFile)
      compose(options, runtime.envFile, [
        'up',
        '-d',
        '--no-deps',
        '--force-recreate',
        'admin',
      ])
      await waitForAdminHealth(layout)
      injectFailure(options.failureInjection, 'after-acceptance')
      writeDeploymentState(options, layout, deployId)
      report = {
        ...reportBase,
        finishedAt: new Date().toISOString(),
        status: 'PASS',
        layoutDigest,
        previous: summarizePrevious(previous),
        backups,
        acceptance,
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error)
      removeAcceptanceUser(layout)
      if (Object.keys(previous.containers).length === 0) {
        // First deployment: there is nothing to roll back to. Remove only the
        // candidate containers; local data is disposable, production data is
        // never deleted.
        composeDown(options, runtime.envFile, options.mode === 'local')
        if (options.mode === 'local') {
          fs.rmSync(layout.dataDirs.admin, { recursive: true, force: true })
          fs.rmSync(layout.dataDirs.ai, { recursive: true, force: true })
        }
        report = {
          ...reportBase,
          finishedAt: new Date().toISOString(),
          status: 'FAILED',
          layoutDigest,
          previous: summarizePrevious(previous),
          backups,
          failure,
        }
        writeTransactionReport(options, report)
        throw Object.assign(new Error(failure), { transactionReport: report })
      }
      try {
        rollback = rollbackDeployment(
          previous,
          layout,
          backups,
          options,
          runtime.envFile,
        )
        report = {
          ...reportBase,
          finishedAt: new Date().toISOString(),
          status: 'ROLLED_BACK',
          layoutDigest,
          previous: summarizePrevious(previous),
          backups,
          rollback,
          failure,
        }
      } catch (rollbackError) {
        report = {
          ...reportBase,
          finishedAt: new Date().toISOString(),
          status: 'ROLLBACK_FAILED',
          layoutDigest,
          previous: summarizePrevious(previous),
          backups,
          failure,
          rollback: {
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            restoredContainers: [],
            restoredDatabases: [],
            restoredWorkspaces: [],
            health: 'FAIL',
            buildInfoVerified: false,
            error:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          },
        }
      }
      writeTransactionReport(options, report)
      throw Object.assign(new Error(failure), {
        transactionReport: report,
      })
    }

    writeTransactionReport(options, report)
    if (options.mode === 'local' && !options.keepLocal) {
      cleanupLocalDeployment(options, runtime.envFile)
    }
    console.log(
      options.mode === 'local'
        ? 'STAGE2_LOCAL_INTEGRATION_PASS'
        : 'STAGE2_ONLINE_TRANSACTION_PASS',
    )
    return report
  } catch (error) {
    if (!report) {
      report = {
        ...reportBase,
        finishedAt: new Date().toISOString(),
        status: 'FAILED',
        failure: error instanceof Error ? error.message : String(error),
      }
      writeTransactionReport(options, report)
    }
    throw error
  } finally {
    lock.release()
  }
}

// ---------------------------------------------------------------------------
// Runtime configuration and secrets

function createRuntimeConfiguration(
  options: TransactionOptions,
): RuntimeConfiguration {
  const local = options.mode === 'local'
  const layout = local
    ? createLocalLayout(options)
    : loadProductionLayout(options)
  const production = !local
  for (const dir of [layout.dataDirs.admin, layout.dataDirs.ai]) {
    fs.mkdirSync(dir, { recursive: true, mode: local ? 0o777 : 0o700 })
    if (local) fs.chmodSync(dir, 0o777)
  }
  let adminEmail: string
  let adminPassword: string
  let viewerPassword: string
  if (production) {
    const secrets = readProductionSecrets(options.productionEnvFile)
    adminEmail = secrets.ZEUS_ADMIN_EMAIL!
    adminPassword = secrets.ZEUS_ADMIN_PASSWORD!
    viewerPassword = secrets.ZEUS_ADMIN_VIEWER_PASSWORD!
    assertCredentialSeparation({
      adminEmail,
      adminPassword,
      viewerPassword,
      acceptanceEmail: options.acceptanceEmail,
      acceptancePassword: options.acceptancePassword,
    })
  } else {
    adminEmail = 'stage2-admin@local.test'
    adminPassword = `stage2-admin-${randomToken()}`
    viewerPassword = `stage2-viewer-${randomToken()}`
    if (!options.acceptanceEmail) {
      options = {
        ...options,
        acceptanceEmail: 'stage2-acceptance@local.test',
        acceptancePassword: `stage2-acceptance-${randomToken()}`,
      }
    }
  }
  if (!SAFE_PASSWORD.test(adminPassword)) {
    throw new Error('production admin password must be 12-200 printable chars')
  }
  if (!SAFE_PASSWORD.test(viewerPassword)) {
    throw new Error('production viewer password must be 12-200 printable chars')
  }
  if (!options.acceptanceEmail || !options.acceptancePassword) {
    throw new Error('acceptance credentials are missing')
  }
  const envFile = path.join(options.stateDir, 'runtime.env')
  const ai = createAiDeploymentEnvironment(options.tenant, {
    publicReplay: true,
  })
  const aiOrigin = production
    ? new URL(layout.products['ai-workbench']).origin
    : `http://127.0.0.1:${layout.ports.workbench}`
  const adminOrigin = production
    ? new URL(layout.products.admin).origin
    : `http://127.0.0.1:${layout.ports.admin}`
  const adminDatabaseFile = path.join(layout.dataDirs.admin, 'admin.sqlite')
  const bootstrap = !fs.existsSync(adminDatabaseFile)
  const lines = [
    `ZEUS_PLAYGROUND_IMAGE=${runtimeImage(options.images.playground!)}`,
    `ZEUS_ADMIN_IMAGE=${runtimeImage(options.images.admin!)}`,
    `ZEUS_AI_HOST_IMAGE=${runtimeImage(options.images.aiHost!)}`,
    `ZEUS_AI_WORKBENCH_IMAGE=${runtimeImage(options.images.workbench!)}`,
    `ZEUS_PLAYGROUND_CONTAINER=${layout.containers.playground}`,
    `ZEUS_ADMIN_CONTAINER=${layout.containers.admin}`,
    `ZEUS_AI_HOST_CONTAINER=${layout.containers.aiHost}`,
    `ZEUS_AI_WORKBENCH_CONTAINER=${layout.containers.workbench}`,
    'ZEUS_PLAYGROUND_BIND=127.0.0.1',
    `ZEUS_PLAYGROUND_HOST_PORT=${layout.ports.playgroundHost}`,
    `ZEUS_PLAYGROUND_SANDBOX_PORT=${layout.ports.playgroundSandbox}`,
    'ZEUS_ADMIN_BIND=127.0.0.1',
    `ZEUS_ADMIN_PORT=${layout.ports.admin}`,
    'ZEUS_AI_WORKBENCH_BIND=127.0.0.1',
    `ZEUS_AI_WORKBENCH_PORT=${layout.ports.workbench}`,
    `ZEUS_ADMIN_DATA_DIR=${layout.dataDirs.admin}`,
    `ZEUS_AI_DATA_DIR=${layout.dataDirs.ai}`,
    `ZEUS_ADMIN_EMAIL=${envValue(adminEmail)}`,
    `ZEUS_ADMIN_PASSWORD=${envValue(adminPassword)}`,
    `ZEUS_ADMIN_VIEWER_PASSWORD=${envValue(viewerPassword)}`,
    'ZEUS_ADMIN_SEED_DEMO=false',
    `ZEUS_ADMIN_BOOTSTRAP=${bootstrap ? 'true' : 'false'}`,
    `ZEUS_ADMIN_ACCEPTANCE_EMAIL=${envValue(options.acceptanceEmail)}`,
    `ZEUS_ADMIN_ACCEPTANCE_PASSWORD=${envValue(options.acceptancePassword)}`,
    'ZEUS_ADMIN_ACCEPTANCE_USER_ID=acceptance',
    'ZEUS_ADMIN_ACCEPTANCE_TTL_MINUTES=120',
    'ZEUS_ADMIN_TRUST_PROXY=true',
    `ZEUS_ADMIN_ORIGINS=${envValue(adminOrigin)}`,
    `ZEUS_AI_ORIGINS=${envValue(aiOrigin)}`,
    'ZEUS_AI_PUBLIC_REPLAY=true',
    'ZEUS_AI_TRUST_PROXY=true',
    ...ai.lines,
    '',
  ]
  fs.mkdirSync(path.dirname(envFile), { recursive: true })
  fs.writeFileSync(envFile, lines.join('\n'), { mode: 0o600 })
  fs.chmodSync(envFile, 0o600)
  return {
    layout,
    envFile,
    production,
    adminEmail,
    adminPassword,
    viewerPassword,
    acceptanceEmail: options.acceptanceEmail,
    acceptancePassword: options.acceptancePassword,
  }
}

function envValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\$/g, '$$$$')
    .replace(/[\r\n]/g, '')
}

function runtimeImage(image: TransactionImage): string {
  // The candidate binds a locally loaded image ID (sha256:<config>). Loading
  // and deploying by ID is immutable even when the archive reuses a tag; a
  // tag@manifest-digest reference is not available for an unpushed image.
  return image.imageDigest
}

export function readProductionSecrets(
  file: string | undefined,
): Record<string, string> {
  if (!file) throw new Error('production secrets file is required')
  if (!path.isAbsolute(file)) {
    throw new Error('production secrets file must be an absolute path')
  }
  const stat = fs.lstatSync(file)
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('production secrets file must be a regular file')
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      'production secrets file must not be readable by group or others',
    )
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error('production secrets file must be owned by the deploy user')
  }
  const values: Record<string, string> = {}
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue
    if (key in values) {
      throw new Error(`production secrets file duplicates ${key}`)
    }
    let value = line.slice(separator + 1)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  for (const key of [
    'ZEUS_ADMIN_EMAIL',
    'ZEUS_ADMIN_PASSWORD',
    'ZEUS_ADMIN_VIEWER_PASSWORD',
  ]) {
    if (!values[key]) {
      throw new Error(`production secrets file is missing ${key}`)
    }
  }
  return values
}

export function assertCredentialSeparation(input: {
  readonly adminEmail: string
  readonly adminPassword: string
  readonly viewerPassword: string
  readonly acceptanceEmail: string
  readonly acceptancePassword: string
}): void {
  if (input.adminPassword === input.viewerPassword) {
    throw new Error('production admin and viewer passwords must differ')
  }
  if (input.acceptanceEmail.toLowerCase() === input.adminEmail.toLowerCase()) {
    throw new Error('acceptance account must not be the production admin')
  }
  if (input.acceptancePassword === input.adminPassword) {
    throw new Error('acceptance password must differ from the admin password')
  }
  if (input.acceptancePassword === input.viewerPassword) {
    throw new Error('acceptance password must differ from the viewer password')
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.acceptanceEmail)) {
    throw new Error('acceptance email is invalid')
  }
}

// ---------------------------------------------------------------------------
// Layout

export function createLocalLayout(
  options: TransactionOptions,
): DeploymentLayout {
  // These must match the Stage 1 local build's baked sandbox URL.
  const ports = options.localPorts ?? [8080, 8081, 8082, 8083]
  if (ports.length !== 4) throw new Error('local layout needs four ports')
  const [playgroundHost, playgroundSandbox, admin, workbench] = ports
  const suffix = options.tenant.replace(/[^a-z0-9-]/g, '-').slice(0, 24)
  // Stable across local runs: a drill must back up and restore the same
  // bind-mounted data directory that the previous containers use.
  const dataRoot = path.join(os.tmpdir(), 'zeus-stage2-data', suffix)
  const layout = {
    schema: 'zeus.deployment-layout/v1',
    environment: 'local',
    allowedHosts: ['127.0.0.1'],
    allowedPorts: ['443', '8443'],
    sandboxUrl: `http://127.0.0.1:${playgroundSandbox}/sandbox.html`,
    products: {
      'webc-studio': `http://127.0.0.1:${playgroundHost}/webc.html`,
      'native-lab': `http://127.0.0.1:${playgroundHost}/`,
      admin: `http://127.0.0.1:${admin}/`,
      'ai-workbench': `http://127.0.0.1:${workbench}/`,
    },
    containers: {
      playground: `zeus-stage2-${suffix}-playground`,
      admin: `zeus-stage2-${suffix}-admin`,
      aiHost: `zeus-stage2-${suffix}-ai-host`,
      workbench: `zeus-stage2-${suffix}-ai-workbench`,
    },
    ports: {
      playgroundHost: playgroundHost!,
      playgroundSandbox: playgroundSandbox!,
      admin: admin!,
      workbench: workbench!,
    },
    dataDirs: {
      admin: path.join(dataRoot, 'admin'),
      ai: path.join(dataRoot, 'ai'),
    },
  }
  const validated = validateLayout(layout, {
    mode: 'local',
    environment: 'local',
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
  })
  if (!validated.layout) throw new Error(validated.errors.join('; '))
  return validated.layout
}

function loadProductionLayout(options: TransactionOptions): DeploymentLayout {
  if (!options.layoutFile) {
    throw new Error('production deployment requires an approved layout file')
  }
  const file = resolveTrustedDeploymentFile({
    root: process.cwd(),
    value: options.layoutFile,
    artifactDir: options.artifactDir,
  })
  if (options.layoutSha256) verifyLayoutDigest(file, options.layoutSha256)
  const validated = validateLayout(readLayout(file), {
    mode: 'online',
    environment: options.expectedEnvironment ?? 'production',
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
  })
  if (!validated.layout) throw new Error(validated.errors.join('; '))
  const layout = validated.layout
  for (const key of ['admin', 'ai'] as const) {
    if (!fs.existsSync(layout.dataDirs[key])) {
      throw new Error(`production data directory is missing: ${key}`)
    }
    if (!fs.statSync(layout.dataDirs[key]).isDirectory()) {
      throw new Error(`production data path is not a directory: ${key}`)
    }
  }
  return layout
}

// ---------------------------------------------------------------------------
// Previous state, ports, Caddy and database preflight

function capturePreviousState(
  layout: DeploymentLayout,
  options: TransactionOptions,
): PreviousState {
  const containers: Record<string, PreviousContainer> = {}
  const candidates: Record<string, string[]> = {
    playground: [layout.containers.playground],
    admin: [layout.containers.admin],
    aiHost: [layout.containers.aiHost],
    workbench: [layout.containers.workbench],
  }
  for (const [key, legacy] of Object.entries(layout.legacyContainers ?? {})) {
    if (legacy) candidates[key]?.push(legacy)
  }
  for (const [key, names] of Object.entries(candidates)) {
    for (const name of names) {
      const inspected = inspectContainer(name)
      if (!inspected) continue
      containers[key] = {
        key,
        name,
        image: inspected.image,
        imageId: inspected.imageId,
        running: inspected.running,
        ...(inspected.health ? { health: inspected.health } : {}),
        mounts: inspected.mounts,
        env: inspected.env,
      }
      break
    }
  }
  const buildInfos: Record<string, string> = {}
  for (const [product, url] of Object.entries(productBuildInfoUrls(layout))) {
    const digest = fetchJsonDigest(url)
    if (digest) buildInfos[product] = digest
  }
  return { containers, buildInfos, renamed: [] }
}

export function productBuildInfoUrls(
  layout: DeploymentLayout,
): Record<string, string> {
  return {
    'webc-studio': `http://127.0.0.1:${layout.ports.playgroundHost}/build-info.json`,
    'native-lab': `http://127.0.0.1:${layout.ports.playgroundHost}/build-info.json`,
    admin: `http://127.0.0.1:${layout.ports.admin}/build-info.json`,
    'ai-workbench': `http://127.0.0.1:${layout.ports.workbench}/build-info.json`,
  }
}

function assertPortOwnership(
  layout: DeploymentLayout,
  previous: PreviousState,
): void {
  const owners = publishedPortOwners()
  const allowed = new Set(
    Object.values(previous.containers).map(container => container.name),
  )
  for (const [key, port] of Object.entries(layout.ports)) {
    const owner = owners.get(port)
    if (owner && !allowed.has(owner)) {
      throw new Error(
        `port ${port} (${key}) is already used by ${owner}; refusing to replace an unrelated service`,
      )
    }
  }
}

export function assertCaddyUpstreams(layout: DeploymentLayout): void {
  if (!layout.caddyFile || !layout.caddyUpstreams) return
  if (!fs.existsSync(layout.caddyFile)) {
    throw new Error(`Caddyfile is missing: ${layout.caddyFile}`)
  }
  const content = fs.readFileSync(layout.caddyFile, 'utf8')
  for (const [host, upstream] of Object.entries(layout.caddyUpstreams)) {
    if (!content.includes(host)) {
      throw new Error(`Caddyfile does not contain the ${host} site block`)
    }
    if (!content.includes(`reverse_proxy ${upstream}`)) {
      throw new Error(
        `Caddyfile does not route ${host} to the expected upstream ${upstream}`,
      )
    }
  }
}

function preflightAdminDatabase(
  previous: PreviousState,
  layout: DeploymentLayout,
): void {
  const container = previous.containers.admin
  if (!container || !container.running) return
  const databaseFile = container.env.ZEUS_ADMIN_DB ?? '/data/admin.sqlite'
  const result = execDatabaseProbe(container.name, databaseFile, true)
  if (!result.exists) return
  if (!result.ok) {
    throw new Error(
      `production Admin database is not safe to migrate: ${result.message}`,
    )
  }
  if (result.users > 0 && result.activeAdmins === 0) {
    throw new Error(
      'production Admin database has users but no active administrator; refusing to auto-reset',
    )
  }
}

function preflightAiDatabase(
  previous: PreviousState,
  layout: DeploymentLayout,
): void {
  const container = previous.containers.aiHost
  if (!container || !container.running) return
  const databaseFile = aiDatabaseFile(container.env)
  const result = execDatabaseProbe(container.name, databaseFile, false)
  if (result.exists && !result.ok) {
    throw new Error(`production AI database is corrupt: ${result.message}`)
  }
}

function execDatabaseProbe(
  container: string,
  databaseFile: string,
  admin: boolean,
): {
  exists: boolean
  ok: boolean
  message: string
  users: number
  activeAdmins: number
} {
  const script = `
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
const file = process.env.ZEUS_PROBE_DB
const exists = fs.existsSync(file)
if (!exists) { console.log(JSON.stringify({exists:false,ok:true,message:'missing'})); process.exit(0) }
const db = new DatabaseSync(file, { readOnly: true })
const messages = db.prepare('PRAGMA quick_check').all().flatMap(row => Object.values(row)).filter(value => typeof value === 'string')
const ok = messages.length === 1 && messages[0] === 'ok'
let users = 0
let activeAdmins = 0
if (process.env.ZEUS_PROBE_ADMIN === 'true') {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
  if (table) {
    users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
    activeAdmins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'").get().count
  }
}
db.close()
console.log(JSON.stringify({exists:true,ok,message:messages.join('; '),users,activeAdmins}))
`
  const result = dockerCapture(
    [
      'exec',
      '-e',
      `ZEUS_PROBE_DB=${databaseFile}`,
      '-e',
      `ZEUS_PROBE_ADMIN=${admin}`,
    ],
    container,
    ['node', '--input-type=module', '-e', script],
  )
  if (result.status !== 0) {
    throw new Error(`database preflight failed inside ${container}`)
  }
  try {
    return JSON.parse(lastLine(stdoutText(result)) || '{}')
  } catch {
    throw new Error(
      `database preflight returned invalid output from ${container}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Backup

function backupDatabases(
  previous: PreviousState,
  layout: DeploymentLayout,
  stateDir: string,
): BackupSummary {
  const directory = path.join(stateDir, 'backups', timestamp())
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const summary: BackupSummary = { directory }
  const admin = previous.containers.admin
  if (admin?.running) {
    const file = backupDatabase({
      container: admin.name,
      source: admin.env.ZEUS_ADMIN_DB ?? '/data/admin.sqlite',
      dataDir: layout.dataDirs.admin,
      directory,
      name: 'admin.sqlite',
      verifierImage: previous.containers.admin.image,
      admin: true,
    })
    if (file) summary.admin = file
  }
  const aiHost = previous.containers.aiHost
  if (aiHost?.running) {
    const file = backupDatabase({
      container: aiHost.name,
      source: aiDatabaseFile(aiHost.env),
      dataDir: layout.dataDirs.ai,
      directory,
      name: 'ai.sqlite',
      verifierImage: aiHost.image,
      admin: false,
    })
    if (file) summary.ai = file
    const workspace = backupWorkspace(
      layout.dataDirs.ai,
      directory,
      aiHost.image,
    )
    if (workspace) summary.aiWorkspace = workspace
  }
  const lines: string[] = []
  for (const entry of [summary.admin, summary.ai, summary.aiWorkspace]) {
    if (entry)
      lines.push(`${entry.sha256.slice(7)}  ${path.basename(entry.file)}`)
  }
  if (lines.length > 0) {
    fs.writeFileSync(
      path.join(directory, 'SHA256SUMS'),
      `${lines.join('\n')}\n`,
    )
  }
  return summary
}

function backupDatabase(input: {
  container: string
  source: string
  dataDir: string
  directory: string
  name: string
  verifierImage: string
  admin: boolean
}): { file: string; sha256: string; sqliteCheck: string } | undefined {
  const targetName = `.zeus-deploy-backup-${input.name}`
  const target = `/data/${targetName}`
  const hostTarget = path.join(input.dataDir, targetName)
  const script = `
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
const source = process.env.ZEUS_BACKUP_SOURCE
const target = process.env.ZEUS_BACKUP_TARGET
if (!fs.existsSync(source)) { console.log('MISSING'); process.exit(0) }
fs.rmSync(target, { force: true })
const db = new DatabaseSync(source)
db.exec("VACUUM INTO '" + target.replace(/'/g, "''") + "'")
db.close()
const backup = new DatabaseSync(target, { readOnly: true })
const rows = backup.prepare('PRAGMA quick_check').all()
backup.close()
console.log(JSON.stringify(rows))
`
  const probe = dockerCapture(
    [
      'exec',
      '-e',
      `ZEUS_BACKUP_SOURCE=${input.source}`,
      '-e',
      `ZEUS_BACKUP_TARGET=${target}`,
    ],
    input.container,
    ['node', '--input-type=module', '-e', script],
  )
  if (probe.status !== 0) {
    throw new Error(`database backup failed inside ${input.container}`)
  }
  if (stdoutText(probe).trim() === 'MISSING') {
    console.warn(
      `[stage2] ${input.container} has no database at ${input.source}`,
    )
    return undefined
  }
  const file = path.join(input.directory, input.name)
  try {
    fs.copyFileSync(hostTarget, file)
  } catch (error) {
    throw new Error(
      `failed to copy the database backup out of ${input.container}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  } finally {
    dockerCapture(['exec'], input.container, ['rm', '-f', target], true)
  }
  const check = verifyBackupFile(
    input.verifierImage,
    input.directory,
    input.name,
  )
  if (!check.ok) {
    throw new Error(`backup verification failed: ${check.messages}`)
  }
  return {
    file,
    sha256: sha256File(file),
    sqliteCheck: check.messages,
  }
}

function backupWorkspace(
  dataDir: string,
  directory: string,
  image: string,
): { file: string; sha256: string; entries: number } | undefined {
  if (!fs.existsSync(path.join(dataDir, 'workspace'))) return undefined
  const file = path.join(directory, 'ai-workspace.tgz')
  const archive = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      '0',
      '-v',
      `${dataDir}:/data:ro`,
      '-v',
      `${directory}:/backup`,
      '--entrypoint',
      'sh',
      image,
      '-c',
      'tar -czf /backup/ai-workspace.tgz -C /data workspace',
    ],
    { encoding: 'utf8' },
  )
  if (archive.status !== 0) {
    throw new Error('failed to archive the AI workspace')
  }
  const listing = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      '0',
      '-v',
      `${directory}:/backup:ro`,
      '--entrypoint',
      'sh',
      image,
      '-c',
      'tar -tzf /backup/ai-workspace.tgz | wc -l',
    ],
    { encoding: 'utf8' },
  )
  if (listing.status !== 0) {
    throw new Error('failed to verify the AI workspace archive')
  }
  const entries = Number(stdoutText(listing).trim())
  if (!Number.isInteger(entries) || entries < 1) {
    throw new Error('AI workspace archive is empty')
  }
  return { file, sha256: sha256File(file), entries }
}

function restoreWorkspaceArchive(
  file: string,
  dataDir: string,
  image: string,
): void {
  const verify = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      '0',
      '-v',
      `${path.dirname(file)}:/backup:ro`,
      '--entrypoint',
      'sh',
      image,
      '-c',
      'tar -tzf /backup/ai-workspace.tgz >/dev/null',
    ],
    { encoding: 'utf8' },
  )
  if (verify.status !== 0) {
    throw new Error('refusing to restore an unverified AI workspace archive')
  }
  const restore = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      '0',
      '-v',
      `${dataDir}:/data`,
      '-v',
      `${path.dirname(file)}:/backup:ro`,
      '--entrypoint',
      'sh',
      image,
      '-c',
      [
        'set -e',
        'previous=/data/.zeus-workspace-previous',
        'restore=/data/.zeus-workspace-restore',
        'rm -rf "$restore"',
        'mkdir -p "$restore"',
        'tar -xzf /backup/ai-workspace.tgz -C "$restore" --strip-components=1',
        'if [ -e /data/workspace ]; then',
        '  rm -rf "$previous"',
        '  mv /data/workspace "$previous"',
        'fi',
        'if ! mv "$restore" /data/workspace; then',
        '  if [ -e "$previous" ]; then mv "$previous" /data/workspace; fi',
        '  exit 1',
        'fi',
        'if ! chown -R 10001:10001 /data/workspace; then exit 1; fi',
        'rm -rf "$previous"',
      ].join('\n'),
    ],
    { encoding: 'utf8' },
  )
  if (restore.status !== 0) {
    throw new Error('failed to restore the AI workspace')
  }
}

function verifyBackupFile(
  image: string,
  directory: string,
  name: string,
): { ok: boolean; messages: string } {
  const script = `
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('/backup/' + process.env.ZEUS_BACKUP_NAME, { readOnly: true })
const rows = db.prepare('PRAGMA quick_check').all()
const messages = rows.flatMap(row => Object.values(row)).filter(value => typeof value === 'string')
console.log(JSON.stringify({ok: messages.length === 1 && messages[0] === 'ok', messages: messages.join('; ')}))
db.close()
`
  const result = dockerCapture(
    [
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      '0',
      '-v',
      `${directory}:/backup:ro`,
      '-e',
      `ZEUS_BACKUP_NAME=${name}`,
      '--entrypoint',
      'node',
      image,
    ],
    undefined,
    ['--input-type=module', '-e', script],
  )
  if (result.status !== 0) return { ok: false, messages: 'verifier failed' }
  try {
    return JSON.parse(lastLine(stdoutText(result)) || '{}')
  } catch {
    return { ok: false, messages: 'verifier returned invalid output' }
  }
}

// ---------------------------------------------------------------------------
// Replacement and rollback

function stopPreviousContainers(previous: PreviousState): void {
  const stamp = timestamp()
  for (const container of Object.values(previous.containers)) {
    const renamed = `${container.name}-r44-rollback-${stamp}`
    const rename = spawnSync('docker', ['rename', container.name, renamed], {
      encoding: 'utf8',
    })
    if (rename.status !== 0) {
      throw new Error(`failed to preserve ${container.name} for rollback`)
    }
    if (container.running) {
      spawnSync('docker', ['stop', renamed], { encoding: 'utf8' })
    }
    previous.renamed.push({ from: renamed, to: container.name })
  }
}

export function rollbackDeployment(
  previous: PreviousState,
  layout: DeploymentLayout,
  backups: BackupSummary | undefined,
  options: TransactionOptions,
  envFile: string,
): RollbackSummary {
  const startedAt = new Date().toISOString()
  const restoredDatabases: string[] = []
  const restoredWorkspaces: string[] = []
  composeDown(options, envFile)
  if (backups) {
    if (backups.admin) {
      restoreDatabaseFile(
        backups.admin.file,
        layout.dataDirs.admin,
        'admin.sqlite',
        previous.containers.admin?.image ?? options.images.admin!.image,
      )
      restoredDatabases.push(backups.admin.file)
    }
    if (backups.ai) {
      restoreDatabaseFile(
        backups.ai.file,
        layout.dataDirs.ai,
        'ai.sqlite',
        previous.containers.aiHost?.image ?? options.images.aiHost!.image,
      )
      restoredDatabases.push(backups.ai.file)
    }
    if (backups.aiWorkspace) {
      restoreWorkspaceArchive(
        backups.aiWorkspace.file,
        layout.dataDirs.ai,
        previous.containers.aiHost?.image ?? options.images.aiHost!.image,
      )
      restoredWorkspaces.push(backups.aiWorkspace.file)
    }
  }
  const restoredContainers: string[] = []
  for (const entry of [...previous.renamed].reverse()) {
    const renamed = spawnSync('docker', ['rename', entry.from, entry.to], {
      encoding: 'utf8',
    })
    if (renamed.status !== 0) {
      throw new Error(`failed to rename ${entry.from} back to ${entry.to}`)
    }
    const started = spawnSync('docker', ['start', entry.to], {
      encoding: 'utf8',
    })
    if (started.status !== 0) {
      throw new Error(`failed to restart the previous container ${entry.to}`)
    }
    restoredContainers.push(entry.to)
  }
  const health = waitForHealthSync(layout)
  let buildInfoVerified = true
  for (const [product, expected] of Object.entries(previous.buildInfos)) {
    const actual = fetchJsonDigest(productBuildInfoUrls(layout)[product] ?? '')
    if (!actual || actual !== expected) buildInfoVerified = false
  }
  const summary: RollbackSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    restoredContainers,
    restoredDatabases,
    restoredWorkspaces,
    health: health ? 'PASS' : 'FAIL',
    buildInfoVerified,
  }
  if (!health || !buildInfoVerified) {
    throw Object.assign(
      new Error('rollback did not restore healthy previous services'),
      { rollback: summary },
    )
  }
  return summary
}

function restoreDatabaseFile(
  backup: string,
  dataDir: string,
  name: string,
  image: string,
): void {
  const check = verifyBackupFile(
    image,
    path.dirname(backup),
    path.basename(backup),
  )
  if (!check.ok) throw new Error('refusing to restore an unverified backup')
  const script = `
set -e
cp "/backup/${name}" "/data/${name}"
rm -f "/data/${name}-wal" "/data/${name}-shm"
chown 10001:10001 "/data/${name}" || true
`
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      '0',
      '-v',
      `${dataDir}:/data`,
      '-v',
      `${path.dirname(backup)}:/backup:ro`,
      '--entrypoint',
      'sh',
      image,
      '-c',
      script,
    ],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`failed to restore the ${name} backup`)
  }
}

/**
 * Removes the deployment-acceptance account after acceptance. The Admin API
 * is deliberately not used: logging in as the production administrator would
 * revoke the operator's live sessions. The server-side TTL is the fallback if
 * this cleanup cannot run.
 */
function removeAcceptanceUser(layout: DeploymentLayout): void {
  const script = `
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
const file = process.env.ZEUS_ACCEPTANCE_DB
if (!fs.existsSync(file)) process.exit(0)
const db = new DatabaseSync(file)
db.exec('PRAGMA foreign_keys = ON')
db.prepare("DELETE FROM sessions WHERE user_id = 'acceptance'").run()
db.prepare("DELETE FROM users WHERE id = 'acceptance' AND role = 'viewer'").run()
db.close()
`
  const result = dockerCapture(
    ['exec', '-e', 'ZEUS_ACCEPTANCE_DB=/data/admin.sqlite'],
    layout.containers.admin,
    ['node', '--input-type=module', '-e', script],
    true,
  )
  if (result.status !== 0) {
    console.warn(
      '[stage2] could not remove the acceptance account; the Admin TTL will expire it',
    )
  }
}

/**
 * Removes the acceptance credential from the persisted runtime env and
 * recreates only the Admin container. A container restart must never be able
 * to re-seed a deployment-acceptance account.
 */
function stripAcceptanceEnvironment(envFile: string): void {
  const lines = fs
    .readFileSync(envFile, 'utf8')
    .split('\n')
    .filter(line => !line.startsWith('ZEUS_ADMIN_ACCEPTANCE_'))
  fs.writeFileSync(envFile, `${lines.join('\n')}\n`, { mode: 0o600 })
  fs.chmodSync(envFile, 0o600)
}

async function waitForAdminHealth(layout: DeploymentLayout): Promise<void> {
  const url = `http://127.0.0.1:${layout.ports.admin}/api/health`
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // wait for the recreated container
    }
    await new Promise(resolve => setTimeout(resolve, 2_000))
  }
  throw new Error('recreated Admin container did not become healthy')
}

function cleanupLocalDeployment(
  options: TransactionOptions,
  envFile: string,
): void {
  composeDown(options, envFile, true)
  const layout = createLocalLayout(options)
  fs.rmSync(layout.dataDirs.admin, { recursive: true, force: true })
  fs.rmSync(layout.dataDirs.ai, { recursive: true, force: true })
  fs.rmSync(envFile, { force: true })
}

// ---------------------------------------------------------------------------
// Compose and health

function composeUp(options: TransactionOptions, envFile: string): void {
  compose(options, envFile, ['up', '-d', '--wait', '--wait-timeout', '240'])
}

function composeDown(
  options: TransactionOptions,
  envFile: string,
  volumes = false,
): void {
  const args = ['down', '--remove-orphans']
  if (volumes) args.push('-v')
  const result = compose(options, envFile, args, false)
  if (result.status !== 0) {
    console.warn('[stage2] compose down returned a non-zero status')
  }
}

function compose(
  options: TransactionOptions,
  envFile: string,
  args: readonly string[],
  required = true,
): ReturnType<typeof spawnSync> {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--project-name',
      options.projectName,
      '--env-file',
      envFile,
      '-f',
      options.composeFile,
      ...args,
    ],
    { encoding: 'utf8', stdio: required ? 'inherit' : 'pipe' },
  )
  if (required && result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed`)
  }
  return result
}

export function healthUrls(layout: DeploymentLayout): string[] {
  return [
    `http://127.0.0.1:${layout.ports.playgroundHost}/`,
    `http://127.0.0.1:${layout.ports.playgroundSandbox}/sandbox.html`,
    `http://127.0.0.1:${layout.ports.admin}/api/health`,
    `http://127.0.0.1:${layout.ports.workbench}/ai-host/health`,
  ]
}

async function waitForHealth(
  layout: DeploymentLayout,
  options: TransactionOptions,
): Promise<void> {
  for (const url of healthUrls(layout)) {
    let last = 'no response'
    for (let attempt = 0; attempt < 90; attempt += 1) {
      try {
        const response = await fetch(url)
        last = `${response.status}`
        if (response.ok) break
      } catch (error) {
        last = error instanceof Error ? error.message : String(error)
      }
      await new Promise(resolve => setTimeout(resolve, 2_000))
      if (attempt === 89) {
        const logs = spawnSync(
          'docker',
          [
            'compose',
            '--project-name',
            options.projectName,
            '--env-file',
            path.join(options.stateDir, 'runtime.env'),
            '-f',
            options.composeFile,
            'logs',
            '--no-color',
            '--tail',
            '100',
          ],
          { encoding: 'utf8' },
        )
        throw new Error(
          `health check failed: ${url}: ${last}${logs.stdout ? `\n${logs.stdout}` : ''}`,
        )
      }
    }
  }
}

function waitForHealthSync(layout: DeploymentLayout): boolean {
  for (const url of healthUrls(layout)) {
    let ok = false
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = spawnSync(
        process.execPath,
        [
          '-e',
          `fetch(${JSON.stringify(url)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
        ],
        { encoding: 'utf8' },
      )
      if (result.status === 0) {
        ok = true
        break
      }
      sleepSync(2_000)
    }
    if (!ok) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Acceptance and manifests

function writeAcceptanceManifest(
  options: TransactionOptions,
  layout: DeploymentLayout,
  envFile: string,
): string {
  const directory = path.join(options.stateDir, 'acceptance')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const provenanceName = 'provenance.json'
  fs.copyFileSync(options.provenanceFile, path.join(directory, provenanceName))
  let manifest: unknown
  if (options.mode === 'online') {
    const created = createOnlineManifest({
      layout,
      coreCommit: options.coreCommit,
      uiCommit: options.uiCommit,
      images: options.images,
      provenanceFile: path.join(directory, provenanceName),
    })
    if (!created.manifest) throw new Error(created.errors.join('; '))
    const provenance = JSON.parse(
      fs.readFileSync(options.provenanceFile, 'utf8'),
    ) as Record<string, unknown>
    const verified = verifyProvenance(provenance, created.manifest)
    if (verified.errors.length > 0) {
      throw new Error(verified.errors.join('; '))
    }
    manifest = created.manifest
  } else {
    manifest = {
      schema: 'zeus.deployment-manifest/v2',
      coreCommit: options.coreCommit,
      uiCommit: options.uiCommit,
      sandboxUrl: layout.sandboxUrl,
      products: [
        localProduct(
          'webc-studio',
          layout.products['webc-studio'],
          options.coreCommit,
          options.images.playground!,
        ),
        localProduct(
          'native-lab',
          layout.products['native-lab'],
          options.coreCommit,
          options.images.playground!,
        ),
        localProduct(
          'admin',
          layout.products.admin,
          options.coreCommit,
          options.images.admin!,
        ),
        localProduct(
          'ai-workbench',
          layout.products['ai-workbench'],
          options.uiCommit,
          options.images.workbench!,
        ),
      ],
      provenance: provenanceName,
    }
  }
  const file = path.join(directory, 'deployment.json')
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  })
  void envFile
  return file
}

function localProduct(
  product: string,
  url: string,
  commit: string,
  image: TransactionImage,
): Record<string, unknown> {
  return {
    product,
    url,
    commit,
    repository: product === 'ai-workbench' ? 'baicie/zeus-ui' : 'baicie/zeus',
    artifactDigest: image.artifactDigest,
    imageDigest: image.imageDigest,
  }
}

async function runAcceptance(
  options: TransactionOptions,
  layout: DeploymentLayout,
  manifestFile: string,
  phase: 'candidate' | 'already-deployed',
  runtime: RuntimeConfiguration,
): Promise<{ decision: string; file: string }> {
  process.env.ZEUS_ACCEPTANCE_ADMIN_EMAIL = runtime.acceptanceEmail
  process.env.ZEUS_ACCEPTANCE_ADMIN_PASSWORD = runtime.acceptancePassword
  process.env.ZEUS_ACCEPTANCE_AI_REPLAY = 'true'
  process.env.ZEUS_ACCEPTANCE_TENANT = options.tenant
  const report = await runDeploymentAcceptance({
    manifestFile,
    mode: options.mode,
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
    engines:
      options.browsers.length > 0
        ? options.browsers
        : options.mode === 'online'
          ? ['chromium', 'firefox', 'webkit']
          : ['chromium'],
    writeMode: 'isolated',
    tenant: options.tenant,
    provenanceFile: path.join(path.dirname(manifestFile), 'provenance.json'),
  })
  const expected =
    options.mode === 'online' ? 'ONLINE_ACCEPTED' : 'LOCAL_VALIDATED'
  const file = path.join(
    options.artifactDir,
    phase === 'candidate'
      ? options.mode === 'online'
        ? 'deployment-acceptance.json'
        : 'stage2-local-acceptance.json'
      : 'deployment-acceptance.repeat.json',
  )
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
  if (report.decision !== expected) {
    throw new Error(`deployment acceptance failed: ${report.decision}`)
  }
  return { decision: report.decision, file }
}

// ---------------------------------------------------------------------------
// Idempotency, state and reporting

function isAlreadyDeployed(
  options: TransactionOptions,
  layout: DeploymentLayout,
  previous: PreviousState,
): boolean {
  const stateFile = path.join(options.stateDir, 'deployment-state.json')
  if (!fs.existsSync(stateFile)) return false
  let state: Record<string, unknown>
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return false
  }
  if (
    state.coreCommit !== options.coreCommit ||
    state.uiCommit !== options.uiCommit
  ) {
    return false
  }
  const images = state.images as Record<string, string> | undefined
  if (!images) return false
  for (const [key, image] of Object.entries(options.images)) {
    if (images[key] !== image.imageDigest) return false
    const container = previous.containers[key]
    if (!container?.running) return false
    if (container.imageId !== image.imageDigest) return false
  }
  return true
}

function writeDeploymentState(
  options: TransactionOptions,
  layout: DeploymentLayout,
  deployId: string,
): void {
  fs.writeFileSync(
    path.join(options.stateDir, 'deployment-state.json'),
    `${JSON.stringify(
      {
        schema: 'zeus.deployment-state/v1',
        deployId,
        coreCommit: options.coreCommit,
        uiCommit: options.uiCommit,
        deployedAt: new Date().toISOString(),
        projectName: options.projectName,
        containers: layout.containers,
        ports: layout.ports,
        images: Object.fromEntries(
          Object.entries(options.images).map(([key, image]) => [
            key,
            image.imageDigest,
          ]),
        ),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
}

export function acquireDeploymentLock(stateDir: string): {
  release: () => void
} {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  const file = path.join(stateDir, 'deployment.lock')
  const acquire = (): number | undefined => {
    try {
      return fs.openSync(file, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      return undefined
    }
  }
  let fd = acquire()
  if (fd === undefined) {
    const stale = lockIsStale(file)
    if (!stale) {
      throw new Error(
        'another deployment holds the lock; concurrent deployments are refused',
      )
    }
    fs.rmSync(file, { force: true })
    fd = acquire()
  }
  if (fd === undefined) throw new Error('failed to acquire the deployment lock')
  fs.writeSync(
    fd,
    `${JSON.stringify({
      pid: process.pid,
      hostname: os.hostname(),
      startedAt: new Date().toISOString(),
    })}\n`,
  )
  let released = false
  return {
    release() {
      if (released) return
      released = true
      fs.closeSync(fd!)
      fs.rmSync(file, { force: true })
    },
  }
}

function lockIsStale(file: string): boolean {
  try {
    const stat = fs.statSync(file)
    if (Date.now() - stat.mtimeMs > 2 * 60 * 60 * 1000) return true
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      pid?: number
      hostname?: string
    }
    if (value.hostname !== os.hostname() || typeof value.pid !== 'number') {
      return false
    }
    try {
      process.kill(value.pid, 0)
      return false
    } catch {
      return true
    }
  } catch {
    return false
  }
}

function assertSafeStateDirectory(options: TransactionOptions): void {
  if (!path.isAbsolute(options.stateDir)) {
    throw new Error('deployment state directory must be absolute')
  }
  if (options.stateDir === '/') {
    throw new Error('deployment state directory must not be /')
  }
  const artifact = fs.realpathSync(options.artifactDir)
  const state = path.resolve(options.stateDir)
  if (state === artifact || state.startsWith(`${artifact}${path.sep}`)) {
    throw new Error(
      'deployment state directory must not be inside the artifact bundle',
    )
  }
}

function writeTransactionReport(
  options: TransactionOptions,
  report: TransactionReport,
): void {
  const reports = path.join(options.stateDir, 'reports')
  fs.mkdirSync(reports, { recursive: true, mode: 0o700 })
  fs.writeFileSync(
    path.join(reports, `${report.deployId}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  )
  fs.writeFileSync(
    path.join(options.artifactDir, 'deployment-transaction.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}

function summarizePrevious(previous: PreviousState): PreviousStateSummary {
  return {
    containers: Object.fromEntries(
      Object.entries(previous.containers).map(([key, container]) => [
        key,
        {
          name: container.name,
          imageId: container.imageId,
          running: container.running,
          ...(container.health ? { health: container.health } : {}),
        },
      ]),
    ),
    buildInfoDigests: previous.buildInfos,
  }
}

// ---------------------------------------------------------------------------
// Docker helpers

/**
 * Loads the four archives after the previous deployment has been captured.
 * The previous containers keep their image IDs, so replacing a tag cannot
 * change what a rollback restarts. Compose then deploys the verified IDs.
 */
function loadAndVerifyImages(images: Record<string, TransactionImage>): void {
  for (const [key, image] of Object.entries(images)) {
    const archive = image.ociArchive
    if (!archive || !fs.existsSync(archive)) {
      throw new Error(`image archive for ${key} is missing`)
    }
    const loaded = spawnSync('docker', ['load', '--input', archive], {
      encoding: 'utf8',
    })
    if (loaded.status !== 0) throw new Error(`docker load failed for ${key}`)
    const byTag = dockerCapture(
      ['image', 'inspect', '--format', '{{.Id}}', image.image],
      undefined,
      [],
    )
    if (byTag.status !== 0 || stdoutText(byTag).trim() !== image.imageDigest) {
      throw new Error(`loaded image ${key} tag does not match the candidate`)
    }
    const byId = dockerCapture(
      ['image', 'inspect', '--format', '{{.Id}}', image.imageDigest],
      undefined,
      [],
    )
    if (byId.status !== 0 || stdoutText(byId).trim() !== image.imageDigest) {
      throw new Error(`loaded image ${key} ID does not match the candidate`)
    }
  }
}

function inspectContainer(name: string):
  | {
      image: string
      imageId: string
      running: boolean
      health?: string
      mounts: string[]
      env: Record<string, string>
    }
  | undefined {
  const result = dockerCapture(
    ['inspect', '--format', '{{json .}}', name],
    undefined,
    [],
  )
  if (result.status !== 0) return undefined
  const value = JSON.parse(stdoutText(result)) as {
    Image?: string
    State?: { Running?: boolean; Health?: { Status?: string } }
    Mounts?: Array<{ Source?: string; Destination?: string }>
    Config?: { Image?: string; Env?: string[] }
  }
  const env: Record<string, string> = {}
  for (const entry of value.Config?.Env ?? []) {
    const separator = entry.indexOf('=')
    if (separator <= 0) continue
    env[entry.slice(0, separator)] = entry.slice(separator + 1)
  }
  return {
    image: value.Config?.Image ?? value.Image ?? '',
    imageId: value.Image ?? '',
    running: value.State?.Running === true,
    ...(value.State?.Health?.Status
      ? { health: value.State.Health.Status }
      : {}),
    mounts: (value.Mounts ?? []).map(
      mount => `${mount.Source}:${mount.Destination}`,
    ),
    env,
  }
}

function publishedPortOwners(): Map<number, string> {
  const result = dockerCapture(
    ['ps', '--format', '{{.Names}}\t{{.Ports}}'],
    undefined,
    [],
  )
  const owners = new Map<number, string>()
  if (result.status !== 0) return owners
  for (const line of stdoutText(result).split('\n')) {
    const [name, ports = ''] = line.split('\t')
    if (!name) continue
    for (const match of ports.matchAll(
      /(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):(\d+)->/g,
    )) {
      owners.set(Number(match[1]), name)
    }
  }
  return owners
}

function aiDatabaseFile(env: Record<string, string>): string {
  try {
    const tenants = JSON.parse(env.ZEUS_AI_TENANTS ?? '[]') as Array<{
      databaseFile?: string
    }>
    return tenants[0]?.databaseFile ?? '/data/ai.sqlite'
  } catch {
    return '/data/ai.sqlite'
  }
}

function fetchJsonDigest(url: string): string | undefined {
  if (!url) return undefined
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `fetch(${JSON.stringify(url)}).then(async r=>{if(!r.ok)process.exit(1);const t=await r.text();process.stdout.write(t)}).catch(()=>process.exit(1))`,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  )
  if (result.status !== 0) return undefined
  try {
    const value = JSON.parse(stdoutText(result)) as { artifactDigest?: unknown }
    return typeof value.artifactDigest === 'string'
      ? value.artifactDigest
      : undefined
  } catch {
    return undefined
  }
}

function dockerCapture(
  prefix: readonly string[],
  target: string | undefined,
  args: readonly string[],
  allowFailure = false,
): ReturnType<typeof spawnSync> {
  const command = ['docker', ...prefix]
  if (target) command.push(target)
  command.push(...args)
  const result = spawnSync(command[0]!, command.slice(1), {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0 && !allowFailure) {
    return result
  }
  return result
}

function injectFailure(
  injection: FailureInjection,
  step: FailureInjection,
): void {
  if (injection === step) {
    throw new Error(`injected deployment failure at ${step}`)
  }
}

function lastLine(value: string): string {
  const lines = value.trim().split('\n')
  return lines[lines.length - 1] ?? ''
}

function stdoutText(result: ReturnType<typeof spawnSync>): string {
  if (typeof result.stdout === 'string') return result.stdout
  return result.stdout ? result.stdout.toString('utf8') : ''
}

function sleepSync(milliseconds: number): void {
  const shared = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(shared), 0, 0, milliseconds)
}

function randomToken(): string {
  return createHash('sha256')
    .update(`${process.pid}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 24)
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}
