import { defineReleaseConfig } from '@baicie/release'

export const zeusFixedPackages = [
  '@zeus-js/shared',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/compiler',
  '@zeus-js/zeus',
  '@zeus-js/bundler-plugin',
  '@zeus-js/component-analyzer',
  '@zeus-js/component-dts',
  '@zeus-js/output-wc',
  '@zeus-js/output-react-wrapper',
  '@zeus-js/output-vue-wrapper',
  '@zeus-js/output-css',
  '@zeus-js/output-icons',
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

  publish: {
    access: 'public',
    provenance: true,
    skipExisting: true,
    retry: 5,
  },

  precheck: {
    commands: [
      ['pnpm', 'check:branch'],
      ['pnpm', 'build'],
      ['pnpm', 'check:compiler-cjs'],
      ['pnpm', 'build-dts'],
      ['pnpm', 'api:check'],
      ['pnpm', 'check'],
      ['pnpm', 'lint'],
      ['pnpm', 'test-unit'],
      ['pnpm', 'examples:check:all'],
      ['pnpm', 'bench:component-host:ci'],
      ['pnpm', 'docs:build'],
      ['pnpm', 'size:ci'],
      ['pnpm', 'check:exports'],
      ['pnpm', 'check:repository'],
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
    dispatch: {
      tokenEnv: 'ZEUS_UI_DISPATCH_TOKEN',
      repository: 'baicie/zeus-ui',
      eventType: 'zeus-canary-published',
      payload: ({ version, sha }) => ({
        source: 'zeus',
        sha,
        version,
      }),
    },
  },
})
