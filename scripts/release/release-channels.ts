export type ReleaseChannel = 'canary' | 'rc'

export type ReleaseCommand = readonly string[]

/**
 * Canary validates the latest main branch as publishable packages. It keeps the
 * code, native, packaging, consumer and security gates, but deliberately does
 * not require stable-release evidence such as deployed products, manual A11y,
 * Windows/Linux product acceptance or a release approval.
 *
 * The version rewrite performed by release:canary happens before this list runs.
 * `check:release-worktree --capture` therefore records that expected dirt and
 * the final verify only rejects changes made *during* the gate.
 */
export const CANARY_PRECHECK_COMMANDS: readonly ReleaseCommand[] = [
  ['pnpm', 'check:release-worktree', '--capture'],
  ['pnpm', 'check:branch'],
  ['pnpm', 'audit:prod'],
  ['pnpm', 'check:secrets'],
  ['pnpm', 'check:sbom:write'],
  ['pnpm', 'check:sbom'],
  ['pnpm', 'check:native-packages'],
  ['pnpm', 'check:native-binaries'],
  ['pnpm', 'build'],
  ['pnpm', 'check:runtime-interop'],
  ['pnpm', 'check:cjs'],
  ['pnpm', 'build-dts'],
  ['pnpm', 'check:release-artifacts', '--require-binaries'],
  ['pnpm', 'api:check'],
  ['pnpm', 'check'],
  ['pnpm', 'lint'],
  ['pnpm', 'test-unit'],
  ['pnpm', 'check:package-versions'],
  ['pnpm', 'check:create-zeus'],
  ['pnpm', 'check:packed-consumers'],
  ['pnpm', 'check:exports'],
  ['pnpm', 'check:repository'],
  ['pnpm', 'check:canary-readiness'],
  ['pnpm', 'check:release-worktree', '--verify'],
]

export function parseReleaseChannel(args: readonly string[]): ReleaseChannel {
  let channel: ReleaseChannel = 'rc'

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--channel') {
      const value = args[index + 1]
      if (value !== 'canary' && value !== 'rc') {
        throw new Error('--channel must be canary or rc')
      }
      channel = value
      index += 1
      continue
    }
    if (arg?.startsWith('--channel=')) {
      const value = arg.slice('--channel='.length)
      if (value !== 'canary' && value !== 'rc') {
        throw new Error('--channel must be canary or rc')
      }
      channel = value
      continue
    }
    throw new Error(`Unknown release precheck option: ${arg}`)
  }

  return channel
}

export function getReleasePrecheckCommands(
  channel: ReleaseChannel,
  rcCommands: readonly ReleaseCommand[],
): readonly ReleaseCommand[] {
  return channel === 'canary' ? CANARY_PRECHECK_COMMANDS : rcCommands
}
