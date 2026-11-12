/**
 * CLI for the image size gate.
 *
 * Two input modes:
 *
 *   --manifest <path>   a local JSON file already fetched from the registry
 *                       (used by the tests and by a dry run)
 *   --reference <ref>   a registry reference; the manifest is fetched with
 *                       `docker buildx imagetools inspect --raw`, which returns
 *                       the real manifest body rather than a descriptor.
 *
 * `--raw` is the load-bearing flag: the previous implementation used
 * `--format '{{json .Manifest}}'`, whose output is a descriptor
 * (`{mediaType, digest, size}`) with no `layers` array. That is how the gate
 * came to report 0.0 MB and pass every build.
 *
 * When the reference resolves to an index, the per-platform manifest is fetched
 * by digest through the same command, so no HTTP client is needed here.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

import {
  evaluateBudget,
  measureImageSize,
  parsePlatform,
  renderSummary,
  type Descriptor,
  type ImageSizeResult,
} from './image-size-gate'

interface Options {
  readonly manifest?: string
  readonly reference?: string
  readonly digest?: string
  readonly platform: string
  readonly budgetMb: number
  readonly summaryFile?: string
  readonly json: boolean
}

function parseArgs(argv: readonly string[]): Options {
  const options: Record<string, string | boolean> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (!arg.startsWith('--')) continue
    const name = arg.slice(2)
    if (name === 'json') {
      options.json = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`)
    }
    options[name] = value
    index += 1
  }

  const budgetRaw = String(options['budget-mb'] ?? '120')
  const budgetMb = Number(budgetRaw)
  if (!Number.isFinite(budgetMb) || budgetMb <= 0) {
    throw new Error(
      `--budget-mb must be a positive number (got "${budgetRaw}")`,
    )
  }

  return {
    manifest: options.manifest ? String(options.manifest) : undefined,
    reference: options.reference ? String(options.reference) : undefined,
    digest: options.digest ? String(options.digest) : undefined,
    platform: String(options.platform ?? 'linux/amd64'),
    budgetMb,
    summaryFile: options['summary-file']
      ? String(options['summary-file'])
      : undefined,
    json: Boolean(options.json),
  }
}

function inspectRaw(reference: string): unknown {
  const output = execFileSync(
    'docker',
    ['buildx', 'imagetools', 'inspect', '--raw', reference],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  return JSON.parse(output)
}

/**
 * Reads the digest of the manifest a reference resolves to.
 *
 * `--raw` returns the manifest body, which carries no digest of itself: a
 * registry addresses a manifest *by* its digest, so the body cannot contain
 * one. The digest is therefore read from the non-raw inspection, whose first
 * `Digest:` line is the resolved manifest. Recording it matters because a
 * report that names only a tag can describe a different image than the one
 * that was measured.
 */
function resolveDigest(reference: string): string {
  const output = execFileSync(
    'docker',
    ['buildx', 'imagetools', 'inspect', reference],
    { encoding: 'utf8' },
  )
  const match = /^Digest:\s+(sha256:[0-9a-f]{64})\s*$/m.exec(output)
  return match?.[1] ?? ''
}

function resolveIndexByDigest(
  reference: string,
  descriptor: Descriptor,
): unknown {
  if (!descriptor.digest) {
    throw new Error('Index entry has no digest, so it cannot be resolved.')
  }
  // `<repo>@sha256:…` pins the exact manifest the index selected.
  const repository = reference.split(':')[0]!.split('@')[0]!
  return inspectRaw(`${repository}@${descriptor.digest}`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options.manifest && !options.reference) {
    throw new Error('Pass --manifest <path> or --reference <registry-ref>.')
  }

  const platform = parsePlatform(options.platform)
  const document = options.manifest
    ? JSON.parse(fs.readFileSync(options.manifest, 'utf8'))
    : inspectRaw(options.reference!)

  // A tag can be repointed between the measurement and the report, so the
  // digest of the manifest actually measured is recorded and printed.
  const digest =
    options.digest ??
    (options.reference ? resolveDigest(options.reference) : '')

  let result: ImageSizeResult
  try {
    result = await measureImageSize(document, {
      platform,
      ...(digest ? { digest } : {}),
      ...(options.reference
        ? {
            resolveIndex: (descriptor: Descriptor) =>
              resolveIndexByDigest(options.reference!, descriptor),
          }
        : {}),
    })
  } catch (error) {
    result = {
      ok: false,
      reason: 'resolution-failed',
      problems: [error instanceof Error ? error.message : String(error)],
    }
  }

  const evaluation = evaluateBudget(result, options.budgetMb)
  const summary = renderSummary(result, evaluation, {
    ...(options.reference ? { reference: options.reference } : {}),
  })

  if (options.json) {
    console.log(JSON.stringify({ measurement: result, evaluation }, null, 2))
  } else {
    console.log(
      result.ok
        ? `image size: ${evaluation.mb.toFixed(1)} MB (budget ${evaluation.budgetMb} MB)`
        : `image size: UNMEASURED — ${result.reason}`,
    )
    for (const problem of evaluation.problems) console.error(problem)
  }

  if (options.summaryFile) {
    fs.appendFileSync(options.summaryFile, `\n${summary}`)
  }

  if (!evaluation.ok) {
    if (result.ok) {
      console.error(
        `::error::image is ${evaluation.mb.toFixed(1)} MB, over the ${evaluation.budgetMb} MB budget`,
      )
    } else {
      console.error(
        `::error::image size could not be measured (${result.reason}); refusing to pass`,
      )
    }
    process.exitCode = 1
  }
}

void main().catch(error => {
  console.error(
    `image-size-gate: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
})
