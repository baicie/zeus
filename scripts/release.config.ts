import { defineReleaseConfig } from '@baicie/release'

import { syncNativeLoader } from './release/sync-native-loader'

export const zeusFixedPackages = [
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
]

export const zeusNativePackages = [
  '@zeus-js/compiler-native',
  '@zeus-js/compiler-native-darwin-arm64',
  '@zeus-js/compiler-native-darwin-x64',
  '@zeus-js/compiler-native-linux-arm64-gnu',
  '@zeus-js/compiler-native-linux-x64-gnu',
  '@zeus-js/compiler-native-linux-x64-musl',
  '@zeus-js/compiler-native-win32-arm64-msvc',
  '@zeus-js/compiler-native-win32-x64-msvc',
]

export default defineReleaseConfig({
  repo: 'baicie/zeus',
  repositoryUrl: 'https://github.com/baicie/zeus.git',
  mode: 'changesets-fixed',
  packageManager: 'pnpm',

  workspace: {
    roots: ['packages'],
    include: zeusFixedPackages,
    packageKind(relativeDir) {
      if (relativeDir.startsWith('packages/core/')) return 'core'
      if (relativeDir.startsWith('packages/web-c/')) return 'web-c'
      return undefined
    },
  },

  fixedPackages: zeusFixedPackages,
  rootVersionPackage: '@zeus-js/zeus',
  changesetFile: '.changeset/release.md',
  changelogFile: 'CHANGELOG.md',

  async afterVersion({ version }) {
    await syncNativeLoader(version)
  },

  publish: {
    access: 'public',
    provenance: true,
    skipExisting: true,
    retry: 5,
  },

  precheck: {
    commands: [
      ['pnpm', 'check:release-worktree', '--capture'],
      ['pnpm', 'check:branch'],
      ['pnpm', 'audit:prod'],
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
    ],
  },

  /**
   * Zeus 本身已经有 check:exports / check:repository / api:check 这些强约束，
   * 所以这里不要启用通用 common readiness。
   *
   * common readiness 会要求每个包都有 scripts.check / files: ["dist"] 等，
   * 这对 zeus 现有包结构可能过严。
   */
  readiness: {
    common: false,
    strict: false,
    allowZero: false,
    package(pkg) {
      const errors: string[] = []

      if (!pkg.name.startsWith('@zeus-js/')) {
        errors.push(`${pkg.name}: expected @zeus-js scope`)
      }

      if (!zeusFixedPackages.includes(pkg.name)) {
        errors.push(`${pkg.name}: package is not in zeus fixed release group`)
      }

      if (!pkg.packageJson.version) {
        errors.push(`${pkg.name}: missing version`)
      }

      if (pkg.packageJson.private) {
        errors.push(`${pkg.name}: private package should not be publishable`)
      }

      return errors
    },
  },

  canary: {
    enabled: true,
    prefix: 'canary',
    tag: 'canary',
    envName: 'ZEUS_CANARY_VERSION',
    includeBranches: ['main'],
  },
})
