/**
 * Deterministic build metadata for a product artifact. The digest is computed
 * over every deployed file (excluding build-info.json) so a change to any
 * asset changes the digest. CI uses this digest to bind an artifact or image
 * to the checked-out Core/UI commits; online acceptance compares the served
 * build-info.json with the CI-generated provenance record.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const BUILD_INFO_SCHEMA = 'zeus.build-info/v1'
export const PROVENANCE_SCHEMA = 'zeus.provenance/v1'

export interface BuildInfoFile {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface BuildInfo {
  readonly schema: typeof BUILD_INFO_SCHEMA
  readonly products: readonly string[]
  readonly coreCommit: string
  readonly uiCommit: string
  readonly version: string
  readonly builtAt: string
  readonly artifactDigest: string
  readonly files: readonly BuildInfoFile[]
}

export interface ProvenanceProduct {
  readonly product: string
  readonly artifactDigest: string
  readonly imageDigest?: string
  readonly archive?: string
  readonly buildInfo: BuildInfo
}

export interface ProvenanceRecord {
  readonly schema: typeof PROVENANCE_SCHEMA
  readonly coreCommit: string
  readonly uiCommit: string
  readonly runId: string
  readonly runUrl: string
  readonly createdAt: string
  readonly products: readonly ProvenanceProduct[]
}

export function collectArtifactFiles(distDir: string): BuildInfoFile[] {
  const files: BuildInfoFile[] = []
  const walk = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (relative === 'build-info.json') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute, relative)
      } else if (entry.isFile()) {
        const content = fs.readFileSync(absolute)
        files.push({
          path: relative,
          sha256: createHash('sha256').update(content).digest('hex'),
          bytes: content.byteLength,
        })
      }
    }
  }
  walk(distDir, '')
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

export function computeArtifactDigest(files: readonly BuildInfoFile[]): string {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(`${file.path}\0${file.sha256}\n`)
  }
  return `sha256:${hash.digest('hex')}`
}

export function createBuildInfo(options: {
  readonly distDir: string
  readonly products: readonly string[]
  readonly coreCommit: string
  readonly uiCommit: string
  readonly version: string
  readonly builtAt: string
}): BuildInfo {
  if (!/^[0-9a-f]{40}$/i.test(options.coreCommit)) {
    throw new Error('coreCommit must be a full 40-character commit')
  }
  if (!/^[0-9a-f]{40}$/i.test(options.uiCommit)) {
    throw new Error('uiCommit must be a full 40-character commit')
  }
  const files = collectArtifactFiles(options.distDir)
  if (files.length === 0)
    throw new Error('artifact contains no deployable files')
  return {
    schema: BUILD_INFO_SCHEMA,
    products: [...new Set(options.products)].sort(),
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
    version: options.version,
    builtAt: options.builtAt,
    artifactDigest: computeArtifactDigest(files),
    files,
  }
}

export function writeBuildInfo(info: BuildInfo, distDir: string): string {
  const output = path.join(distDir, 'build-info.json')
  fs.writeFileSync(output, `${JSON.stringify(info, null, 2)}\n`)
  return output
}

export function verifyDeployedBuildInfo(
  value: unknown,
  expected: {
    readonly products: readonly string[]
    readonly coreCommit: string
    readonly uiCommit: string
    readonly artifactDigest: string
    readonly imageDigest?: string
  },
): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['build-info must be an object']
  if (value.schema !== BUILD_INFO_SCHEMA) {
    errors.push(`build-info schema must be ${BUILD_INFO_SCHEMA}`)
  }
  const products = Array.isArray(value.products)
    ? value.products.filter((item): item is string => typeof item === 'string')
    : []
  for (const product of expected.products) {
    if (!products.includes(product)) {
      errors.push(`build-info is missing product ${product}`)
    }
  }
  if (value.coreCommit !== expected.coreCommit) {
    errors.push(
      `build-info coreCommit ${String(value.coreCommit)} does not match ${expected.coreCommit}`,
    )
  }
  if (value.uiCommit !== expected.uiCommit) {
    errors.push(
      `build-info uiCommit ${String(value.uiCommit)} does not match ${expected.uiCommit}`,
    )
  }
  if (value.artifactDigest !== expected.artifactDigest) {
    errors.push(
      `build-info artifactDigest ${String(value.artifactDigest)} does not match ${expected.artifactDigest}`,
    )
  }
  if (
    expected.imageDigest &&
    value.imageDigest !== undefined &&
    value.imageDigest !== expected.imageDigest
  ) {
    errors.push(
      `build-info imageDigest ${String(value.imageDigest)} does not match ${expected.imageDigest}`,
    )
  }
  if (typeof value.builtAt !== 'string' || !value.builtAt) {
    errors.push('build-info builtAt must be a non-empty string')
  }
  return errors
}

export function verifyProvenance(
  value: unknown,
  expected: {
    readonly coreCommit: string
    readonly uiCommit: string
    readonly products: readonly {
      readonly product: string
      readonly artifactDigest: string
      readonly imageDigest?: string
    }[]
  },
): { record?: ProvenanceRecord; errors: string[] } {
  if (!isRecord(value)) return { errors: ['provenance must be an object'] }
  const errors: string[] = []
  if (value.schema !== PROVENANCE_SCHEMA) {
    errors.push(`provenance schema must be ${PROVENANCE_SCHEMA}`)
  }
  if (value.coreCommit !== expected.coreCommit) {
    errors.push('provenance coreCommit does not match the manifest')
  }
  if (value.uiCommit !== expected.uiCommit) {
    errors.push('provenance uiCommit does not match the manifest')
  }
  if (typeof value.runId !== 'string' || !value.runId) {
    errors.push('provenance runId must be a non-empty string')
  }
  const records = Array.isArray(value.products) ? value.products : []
  for (const product of expected.products) {
    const record = records.find(
      entry => isRecord(entry) && entry.product === product.product,
    )
    if (!isRecord(record)) {
      errors.push(`provenance is missing ${product.product}`)
      continue
    }
    if (record.artifactDigest !== product.artifactDigest) {
      errors.push(
        `provenance ${product.product} artifactDigest does not match the manifest`,
      )
    }
    if (product.imageDigest && record.imageDigest !== product.imageDigest) {
      errors.push(
        `provenance ${product.product} imageDigest does not match the manifest`,
      )
    }
    if (!isRecord(record.buildInfo)) {
      errors.push(`provenance ${product.product} buildInfo is missing`)
    }
  }
  return errors.length > 0
    ? { errors }
    : { record: value as unknown as ProvenanceRecord, errors }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function main(): void {
  const { values } = parseArgs({
    options: {
      product: { type: 'string' },
      dist: { type: 'string' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      version: { type: 'string' },
      'built-at': { type: 'string' },
      output: { type: 'string' },
    },
  })
  const products = (values.product ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  if (products.length === 0) throw new Error('--product is required')
  if (!values.dist) throw new Error('--dist is required')
  if (!values['core-commit']) throw new Error('--core-commit is required')
  if (!values['ui-commit']) throw new Error('--ui-commit is required')
  if (!values.version) throw new Error('--version is required')
  const info = createBuildInfo({
    distDir: path.resolve(values.dist),
    products,
    coreCommit: values['core-commit'],
    uiCommit: values['ui-commit'],
    version: values.version,
    builtAt: values['built-at'] ?? new Date().toISOString(),
  })
  const written = writeBuildInfo(info, path.resolve(values.dist))
  if (values.output) {
    fs.mkdirSync(path.dirname(path.resolve(values.output)), { recursive: true })
    fs.writeFileSync(
      path.resolve(values.output),
      `${JSON.stringify(info, null, 2)}\n`,
    )
  }
  console.log(
    `build-info ${products.join(',')}: ${info.artifactDigest} (${path.relative(process.cwd(), written)})`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
