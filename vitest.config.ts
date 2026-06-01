import { configDefaults, defineConfig } from 'vitest/config'

import { entries } from './scripts/shared/aliases.ts'

// 测试项目配置
const testProjects = [
  {
    name: 'unit',
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'create/**/*.{test,spec}.{ts,tsx}',
    ],
  },
  {
    name: 'bench',
    include: ['packages/**/__benchmarks__/*.bench.ts'],
  },
]

const resolveEntries = {
  ...entries,
  '@zeus-ui/registry': './packages/registry/src/index.ts',
  '@zeus-ui/registry/shared/cn': './packages/registry/src/shared/cn.ts',
  '@zeus-ui/registry/shared/theme': './packages/registry/src/shared/theme.ts',
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
        'packages/headless/src/**',
      ],
    },
    projects: testProjects.map(project => ({
      extends: true,
      test: {
        ...project,
        exclude: [...configDefaults.exclude],
        ...(project.name === 'bench' ? { mode: 'benchmark' } : {}),
      },
    })),
  },
})
