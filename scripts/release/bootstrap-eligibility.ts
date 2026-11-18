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
  /**
   * Evidence that this release recovers a previously failed RC.
   *
   * Absent for an ordinary first-RC bootstrap. Present only for `rc.N` with
   * N > 0, and refused unless every field can be established.
   */
  readonly recovery?: RecoveryEvidence
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

/**
 * Evidence that a previous RC failed before publishing anything.
 *
 * Every field is something the caller established from GitHub or the registry;
 * none of it is read from the pairing record under test. A recovery that cannot
 * show all of it is refused, because the alternative is a path that lets any
 * `rc.N` publish unpaired by claiming a failure nobody verified.
 */
export interface RecoveryEvidence {
  /**
   * The failed version, e.g. `0.2.0-rc.0`. Must be the immediately preceding
   * RC of the same line: skipping ahead would let rc.2 ride on rc.0's failure.
   */
  readonly failedVersion: string
  /** The tag exists and this is the commit it points at. */
  readonly failedTagCommit: string
  /** The workflow run that failed, and the tag SHA it started from. */
  readonly failedRunId: string
  readonly failedRunTagCommit: string
  /**
   * Whether that run reached any npm publish step. `false` is required: a run
   * that published some packages cannot be recovered by publishing a new
   * version, because the previous version is already partially out there.
   */
  readonly failedRunReachedPublish: boolean
  /** Whether the failed version exists on the registry at all. */
  readonly failedVersionPublished: boolean
  /** The version being recovered — must not already be published. */
  readonly recoveryVersionPublished: boolean
  /** Other RCs of this line that are published and not the failed one. */
  readonly otherPublishedRcs: readonly string[]
  /** Whether a pair attestation already exists for the failed version. */
  readonly failedVersionPaired: boolean
}

/**
 * Evaluates the recovery path for `rc.N`.
 *
 * The bar is deliberately higher than ordinary bootstrap, not equal to it:
 * an ordinary bootstrap claims "nothing has been published for this line",
 * while a recovery claims "something was published but failed before any
 * artifact left" — a claim that has to be proved rather than asserted.
 */
function evaluateRecovery(
  request: BootstrapRequest,
  parsed: { line: string; channel: string; sequence: string },
  findings: AuthorizationFinding[],
): { eligible: boolean; findings: readonly AuthorizationFinding[] } {
  const refuse = (
    detail: string,
  ): { eligible: false; findings: readonly AuthorizationFinding[] } => {
    findings.push(
      finding(AUTHORIZATION_RULES.bootstrapEligibility, 'REFUSED', detail),
    )
    return { eligible: false, findings }
  }
  const recovery = request.recovery!

  if (!BOOTSTRAPPABLE_CHANNELS.has(parsed.channel)) {
    return refuse(
      `${request.version} is a ${parsed.channel} prerelease; recovery, like bootstrap, is an rc-only path`,
    )
  }

  /*
   * Only the immediately preceding RC. `rc.2` after a failed `rc.1` is a
   * second failure, not a recovery of the first, and treating it as one would
   * let an unbounded chain of unpaired publications hang off one failure.
   */
  const expectedFailed = `${parsed.line}-${parsed.channel}.${Number(parsed.sequence) - 1}`
  if (recovery.failedVersion !== expectedFailed) {
    return refuse(
      `recovery of ${request.version} must recover ${expectedFailed}, the immediately preceding RC; ${recovery.failedVersion} is not it`,
    )
  }

  if (recovery.failedRunTagCommit !== recovery.failedTagCommit) {
    return refuse(
      `the failed run started from ${recovery.failedRunTagCommit}, but v${recovery.failedVersion} points at ${recovery.failedTagCommit}; the recovery would be attributed to a different tag than the one that failed`,
    )
  }

  /*
   * The claim that makes recovery safe. A run that reached publish may have
   * published some packages; publishing a new version then produces a mixed
   * release, and no amount of pairing fixes a version that is half out.
   */
  if (recovery.failedRunReachedPublish) {
    return refuse(
      `the failed run reached a publish step; a partially published version cannot be recovered by publishing another, because the packages that did land cannot be withdrawn`,
    )
  }

  if (recovery.failedVersionPublished) {
    return refuse(
      `${recovery.failedVersion} exists on the registry; recovery is only for a version whose tag exists but published nothing`,
    )
  }

  if (recovery.recoveryVersionPublished) {
    return refuse(
      `${request.version} is already published; a recovery publishes a version that is not yet on the registry`,
    )
  }

  if (recovery.otherPublishedRcs.length > 0) {
    return refuse(
      `${parsed.line} already has published RCs (${recovery.otherPublishedRcs.join(', ')}); recovery is for a line whose only RC failed before publishing`,
    )
  }

  if (recovery.failedVersionPaired) {
    return refuse(
      `${recovery.failedVersion} already has a pair attestation; a paired release must not be recovered by publishing an unpaired one`,
    )
  }

  /*
   * Same registry and in-tree checks as ordinary bootstrap. Recovery does not
   * skip them — it adds to them.
   */
  if (request.publishedVersions === undefined) {
    return refuse(
      'the registry could not be queried, so the published state of this line cannot be established; a recovery that cannot prove its premise must not proceed',
    )
  }
  if (request.existingAttestation === true) {
    return refuse(
      `an attestation for ${request.version} already exists; a paired release must not fall back to recovery`,
    )
  }
  if (request.existingPairInTree === true) {
    return refuse(
      `the in-tree record for ${request.version} already names a UI commit; this release is paired`,
    )
  }

  findings.push(
    finding(
      AUTHORIZATION_RULES.bootstrapEligibility,
      'AUTHORIZED',
      `${request.version} recovers ${recovery.failedVersion}, whose tag exists but whose run ${recovery.failedRunId} stopped before publishing anything; the line has no published RC and no pair`,
    ),
  )
  return { eligible: true, findings }
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
    /*
     * `rc.N` for N > 0 normally means an earlier RC of this line shipped, and
     * that RC carries its own pair — so bootstrapping again would publish a
     * second unpaired release for a line that already had one.
     *
     * The exception is a *failed* rc.0: a tag that exists but whose release
     * workflow stopped before any npm publish. That leaves a version number
     * occupied with nothing published, and without a recovery path the line is
     * stuck forever — the tag cannot be deleted and the published versions
     * cannot be overwritten.
     *
     * `recovery` is that path, and it is a different claim from bootstrap. It
     * is checked below against evidence the caller supplies, and it never
     * loosens the ordinary rule: with no recovery evidence, rc.1 is refused
     * exactly as before.
     */
    if (request.recovery === undefined) {
      refuse(
        `${request.version} is not the first RC of ${parsed.line}; rc.${parsed.sequence} implies an earlier RC exists, which would already carry its pair`,
      )
      return { eligible: false, findings }
    }
    return evaluateRecovery(request, parsed, findings)
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
