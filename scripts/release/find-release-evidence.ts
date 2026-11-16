/**
 * Finds the evidence a release needs, instead of asking the maintainer for it.
 *
 * ## What this replaces
 *
 * The v1 release path required three repository variables to be set by hand
 * before a release: `ZEUS_RC_APPROVAL_RUN_ID`, `ZEUS_RC_APPROVERS`, and
 * `ZEUS_DEPLOYMENT_EVIDENCE_RUN_ID`. Each one was a run id a human copied from
 * a URL. That is not evidence — it is a claim about evidence, and nothing
 * checked that the run it named had anything to do with the tag being released.
 *
 * This module asks GitHub for runs of a named workflow, on a named commit,
 * and takes the newest attempt for each. The selection rules are the security
 * surface, so they are narrow on purpose:
 *
 * - the workflow path must match exactly;
 * - the head commit must be the release commit, not merely recent;
 * - the event must be one that can produce trusted evidence (`push`,
 *   `workflow_dispatch`, `workflow_call`) — never `pull_request`, whose runs
 *   execute untrusted code;
 * - the run must be `completed`;
 * - when several attempts exist, the newest decides.
 *
 * ## What it deliberately does not do
 *
 * It does not take "the most recent success". A run that succeeded an hour ago
 * on a different commit is the most common way a release gets published
 * against code nobody tested. Every lookup is keyed by `headSha`.
 */
import { execFileSync } from 'node:child_process'

import type { SupportingRun } from './release-authorization'

/** Events whose runs execute a trusted commit. */
const TRUSTED_EVENTS = new Set(['push', 'workflow_dispatch', 'workflow_call'])

export interface RunLookup {
  readonly repository: string
  readonly workflowPath: string
  readonly headSha: string
}

export interface RunLookupResult {
  readonly runs: readonly SupportingRun[]
  readonly problems: readonly string[]
}

function gh(args: readonly string[]): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  }) as string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads runs for one workflow, filtered to one commit.
 *
 * The workflow is identified by its file path rather than its display name:
 * a display name is not unique and can be edited without changing the file, so
 * matching on it would let a renamed workflow stand in for the one the release
 * requires.
 */
export function findSupportingRuns(
  lookup: RunLookup,
  run: (args: readonly string[]) => string = gh,
): RunLookupResult {
  const problems: string[] = []
  let raw: string
  try {
    raw = run([
      'api',
      `repos/${lookup.repository}/actions/workflows/${encodeURIComponent(
        lookup.workflowPath.split('/').pop() ?? lookup.workflowPath,
      )}/runs?head_sha=${lookup.headSha}&per_page=50`,
    ])
  } catch (error) {
    return {
      runs: [],
      problems: [
        `cannot list runs for ${lookup.workflowPath}: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      runs: [],
      problems: [`${lookup.workflowPath}: run list is not JSON`],
    }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.workflow_runs)) {
    return {
      runs: [],
      problems: [`${lookup.workflowPath}: run list has no workflow_runs array`],
    }
  }

  const runs: SupportingRun[] = []
  for (const entry of parsed.workflow_runs) {
    if (!isRecord(entry)) continue
    const path = entry.path
    /*
     * The API filters by workflow id, and the id came from the path — but the
     * returned entry still carries its own path, and a mismatch means the
     * filter resolved to a different workflow than the caller named.
     */
    if (typeof path === 'string' && path !== lookup.workflowPath) {
      problems.push(
        `${lookup.workflowPath}: run ${String(entry.id)} belongs to ${path}`,
      )
      continue
    }
    const headSha = entry.head_sha
    if (typeof headSha !== 'string') continue
    if (headSha.toLowerCase() !== lookup.headSha.toLowerCase()) continue

    const event = entry.event
    if (typeof event !== 'string') continue
    if (!TRUSTED_EVENTS.has(event)) continue

    const status = entry.status
    if (status !== 'completed') continue

    const id = entry.id
    if (typeof id !== 'number') continue
    const attempt = entry.run_attempt
    if (typeof attempt !== 'number') continue
    const conclusion = entry.conclusion
    if (typeof conclusion !== 'string') continue

    runs.push({
      workflowPath: lookup.workflowPath,
      runId: String(id),
      runAttempt: attempt,
      headSha,
      conclusion,
      event,
    })
  }

  if (runs.length === 0) {
    problems.push(
      `${lookup.workflowPath}: no completed ${[...TRUSTED_EVENTS].join('/')} run on ${lookup.headSha}`,
    )
  }
  return { runs, problems }
}

/** Whether the tag target is an ancestor of the default branch. */
export function isAncestorOfMain(
  checkoutSha: string,
  root: string,
  run: (args: readonly string[]) => string = args =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as string,
): boolean | undefined {
  try {
    run(['fetch', '--quiet', 'origin', 'main'])
  } catch {
    /*
     * A shallow or offline checkout cannot answer. `undefined` is "not
     * established", which the policy refuses — it is not a pass.
     */
    return undefined
  }
  try {
    run(['merge-base', '--is-ancestor', checkoutSha, 'origin/main'])
    return true
  } catch {
    return false
  }
}

/**
 * Where a tag points right now.
 *
 * `GITHUB_SHA` is frozen when the run starts, so it cannot answer this. The
 * API can, and the difference is how a tag moved mid-release is detected.
 * Returns `undefined` when the read fails — the policy treats that as a
 * limitation rather than a pass, because "I could not check" and "I checked
 * and it is fine" are different answers.
 */
export function readCurrentTagSha(
  repository: string,
  tag: string,
  run: (args: readonly string[]) => string = gh,
): string | undefined {
  try {
    const raw = run([
      'api',
      `repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
    ])
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return undefined
    const object = parsed.object
    if (!isRecord(object)) return undefined
    const sha = object.sha
    return typeof sha === 'string' ? sha : undefined
  } catch {
    return undefined
  }
}
