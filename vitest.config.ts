import { configDefaults, defineConfig } from 'vitest/config'
import { entries } from './scripts/aliases.ts'

export default defineConfig({
  define: {
    __DEV__: true,
    __TEST__: true,
    __VERSION__: '"test"',
    __BROWSER__: false,
    __GLOBAL__: false,
    __ESM_BUNDLER__: true,
    __ESM_BROWSER__: false,
    __CJS__: true,
    // __SSR__: true,
  },
  resolve: {
    alias: entries,
  },
  test: {
    globals: true,
    pool: 'threads',
    setupFiles: 'scripts/setup-vitest.ts',
    sequence: {
      hooks: 'list',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
      exclude: [],
    },

    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/signal/**/*.{test,spec}.*'],
          exclude: [...configDefaults.exclude, '**/e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'unit-runtime',
          include: ['packages/{runtime-core,runtime-dom}/**/*.{test,spec}.*'],
          exclude: [...configDefaults.exclude, '**/e2e/**'],
          environment: 'jsdom',
        },
      },
      {
        extends: true,
        test: {
          name: 'unit-jsdom',
          include: ['packages/{zeus,runtime}/**/*.{test,spec}.*'],
          exclude: [...configDefaults.exclude, '**/e2e/**'],
          environment: 'jsdom',
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          environment: 'jsdom',
          poolOptions: {
            threads: {
              singleThread: !!process.env.CI,
            },
          },
          include: ['packages/zeus/__tests__/e2e/*.spec.ts'],
        },
      },
    ],
  },
})
