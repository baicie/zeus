/**
 * The final delivery verdict: is this version actually shippable (R23 TASK 24).
 *
 * `check:rc-readiness` answers a different question — is the *tree* ready for
 * review. It looks at the worktree, the SBOM, secrets, packed consumers and the
 * approval environments. All of that can pass while the published artifacts are
 * unusable, which is exactly rc.3: a clean tree, green gates, and seven of
 * thirty-two packages on the registry with no runtime among them.
 *
 * So this evaluates the eight things a consumer actually depends on, and any one
 * of them is enough to refuse:
 *
 *   registry-complete     all 32 packages at this version
 *   framework-complete    shared, signal, runtime-dom, runtime-ssr, zeus
 *   native-install        the platform package installs and loads
 *   runtime-install       a consumer can install and use the runtime
 *   create-zeus           the scaffold builds and starts
 *   provenance            the published packages carry attestations
 *   dist-tags             `latest` points only at stable versions
 *   core-ui-pairing       the Core and UI commits are a recorded pair
 *
 * ## NOT_RUN and BLOCKED refuse, exactly like FAILED
 *
 * The one rule this file exists to enforce. An input that was never collected
 * is not a pass; a check that could not run because a token was missing is not a
 * pass. R22's `UNVERIFIED` experience was that a claim-based gate passes
 * automatically for anything nobody claimed — so the verdict is computed from
 * "did every check pass", not from "did any check fail".
 *
 * The functions here take already-collected results. Collecting them needs the
 * registry, credentials and real installs, and that lives in the command that
 * calls this; what is testable without any of those is the decision rule, and
 * the rule is where a mistake would be invisible.
 */

export type DeliveryStatus = 'PASS' | 'FAILED' | 'BLOCKED' | 'NOT_RUN'

export interface DeliveryCheck {
  readonly id: string
  /** What a consumer loses if this does not pass. */
  readonly stakes: string
  readonly status: DeliveryStatus
  /** What was observed. Required even for PASS: a bare "ok" proves nothing. */
  readonly evidence: string
}

export interface DeliveryInput {
  readonly version: string
  readonly commit: string
  readonly checks: readonly DeliveryCheck[]
}

export type DeliveryDecision =
  | 'READY'
  | 'NOT_READY'
  /** Every check passed, but something required was never collected. */
  | 'INCOMPLETE'

export interface DeliveryReport {
  readonly schema: 'zeus.delivery-readiness/v1'
  readonly version: string
  readonly commit: string
  readonly decision: DeliveryDecision
  readonly checks: readonly DeliveryCheck[]
  /** One line per non-passing check, quoting its evidence. */
  readonly blockers: readonly string[]
  /** One line per check that is NOT_RUN or BLOCKED, whatever the decision. */
  readonly unverified: readonly string[]
}

/** The checks a delivery report must contain, in the order they are reported. */
export const REQUIRED_DELIVERY_CHECKS = [
  'registry-complete',
  'framework-complete',
  'native-install',
  'runtime-install',
  'create-zeus',
  'provenance',
  'dist-tags',
  'core-ui-pairing',
] as const

/**
 * The delivery decision.
 *
 * Three outcomes rather than two, because "we did not look" and "we looked and
 * it is broken" lead to different next actions: one needs a credential, the
 * other needs a fix.
 */
export function evaluateDelivery(input: DeliveryInput): DeliveryReport {
  const checks = [...input.checks]
  const present = new Set(checks.map(check => check.id))

  // A required check that is absent from the input is NOT_RUN, not skipped.
  // Constructing it here rather than trusting the caller means a collector that
  // forgot one cannot produce a READY verdict by omission.
  for (const id of REQUIRED_DELIVERY_CHECKS) {
    if (!present.has(id)) {
      checks.push({
        id,
        stakes: 'unknown: this check was never supplied',
        status: 'NOT_RUN',
        evidence: 'the collector did not produce a result for this check',
      })
    }
  }

  // Every check must say something, even when it passes. A PASS with empty
  // evidence is a claim, and claims are what this gate is replacing.
  const emptyEvidence = checks.filter(
    check => check.evidence.trim().length === 0,
  )
  if (emptyEvidence.length > 0) {
    throw new Error(
      `these checks passed no evidence: ${emptyEvidence.map(check => check.id).join(', ')}`,
    )
  }

  const blockers = checks
    .filter(check => check.status !== 'PASS')
    .map(check => `${check.id}: ${check.evidence}`)
  const unverified = checks
    .filter(check => check.status === 'NOT_RUN' || check.status === 'BLOCKED')
    .map(check => `${check.id}: ${check.evidence}`)

  const decision: DeliveryDecision =
    blockers.length > 0
      ? unverified.length > 0 &&
        checks.every(check => check.status !== 'FAILED')
        ? // Nothing was found broken, but something was not looked at. Saying
          // NOT_READY would imply a defect; saying READY would imply coverage.
          'INCOMPLETE'
        : 'NOT_READY'
      : 'READY'

  return {
    schema: 'zeus.delivery-readiness/v1',
    version: input.version,
    commit: input.commit,
    decision,
    checks,
    blockers,
    unverified,
  }
}

/**
 * Builds one check, refusing the shapes that make a gate quiet.
 *
 * A result whose status and evidence disagree — `PASS` with "could not read the
 * registry", or `FAILED` with "everything is fine" — is the failure mode this
 * whole file is about, so it throws rather than reporting.
 */
export function deliveryCheck(
  id: (typeof REQUIRED_DELIVERY_CHECKS)[number] | (string & {}),
  status: DeliveryStatus,
  evidence: string,
  stakes: string,
): DeliveryCheck {
  if (evidence.trim().length === 0) {
    throw new Error(`${id}: a check must report what it observed`)
  }
  return { id, status, evidence, stakes }
}
