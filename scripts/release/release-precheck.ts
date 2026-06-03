/**
 * Release precheck script
 *
 * Note: create-zeus is excluded from this precheck because it is marked as
 * "ignore" in changeset (experimental DX tool, not part of MVP scope).
 * If create-zeus is ever published, add:
 *   ['pnpm', ['create-zeus:build']],
 * to the steps below and remove it from .changeset/config.json ignore list.
 */

import { exec } from '../shared/utils'

const steps: Array<[string, string[]]> = [
  ['pnpm', ['build']],
  ['pnpm', ['check:compiler-cjs']],
  ['pnpm', ['build-dts']],
  ['pnpm', ['api:check']],
  ['pnpm', ['check']],
  ['pnpm', ['lint']],
  ['pnpm', ['test-unit']],
  ['pnpm', ['examples:check:all']],
  ['pnpm', ['docs:build']],
  ['pnpm', ['size:ci']],
  ['pnpm', ['check:exports']],
]

async function run() {
  for (const [command, args] of steps) {
    console.log(`\n> ${command} ${args.join(' ')}\n`)
    await exec(command, args, { stdio: 'inherit' })
  }
  console.log('\nRelease precheck passed.\n')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
