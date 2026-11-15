/**
 * Reads the source commit out of a published package's SLSA provenance.
 *
 * The previous conclusion in this repository was that npm provenance attests
 * only *which workflow published a package*, not which commit was built. That
 * was drawn from the `publish/v0.1` attestation and it is wrong: packages
 * published with `provenance: true` also carry a SLSA v1 attestation whose
 * `resolvedDependencies` names the source commit.
 *
 * Measured for `@zeus-web/button@0.1.0-beta.34`:
 *
 *   uri:       git+https://github.com/baicie/zeus-ui@refs/tags/v0.1.0-beta.34
 *   gitCommit: a8826dd1f81560aaf6459d8d40a3e599f705f6e0
 *
 * and that commit exists in the UI repository and is what `v0.1.0-beta.34`
 * points at. So the source commit of a published UI package *is* verifiable —
 * for packages published after provenance was enabled.
 */
export const SLSA_PROVENANCE_V1 = 'https://slsa.dev/provenance/v1'

export interface AttestationSource {
  /** The commit the build was made from, per the attestation. */
  readonly commit: string
  /** The repository that commit belongs to. */
  readonly repository: string
  /** The ref the build was made from, when the attestation names one. */
  readonly ref?: string
}

interface AttestationEntry {
  readonly predicateType?: unknown
  readonly bundle?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Extracts the source commit from an attestation response.
 *
 * Returns `undefined` rather than throwing: a package published without
 * provenance simply has no answer here, and that is a fact to record, not an
 * error to fail on. The caller decides whether the absence blocks a release.
 */
export function readAttestationSource(
  response: unknown,
): AttestationSource | undefined {
  if (!isRecord(response) || !Array.isArray(response.attestations)) {
    return undefined
  }
  for (const entry of response.attestations as AttestationEntry[]) {
    if (!isRecord(entry)) continue
    if (entry.predicateType !== SLSA_PROVENANCE_V1) continue
    const bundle = entry.bundle
    if (!isRecord(bundle)) continue
    const envelope = bundle.dsseEnvelope
    if (!isRecord(envelope)) continue
    const payload = envelope.payload
    if (typeof payload !== 'string') continue

    let document: unknown
    try {
      document = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    } catch {
      continue
    }
    if (!isRecord(document)) continue
    const predicate = document.predicate
    if (!isRecord(predicate)) continue
    const definition = predicate.buildDefinition
    if (!isRecord(definition)) continue

    const dependencies = Array.isArray(definition.resolvedDependencies)
      ? definition.resolvedDependencies
      : []
    for (const dependency of dependencies) {
      if (!isRecord(dependency)) continue
      const uri = dependency.uri
      const digest = dependency.digest
      if (typeof uri !== 'string' || !isRecord(digest)) continue
      const commit = digest.gitCommit
      if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) continue
      /*
       * `git+https://github.com/baicie/zeus-ui@refs/tags/v0.1.0-beta.34`
       * -> repository `baicie/zeus-ui`, ref `refs/tags/v0.1.0-beta.34`.
       */
      const match =
        /^git\+https:\/\/github\.com\/([^/@]+)\/([^/@]+)(?:@(.+))?$/.exec(uri)
      if (!match) continue
      return {
        commit,
        repository: `${match[1]}/${match[2]}`,
        ...(match[3] ? { ref: match[3] } : {}),
      }
    }
  }
  return undefined
}

/**
 * Whether an attestation names the repository and commit a package claims.
 *
 * A package that records `sourceCommit: X` is making a claim. This is how that
 * claim is checked against something the publisher cannot rewrite after the
 * fact.
 */
export function attestationMatches(
  observed: AttestationSource | undefined,
  expected: { readonly repository: string; readonly commit?: string },
): boolean {
  if (!observed) return false
  if (observed.repository !== expected.repository) return false
  if (expected.commit !== undefined && observed.commit !== expected.commit) {
    return false
  }
  return true
}
