import { readFileSync } from 'node:fs'
import path from 'node:path'

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
    // Registry installs run after publication, not in the pre-publish gate.
    expect(names).not.toContain('check:create-zeus-packed')
    expect(names).not.toContain('bench:component-host:ci')
  })

  it('returns the RC table unchanged for the RC channel', () => {
    expect(getReleasePrecheckCommands('rc', rcCommands)).toBe(rcCommands)
  })
})

/**
 * Both channels must build the browser compiler before `check:exports`.
 *
 * `@zeus-js/compiler-wasm` exports `./zeus-compiler.wasm`, a cargo artifact that
 * `.gitignore` excludes. `check:exports` asserts that every export target
 * exists, so on a fresh checkout the gate fails with "points to missing file"
 * for an export that is correct — the artifact was simply never built. This was
 * dormant while the package was `private: true` and the checker skipped it; it
 * went live when the package was made publishable for the Playground migration.
 *
 * The order is part of the contract, not an implementation detail: a build
 * placed after the export check would leave the gate red for the same reason.
 */
describe('the browser compiler is built before the export gate', () => {
  const WASM_BUILD = 'pnpm --filter @zeus-js/compiler-wasm build:wasm'

  it('does so in the canary table', () => {
    const commands = CANARY_PRECHECK_COMMANDS.map(command => command.join(' '))
    const build = commands.indexOf(WASM_BUILD)
    const exports = commands.findIndex(command =>
      command.startsWith('pnpm check:exports'),
    )

    expect(build).toBeGreaterThanOrEqual(0)
    expect(exports).toBeGreaterThanOrEqual(0)
    expect(build).toBeLessThan(exports)
  })

  it('does so in the RC table the release workflow runs', () => {
    // The real table, not the fixture above: the defect is a property of the
    // release configuration, and a fixture would keep passing after it changed.
    const config = readFileSync(
      path.resolve(import.meta.dirname, '../../release.config.ts'),
      'utf8',
    )
    const build = config.indexOf(
      "['pnpm', '--filter', '@zeus-js/compiler-wasm', 'build:wasm']",
    )
    const exports = config.indexOf("['pnpm', 'check:exports']")

    expect(build).toBeGreaterThanOrEqual(0)
    expect(exports).toBeGreaterThanOrEqual(0)
    expect(build).toBeLessThan(exports)
  })
})
