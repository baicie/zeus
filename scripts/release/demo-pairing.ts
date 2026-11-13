/**
 * The pairing manifest for the published demos.
 *
 * The demos are built from two repositories in one CI job: `baicie/zeus`
 * (Admin) and `baicie/zeus-ui` (AI Workbench). Nothing in a Pages deployment
 * records which pair of commits produced it, so a published demo could name a
 * commit it was not built from — which is exactly what happened before R6:
 * `ai-demo-recording.json.uiCommit` carried the *Core* SHA, because the
 * workflow passed `GITHUB_SHA` to `--ui-commit` after checking the UI out from
 * a moving branch.
 *
 * This module makes the pairing a first-class artifact:
 *
 * - both commits are full 40-character SHAs, resolved from the checkouts, not
 *   from an environment variable that may describe the other repository;
 * - each product's deployed files are digested with the same algorithm as
 *   `build-info.ts`, so the manifest binds bytes as well as commits;
 * - the metadata file each product ships (`demo-snapshot.json`,
 *   `ai-demo-recording.json`) is digested and its embedded commit must equal
 *   the manifest's;
 * - `verifyDemoPairing` fails closed on a missing field, a short or non-hex
 *   SHA, an unknown product, a digest mismatch, or a pairing that disagrees
 *   with the expected commits.
 *
 * Verification is pure: it reads the site directory and never writes, pushes,
 * builds an image or restarts a service. Publishing is the workflow's job, and
 * a test run must not be able to reach it.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { collectArtifactFiles, computeArtifactDigest } from './build-info'

export const DEMO_PAIRING_SCHEMA = 'zeus.demo-pairing/v1'

/** The manifest sits at the site root, next to the two product directories. */
export const DEMO_PAIRING_FILE = 'demo-pairing.json'

/** The two builds this repository publishes, and the metadata each ships. */
export const DEMO_PRODUCTS = {
  admin: {
    directory: 'admin',
    metadata: 'demo-snapshot.json',
    schema: 'zeus.admin-demo/v1',
    coreCommitField: 'coreCommit',
    uiCommitField: 'uiCommit',
  },
  ai: {
    directory: 'ai',
    metadata: 'ai-demo-recording.json',
    schema: 'zeus.ai-demo/v1',
    coreCommitField: 'coreCommit',
    uiCommitField: 'uiCommit',
  },
} as const

export type DemoProductName = keyof typeof DEMO_PRODUCTS

const FULL_SHA = /^[0-9a-f]{40}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/

export interface DemoProductRecord {
  readonly product: DemoProductName
  /** sha256 over every deployed file under the product directory. */
  readonly artifactDigest: string
  readonly files: number
  readonly bytes: number
  /** The metadata file the product ships and its own digest. */
  readonly metadata: { readonly file: string; readonly digest: string }
}

export interface DemoPairing {
  readonly schema: typeof DEMO_PAIRING_SCHEMA
  readonly createdAt: string
  readonly coreCommit: string
  readonly uiCommit: string
  readonly coreVersion: string
  readonly uiVersion: string
  /** Where the pair was produced, so a published site can be traced back. */
  readonly build: {
    readonly workflow: string
    readonly runId?: string
    readonly runUrl?: string
  }
  readonly products: readonly DemoProductRecord[]
  /** Digest over the whole site, `demo-pairing.json` excluded. */
  readonly siteDigest: string
}

export interface DemoPairingExpectation {
  readonly coreCommit?: string
  readonly uiCommit?: string
  readonly coreVersion?: string
  readonly uiVersion?: string
  readonly products?: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function digestOf(file: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
}

function fileStats(directory: string): { files: number; bytes: number } {
  const files = collectArtifactFiles(directory)
  return {
    files: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  }
}

/**
 * Reads a product's shipped metadata and returns the two commits it names.
 *
 * The metadata is the second, independent statement of the pairing: a manifest
 * that says one thing while the shipped recording says another is a pairing
 * mismatch, not a cosmetic difference, because the demo replays that file.
 */
export function readDemoMetadata(
  siteDir: string,
  product: DemoProductName,
): {
  schema?: unknown
  coreCommit?: unknown
  uiCommit?: unknown
  digest: string
} {
  const spec = DEMO_PRODUCTS[product]
  const file = path.join(siteDir, spec.directory, spec.metadata)
  if (!fs.existsSync(file)) {
    throw new Error(
      `demo ${product}: metadata ${spec.directory}/${spec.metadata} is missing`,
    )
  }
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!isRecord(value)) {
    throw new Error(`demo ${product}: metadata is not an object`)
  }
  return {
    schema: value.schema,
    coreCommit: value[spec.coreCommitField],
    uiCommit: value[spec.uiCommitField],
    digest: digestOf(file),
  }
}

/**
 * Builds the manifest for an assembled site.
 *
 * `createdAt` is a parameter rather than `new Date()` so a test can prove that
 * the same tree and the same inputs produce the same manifest.
 */
export function createDemoPairing(options: {
  readonly siteDir: string
  readonly coreCommit: string
  readonly uiCommit: string
  readonly coreVersion: string
  readonly uiVersion: string
  readonly createdAt: string
  readonly workflow: string
  readonly runId?: string
  readonly runUrl?: string
}): DemoPairing {
  for (const [label, commit] of [
    ['coreCommit', options.coreCommit],
    ['uiCommit', options.uiCommit],
  ] as const) {
    if (!FULL_SHA.test(commit)) {
      throw new Error(`${label} must be a full 40-character lowercase SHA`)
    }
  }
  const siteDir = path.resolve(options.siteDir)
  if (!fs.existsSync(siteDir)) {
    throw new Error(`site directory does not exist: ${siteDir}`)
  }

  const products: DemoProductRecord[] = []
  for (const product of Object.keys(DEMO_PRODUCTS) as DemoProductName[]) {
    const spec = DEMO_PRODUCTS[product]
    const directory = path.join(siteDir, spec.directory)
    if (!fs.existsSync(path.join(directory, 'index.html'))) {
      throw new Error(
        `demo ${product}: ${spec.directory}/index.html is missing; an empty demo must not be paired`,
      )
    }
    const metadata = readDemoMetadata(siteDir, product)
    if (metadata.schema !== spec.schema) {
      throw new Error(
        `demo ${product}: metadata schema ${String(metadata.schema)} != ${spec.schema}`,
      )
    }
    const files = collectArtifactFiles(directory)
    if (files.length === 0) {
      throw new Error(`demo ${product}: ${spec.directory} has no files`)
    }
    products.push({
      product,
      artifactDigest: computeArtifactDigest(files),
      ...fileStats(directory),
      metadata: { file: spec.metadata, digest: metadata.digest },
    })
  }

  // The site digest covers the landing page and dispatcher too, so a change
  // that only touches those files still changes what was published.
  const siteFiles = collectArtifactFiles(siteDir, {
    exclude: [DEMO_PAIRING_FILE],
  })

  return {
    schema: DEMO_PAIRING_SCHEMA,
    createdAt: options.createdAt,
    coreCommit: options.coreCommit,
    uiCommit: options.uiCommit,
    coreVersion: options.coreVersion,
    uiVersion: options.uiVersion,
    build: {
      workflow: options.workflow,
      ...(options.runId ? { runId: options.runId } : {}),
      ...(options.runUrl ? { runUrl: options.runUrl } : {}),
    },
    products,
    siteDigest: computeArtifactDigest(siteFiles),
  }
}

/**
 * Rejects a manifest that is malformed, names the wrong pair, or disagrees
 * with what the site actually contains.
 *
 * Every branch returns an error string instead of throwing: the CLI reports
 * all of them at once, so one run tells the operator everything to fix.
 */
export function verifyDemoPairing(
  value: unknown,
  expected: DemoPairingExpectation = {},
  siteDir?: string,
): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['demo pairing must be an object']

  if (value.schema !== DEMO_PAIRING_SCHEMA) {
    errors.push(
      `demo pairing schema ${String(value.schema)} != ${DEMO_PAIRING_SCHEMA}`,
    )
  }
  if (
    typeof value.createdAt !== 'string' ||
    !ISO_TIMESTAMP.test(value.createdAt)
  ) {
    errors.push('demo pairing createdAt is missing or not an ISO timestamp')
  }
  for (const field of ['coreCommit', 'uiCommit'] as const) {
    const commit = value[field]
    if (typeof commit !== 'string' || !FULL_SHA.test(commit)) {
      errors.push(
        `demo pairing ${field} must be a full 40-character lowercase SHA (got ${JSON.stringify(commit)})`,
      )
      continue
    }
    const wanted = expected[field]
    if (wanted !== undefined && commit !== wanted) {
      errors.push(`demo pairing ${field} ${commit} does not match ${wanted}`)
    }
  }
  for (const field of ['coreVersion', 'uiVersion'] as const) {
    const version = value[field]
    if (typeof version !== 'string' || version.trim() === '') {
      errors.push(`demo pairing ${field} is missing`)
      continue
    }
    const wanted = expected[field]
    if (wanted !== undefined && version !== wanted) {
      errors.push(`demo pairing ${field} ${version} does not match ${wanted}`)
    }
  }
  if (!isRecord(value.build) || typeof value.build.workflow !== 'string') {
    errors.push('demo pairing build.workflow is missing')
  }

  const products = value.products
  if (!Array.isArray(products)) {
    errors.push('demo pairing products is missing')
    return errors
  }
  const expectedProducts = expected.products ?? Object.keys(DEMO_PRODUCTS)
  const seen = new Set<string>()
  for (const [index, raw] of products.entries()) {
    if (!isRecord(raw)) {
      errors.push(`demo pairing products[${index}] is not an object`)
      continue
    }
    const product = raw.product
    if (typeof product !== 'string' || !(product in DEMO_PRODUCTS)) {
      errors.push(`demo pairing products[${index}].product is not known`)
      continue
    }
    seen.add(product)
    for (const field of ['artifactDigest'] as const) {
      const digest = raw[field]
      if (typeof digest !== 'string' || !DIGEST.test(digest)) {
        errors.push(`demo pairing ${product}.${field} is not a sha256 digest`)
      }
    }
    if (typeof raw.files !== 'number' || raw.files <= 0) {
      errors.push(`demo pairing ${product}.files must be a positive number`)
    }
    if (typeof raw.bytes !== 'number' || raw.bytes <= 0) {
      errors.push(`demo pairing ${product}.bytes must be a positive number`)
    }
    const metadata = raw.metadata
    const spec = DEMO_PRODUCTS[product as DemoProductName]
    if (!isRecord(metadata)) {
      errors.push(`demo pairing ${product}.metadata is missing`)
    } else {
      if (metadata.file !== spec.metadata) {
        errors.push(
          `demo pairing ${product}.metadata.file ${String(metadata.file)} != ${spec.metadata}`,
        )
      }
      if (
        typeof metadata.digest !== 'string' ||
        !DIGEST.test(metadata.digest)
      ) {
        errors.push(
          `demo pairing ${product}.metadata.digest is not a sha256 digest`,
        )
      }
    }
  }
  for (const product of expectedProducts) {
    if (!seen.has(product)) {
      errors.push(`demo pairing has no record for product ${product}`)
    }
  }
  if (typeof value.siteDigest !== 'string' || !DIGEST.test(value.siteDigest)) {
    errors.push('demo pairing siteDigest is not a sha256 digest')
  }

  // Byte-level comparison, when the caller has the site on disk.
  if (siteDir !== undefined && errors.length === 0) {
    const site = path.resolve(siteDir)
    for (const raw of products as DemoProductRecord[]) {
      const spec = DEMO_PRODUCTS[raw.product]
      const directory = path.join(site, spec.directory)
      if (!fs.existsSync(directory)) {
        errors.push(`demo ${raw.product}: ${spec.directory} is missing`)
        continue
      }
      const files = collectArtifactFiles(directory)
      const digest = computeArtifactDigest(files)
      if (digest !== raw.artifactDigest) {
        errors.push(
          `demo ${raw.product}: artifactDigest ${digest} does not match manifest ${raw.artifactDigest}`,
        )
      }
      const stats = fileStats(directory)
      if (stats.files !== raw.files || stats.bytes !== raw.bytes) {
        errors.push(
          `demo ${raw.product}: file count/bytes ${stats.files}/${stats.bytes} do not match manifest ${raw.files}/${raw.bytes}`,
        )
      }
      const metadata = readDemoMetadata(site, raw.product)
      if (metadata.digest !== raw.metadata.digest) {
        errors.push(
          `demo ${raw.product}: metadata digest ${metadata.digest} does not match manifest ${raw.metadata.digest}`,
        )
      }
      if (metadata.coreCommit !== value.coreCommit) {
        errors.push(
          `demo ${raw.product}: metadata coreCommit ${String(metadata.coreCommit)} does not match pairing ${String(value.coreCommit)}`,
        )
      }
      if (metadata.uiCommit !== value.uiCommit) {
        errors.push(
          `demo ${raw.product}: metadata uiCommit ${String(metadata.uiCommit)} does not match pairing ${String(value.uiCommit)}`,
        )
      }
    }
    const siteDigest = computeArtifactDigest(
      collectArtifactFiles(site, { exclude: [DEMO_PAIRING_FILE] }),
    )
    if (siteDigest !== value.siteDigest) {
      errors.push(
        `demo pairing siteDigest ${siteDigest} does not match manifest ${String(value.siteDigest)}`,
      )
    }
  }

  return errors
}

/**
 * Proves a manifest is a function of the site and the pair, and of nothing
 * else.
 *
 * Two independent questions, both asked of the bytes on disk:
 *
 * 1. **Determinism** — `createDemoPairing` called twice with the same inputs
 *    returns the same manifest. A digest that changed between two calls would
 *    make "the same pair produced this site" meaningless.
 * 2. **Fidelity** — recomputing from the recorded pair, the recorded timestamp
 *    and workflow reproduces the manifest that was published. If it does not,
 *    some field was written by something other than this function.
 *
 * The timestamp is an input precisely so this is checkable: `--write` stamps
 * the real time once, and verification compares against *that* stamp instead of
 * demanding today's.
 */
export function verifyDemoPairingReproducible(
  value: unknown,
  siteDir: string,
): string[] {
  const errors = verifyDemoPairing(value, {}, siteDir)
  if (errors.length > 0 || !isRecord(value)) return errors

  const input = {
    siteDir,
    coreCommit: value.coreCommit as string,
    uiCommit: value.uiCommit as string,
    coreVersion: value.coreVersion as string,
    uiVersion: value.uiVersion as string,
    createdAt: value.createdAt as string,
    workflow: (value.build as Record<string, unknown>).workflow as string,
    ...(typeof (value.build as Record<string, unknown>).runId === 'string'
      ? { runId: (value.build as Record<string, unknown>).runId as string }
      : {}),
    ...(typeof (value.build as Record<string, unknown>).runUrl === 'string'
      ? { runUrl: (value.build as Record<string, unknown>).runUrl as string }
      : {}),
  }
  let first: DemoPairing
  let second: DemoPairing
  try {
    first = createDemoPairing(input)
    second = createDemoPairing(input)
  } catch (error) {
    return [
      `demo pairing is not reproducible: ${error instanceof Error ? error.message : String(error)}`,
    ]
  }
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    errors.push('the same pair produced two different manifests')
  }
  for (const key of [
    'createdAt',
    'coreCommit',
    'uiCommit',
    'coreVersion',
    'uiVersion',
    'build',
    'products',
    'siteDigest',
  ] as const) {
    if (JSON.stringify(first[key]) !== JSON.stringify(value[key])) {
      errors.push(
        `demo pairing ${key} is not reproducible from the site and the recorded pair`,
      )
    }
  }
  return errors
}

/** Writes the manifest beside the site; the caller decides whether to publish. */
export function writeDemoPairing(
  pairing: DemoPairing,
  siteDir: string,
): string {
  const output = path.join(path.resolve(siteDir), DEMO_PAIRING_FILE)
  fs.writeFileSync(output, `${JSON.stringify(pairing, null, 2)}\n`)
  return output
}

export function readDemoPairing(siteDir: string): unknown {
  const file = path.join(path.resolve(siteDir), DEMO_PAIRING_FILE)
  if (!fs.existsSync(file)) {
    throw new Error(`demo pairing manifest is missing: ${file}`)
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
}

function main(): void {
  const { values } = parseArgs({
    options: {
      site: { type: 'string' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      'core-version': { type: 'string' },
      'ui-version': { type: 'string' },
      workflow: { type: 'string', default: 'Demos Pages' },
      'run-id': { type: 'string' },
      'run-url': { type: 'string' },
      write: { type: 'boolean', default: false },
      verify: { type: 'boolean', default: false },
      reproducible: { type: 'boolean', default: false },
    },
  })
  if (!values.site) throw new Error('--site is required')
  if (!values.write && !values.verify) {
    throw new Error('one of --write or --verify is required')
  }
  const expected: DemoPairingExpectation = {
    ...(values['core-commit'] ? { coreCommit: values['core-commit'] } : {}),
    ...(values['ui-commit'] ? { uiCommit: values['ui-commit'] } : {}),
    ...(values['core-version'] ? { coreVersion: values['core-version'] } : {}),
    ...(values['ui-version'] ? { uiVersion: values['ui-version'] } : {}),
  }

  if (values.write) {
    for (const [name, value] of [
      ['core-commit', values['core-commit']],
      ['ui-commit', values['ui-commit']],
      ['core-version', values['core-version']],
      ['ui-version', values['ui-version']],
    ] as const) {
      if (!value) throw new Error(`--${name} is required with --write`)
    }
    const pairing = createDemoPairing({
      siteDir: values.site,
      coreCommit: values['core-commit']!,
      uiCommit: values['ui-commit']!,
      coreVersion: values['core-version']!,
      uiVersion: values['ui-version']!,
      createdAt: new Date().toISOString(),
      workflow: values.workflow!,
      ...(values['run-id'] ? { runId: values['run-id'] } : {}),
      ...(values['run-url'] ? { runUrl: values['run-url'] } : {}),
    })
    const output = writeDemoPairing(pairing, values.site)
    console.log(
      `demo pairing written: core ${pairing.coreCommit.slice(0, 12)} + ui ${pairing.uiCommit.slice(0, 12)} -> ${output}`,
    )
  }

  if (values.verify) {
    const pairing = readDemoPairing(values.site)
    // The base check always runs: it compares the manifest against the expected
    // pair and the site's bytes, so the stronger check below cannot pass for a
    // site built from the wrong commits. The two error sets are unioned, never
    // substituted — a reproducibility pass must not hide a wrong-commit failure.
    const errors = verifyDemoPairing(pairing, expected, values.site)
    if (values.reproducible) {
      for (const error of verifyDemoPairingReproducible(pairing, values.site)) {
        if (!errors.includes(error)) errors.push(error)
      }
    }
    for (const error of errors) console.error(`MISMATCH ${error}`)
    console.log(
      `demo pairing ${errors.length === 0 ? 'PASS' : 'FAIL'}${values.reproducible ? ' (reproducible)' : ''}${values['core-commit'] ? ` for core ${values['core-commit'].slice(0, 12)}` : ''}${values['ui-commit'] ? ` + ui ${values['ui-commit'].slice(0, 12)}` : ''}`,
    )
    if (errors.length > 0) process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
