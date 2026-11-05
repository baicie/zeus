/**
 * Records the CI-generated artifact digest for a product. The record is
 * merged into one provenance.json consumed by online acceptance. It is a
 * digest-bound build record, not a cryptographic signature: the trusted step
 * is the CI job that runs this script after checking out the source.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  PROVENANCE_SCHEMA,
  verifyDeployedBuildInfo,
  type BuildInfo,
  type ProvenanceProduct,
  type ProvenanceRecord,
} from './build-info'

function main(): void {
  const { values } = parseArgs({
    options: {
      product: { type: 'string' },
      dist: { type: 'string' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      'run-id': { type: 'string' },
      'run-url': { type: 'string' },
      'image-digest': { type: 'string' },
      output: { type: 'string' },
    },
  })
  const products = (values.product ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  for (const [name, value] of [
    ['product', products.length > 0],
    ['dist', values.dist],
    ['core-commit', values['core-commit']],
    ['ui-commit', values['ui-commit']],
    ['run-id', values['run-id']],
    ['run-url', values['run-url']],
    ['output', values.output],
  ] as const) {
    if (!value) throw new Error(`--${name} is required`)
  }

  const dist = path.resolve(values.dist!)
  const buildInfo = JSON.parse(
    fs.readFileSync(path.join(dist, 'build-info.json'), 'utf8'),
  ) as BuildInfo
  const errors = verifyDeployedBuildInfo(buildInfo, {
    products,
    coreCommit: values['core-commit']!,
    uiCommit: values['ui-commit']!,
    artifactDigest: buildInfo.artifactDigest,
    ...(values['image-digest'] ? { imageDigest: values['image-digest'] } : {}),
  })
  if (errors.length > 0) throw new Error(errors.join('; '))

  const output = path.resolve(values.output!)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const existing = readExisting(output)
  const record: ProvenanceRecord = {
    schema: PROVENANCE_SCHEMA,
    coreCommit: values['core-commit']!,
    uiCommit: values['ui-commit']!,
    runId: values['run-id']!,
    runUrl: values['run-url']!,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    products: [
      ...(existing?.products.filter(
        entry => !products.includes(entry.product),
      ) ?? []),
      ...products.map(
        (product): ProvenanceProduct => ({
          product,
          artifactDigest: buildInfo.artifactDigest,
          ...(values['image-digest']
            ? { imageDigest: values['image-digest'] }
            : {}),
          buildInfo,
        }),
      ),
    ].sort((left, right) => left.product.localeCompare(right.product)),
  }
  fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`)
  console.log(
    `provenance ${products.join(',')}: ${buildInfo.artifactDigest}${
      values['image-digest'] ? ` image ${values['image-digest']}` : ''
    }`,
  )
}

function readExisting(file: string): ProvenanceRecord | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ProvenanceRecord
  } catch {
    return undefined
  }
}

export function sha256File(file: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
