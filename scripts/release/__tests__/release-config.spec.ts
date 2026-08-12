import { existsSync } from 'node:fs'

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
      '@zeus-js/compiler',
      '@zeus-js/zeus',
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
    ])
  })

  it('keeps Changesets fixed packages aligned with the release config', () => {
    expect(changesetConfig.fixed).toEqual([zeusFixedPackages])
  })

  it('reserves the synthetic changeset path for the release tool', () => {
    expect(config.changesetFile).toBe(SYNTHETIC_CHANGESET_FILE)
    expect(existsSync(SYNTHETIC_CHANGESET_FILE)).toBe(false)
  })

  it('keeps release gates aligned with current zeus release precheck', () => {
    expect(config.precheck?.commands).toEqual([
      ['pnpm', 'check:release-worktree', '--capture'],
      ['pnpm', 'check:branch'],
      ['pnpm', 'check:native-packages'],
      ['pnpm', 'check:native-binaries'],
      ['pnpm', 'build'],
      ['pnpm', 'check:cjs'],
      ['pnpm', 'build-dts'],
      ['pnpm', 'check:release-artifacts', '--require-binaries'],
      ['pnpm', 'api:check'],
      ['pnpm', 'check'],
      ['pnpm', 'lint'],
      ['pnpm', 'test-unit'],
      ['pnpm', 'bench:compiler-native'],
      ['pnpm', 'check:package-versions'],
      ['pnpm', 'examples:check:all'],
      ['pnpm', 'check:create-zeus'],
      ['pnpm', 'bench:component-host:ci'],
      ['pnpm', 'docs:build'],
      ['pnpm', 'size:ci'],
      ['pnpm', 'check:exports'],
      ['pnpm', 'check:repository'],
      ['pnpm', 'check:release-worktree', '--verify'],
    ])
  })

  it('keeps canary downstream dispatch compatible with zeus-ui', () => {
    expect(config.canary).toMatchObject({
      enabled: true,
      prefix: 'canary',
      tag: 'canary',
      envName: 'ZEUS_CANARY_VERSION',
      dispatch: {
        tokenEnv: 'ZEUS_UI_DISPATCH_TOKEN',
        repository: 'baicie/zeus-ui',
        eventType: 'zeus-canary-published',
      },
    })
  })
})
