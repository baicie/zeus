/**
 * The image size gate.
 *
 * `admin-image.yml` used to read the image size from
 * `docker buildx imagetools inspect --format '{{json .Manifest}}'`. That
 * template does not return an OCI manifest — it returns only
 * `{ mediaType, digest, size }`, the descriptor of the manifest *itself*.
 * `(m.layers || [])` was therefore always the empty array, the computed size
 * was always 0.0 MB, and the gate passed on every build no matter how large
 * the image grew. The observed CI line
 * `image size: 0.0 MB (budget 120 MB)` was this defect, not a genuinely small
 * image.
 *
 * This module replaces that expression with an explicit resolver:
 *
 *   1. Accept either an OCI image manifest or an OCI image index. An index is
 *      resolved by selecting exactly one platform; picking a single platform
 *      is what makes a multi-platform index report one architecture's size.
 *   2. Validate every media type before reading anything out of it, so a
 *      registry that returns a manifest list where a manifest was expected —
 *      or the reverse — fails instead of silently producing a number.
 *   3. Refuse an empty layer list. An image with no layers is not a valid
 *      image, and treating it as 0 bytes is precisely the fail-open behaviour
 *      being removed.
 *   4. Verify each layer's size is a non-negative integer and that the total
 *      is non-zero.
 *
 * Anything this module cannot measure is reported as a failure with a reason,
 * never as zero.
 */

/** OCI image manifest media type. */
export const OCI_IMAGE_MANIFEST =
  'application/vnd.oci.image.manifest.v1+json' as const
/** OCI image index media type. */
export const OCI_IMAGE_INDEX =
  'application/vnd.oci.image.index.v1+json' as const
/** Docker schema 2 manifest media type, still emitted by some registries. */
export const DOCKER_IMAGE_MANIFEST =
  'application/vnd.docker.distribution.manifest.v2+json' as const
/** Docker schema 2 manifest list media type. */
export const DOCKER_MANIFEST_LIST =
  'application/vnd.docker.distribution.manifest.list.v2+json' as const

const MANIFEST_TYPES: ReadonlySet<string> = new Set([
  OCI_IMAGE_MANIFEST,
  DOCKER_IMAGE_MANIFEST,
])

const INDEX_TYPES: ReadonlySet<string> = new Set([
  OCI_IMAGE_INDEX,
  DOCKER_MANIFEST_LIST,
])

export interface TargetPlatform {
  readonly os: string
  readonly architecture: string
  readonly variant?: string
}

export const DEFAULT_PLATFORM: TargetPlatform = {
  os: 'linux',
  architecture: 'amd64',
}

export interface LayerSize {
  readonly mediaType: string
  readonly digest: string
  readonly size: number
}

export interface Descriptor {
  readonly mediaType?: string
  readonly digest?: string
  readonly size?: number
  readonly platform?: {
    readonly os?: string
    readonly architecture?: string
    readonly variant?: string
  }
}

export interface ImageSizeMeasurement {
  readonly ok: true
  /** Sum of layer sizes in bytes, excluding the config blob. */
  readonly bytes: number
  /** The resolved manifest digest, so a report names exactly what was measured. */
  readonly digest: string
  /** Layer count, for the job summary. */
  readonly layerCount: number
  /** The platform actually measured. Always present, even for a bare manifest. */
  readonly platform: TargetPlatform
  /** True when an index had to be resolved to reach this manifest. */
  readonly resolvedFromIndex: boolean
  /** Descriptor of each layer, so a report can attribute bloat. */
  readonly layers: readonly LayerSize[]
}

export interface ImageSizeFailure {
  readonly ok: false
  readonly reason: string
  /** Every check that failed, so one run reports all of them. */
  readonly problems: readonly string[]
}

export type ImageSizeResult = ImageSizeMeasurement | ImageSizeFailure

export interface ResolveOptions {
  readonly platform?: TargetPlatform
  /** Resolves an index entry to the manifest it points at. */
  readonly resolveIndex?: (descriptor: Descriptor) => Promise<unknown> | unknown
  /** The digest of the document being measured, when the caller knows it. */
  readonly digest?: string
}

/**
 * Parses a descriptor's `size` field. A missing, negative, non-integer, or
 * non-finite size is a failure, not a zero: an unreadable layer is exactly the
 * case the old gate turned into a pass.
 */
function readSize(
  value: unknown,
  label: string,
  problems: string[],
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${label}: size is not a finite number (got ${typeof value})`)
    return undefined
  }
  if (!Number.isInteger(value)) {
    problems.push(`${label}: size is not an integer (${value})`)
    return undefined
  }
  if (value < 0) {
    problems.push(`${label}: size is negative (${value})`)
    return undefined
  }
  return value
}

function platformMatches(
  candidate: Descriptor['platform'],
  target: TargetPlatform,
): boolean {
  if (!candidate) return false
  if (candidate.os !== target.os) return false
  if (candidate.architecture !== target.architecture) return false
  if (target.variant !== undefined && candidate.variant !== target.variant) {
    return false
  }
  return true
}

function formatPlatform(platform: TargetPlatform): string {
  return `${platform.os}/${platform.architecture}${platform.variant ? `/${platform.variant}` : ''}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Measures an image's compressed size from a parsed registry document.
 *
 * `document` is whatever the registry returned after Accept negotiation: an
 * image manifest, an image index (multi-platform), or a malformed value.
 * `resolveIndex` is called when an index must be followed to its per-platform
 * manifest descriptor; the caller performs the fetch because this module does
 * no I/O.
 */
export async function measureImageSize(
  document: unknown,
  options: ResolveOptions = {},
): Promise<ImageSizeResult> {
  const platform = options.platform ?? DEFAULT_PLATFORM

  if (!isRecord(document)) {
    return {
      ok: false,
      reason: 'manifest-not-an-object',
      problems: [`manifest is not an object (got ${typeof document})`],
    }
  }

  const mediaType =
    typeof document.mediaType === 'string' ? document.mediaType : undefined
  if (mediaType === undefined) {
    return {
      ok: false,
      reason: 'missing-media-type',
      problems: ['manifest has no mediaType, so its shape cannot be trusted'],
    }
  }

  if (INDEX_TYPES.has(mediaType)) {
    return resolveIndexDocument(document, mediaType, platform, options)
  }

  if (!MANIFEST_TYPES.has(mediaType)) {
    return {
      ok: false,
      reason: 'unsupported-media-type',
      problems: [`unsupported media type: ${mediaType}`],
    }
  }

  return measureManifest(document, mediaType, platform, options.digest)
}

async function resolveIndexDocument(
  document: Record<string, unknown>,
  mediaType: string,
  platform: TargetPlatform,
  options: ResolveOptions,
): Promise<ImageSizeResult> {
  const manifests = document.manifests
  if (!Array.isArray(manifests) || manifests.length === 0) {
    return {
      ok: false,
      reason: 'index-without-manifests',
      problems: [`index ${mediaType} has no manifests array`],
    }
  }

  const entries = manifests.filter(isRecord) as readonly Descriptor[]
  const matched = entries.filter(descriptor =>
    platformMatches(descriptor.platform, platform),
  )

  if (matched.length === 0) {
    const available = entries
      .map(
        descriptor =>
          `${descriptor.platform?.os ?? '?'}/${descriptor.platform?.architecture ?? '?'}`,
      )
      .join(', ')
    return {
      ok: false,
      reason: 'platform-not-found',
      problems: [
        `index does not contain ${formatPlatform(platform)}; it offers: ${available || 'nothing'}`,
      ],
    }
  }

  if (matched.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous-platform',
      problems: [
        `index contains ${matched.length} entries for ${formatPlatform(platform)}; refusing to guess`,
      ],
    }
  }

  const target = matched[0]!
  if (!options.resolveIndex) {
    return {
      ok: false,
      reason: 'index-needs-resolution',
      problems: [
        `manifest for ${formatPlatform(platform)} is an index entry; a resolver is required to read its layers`,
      ],
    }
  }

  const resolved = await options.resolveIndex(target)
  const nested = await measureImageSize(resolved, {
    platform,
    digest: target.digest,
  })
  if (!nested.ok) return nested

  return {
    ...nested,
    resolvedFromIndex: true,
    digest: target.digest ?? nested.digest,
  }
}

function measureManifest(
  document: Record<string, unknown>,
  mediaType: string,
  platform: TargetPlatform,
  digest: string | undefined,
): ImageSizeResult {
  const layers = document.layers
  if (!Array.isArray(layers)) {
    return {
      ok: false,
      reason: 'manifest-without-layers',
      problems: [
        `manifest ${mediaType} has no layers array; the descriptor returned by ` +
          '`imagetools inspect --format {{json .Manifest}}` has this shape and is ' +
          'not the image itself',
      ],
    }
  }
  if (layers.length === 0) {
    return {
      ok: false,
      reason: 'empty-layers',
      problems: [
        'manifest has an empty layers array; an image with no layers is not measurable',
      ],
    }
  }

  const problems: string[] = []
  const measured: LayerSize[] = []
  let total = 0

  layers.forEach((layer, index) => {
    const label = `layers[${index}]`
    if (!isRecord(layer)) {
      problems.push(`${label}: not an object`)
      return
    }
    const layerMediaType =
      typeof layer.mediaType === 'string' ? layer.mediaType : ''
    const layerDigest = typeof layer.digest === 'string' ? layer.digest : ''
    if (layerMediaType === '') problems.push(`${label}: mediaType is missing`)
    if (!/^sha256:[0-9a-f]{64}$/.test(layerDigest)) {
      problems.push(`${label}: digest is not a sha256:<64 hex> value`)
    }
    const size = readSize(layer.size, label, problems)
    if (size === undefined) return
    total += size
    measured.push({ mediaType: layerMediaType, digest: layerDigest, size })
  })

  if (problems.length > 0) {
    return { ok: false, reason: 'invalid-layers', problems }
  }

  if (total <= 0) {
    return {
      ok: false,
      reason: 'zero-size',
      problems: [
        'every layer reports 0 bytes; a zero total is not a valid measurement',
      ],
    }
  }

  const manifestDigest =
    digest ?? (typeof document.digest === 'string' ? document.digest : '')

  return {
    ok: true,
    bytes: total,
    digest: manifestDigest,
    layerCount: measured.length,
    platform,
    resolvedFromIndex: false,
    layers: measured,
  }
}

export interface BudgetEvaluation {
  readonly ok: boolean
  readonly bytes: number
  readonly mb: number
  readonly budgetMb: number
  readonly problems: readonly string[]
}

/**
 * Applies a megabyte budget to a measurement.
 *
 * A failure to measure is a failure to pass: the caller must never treat an
 * unreadable image as small.
 */
export function evaluateBudget(
  result: ImageSizeResult,
  budgetMb: number,
): BudgetEvaluation {
  if (!result.ok) {
    return {
      ok: false,
      bytes: 0,
      mb: 0,
      budgetMb,
      problems: [
        `size is UNMEASURED (${result.reason}): ${result.problems.join('; ')}`,
      ],
    }
  }
  if (!Number.isFinite(budgetMb) || budgetMb <= 0) {
    return {
      ok: false,
      bytes: result.bytes,
      mb: result.bytes / 1024 / 1024,
      budgetMb,
      problems: [`budget is not a positive number (got ${budgetMb})`],
    }
  }
  const mb = result.bytes / 1024 / 1024
  const withinBudget = mb <= budgetMb
  return {
    ok: withinBudget,
    bytes: result.bytes,
    mb,
    budgetMb,
    problems: withinBudget
      ? []
      : [`image is ${mb.toFixed(1)} MB, over the ${budgetMb} MB budget`],
  }
}

/** Parses `linux/amd64` or `linux/arm64/v8` into the shape the resolver compares. */
export function parsePlatform(value: string): TargetPlatform {
  const [os, architecture, variant] = value.split('/')
  if (!os || !architecture) {
    throw new Error(
      `Invalid platform "${value}"; expected os/architecture[/variant]`,
    )
  }
  return variant ? { os, architecture, variant } : { os, architecture }
}

export function formatPlatformForReport(platform: TargetPlatform): string {
  return formatPlatform(platform)
}

/** Renders the measurement and the budget outcome as a job-summary table. */
export function renderSummary(
  result: ImageSizeResult,
  evaluation: BudgetEvaluation,
  options: { readonly reference?: string } = {},
): string {
  const lines: string[] = []
  lines.push('### Image size')
  lines.push('')
  lines.push('| field | value |')
  lines.push('| --- | --- |')
  if (options.reference) lines.push(`| image | \`${options.reference}\` |`)
  if (result.ok) {
    lines.push(`| platform | ${formatPlatform(result.platform)} |`)
    lines.push(`| digest | \`${result.digest || 'unknown'}\` |`)
    lines.push(`| layers | ${result.layerCount} |`)
    lines.push(
      `| size | ${evaluation.mb.toFixed(1)} MB (${evaluation.bytes} B) |`,
    )
    lines.push(
      `| resolved from index | ${result.resolvedFromIndex ? 'yes' : 'no'} |`,
    )
  } else {
    lines.push(`| size | UNMEASURED — ${result.reason} |`)
    lines.push(
      `| problems | ${result.problems.map(problem => `\`${problem}\``).join('<br>')} |`,
    )
  }
  lines.push(`| budget | ${evaluation.budgetMb} MB |`)
  lines.push(`| result | ${evaluation.ok ? 'PASS' : 'FAIL'} |`)
  if (evaluation.problems.length > 0) {
    lines.push('')
    for (const problem of evaluation.problems) lines.push(`- ${problem}`)
  }
  return `${lines.join('\n')}\n`
}
