import { defineReleaseConfig } from '@baicie/release'

import { syncCreateZeusVersions } from './release/create-zeus-versions'
import { packageKind } from './release/publish-order'
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
    /** The release *order* group. See `release/publish-order.ts`. */
    packageKind: packageKind,
  },

  fixedPackages: zeusFixedPackages,
  rootVersionPackage: '@zeus-js/zeus',
  changesetFile: '.changeset/release.md',
  changelogFile: 'CHANGELOG.md',

  async afterVersion({ version }) {
    await syncNativeLoader(version)
    syncCreateZeusVersions({
      root: process.cwd(),
      coreVersion: version,
      ...(process.env.ZEUS_UI_VERSION
        ? { uiVersion: process.env.ZEUS_UI_VERSION }
        : {}),
    })
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
      ['pnpm', 'check:secrets'],
      ['pnpm', 'check:sbom:write'],
      ['pnpm', 'check:sbom'],
      ['pnpm', 'check:native-packages'],
      ['pnpm', 'check:native-binaries'],
      /*
       * `zeus-compiler.wasm` is a cargo artifact and `.gitignore` excludes it.
       * `check:exports` verifies that every export target exists, and
       * `@zeus-js/compiler-wasm` exports `./zeus-compiler.wasm` — so on a fresh
       * checkout `pnpm build` alone leaves that gate reporting "points to
       * missing file" for a correct export whose artifact was simply never
       * built.
       *
       * This was dormant while compiler-wasm was `private: true` and
       * `check:exports` skipped it. It became live when the package was made
       * publishable for the Playground migration. The canary list gained the
       * same line earlier, for the same reason.
       *
       * The workflow that runs this list must also have the
       * `wasm32-unknown-unknown` target installed; a command list cannot
       * install a toolchain.
       */
      ['pnpm', '--filter', '@zeus-js/compiler-wasm', 'build:wasm'],
      ['pnpm', 'build'],
      ['pnpm', 'check:runtime-interop'],
      ['pnpm', 'check:cjs'],
      ['pnpm', 'build-dts'],
      [
        'pnpm',
        'check:release-artifacts',
        '--require-binaries',
        '--out',
        'temp/release/tarballs.json',
      ],
      ['pnpm', 'api:check'],
      /*
       * The version table is derived from the manifests, and a release that
       * bumps one without the other is what put `package-table.spec.ts` red on
       * main after publishing the DevTools consumer. Listed here beside
       * `api:check` because they are the same kind of check: a derived document
       * that must agree with the tree it describes.
       */
      ['pnpm', 'check:package-table'],
      ['pnpm', 'check'],
      ['pnpm', 'lint'],
      ['pnpm', 'test-unit'],
      ['pnpm', 'bench:compiler-native'],
      ['pnpm', 'check:package-versions'],
      ['pnpm', 'check:latest-tags'],
      ['pnpm', 'examples:check:all'],
      ['pnpm', 'check:create-zeus'],
      ['pnpm', 'check:create-zeus-candidate'],
      ['pnpm', 'check:create-zeus-versions'],
      /*
       * Publishing a scaffold whose template names a version nobody can
       * install is a broken release that no later step repairs: `create-zeus`
       * ships on its own train, and once a template leaves this repository
       * pinned to an unpublished `@zeus-web/*` version, every `create-zeus`
       * user who scaffolds that template gets `ETARGET`.
       *
       * The candidate gate covers this template during the release, but only
       * with tarballs built from the paired UI checkout. This asks the
       * question the release itself has to answer: is the pin installable from
       * the registry *now*? A registry that cannot answer fails the step rather
       * than being read as "not published".
       */
      ['pnpm', 'check:template-dependencies'],
      ['pnpm', 'bench:component-host:ci'],
      ['pnpm', 'docs:build'],
      ['pnpm', 'size:ci'],
      ['pnpm', 'check:exports'],
      ['pnpm', 'check:repository'],
      // A release runs inside the `Release` environment; a workflow bound to
      // the wrong one would be refused at deploy time, which is a late and
      // confusing way to find out.
      ['pnpm', 'check:environment-topology'],
      ['pnpm', 'check:release-pairing'],
      // RC readiness validates the packed consumer report; generate it in the
      // same precheck so a stale or missing report cannot pass the gate.
      ['pnpm', 'check:packed-consumers'],
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
