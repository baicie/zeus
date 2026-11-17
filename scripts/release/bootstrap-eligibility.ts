/**
 * Whether a release is allowed to publish unpaired.
 *
 * ## The failure this exists for
 *
 * `bootstrap: true` in a file is a claim, and a claim in a file is not
 * evidence. Before this rule, any record containing the flag skipped the UI
 * pair — including one for a stable release, or for an RC that had already
 * been published, or for a version whose pair already existed. The flag had no
 * eligibility test, so it was a universal key wearing the name of a one-off
 * exception.
 *
 * ## What actually makes bootstrap legitimate
 *
 * Exactly one situation: the first release of a new version line, where the UI
 * lockfile cannot resolve until these packages are on the registry. That
 * situation has observable preconditions, and this module checks them rather
 * than trusting the declaration:
 *
 * | Condition | How it is established |
 * | --- | --- |
 * | the version is a prerelease | the version string, which the registry will enforce anyway |
 * | it is the first RC of its line | no other `X.Y.Z-rc.*` is published |
 * | nothing at this exact version is published | registry query for the exact version |
 * | no pair exists yet | no attestation and no in-tree pair names this version |
 *
 * ## What it deliberately does not do
 *
 * It does not re-check CI, the native matrix, the SBOM, the tarballs, the tag,
 * or provenance. Those are separate rules in the authorisation and bootstrap
 * waives none of them. Reading this module alone should never suggest that a
 * bootstrap release is otherwise unchecked.
 */
import { AUTHORIZATION_RULES, finding } from './release-authorization'

import type { AuthorizationFinding } from './release-authorization'

export const BOOTSTRAP_POLICY_VERSION = 'zeus.bootstrap-policy/v1'

/** Prerelease identifiers that may bootstrap. Stable is excluded by name. */
const BOOTSTRAPPABLE_CHANNELS = new Set(['rc'])

export interface BootstrapRequest {
  readonly version: string
  /** The record declared `bootstrap: true`. */
  readonly declared: boolean
  /**
   * Versions of this package already on the registry.
   *
   * `undefined` means the query failed. That is a refusal, not a pass: an
   * unreachable registry cannot distinguish "first release" from "already
   * published", and guessing in that direction publishes over a version.
   */
  readonly publishedVersions?: readonly string[]
  /** Whether an attestation for this version already exists. */
  readonly existingAttestation?: boolean
  /** Whether an in-tree pairing record for this version names a UI commit. */
  readonly existingPairInTree?: boolean
}

export interface BootstrapEligibility {
  readonly eligible: boolean
  readonly findings: readonly AuthorizationFinding[]
}

/** `X.Y.Z-<channel>.<n>` → `{ line: 'X.Y.Z', channel: 'rc', n: 'N' }`. */
export function parsePrerelease(
  version: string,
): { line: string; channel: string; sequence: string } | undefined {
  const match = /^(\d+\.\d+\.\d+)-([a-z]+)\.(\d+)$/i.exec(version)
  if (!match) return undefined
  return {
    line: match[1]!,
    channel: match[2]!.toLowerCase(),
    sequence: match[3]!,
  }
}

/**
 * Whether any other prerelease of the same line is already published.
 *
 * `0.2.0-rc.1` must not bootstrap even if `0.2.0-rc.0` was never published:
 * the point of the exception is the *first* release of a line, and a second
 * RC implies the first one is out there, pairing and all.
 */
export function publishedPrereleasesOfLine(
  versions: readonly string[],
  line: string,
): string[] {
  return versions.filter(version => {
    const parsed = parsePrerelease(version)
    return parsed !== undefined && parsed.line === line
  })
}

export function evaluateBootstrapEligibility(
  request: BootstrapRequest,
): BootstrapEligibility {
  const findings: AuthorizationFinding[] = []
  const refuse = (detail: string): void => {
    findings.push(
      finding(AUTHORIZATION_RULES.bootstrapEligibility, 'REFUSED', detail),
    )
  }

  if (!request.declared) {
    /*
     * Not a bootstrap release. Nothing to authorise and nothing to refuse —
     * this rule is silent rather than passing, because a passing verdict here
     * would read as "a bootstrap was considered and approved".
     */
    return { eligible: false, findings }
  }

  const parsed = parsePrerelease(request.version)
  if (!parsed) {
    refuse(
      `${request.version} is not a prerelease; a stable version has no bootstrap case, because its UI lockfile can always be produced before the tag`,
    )
    return { eligible: false, findings }
  }

  if (!BOOTSTRAPPABLE_CHANNELS.has(parsed.channel)) {
    refuse(
      `${request.version} is a ${parsed.channel} prerelease; only an rc may bootstrap, and the channel is decided by the version, not by the record`,
    )
    return { eligible: false, findings }
  }

  if (parsed.sequence !== '0') {
    refuse(
      `${request.version} is not the first RC of ${parsed.line}; rc.${parsed.sequence} implies an earlier RC exists, which would already carry its pair`,
    )
    return { eligible: false, findings }
  }

  if (request.publishedVersions === undefined) {
    refuse(
      'the registry could not be queried, so "this version has never been published" cannot be established; a release that cannot tell first-publication from republication must not publish',
    )
    return { eligible: false, findings }
  }

  if (request.publishedVersions.includes(request.version)) {
    refuse(
      `${request.version} is already published; bootstrap is for a first publication only, and a published version cannot be re-released`,
    )
    return { eligible: false, findings }
  }

  const earlier = publishedPrereleasesOfLine(
    request.publishedVersions,
    parsed.line,
  ).filter(version => version !== request.version)
  if (earlier.length > 0) {
    refuse(
      `${parsed.line} already has published prereleases (${earlier.join(', ')}); bootstrap is for a new version line, and a line that has shipped an RC already has its pairing path`,
    )
    return { eligible: false, findings }
  }

  if (request.existingAttestation === true) {
    refuse(
      `an attestation for ${request.version} already exists; a paired release must not fall back to bootstrap, which would discard the pair that was already proven`,
    )
    return { eligible: false, findings }
  }

  if (request.existingPairInTree === true) {
    refuse(
      `the in-tree record for ${request.version} already names a UI commit; this release is paired, and bootstrap would publish it as unpaired`,
    )
    return { eligible: false, findings }
  }

  findings.push(
    finding(
      AUTHORIZATION_RULES.bootstrapEligibility,
      'AUTHORIZED',
      `${request.version} is the first RC of ${parsed.line}, is not published, and has no existing pair; it may publish unpaired`,
    ),
  )
  return { eligible: true, findings }
}
