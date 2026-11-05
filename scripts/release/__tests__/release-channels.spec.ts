import { describe, expect, it } from 'vitest'

import {
  CANARY_PRECHECK_COMMANDS,
  getReleasePrecheckCommands,
  parseReleaseChannel,
} from '../release-channels'

const rcCommands = [
  ['pnpm', 'check'],
  ['pnpm', 'check:rc-readiness'],
  ['pnpm', 'check:release-worktree', '--verify'],
] as const

describe('release channels', () => {
  it('defaults to RC and accepts explicit channels', () => {
    expect(parseReleaseChannel([])).toBe('rc')
    expect(parseReleaseChannel(['--channel', 'canary'])).toBe('canary')
    expect(parseReleaseChannel(['--channel=canary'])).toBe('canary')
    expect(parseReleaseChannel(['--channel', 'rc'])).toBe('rc')
    expect(() => parseReleaseChannel(['--channel', 'stable'])).toThrow(
      '--channel must be canary or rc',
    )
    expect(() => parseReleaseChannel(['--strict'])).toThrow(
      'Unknown release precheck option',
    )
  })

  it('keeps RC readiness out of the canary gate', () => {
    const commands = getReleasePrecheckCommands('canary', rcCommands).map(
      command => command.join(' '),
    )

    expect(commands).not.toContain('pnpm check:rc-readiness')
    expect(commands).toContain('pnpm check:canary-readiness')
    expect(commands).toContain('pnpm check:packed-consumers')
    expect(commands).toContain('pnpm check:native-binaries')
    expect(commands).toContain('pnpm check:secrets')
    expect(commands).toContain('pnpm check:sbom')
  })

  it('keeps the canary command table ordered and free of RC-only gates', () => {
    const names = CANARY_PRECHECK_COMMANDS.map(command => command[1])

    expect(names.indexOf('check:packed-consumers')).toBeLessThan(
      names.indexOf('check:canary-readiness'),
    )
    expect(names.indexOf('check:canary-readiness')).toBeLessThan(
      names.lastIndexOf('check:release-worktree'),
    )
    expect(names).not.toContain('check:rc-readiness')
    expect(names).not.toContain('bench:component-host:ci')
  })

  it('returns the RC table unchanged for the RC channel', () => {
    expect(getReleasePrecheckCommands('rc', rcCommands)).toBe(rcCommands)
  })
})
