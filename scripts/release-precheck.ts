import { spawnSync } from 'node:child_process'

const steps: Array<[string, string[]]> = [
  ['pnpm', ['build']],
  ['pnpm', ['build-dts']],
  ['pnpm', ['check']],
  ['pnpm', ['lint']],
  ['pnpm', ['test-unit']],
  ['pnpm', ['examples:check']],
  ['pnpm', ['docs:build']],
  ['pnpm', ['size']],
  ['pnpm', ['check:exports']],
]

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(' ')}\n`)

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    console.error(`\nFailed: ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nRelease precheck passed.\n')
