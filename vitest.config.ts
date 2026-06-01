import { configDefaults, defineConfig } from 'vitest/config'

import { entries } from './scripts/shared/aliases.ts'

// 测试项目配置
const testProjects = [
  {
    name: 'unit',
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'examples/headless/**/*.{test,spec}.{ts,tsx}',
    ],
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
        'packages/devtools/*/src/**',
        'packages/web-c/*/src/**',
        'examples/headless/src/**',
      ],
    },
    projects: testProjects.map(project => ({
      extends: true,
      test: {
        ...project,
        exclude: [...configDefaults.exclude, 'packages/create/**'],
        ...(project.name === 'bench' ? { mode: 'benchmark' } : {}),
      },
    })),
  },
})
