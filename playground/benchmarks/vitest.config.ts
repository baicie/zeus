import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    testTimeout: 30000, // 基准测试可能需要更长时间
    hookTimeout: 30000,
    teardownTimeout: 30000,
    // 基准测试通常不需要并行执行
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // 禁用覆盖率收集，因为这是基准测试
    coverage: {
      enabled: false,
    },
    // 基准测试需要更详细的输出
    reporter: ['verbose'],
    // 允许基准测试运行更长时间
    sequence: {
      concurrent: false,
    },
  },
  define: {
    // 基准测试环境变量
    __DEV__: true,
    __TEST__: true,
    __BENCHMARK__: true,
  },
  resolve: {
    // 确保能正确解析React和Vue
    alias: {
      react: 'react',
      'react-dom': 'react-dom',
      vue: 'vue',
    },
  },
})
