/**
 * CLI for the image size gate.
 *
 * ## Why this file is bundled before CI runs it
 *
 * The first version was invoked as `node --import tsx scripts/…-cli.ts` from
 * `admin-image.yml`. That job never runs `pnpm install` — it builds an image,
 * not the repository — so `tsx` was not resolvable and the gate died with
 * `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'` before measuring anything.
 * A gate that cannot start is a gate that does not run, which is the same
 * outcome as the `0.0 MB` bug it replaced.
 *
 * The fix keeps the TypeScript source (typed, unit-tested) and adds a build
 * step that bundles it into `scripts/release/image-size-gate.mjs`: a single
 * file whose only imports are `node:` builtins. `admin-image.yml` runs that
 * file with the Node already on the runner. No package install, no version
 * drift, no download at run time.
 *
 *   pnpm build:image-gate     # regenerate the bundle after editing this file
 *
 * `scripts/release/__tests__/image-size-gate-bundle.spec.ts` asserts the
 * bundle exists, imports nothing but `node:`, and matches the current source,
 * so a stale bundle fails the test suite rather than production.
 *
 * ## Input modes
 *
 *   --manifest <path>   a local JSON file already fetched from the registry
 *   --reference <ref>   a registry reference; the manifest is fetched with
 *                       `docker buildx imagetools inspect --raw`, which returns
 *                       the real manifest body rather than a descriptor.
 *   --digest <sha256:…> the digest the caller already knows (the build job has
 *                       it in `steps.build.outputs.digest`). Strongly preferred:
 *                       it pins the measurement to the bytes that were built.
 *
 * ## Pinning
 *
 * A tag can be repointed between the build and the measurement, so a report
 * that only names a tag can describe a different image than the one measured.
 * With `--reference`, the flow is:
 *
 *   1. resolve the tag to a digest once;
 *   2. when `--digest` is also given, require the two to agree — a mismatch is
 *      a failure, never a silent fallback to either one;
 *   3. fetch and measure `name@digest` from then on.
 *
 * An index is resolved by selecting exactly one platform, and both the index
 * digest and the platform manifest digest are reported.
 */
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import {
  evaluateBudget,
  measureImageSize,
  measurePinned,
  parsePlatform,
  renderSummary,
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
 * Reads the digest a reference currently resolves to.
 *
 * `--raw` returns the manifest body, which cannot contain its own digest: a
 * registry addresses a manifest *by* that digest. The digest therefore comes
 * from the non-raw inspection, whose `Digest:` line is the resolved manifest.
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options.manifest && !options.reference) {
    throw new Error('Pass --manifest <path> or --reference <registry-ref>.')
  }

  const platform = parsePlatform(options.platform)

  let result: ImageSizeResult
  let measuredDigest = ''
  let referenceDigest = ''
  let indexResolved = false
  let referenceLabel = ''

  try {
    if (options.manifest) {
      const document = JSON.parse(fs.readFileSync(options.manifest, 'utf8'))
      result = await measureImageSize(document, {
        platform,
        ...(options.digest ? { digest: options.digest } : {}),
      })
      measuredDigest = options.digest ?? (result.ok ? result.digest : '')
      referenceDigest = measuredDigest
    } else {
      const reference = options.reference!
      const pinned = await measurePinned({
        reference,
        ...(options.digest ? { knownDigest: options.digest } : {}),
        platform,
        fetchRaw: inspectRaw,
        resolveDigest,
      })
      result = pinned.result
      measuredDigest = pinned.measuredDigest
      referenceDigest = pinned.referenceDigest
      indexResolved = pinned.indexResolved
      referenceLabel = reference
    }
  } catch (error) {
    result = {
      ok: false,
      reason: 'resolution-failed',
      problems: [error instanceof Error ? error.message : String(error)],
    }
  }

  const evaluation = evaluateBudget(result, options.budgetMb)
  const summary = renderSummary(result, evaluation, {
    ...(referenceLabel ? { reference: referenceLabel } : {}),
    ...(measuredDigest ? { digest: measuredDigest } : {}),
    ...(referenceDigest && referenceDigest !== measuredDigest
      ? { indexDigest: referenceDigest }
      : {}),
    indexResolved,
  })

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          measurement: result,
          evaluation,
          digest: { measured: measuredDigest, reference: referenceDigest },
          indexResolved,
        },
        null,
        2,
      ),
    )
  } else {
    console.log(
      result.ok
        ? `image size: ${evaluation.mb.toFixed(1)} MB (budget ${evaluation.budgetMb} MB)`
        : `image size: UNMEASURED — ${result.reason}`,
    )
    if (measuredDigest) {
      console.log(
        indexResolved
          ? `index digest: ${referenceDigest}\nplatform digest: ${measuredDigest}`
          : `digest: ${measuredDigest}`,
      )
    }
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

/**
 * Runs only when this file is the process entry point.
 *
 * The bundle is a CLI, but it is still a module: importing it must not start a
 * measurement. The test suite imports the source and the bundle checks import
 * the built file, so a bare `void main()` would make an import exit the process
 * with a usage error.
 */
function isMain(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href
  } catch {
    return false
  }
}

if (isMain()) {
  void main().catch(error => {
    console.error(
      `image-size-gate: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  })
}
