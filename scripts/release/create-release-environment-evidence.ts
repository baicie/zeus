/**
 * Writes the release-environment evidence record.
 *
 * Runs only inside the governance workflow, which is `workflow_dispatch`-only,
 * pinned to the `Release` environment, and holds the Administration-scoped
 * token as a repository secret. It is not referenced from PR CI: the token is
 * not reachable from a pull request, which is the whole point of the split.
 *
 * The record it writes carries the bindings `release:precheck` checks —
 * repository, environment, workflow path, run id and attempt, Core commit,
 * policy version, observed time — so a consumer can tell "this run read this
 * environment for this commit" from "some file says PASS".
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import {
  RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA,
  type ReleaseEnvironmentEvidence,
} from './release-environment-evidence'
import {
  readReleaseEnvironment,
  type ReleaseEnvironmentProbe,
} from '../check/rc-readiness'
import {
  evaluateReleaseEnvironmentPolicy,
  RELEASE_ENVIRONMENT_POLICY_VERSION,
} from '../check/release-environment-policy'

export const GOVERNANCE_WORKFLOW_PATH =
  '.github/workflows/release-governance.yml'

export interface CreateEvidenceInput {
  readonly repository: string
  readonly environment: string
  readonly runId: string
  readonly runAttempt: number
  readonly coreCommit: string
  /** Injectable, so the producer can be tested without a GitHub token. */
  readonly probe?: ReleaseEnvironmentProbe
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => number
}

export interface CreateEvidenceResult {
  readonly evidence?: ReleaseEnvironmentEvidence
  readonly errors: readonly string[]
}

/**
 * Produces the record, refusing when the environment could not be read.
 *
 * A record is only written for a `read` probe. Writing one for `unauthorized`
 * or `network_error` would put a file on disk that says nothing about the
 * environment while carrying a verdict, and a consumer that checks only the
 * verdict would accept it.
 */
export function createReleaseEnvironmentEvidence(
  input: CreateEvidenceInput,
): CreateEvidenceResult {
  const errors: string[] = []
  const probe = input.probe ?? readReleaseEnvironment(input.env ?? process.env)

  if (probe.state !== 'read') {
    /*
     * Every non-`read` state carries a `detail`; TypeScript cannot see that
     * through the union without the check, so it is read after narrowing on
     * `state` rather than with `in`.
     */
    const detail = probe.detail
    return {
      errors: [
        `cannot produce evidence: environment probe returned ${probe.state} (${detail})`,
      ],
    }
  }

  const policy = evaluateReleaseEnvironmentPolicy({
    hasRequiredReviewers: probe.hasRequiredReviewers,
    reviewers: probe.reviewers,
    preventsSelfReview: probe.preventsSelfReview,
    adminsCanBypass: probe.adminsCanBypass,
    branchPolicy: probe.branchPolicy,
    ...(probe.deploymentPolicies
      ? { deploymentPolicies: probe.deploymentPolicies }
      : {}),
  })

  /*
   * A FAIL is recorded too, not withheld. The record has to be able to say
   * "I looked, and the environment is not protected" — that is evidence. What
   * it must not do is say PASS without having read anything, which the
   * `state !== 'read'` guard above already prevents.
   */
  const now = input.now ? input.now() : Date.now()
  const evidence: ReleaseEnvironmentEvidence = {
    schema: RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA,
    repository: input.repository,
    environment: input.environment,
    workflowPath: GOVERNANCE_WORKFLOW_PATH,
    runId: input.runId,
    runAttempt: input.runAttempt,
    coreCommit: input.coreCommit,
    observedAt: new Date(now).toISOString(),
    policyVersion: RELEASE_ENVIRONMENT_POLICY_VERSION,
    observed: {
      hasRequiredReviewers: probe.hasRequiredReviewers,
      reviewers: probe.reviewers,
      preventsSelfReview: probe.preventsSelfReview,
      adminsCanBypass: probe.adminsCanBypass,
      branchPolicy: probe.branchPolicy,
      ...(probe.deploymentPolicies
        ? { deploymentPolicies: probe.deploymentPolicies }
        : {}),
    },
    verdict: policy.verdict,
  }

  if (policy.verdict !== 'PASS') {
    errors.push(
      `the Release environment does not satisfy ${RELEASE_ENVIRONMENT_POLICY_VERSION}: ${policy.findings
        .filter(finding => finding.verdict !== 'PASS')
        .map(finding => `[${finding.verdict}] ${finding.detail}`)
        .join('; ')}`,
    )
  }

  return { evidence, errors }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'temp/release/release-environment.json' },
      repository: { type: 'string' },
      environment: { type: 'string', default: 'Release' },
      'run-id': { type: 'string' },
      'run-attempt': { type: 'string', default: '1' },
      'core-commit': { type: 'string' },
    },
  })
  const errors: string[] = []
  for (const key of ['repository', 'run-id', 'core-commit'] as const) {
    if (!values[key]) errors.push(`--${key} is required`)
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(error)
    process.exit(1)
  }

  const result = createReleaseEnvironmentEvidence({
    repository: values.repository as string,
    environment: values.environment as string,
    runId: values['run-id'] as string,
    runAttempt: Number(values['run-attempt']),
    coreCommit: values['core-commit'] as string,
  })

  if (result.evidence) {
    const out = path.resolve(values.out)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, `${JSON.stringify(result.evidence, null, 2)}\n`)
    console.log(`wrote ${out} (verdict ${result.evidence.verdict})`)
  }
  for (const error of result.errors) console.error(error)
  if (result.errors.length > 0) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
