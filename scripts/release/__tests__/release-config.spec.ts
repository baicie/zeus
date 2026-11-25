import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import changesetConfig from '../../../.changeset/config.json'
import config, { zeusFixedPackages } from '../../release.config'

const SYNTHETIC_CHANGESET_FILE = '.changeset/release.md'

describe('zeus release config', () => {
  it('uses changesets fixed release mode', () => {
    expect(config.mode).toBe('changesets-fixed')
    expect(config.repo).toBe('baicie/zeus')
    expect(config.repositoryUrl).toBe('https://github.com/baicie/zeus.git')
    expect(config.rootVersionPackage).toBe('@zeus-js/zeus')
  })

  it('keeps fixed package group explicit', () => {
    expect(zeusFixedPackages).toEqual([
      '@zeus-js/shared',
      '@zeus-js/compiler-shared',
      '@zeus-js/compiler-native',
      '@zeus-js/compiler-native-darwin-arm64',
      '@zeus-js/compiler-native-darwin-x64',
      '@zeus-js/compiler-native-linux-arm64-gnu',
      '@zeus-js/compiler-native-linux-x64-gnu',
      '@zeus-js/compiler-native-linux-x64-musl',
      '@zeus-js/compiler-native-win32-arm64-msvc',
      '@zeus-js/compiler-native-win32-x64-msvc',
      '@zeus-js/signal',
      '@zeus-js/runtime-dom',
      '@zeus-js/runtime-ssr',
      '@zeus-js/i18n',
      '@zeus-js/router',
      '@zeus-js/resource',
      '@zeus-js/query',
      '@zeus-js/compiler',
      '@zeus-js/zeus',
      '@zeus-js/testing',
      '@zeus-js/bundler-plugin',
      '@zeus-js/component-analyzer',
      '@zeus-js/component-dts',
      '@zeus-js/web-c-runtime',
      '@zeus-js/web-c',
      '@zeus-js/output-wc',
      '@zeus-js/output-react-wrapper',
      '@zeus-js/output-vue-wrapper',
      '@zeus-js/output-css',
      '@zeus-js/output-icons',
      '@zeus-js/eslint-plugin',
      '@zeus-js/playground-engine',
    ])
  })

  it('keeps Changesets fixed packages aligned with the release config', () => {
    expect(changesetConfig.fixed).toEqual([zeusFixedPackages])
  })

  it('reserves the synthetic changeset path for the release tool', () => {
    expect(config.changesetFile).toBe(SYNTHETIC_CHANGESET_FILE)
    expect(existsSync(SYNTHETIC_CHANGESET_FILE)).toBe(false)
  })

  it('regenerates the native loader after package versioning', () => {
    expect(config.afterVersion).toBeTypeOf('function')
  })

  /**
   * The gates a release must pass, and the ones whose removal is a regression.
   *
   * This replaced an exact-equality check against a hand-written copy of the
   * whole precheck list. That copy drifted by construction — it had to be
   * edited in the same commit as the config or the suite went red — and it
   * failed the two times this branch added a gate. A test that must be updated
   * whenever the thing it tests changes protects nothing; the reviewer updates
   * it without reading it.
   *
   * Two properties instead:
   *
   *   - every gate named here is still present  (nothing was removed quietly)
   *   - every script the precheck runs exists    (no typo ships as a no-op)
   */
  it('runs every release gate that must not disappear', () => {
    const commands = (config.precheck?.commands ?? []).map(command =>
      command.join(' '),
    )

    const REQUIRED = [
      'check:branch',
      'check:secrets',
      'check:sbom',
      'check:native-packages',
      'check:native-binaries',
      'check:runtime-interop',
      'check:cjs',
      'api:check',
      'check:package-table',
      'check:package-versions',
      'check:latest-tags',
      'check:create-zeus-candidate',
      'check:release-pairing',
      'check:packed-consumers',
      'size:ci',
    ]

    for (const gate of REQUIRED) {
      expect(
        commands.some(command => command.includes(gate)),
        `${gate} is no longer part of the release precheck`,
      ).toBe(true)
    }
  })

  it('runs only scripts that exist', () => {
    /*
     * A typo in the precheck list is a gate that silently does nothing: the
     * process exits non-zero on a missing script, but only when the release
     * runs, not when the typo is introduced.
     */
    const manifest = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '../../../package.json'),
        'utf-8',
      ),
    ) as { scripts?: Record<string, string> }

    const missing: string[] = []

    for (const command of config.precheck?.commands ?? []) {
      const [bin, script] = command

      if (bin !== 'pnpm' || !script || script.startsWith('-')) continue

      if (!(script in (manifest.scripts ?? {}))) missing.push(script)
    }

    expect(
      missing,
      `the precheck runs scripts package.json does not define`,
    ).toEqual([])
  })

  it('starts and ends with the worktree guard', () => {
    /*
     * The first command captures the worktree state and the last verifies it,
     * so a gate that writes to the tree fails instead of leaving a dirty
     * checkout behind for the release to commit.
     */
    const commands = config.precheck?.commands ?? []

    expect(commands[0]?.join(' ')).toContain('check:release-worktree --capture')
    expect(commands[commands.length - 1]?.join(' ')).toContain(
      'check:release-worktree --verify',
    )
  })

  it('keeps canary downstream dispatch compatible with zeus-ui', () => {
    expect(config.canary).toMatchObject({
      enabled: true,
      prefix: 'canary',
      tag: 'canary',
      envName: 'ZEUS_CANARY_VERSION',
      includeBranches: ['main'],
    })
  })
})
