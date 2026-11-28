import { configDefaults, defineConfig } from 'vitest/config'

import { entries } from './scripts/shared/aliases.ts'
import { compileTestViews } from './scripts/testing/compile-test-views.ts'

// 测试项目配置
const testProjects = [
  {
    name: 'unit',
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'examples/headless/**/*.{test,spec}.{ts,tsx}',
      // The Playground's editor-level specs moved with the app to
      // `zeus-ecosystem/apps/playground`, where its own test runner covers the
      // highlighter's loading, failure and staleness states. Nothing in this
      // repository's `examples/` has unit specs any more; `examples/headless`
      // above is kept because its fixture asserts package behaviour.
      'scripts/**/*.{test,spec}.{ts,tsx}',
    ],
    /*
     * 20s, not the 5s default.
     *
     * A large part of this suite is not unit-shaped: specs read the real
     * repository tree, compile a module through the native compiler, spawn the
     * CLI, or start a server. Each costs 1-3s alone; run beside three hundred
     * other files they have crossed 5s and failed as timeouts. A timeout is a
     * measurement of the scheduler, and the failure it produces names no
     * assertion — which is how a real regression gets dismissed as flake and
     * rerun until green.
     *
     * 20s is still short enough that a genuine hang fails the run.
     */
    testTimeout: 20_000,
  },
  {
    name: 'bench',
    include: ['packages/**/__benchmarks__/*.bench.ts'],
  },
]

const resolveEntries = {
  ...entries,
  '@zeus-ui/headless': './examples/headless/src/index.ts',
  '@zeus-ui/registry': './packages/create/registry/src/index.ts',
  '@zeus-ui/registry/shared/cn': './packages/create/registry/src/shared/cn.ts',
  '@zeus-ui/registry/shared/theme':
    './packages/create/registry/src/shared/theme.ts',
}

export default defineConfig({
  plugins: [compileTestViews()],
  define: {
    __DEV__: 'true',
    __TEST__: 'true',
    __VERSION__: '"test"',
  },
  resolve: { alias: resolveEntries },
  test: {
    globals: true,
    setupFiles: 'scripts/testing/setup-vitest.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/core/*/src/**',
        'packages/tooling/*/src/**',
        'packages/web-c/*/src/**',
        'examples/headless/src/**',
      ],
    },
    projects: testProjects.map(project => ({
      extends: true,
      test: {
        ...project,
        exclude: [
          ...configDefaults.exclude,
          'packages/create/**',
          'packages/create/create-zeus/templates/**',
        ],
        ...(project.name === 'bench' ? { mode: 'benchmark' } : {}),
      },
    })),
  },
})
