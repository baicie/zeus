import { configDefaults, defineConfig } from 'vitest/config'

import { entries } from './scripts/shared/aliases.ts'

// 测试项目配置
const testProjects = [
  {
    name: 'unit',
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'addons/**/*.{test,spec}.{ts,tsx}',
    ],
  },
  {
    name: 'bench',
    include: [
      'packages/**/__benchmarks__/*.bench.ts',
      'addons/**/__benchmarks__/*.bench.ts',
    ],
  },
]

export default defineConfig({
  define: {
    __DEV__: 'true',
    __TEST__: 'true',
    __VERSION__: '"test"',
  },
  resolve: { alias: entries },
  test: {
    globals: true,
    setupFiles: 'scripts/testing/setup-vitest.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**', 'addons/*/src/**'],
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
