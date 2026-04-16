import { configDefaults, defineConfig } from 'vitest/config'

import { entries } from './scripts/aliases.ts'

// 测试项目配置
const testProjects = [
  { name: 'unit', include: ['packages/signal/**/*.{test,spec}.*'] },
  {
    name: 'unit-compiler',
    include: ['packages/compiler-core/**/*.{test,spec}.*'],
  },
  {
    name: 'unit-compiler-babel',
    include: ['packages/compiler/__tests__/**/*.{test,spec}.*'],
  },
  {
    name: 'unit-server-renderer',
    include: ['packages/server-renderer/__tests__/**/*.{test,spec}.*'],
  },
  {
    name: 'unit-runtime',
    include: ['packages/{runtime-core,runtime-dom}/**/*.{test,spec}.*'],
    environment: 'jsdom',
  },
  {
    name: 'unit-jsdom',
    include: ['packages/{zeus,runtime}/**/*.{test,spec}.*'],
    environment: 'jsdom',
  },
  {
    name: 'e2e',
    include: ['packages/zeus/__tests__/e2e/*.spec.ts'],
    environment: 'jsdom',
  },
]

export default defineConfig({
  define: {
    __DEV__: 'true',
    __TEST__: 'true',
    __VERSION__: '"test"',
    __BROWSER__: 'false',
    __GLOBAL__: 'false',
    __ESM_BUNDLER__: 'true',
    __ESM_BROWSER__: 'false',
    __CJS__: 'true',
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
        exclude: [...configDefaults.exclude, '**/e2e/**'],
      },
    })),
  },
})
