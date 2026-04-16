import { configDefaults, defineConfig } from 'vitest/config'

import { entries } from './scripts/aliases.ts'

// 测试项目配置
const testProjects = [
  {
    name: 'unit',
    include: ['packages/**/*.{test,spec}.*'],
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
    setupFiles: 'scripts/setup-vitest.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
    projects: testProjects.map(project => ({
      extends: true,
      test: {
        ...project,
        exclude: [...configDefaults.exclude],
      },
    })),
  },
})
