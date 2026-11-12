/**
 * Image reference parsing.
 *
 * The gate used `reference.split(':')[0]` to recover the repository part of a
 * reference, which is wrong twice over:
 *
 *   `registry.example.com:5000/team/app:main`
 *     split(':')[0] → `registry.example.com`   (the port ends the match)
 *
 * The repository became the bare hostname, so a follow-up request addressed a
 * different image — or failed outright on a registry that only serves the
 * namespaced path. A digest reference fails the same way.
 *
 * The grammar a container reference actually follows is:
 *
 *   [host[:port]/]path[:tag][@sha256:digest]
 *
 * where `host` is present only when the first segment contains a `.` or a `:`,
 * or is exactly `localhost`. That rule is what lets `ubuntu:22.04` mean
 * `docker.io/library/ubuntu:22.04` while `localhost:5000/app` keeps its port.
 */

export interface ImageReference {
  /** `registry.example.com:5000`, or empty when the reference has no host. */
  readonly registry: string
  /** `team/app`, without tag or digest. */
  readonly repository: string
  /** The tag, when the reference carries one. */
  readonly tag?: string
  /** `sha256:<64 hex>`, when the reference is digest-pinned. */
  readonly digest?: string
  /**
   * `host[:port]/path`, the address a registry request is made against.
   * Empty registry means the reference is relative to the default registry.
   */
  readonly name: string
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

function looksLikeHost(segment: string): boolean {
  return (
    segment === 'localhost' || segment.includes('.') || segment.includes(':')
  )
}

/**
 * Splits a reference into registry, repository, tag and digest.
 *
 * Throws on anything that cannot be resolved unambiguously, because a gate that
 * measures the wrong image and reports PASS is worse than one that stops.
 */
export function parseImageReference(value: string): ImageReference {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error('Image reference is empty.')
  }

  // The digest wins over the tag: `name:tag@sha256:…` is a valid reference whose
  // authoritative identity is the digest.
  let rest = trimmed
  let digest: string | undefined
  const atIndex = rest.indexOf('@')
  if (atIndex >= 0) {
    digest = rest.slice(atIndex + 1)
    rest = rest.slice(0, atIndex)
    if (!DIGEST_PATTERN.test(digest)) {
      throw new Error(
        `Image reference "${value}" has a digest that is not sha256:<64 hex>: "${digest}".`,
      )
    }
  }

  // A tag is the last `:` that appears after the last `/`. Anything earlier is
  // a registry port.
  let tag: string | undefined
  const lastSlash = rest.lastIndexOf('/')
  const lastColon = rest.lastIndexOf(':')
  if (lastColon > lastSlash) {
    tag = rest.slice(lastColon + 1)
    rest = rest.slice(0, lastColon)
    if (tag === '') {
      throw new Error(`Image reference "${value}" ends with an empty tag.`)
    }
  }

  const segments = rest.split('/')
  let registry = ''
  if (segments.length > 1 && looksLikeHost(segments[0]!)) {
    registry = segments.shift()!
  }
  const repository = segments.join('/')
  // A trailing separator names no image: `ghcr.io/app/` would otherwise be
  // measured as a repository literally called `app/`, and the registry request
  // built from it would 404 rather than fail here with a clear reason.
  if (repository === '' || repository.endsWith('/')) {
    throw new Error(`Image reference "${value}" has no repository path.`)
  }

  return {
    registry,
    repository,
    ...(tag !== undefined ? { tag } : {}),
    ...(digest !== undefined ? { digest } : {}),
    name: registry === '' ? repository : `${registry}/${repository}`,
  }
}

/**
 * The reference with any tag removed and the digest pinned.
 *
 * This is the form used to measure: `repo@sha256:…` cannot be repointed, so the
 * bytes measured are the bytes that were built.
 */
export function pinToDigest(reference: ImageReference, digest: string): string {
  if (!DIGEST_PATTERN.test(digest)) {
    throw new Error(
      `Cannot pin to a digest that is not sha256:<64 hex>: "${digest}".`,
    )
  }
  return `${reference.name}@${digest}`
}

/** True when the reference already names an immutable digest. */
export function isDigestPinned(reference: ImageReference): boolean {
  return reference.digest !== undefined
}

export { DIGEST_PATTERN }
