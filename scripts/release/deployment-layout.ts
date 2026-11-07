/**
 * Approved deployment layout and the formal online deployment manifest.
 *
 * Stage 1 produces a local manifest whose URLs are loopback addresses. That
 * document is evidence for the local acceptance only and must never be handed
 * to the online acceptance runner. This module turns an approved, checked-in
 * layout (domains, ports, container names, data directories) plus the verified
 * Stage 1 candidate into the online manifest the acceptance runner consumes.
 *
 * The layout is deployment configuration, not evidence: every URL is
 * revalidated here and again by `validateDeploymentManifest`, and the live
 * origin is verified by the acceptance runner (DNS, TLS, redirects, headers,
 * build-info). A checked-in digest pins the exact layout revision.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import {
  APPROVED_DEPLOYMENT_PORTS,
  validateDeploymentManifest,
  type DeploymentManifest,
} from './deployment-acceptance'

export const DEPLOYMENT_LAYOUT_SCHEMA = 'zeus.deployment-layout/v1'

export const REQUIRED_IMAGES = [
  'playground',
  'admin',
  'aiHost',
  'workbench',
] as const
export type ImageKey = (typeof REQUIRED_IMAGES)[number]

/** Manifest product -> candidate image key. Shared with Stage 2 validation. */
export const PRODUCT_IMAGES: Record<string, ImageKey> = {
  'webc-studio': 'playground',
  'native-lab': 'playground',
  admin: 'admin',
  'ai-workbench': 'workbench',
}

const PRODUCT_NAMES = [
  'webc-studio',
  'native-lab',
  'admin',
  'ai-workbench',
] as const
const CONTAINER_KEYS = ['playground', 'admin', 'aiHost', 'workbench'] as const
const PORT_KEYS = [
  'playgroundHost',
  'playgroundSandbox',
  'admin',
  'workbench',
] as const
const DATA_KEYS = ['admin', 'ai'] as const
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,62}$/
const SHA_PATTERN = /^sha256:[0-9a-f]{64}$/i

export interface DeploymentLayout {
  readonly schema: typeof DEPLOYMENT_LAYOUT_SCHEMA
  readonly environment: string
  readonly allowedHosts: readonly string[]
  readonly allowedPorts: readonly string[]
  readonly sandboxUrl: string
  readonly products: Record<(typeof PRODUCT_NAMES)[number], string>
  readonly containers: Record<(typeof CONTAINER_KEYS)[number], string>
  /** Containers created by earlier one-off deployments, replaced on upgrade. */
  readonly legacyContainers?: Partial<
    Record<(typeof CONTAINER_KEYS)[number], string>
  >
  readonly ports: Record<(typeof PORT_KEYS)[number], number>
  readonly dataDirs: Record<(typeof DATA_KEYS)[number], string>
  /** Optional host Caddyfile used for a read-only upstream conflict check. */
  readonly caddyFile?: string
  readonly caddyUpstreams?: Record<string, string>
}

export interface CandidateImage {
  readonly image: string
  readonly imageDigest: string
  readonly artifactDigest: string
}

export function sha256File(file: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
}

/**
 * Resolves a checked-in deployment file. The artifact directory is never a
 * source of Compose files, layouts or manifests: only files inside the
 * repository's `deploy/` directory are trusted, and symlinks are rejected.
 */
export function resolveTrustedDeploymentFile(input: {
  readonly root: string
  readonly value: string
  readonly artifactDir?: string
  readonly allowOutsideRepo?: boolean
}): string {
  if (!input.value || !path.isAbsolute(input.value)) {
    throw new Error('deployment file must be an absolute path')
  }
  const candidate = path.resolve(input.value)
  if (input.artifactDir) {
    const artifactRoot = fs.realpathSync(input.artifactDir)
    const real = fs.realpathSync(candidate)
    if (
      real === artifactRoot ||
      real.startsWith(`${artifactRoot}${path.sep}`)
    ) {
      throw new Error('deployment file must not come from the artifact bundle')
    }
  }
  const stat = fs.lstatSync(candidate)
  if (stat.isSymbolicLink()) {
    throw new Error('deployment file must not be a symlink')
  }
  if (!stat.isFile()) throw new Error('deployment file must be a regular file')
  const real = fs.realpathSync(candidate)
  if (!input.allowOutsideRepo) {
    const root = fs.realpathSync(input.root)
    const deployRoot = path.join(root, 'deploy')
    if (!real.startsWith(`${deployRoot}${path.sep}`)) {
      throw new Error('deployment file must live under the repository deploy/')
    }
  }
  return real
}

export function validateLayout(
  value: unknown,
  options: {
    readonly mode: 'local' | 'online'
    readonly environment?: string
    readonly coreCommit: string
    readonly uiCommit: string
  },
): { layout?: DeploymentLayout; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(value)) return { errors: ['layout must be an object'] }
  if (value.schema !== DEPLOYMENT_LAYOUT_SCHEMA) {
    errors.push(`layout schema must be ${DEPLOYMENT_LAYOUT_SCHEMA}`)
  }
  if (typeof value.environment !== 'string' || !value.environment.trim()) {
    errors.push('layout environment is required')
  } else if (
    options.environment !== undefined &&
    value.environment !== options.environment
  ) {
    errors.push(
      `layout environment ${value.environment} does not match ${options.environment}`,
    )
  }

  const allowedHosts = stringList(value.allowedHosts)
  const allowedPorts = stringList(value.allowedPorts)
  if (options.mode === 'online') {
    if (allowedHosts.length === 0)
      errors.push('layout allowedHosts must list the deployment domains')
    for (const host of allowedHosts) {
      if (
        !/^[a-z0-9.-]+$/i.test(host) ||
        net.isIP(host) !== 0 ||
        host.includes('..')
      ) {
        errors.push(`layout allowedHosts entry ${host} must be a DNS name`)
      }
    }
    if (allowedPorts.length === 0)
      errors.push('layout allowedPorts must list approved HTTPS ports')
    for (const port of allowedPorts) {
      if (!(APPROVED_DEPLOYMENT_PORTS as readonly string[]).includes(port)) {
        errors.push(`layout allowedPorts entry ${port} is not approved HTTPS`)
      }
    }
  }

  const sandboxUrl =
    typeof value.sandboxUrl === 'string' ? value.sandboxUrl : ''
  if (!sandboxUrl) errors.push('layout sandboxUrl is required')
  else {
    const sandbox = parseUrl(sandboxUrl, 'sandboxUrl', options.mode, errors)
    if (sandbox) {
      assertHostAndPort(
        sandbox,
        allowedHosts,
        allowedPorts,
        options.mode,
        errors,
      )
    }
  }

  const products = isRecord(value.products) ? value.products : {}
  const productUrls: Partial<Record<string, string>> = {}
  for (const product of PRODUCT_NAMES) {
    const raw = products[product]
    if (typeof raw !== 'string' || raw.length === 0) {
      errors.push(`layout product ${product} URL is required`)
      continue
    }
    productUrls[product] = raw
    const url = parseUrl(raw, `product ${product}`, options.mode, errors)
    if (!url) continue
    assertHostAndPort(url, allowedHosts, allowedPorts, options.mode, errors)
  }
  for (const key of Object.keys(products)) {
    if (!(PRODUCT_NAMES as readonly string[]).includes(key)) {
      errors.push(`layout contains unexpected product ${key}`)
    }
  }
  const sandbox = tryUrl(sandboxUrl)
  const native = tryUrl(productUrls['native-lab'] ?? '')
  if (sandbox && native && sandbox.origin === native.origin) {
    errors.push('sandboxUrl must not share the native-lab origin')
  }

  const containers = isRecord(value.containers) ? value.containers : {}
  for (const key of CONTAINER_KEYS) {
    const name = containers[key]
    if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
      errors.push(`layout container ${key} is not a safe container name`)
    }
  }
  if (new Set(Object.values(containers)).size !== CONTAINER_KEYS.length) {
    errors.push('layout container names must be unique')
  }
  for (const key of Object.keys(containers)) {
    if (!(CONTAINER_KEYS as readonly string[]).includes(key)) {
      errors.push(`layout contains unexpected container ${key}`)
    }
  }

  let legacyContainers:
    | Partial<Record<(typeof CONTAINER_KEYS)[number], string>>
    | undefined
  if (value.legacyContainers !== undefined) {
    if (!isRecord(value.legacyContainers)) {
      errors.push('layout legacyContainers must be an object')
    } else {
      legacyContainers = {}
      for (const [key, name] of Object.entries(value.legacyContainers)) {
        if (!(CONTAINER_KEYS as readonly string[]).includes(key)) {
          errors.push(`layout contains unexpected legacy container ${key}`)
          continue
        }
        if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
          errors.push(`layout legacy container ${key} is not a safe name`)
          continue
        }
        if (name === containers[key]) {
          errors.push(`layout legacy container ${key} duplicates its target`)
          continue
        }
        legacyContainers[key as (typeof CONTAINER_KEYS)[number]] = name
      }
    }
  }

  const ports = isRecord(value.ports) ? value.ports : {}
  for (const key of PORT_KEYS) {
    const port = ports[key]
    if (
      typeof port !== 'number' ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      errors.push(`layout port ${key} must be an integer TCP port`)
    }
  }
  if (new Set(Object.values(ports)).size !== PORT_KEYS.length) {
    errors.push('layout ports must be unique')
  }
  for (const key of Object.keys(ports)) {
    if (!(PORT_KEYS as readonly string[]).includes(key)) {
      errors.push(`layout contains unexpected port ${key}`)
    }
  }

  const dataDirs = isRecord(value.dataDirs) ? value.dataDirs : {}
  for (const key of DATA_KEYS) {
    const dir = dataDirs[key]
    if (
      typeof dir !== 'string' ||
      !path.isAbsolute(dir) ||
      path.normalize(dir) !== dir ||
      dir === '/'
    ) {
      errors.push(`layout data directory ${key} is not a safe absolute path`)
    }
  }
  if (new Set(Object.values(dataDirs)).size !== DATA_KEYS.length) {
    errors.push('layout data directories must be unique')
  }

  let caddyFile: string | undefined
  let caddyUpstreams: Record<string, string> | undefined
  if (value.caddyFile !== undefined) {
    if (
      typeof value.caddyFile !== 'string' ||
      !path.isAbsolute(value.caddyFile)
    ) {
      errors.push('layout caddyFile must be an absolute path')
    } else {
      caddyFile = value.caddyFile
    }
  }
  if (value.caddyUpstreams !== undefined) {
    if (!isRecord(value.caddyUpstreams)) {
      errors.push('layout caddyUpstreams must be an object')
    } else {
      caddyUpstreams = {}
      for (const [host, upstream] of Object.entries(value.caddyUpstreams)) {
        if (
          typeof upstream !== 'string' ||
          !/^[\w.-]+:\d{1,5}$/.test(upstream)
        ) {
          errors.push(`layout Caddy upstream for ${host} is invalid`)
          continue
        }
        if (!allowedHosts.includes(host)) {
          errors.push(`layout Caddy host ${host} is not in allowedHosts`)
        }
        caddyUpstreams[host] = upstream
      }
      if (
        options.mode === 'online' &&
        Object.keys(caddyUpstreams).length === 0
      ) {
        errors.push('layout caddyUpstreams must not be empty')
      }
    }
  }
  if (options.mode === 'online' && caddyFile === undefined) {
    errors.push(
      'online layout must name the host Caddyfile for conflict checks',
    )
  }
  if (options.mode === 'online' && caddyUpstreams === undefined) {
    errors.push('online layout must declare expected Caddy upstreams')
  }

  if (errors.length > 0) return { errors }
  return {
    layout: {
      schema: DEPLOYMENT_LAYOUT_SCHEMA,
      environment: String(value.environment),
      allowedHosts,
      allowedPorts,
      sandboxUrl,
      products: productUrls as DeploymentLayout['products'],
      containers: containers as DeploymentLayout['containers'],
      ...(legacyContainers === undefined ? {} : { legacyContainers }),
      ports: ports as DeploymentLayout['ports'],
      dataDirs: dataDirs as DeploymentLayout['dataDirs'],
      ...(caddyFile === undefined ? {} : { caddyFile }),
      ...(caddyUpstreams === undefined ? {} : { caddyUpstreams }),
    },
    errors,
  }
}

export function readLayout(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
}

/**
 * Builds the online manifest from the approved layout and the verified
 * candidate. Artifact and image digests come from the candidate, never from
 * the layout or the local Stage 1 manifest.
 */
export function createOnlineManifest(input: {
  readonly layout: DeploymentLayout
  readonly coreCommit: string
  readonly uiCommit: string
  readonly images: Record<string, CandidateImage>
  readonly provenanceFile: string
}): { manifest?: DeploymentManifest; errors: string[] } {
  const errors: string[] = []
  const products = PRODUCT_NAMES.map(product => {
    const image = input.images[PRODUCT_IMAGES[product]!]
    if (!image) {
      errors.push(`candidate is missing the ${product} image`)
      return undefined
    }
    return {
      product,
      url: input.layout.products[product],
      commit: product === 'ai-workbench' ? input.uiCommit : input.coreCommit,
      repository: product === 'ai-workbench' ? 'baicie/zeus-ui' : 'baicie/zeus',
      artifactDigest: image.artifactDigest,
      imageDigest: image.imageDigest,
    }
  })
  if (errors.length > 0) return { errors }
  const manifest = {
    schema: 'zeus.deployment-manifest/v2',
    coreCommit: input.coreCommit,
    uiCommit: input.uiCommit,
    allowedHosts: input.layout.allowedHosts,
    allowedPorts: input.layout.allowedPorts,
    sandboxUrl: input.layout.sandboxUrl,
    provenance: path.basename(input.provenanceFile),
    products,
  }
  const validation = validateDeploymentManifest(
    manifest,
    input.coreCommit,
    input.uiCommit,
    'online',
  )
  if (!validation.manifest) return { errors: validation.errors }
  return { manifest: validation.manifest, errors: [] }
}

export function verifyLayoutDigest(file: string, expected: string): void {
  if (!SHA_PATTERN.test(expected)) {
    throw new Error('layout digest must be sha256:<64 hex>')
  }
  const actual = sha256File(file)
  if (actual !== expected) {
    throw new Error('layout digest does not match the approved revision')
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function parseUrl(
  value: string,
  label: string,
  mode: 'local' | 'online',
  errors: string[],
): URL | undefined {
  const url = tryUrl(value)
  if (!url) {
    errors.push(`layout ${label} is not a valid URL`)
    return undefined
  }
  if (url.username || url.password) {
    errors.push(`layout ${label} must not contain credentials`)
  }
  if (mode === 'online') {
    if (url.protocol !== 'https:') {
      errors.push(`layout ${label} must use HTTPS`)
    }
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0) {
      errors.push(`layout ${label} must use a DNS hostname`)
    }
  } else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    errors.push(`layout ${label} must use HTTP(S)`)
  }
  return url
}

function assertHostAndPort(
  url: URL,
  allowedHosts: readonly string[],
  allowedPorts: readonly string[],
  mode: 'local' | 'online',
  errors: string[],
): void {
  if (mode !== 'online') return
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    errors.push(`layout URL host ${url.hostname} is not in allowedHosts`)
  }
  if (!allowedPorts.includes(url.port || '443')) {
    errors.push(`layout URL port ${url.port || '443'} is not in allowedPorts`)
  }
}

function tryUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
