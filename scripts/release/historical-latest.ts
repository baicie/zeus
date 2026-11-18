/**
 * The committed record of dist-tag deviations that predate any 0.2.0 release.
 *
 * ## Why a file rather than a rule
 *
 * `latest` pointing at a prerelease is wrong. The release gate refuses it, and
 * that refusal is correct — it is how a package that silently shipped the wrong
 * default install target gets caught. But thirteen packages were left in that
 * state by canary runs in August and October, and the platform will not let
 * anyone delete the tag: every `npm dist-tag rm` against `registry.npmjs.org`
 * returns `403 Forbidden - DELETE .../dist-tags/latest`, after authentication
 * and the package ACL both succeed. PUT (`dist-tag add`) works; DELETE does
 * not.
 *
 * The maintainer decided on 2026-10-24 not to keep retrying that delete and
 * not to make the historical cleanup a precondition for shipping 0.2.0
 * (`docs/release-process.md` §5.4, `docs/internal/architecture-roadmap-2026-10.md`).
 * That decision is the authority for this baseline — not a convenience.
 *
 * ## What this file is not
 *
 * It is not an "ignore these packages" flag. A package is exempt only while
 * the registry answers with the *exact* version recorded here. A new canary, a
 * beta, an rc, or a stable version all leave the exemption and are judged by
 * the ordinary rules. Nothing about this file can be widened at check time:
 *
 * - the path is fixed, not a CLI argument;
 * - the value written by the release is read, never the state observed at
 *   check time, so an operator cannot repair the tag and have it recorded as
 *   though it had always been that way;
 * - the release reads the copy committed at the tag it is building, so the
 *   baseline is reviewed like any other change to the repository.
 *
 * ## Why the digest matters
 *
 * Two runs can both say ACCEPTED_HISTORICAL while agreeing on nothing else.
 * The digest binds the verdict to the exact bytes that produced it, so a later
 * audit can tell which baseline was in force without trusting a log line.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { zeusFixedPackages } from '../release.config'

export const HISTORICAL_LATEST_SCHEMA = 'zeus.historical-latest/v1'

/** The only path this module will read. Not overridable by a flag. */
export const HISTORICAL_LATEST_PATH = 'release-policy/historical-latest.json'

export interface HistoricalEntry {
  readonly name: string
  /** The exact `latest` this exemption covers. Any other value leaves it. */
  readonly latest: string
  readonly firstObserved?: string
  readonly group?: string
}

export interface HistoricalBaseline {
  readonly schema: string
  readonly policyVersion: string
  readonly acceptedAt: string
  readonly approvedBy: string
  /** The decision this exemption implements. Required, not decorative. */
  readonly decisionReference?: {
    readonly document: string
    readonly section?: string
    readonly decidedOn?: string
    readonly quote?: string
    readonly supporting?: readonly string[]
  }
  readonly registry?: string
  readonly packages: readonly HistoricalEntry[]
  /** Content digest; see `digestEntries`. */
  readonly digest: string
}

export type BaselineProblem = string

/**
 * Reads and validates the committed baseline.
 *
 * Every structural problem is returned rather than thrown, because a caller
 * has to be able to distinguish "the file is absent" from "the file is
 * present and wrong" and report which — but both must block. A missing
 * baseline silently yielding `[]` would be safe; a *corrupt* one yielding `[]`
 * would also be safe, and both are handled the same way here: no exemptions.
 */
export function loadHistoricalBaseline(
  root: string,
  file: string = HISTORICAL_LATEST_PATH,
): { baseline?: HistoricalBaseline; problems: readonly BaselineProblem[] } {
  const full = path.join(root, file)
  const problems: BaselineProblem[] = []

  let raw: string
  try {
    raw = fs.readFileSync(full, 'utf8')
  } catch (error) {
    problems.push(
      `historical baseline could not be read at ${file}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return { problems }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    problems.push(
      `historical baseline at ${file} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return { problems }
  }

  const value = parsed as Partial<HistoricalBaseline>
  if (value.schema !== HISTORICAL_LATEST_SCHEMA) {
    problems.push(
      `historical baseline schema is ${String(value.schema)}, expected ${HISTORICAL_LATEST_SCHEMA}`,
    )
  }
  if (typeof value.policyVersion !== 'string' || !value.policyVersion) {
    problems.push('historical baseline is missing policyVersion')
  }
  /*
   * The decision reference is what separates an approved exemption from a list
   * somebody added entries to. Without it the entries are indistinguishable
   * from an unbounded ignore list, so its absence is a structural failure
   * rather than a cosmetic one.
   */
  const approvedBy = value.approvedBy
  if (typeof approvedBy !== 'string' || !approvedBy.trim()) {
    problems.push(
      'historical baseline has no approvedBy; an exemption must name who approved it',
    )
  }
  if (
    value.decisionReference === undefined ||
    typeof (value.decisionReference as { document?: unknown }).document !==
      'string'
  ) {
    problems.push(
      'historical baseline has no decisionReference.document; an exemption must cite the decision it implements',
    )
  }

  const packages = value.packages
  if (!Array.isArray(packages)) {
    problems.push('historical baseline has no packages array')
    return { problems }
  }

  const seen = new Set<string>()
  const entries: HistoricalEntry[] = []
  for (const [index, entry] of packages.entries()) {
    const at = `packages[${index}]`
    const name = (entry as Partial<HistoricalEntry>)?.name
    const latest = (entry as Partial<HistoricalEntry>)?.latest
    if (typeof name !== 'string' || !name.trim()) {
      problems.push(`${at} has no name`)
      continue
    }
    if (typeof latest !== 'string' || !latest.trim()) {
      problems.push(`${at} (${name}) has no latest version`)
      continue
    }
    if (seen.has(name)) {
      problems.push(
        `${name} is listed more than once in the historical baseline`,
      )
      continue
    }
    seen.add(name)
    /*
     * A baseline entry for a package outside the fixed release group would
     * authorise nothing, and would hide a typo that drops a real package from
     * the exemption. Both directions are refused.
     */
    if (!zeusFixedPackages.includes(name)) {
      problems.push(
        `${name} is in the historical baseline but not in the fixed release group`,
      )
      continue
    }
    /*
     * A stable version in the baseline would mean the exemption is claiming
     * that a compliant tag needs forgiving — the file has drifted from what it
     * describes.
     */
    if (!latest.includes('-')) {
      problems.push(
        `${name}: baseline records ${latest}, which is not a prerelease; a historical exemption only covers prerelease canaries`,
      )
      continue
    }
    entries.push({
      name,
      latest,
      ...(typeof (entry as HistoricalEntry).firstObserved === 'string'
        ? { firstObserved: (entry as HistoricalEntry).firstObserved! }
        : {}),
      ...(typeof (entry as HistoricalEntry).group === 'string'
        ? { group: (entry as HistoricalEntry).group! }
        : {}),
    })
  }

  if (problems.length > 0) return { problems }

  return {
    baseline: {
      schema: value.schema!,
      policyVersion: value.policyVersion!,
      acceptedAt: String(value.acceptedAt ?? ''),
      approvedBy: approvedBy!,
      /*
       * Carried through so a report can cite the decision it implements. The
       * validation above already refused a file without it, so this is the
       * same object the check approved rather than an optional extra.
       */
      decisionReference: value.decisionReference,
      ...(typeof value.registry === 'string'
        ? { registry: value.registry }
        : {}),
      packages: entries,
      digest: digestEntries(entries),
    },
    problems,
  }
}

/**
 * A digest of exactly the package/version pairs, in file order.
 *
 * Deliberately does not include prose fields: editing the risk note must not
 * change the digest a release recorded, while editing any exemption
 * (add/remove/re-point) must.
 */
export function digestEntries(entries: readonly HistoricalEntry[]): string {
  const canonical = entries
    .map(entry => `${entry.name}@${entry.latest}`)
    .join('\n')
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

/** Which release phase is being judged. */
export type LatestPhase = 'precheck' | 'post-publish'

export interface HistoricalMatch {
  readonly name: string
  readonly latest: string
}

export interface HistoricalJudgement {
  /** Packages whose deviation is exactly the recorded historical one. */
  readonly accepted: readonly HistoricalMatch[]
  /** Packages in the baseline that the registry answered differently for. */
  readonly drifted: readonly {
    readonly name: string
    readonly expected: string
    readonly observed: string
  }[]
  /** Baseline packages the registry did not answer for at all. */
  readonly unresolved: readonly string[]
}

/**
 * Applies the baseline to what the registry actually returned.
 *
 * The comparison is exact and per package. "The version changed" is the case
 * this exists to catch: an exemption approved for `A` must never silently
 * cover `B`, which is precisely how an unbounded ignore list would fail.
 *
 * A query failure is `unresolved`, never `accepted` and never silently
 * dropped — the caller decides the verdict, but it cannot be a pass.
 */
export function judgeHistorical(input: {
  readonly baseline: HistoricalBaseline
  readonly records: readonly {
    readonly name: string
    readonly state: { readonly status: string; readonly version?: string }
  }[]
  readonly releaseVersion: string
}): HistoricalJudgement {
  const byName = new Map(
    input.records.map(record => [record.name, record.state] as const),
  )
  const accepted: HistoricalMatch[] = []
  const drifted: { name: string; expected: string; observed: string }[] = []
  const unresolved: string[] = []

  for (const entry of input.baseline.packages) {
    /*
     * The exemption cannot apply to the version being released. If it did, a
     * package could be excused for a deviation this very release created,
     * which is the one thing the baseline must never do.
     */
    if (entry.latest === input.releaseVersion) continue

    const state = byName.get(entry.name)
    if (state === undefined) continue

    if (state.status === 'REGISTRY_QUERY_FAILED') {
      unresolved.push(entry.name)
      continue
    }
    if (state.status !== 'LATEST_PRERELEASE') {
      /*
       * Absent or stable. Both mean the recorded deviation no longer exists,
       * so the exemption is spent. Not an error — the registry moving on is
       * the exit strategy working — but it must not be counted as accepted.
       */
      continue
    }
    if (state.version === entry.latest) {
      accepted.push({ name: entry.name, latest: entry.latest })
    } else {
      drifted.push({
        name: entry.name,
        expected: entry.latest,
        observed: state.version ?? '',
      })
    }
  }

  return { accepted, drifted, unresolved }
}
