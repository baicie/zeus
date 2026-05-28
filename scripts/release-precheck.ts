/**
 * Release precheck script
 *
 * Note: create-zeus is excluded from this precheck because it is marked as
 * "ignore" in changeset (experimental DX tool, not part of MVP scope).
 * If create-zeus is ever published, add:
 *   ['pnpm', ['create-zeus:build']],
 * to the steps below and remove it from .changeset/config.json ignore list.
 */

import { spawnSync } from 'node:child_process'

const steps: Array<[string, string[]]> = [
  ['pnpm', ['build']],
  ['pnpm', ['build-dts']],
  ['pnpm', ['check']],
  ['pnpm', ['lint']],
  ['pnpm', ['test-unit']],
  ['pnpm', ['examples:check:all']],
  ['pnpm', ['docs:build']],
  ['pnpm', ['size:ci']],
  ['pnpm', ['check:exports']],
]

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(' ')}\n`)

  const result = spawnSync(command, args, {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    console.error(`\nFailed: ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nRelease precheck passed.\n')
