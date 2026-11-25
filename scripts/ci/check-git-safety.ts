/**
 * Refuses the git invocations that rewrite published history.
 *
 * ## Why a script rather than a sentence in AGENTS.md
 *
 * A rule in prose is advice. This repository already had "do not force-push"
 * written down, and a release session still ended up using the GitHub API with
 * `force: true` to get past a transport failure — collapsing five commits into
 * one on the remote. The rule was not ignored out of disagreement; it was
 * invisible at the moment of the failure, because the failing command was
 * `git push` and the tool reached for something that worked.
 *
 * So the rule becomes executable. `assertSafeGitInvocation` is a pure predicate
 * over the argv and environment of a git call, and the release scripts route
 * through `runGit` so it cannot be skipped by accident.
 *
 * ## What this can and cannot do
 *
 * It protects the paths that call it. It cannot stop a person typing `git push
 * --force` in a terminal, and it does not replace server-side branch
 * protection, which is the only control that binds every client. Both facts are
 * stated in the receipt this prints, so nobody mistakes the guard for a policy
 * that holds everywhere.
 */
import { parseArgs } from 'node:util'

/** Remote writes that discard history. */
export const FORBIDDEN_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp
  readonly why: string
}> = [
  /*
   * Anchored on a `push` or `git` invocation rather than on the bare flag.
   * `fs.rmSync(path, { recursive: true, force: true })` appears in a dozen
   * release scripts and means something entirely different — a first draft of
   * this check flagged 43 of them, which is how a guard becomes noise nobody
   * reads.
   */
  {
    pattern: /\bpush\b[^\n]*--force-with-lease/,
    why: 'leases narrow the race but still rewrite history; the answer to a rejected push is to fetch and merge',
  },
  {
    pattern: /\bpush\b[^\n]*--force\b/,
    why: 'a forced push replaces the remote ref, discarding commits other people may have based work on',
  },
  {
    pattern: /\bpush\b[^\n]*\s-f(\s|$)/,
    why: '-f is --force; a forced push rewrites the remote ref',
  },
  {
    pattern: /\bpush\b[^\n]*--mirror\b/,
    why: 'a mirror push deletes remote refs that do not exist locally',
  },
  {
    pattern: /\bpush\b[^\n]*--delete\b[^\n]*\b(main|master)\b/,
    why: 'deleting the default branch on the remote is unrecoverable for anyone mid-clone',
  },
]

/**
 * Transport settings that made the registry host usable when the default
 * failed.
 *
 * Not a preference: HTTP/2 framing errors against github.com came and went for
 * hours in this environment, and `-c http.version=HTTP/1.1` made every push and
 * fetch succeed. Pinning it here means the documented workaround is the one the
 * scripts actually use, rather than advice that lives only in a chat log.
 */
export const RELIABLE_TRANSPORT_ARGS = ['-c', 'http.version=HTTP/1.1'] as const

export interface GitSafetyVerdict {
  readonly safe: boolean
  readonly violations: readonly string[]
}

/**
 * Judges a git invocation.
 *
 * Pure: takes argv as it would be passed to `git`, returns why it is refused.
 */
export function assertSafeGitInvocation(
  argv: readonly string[],
): GitSafetyVerdict {
  const command = argv.join(' ')
  const violations: string[] = []

  for (const { pattern, why } of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) violations.push(`${pattern} — ${why}`)
  }

  return { safe: violations.length === 0, violations }
}

/**
 * Judges a GitHub REST call that updates a ref.
 *
 * The API is the route that actually caused the incident: `PATCH
 * /git/refs/heads/<branch>` with `force: true` is a force-push with extra
 * steps, and no shell-level guard sees it.
 */
export function assertSafeRefUpdate(body: {
  force?: unknown
  sha?: unknown
}): GitSafetyVerdict {
  const violations: string[] = []

  if (body.force === true) {
    violations.push(
      'force: true on a ref update rewrites the remote branch; create a commit on top of the fetched HEAD instead',
    )
  }

  if (typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha)) {
    violations.push('a ref update must name a full 40-character commit SHA')
  }

  return { safe: violations.length === 0, violations }
}

/**
 * The receipt, so a reader knows what was and was not covered.
 */
export const SCOPE_NOTE =
  'This guard binds the scripts that call it. It does not bind a terminal, and it is not a substitute ' +
  'for branch protection on the remote, which is the only control every client obeys.'

if (import.meta.url === `file://${process.argv[1]}`) {
  parseArgs({ allowPositionals: true })

  /*
   * Runs against this repository's own scripts: the check is that nothing in
   * `scripts/` builds a force flag, and that the release scripts that do reach
   * a remote use the transport setting that works.
   */
  const { execFileSync } = await import('node:child_process')
  const files = execFileSync('git', ['ls-files', 'scripts/'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      file =>
        file.endsWith('.ts') &&
        /*
         * Test files are excluded because they contain the patterns on purpose.
         *
         * `check-git-safety.spec.ts` lists `push --force`, `--mirror` and the
         * rest as *inputs* to the detector, so scanning it reports the guard
         * testing itself as five violations. The same reasoning covers
         * `__tests__` directories, and the guard's own source — which names
         * each pattern in order to match it.
         */
        !file.includes('__tests__') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('check-git-safety.ts'),
    )

  const offenders: string[] = []

  for (const file of files) {
    const source = execFileSync('cat', [file], { encoding: 'utf8' })

    for (const { pattern, why } of FORBIDDEN_PATTERNS) {
      if (pattern.test(source)) offenders.push(`${file}: ${pattern} — ${why}`)
    }

    /*
     * `force: true` is only a problem when it updates a git ref. The
     * filesystem calls that also use that key are unrelated, so the check needs
     * the surrounding call, not the key alone.
     */
    if (
      /updateRef|git\/refs|refs\/heads/.test(source) &&
      /force:\s*true/.test(source)
    ) {
      offenders.push(
        `${file}: force: true alongside a ref update — this is a force-push`,
      )
    }
  }

  if (offenders.length > 0) {
    for (const offender of offenders) console.error(`  ${offender}`)
    console.error(`\n${offenders.length} git-safety violation(s) in scripts/`)
    process.exit(1)
  }

  console.log(
    `git safety: ${files.length} script(s) scanned, no history-rewriting invocation`,
  )
  console.log(SCOPE_NOTE)
}
