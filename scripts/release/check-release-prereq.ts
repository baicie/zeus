/**
 * The release gates that answer without a build.
 *
 * `release:precheck` runs 32 commands in one serial chain. Eleven of them
 * build the whole repository first — `build`, `build-dts`, `test-unit`,
 * `docs:build`, the two benchmarks — so a question like "does this tree have
 * a high-severity advisory" or "is any `latest` tag unapproved" waits behind
 * roughly an hour of work before it is asked.
 *
 * That ordering is what made the RC line expensive. rc.0 died on `audit:prod`
 * and rc.1 on `check:latest-tags`; both are registry and file reads that take
 * seconds, and both were only asked after the build. Each answer cost a full
 * release run.
 *
 * This command asks those questions first. It is a strict subset of the
 * precheck — everything here also runs there — so a tree that fails here was
 * going to fail the release, and a tree that passes here still has to pass the
 * full chain. Running it before pushing a tag turns an hour-long failure into
 * a one-minute one.
 *
 * Deliberately absent are the gates that need build output to mean anything:
 * `check:exports`, `check:repository`, `check:packed-consumers`,
 * `examples:check:all`, `check:sbom` and the rest read `dist/`, tarballs or
 * SBOM documents this command does not produce.
 */
import { spawnSync } from 'node:child_process'

import pc from 'picocolors'

interface Gate {
  /** The package.json script name. */
  command: string
  /** What a failure here means, in the operator's terms. */
  question: string
}

/**
 * Pinned to the registry CI reads. `check:latest-tags` shells out to `pnpm
 * view`, which follows the local npm config; a mirror that resets a
 * connection makes the answer "unknown", and unknown refuses the release.
 * The same tree would then pass in CI and fail on a developer's machine.
 */
const REGISTRY = 'https://registry.npmjs.org'

const gates: Gate[] = [
  {
    command: 'check:branch',
    question: 'is this a branch a release may be cut from',
  },
  {
    command: 'check:package-versions',
    question: 'do all 32 packages agree on one version',
  },
  {
    command: 'check:release-pairing',
    question: 'is there a pairing record for this version',
  },
  {
    command: 'check:environment-topology',
    question: 'is the release workflow bound to the Release environment',
  },
  {
    command: 'check:latest-tags',
    question: 'is every npm `latest` tag accounted for',
  },
  {
    command: 'audit:prod',
    question: 'does the production dependency tree have a high advisory',
  },
]

const registryArgs: Record<string, string[]> = {
  'check:latest-tags': ['--registry', REGISTRY],
}

function main(): void {
  const failures: Array<{ gate: Gate; status: number | null }> = []

  console.log(
    pc.bold(`\nRelease prereq: ${gates.length} gates that need no build\n`),
  )

  for (const gate of gates) {
    process.stdout.write(`  ${pc.bold(gate.command)} — ${gate.question} ... `)

    const result = spawnSync(
      'pnpm',
      ['run', gate.command, ...(registryArgs[gate.command] ?? [])],
      {
        stdio: 'pipe',
        encoding: 'utf8',
        shell: process.platform === 'win32',
      },
    )

    if (result.status === 0) {
      process.stdout.write(`${pc.green('ok')}\n`)
      continue
    }

    process.stdout.write(`${pc.red('FAILED')}\n`)

    // Only the failing gate's output is printed. A passing gate is one line;
    // otherwise six gates of registry noise would bury the one that matters.
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd()

    if (output) {
      console.log(
        output
          .split('\n')
          .map(line => `      ${line}`)
          .join('\n'),
      )
    }

    failures.push({ gate, status: result.status })
  }

  if (failures.length > 0) {
    console.error(
      pc.red(
        `\n${failures.length} of ${gates.length} gates failed. The release would have stopped here:\n`,
      ),
    )

    for (const { gate } of failures) {
      console.error(`  - ${gate.command}: ${gate.question}`)
    }

    console.error(
      '\nThese run again inside `release:precheck`; fixing them now saves a full run.\n',
    )
    process.exit(1)
  }

  console.log(
    pc.green(
      `\nAll ${gates.length} gates passed. The full precheck still has to pass; this rules out its cheapest failures.\n`,
    ),
  )
}

main()
