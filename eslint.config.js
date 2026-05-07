import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'
import { builtinModules } from 'node:module'
import { defineConfig } from 'eslint/config'

// 共享规则
const SHARED_RULES = {
  'no-debugger': 'error',
  'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
  'no-restricted-globals': 'off',
  'import-x/no-nodejs-modules': [
    'error',
    { allow: builtinModules.map(mod => `node:${mod}`) },
  ],
  '@typescript-eslint/prefer-ts-expect-error': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    {
      fixStyle: 'inline-type-imports',
      disallowTypeAnnotations: false,
    },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  'import-x/order': [
    'error',
    {
      groups: [
        'builtin',
        'external',
        'internal',
        ['parent', 'sibling'],
        'index',
        'object',
        'type',
      ],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    },
  ],
  'no-unused-vars': ['error', { vars: 'all', args: 'none' }],
}

// 忽略文件
const IGNORED_PATTERNS = ['**/dist/', '**/temp/', '**/coverage/', 'target']

// 全局声明 - 由构建工具注入
const GLOBAL_DECLARATIONS = {
  __DEV__: 'readonly',
  __TEST__: 'readonly',
  __BROWSER__: 'readonly',
  __GLOBAL__: 'readonly',
  __ESM_BUNDLER__: 'readonly',
  __ESM_BROWSER__: 'readonly',
  __CJS__: 'readonly',
  __SSR__: 'readonly',
  __VERSION__: 'readonly',
}

export default defineConfig(
  // ============================================
  // 基础配置 - 适用于所有 TypeScript 文件
  // ============================================
  {
    name: 'base',
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['eslint.config.js'],
    extends: [tseslint.configs.base],
    plugins: {
      'import-x': importX,
    },
    rules: SHARED_RULES,
    languageOptions: {
      globals: GLOBAL_DECLARATIONS,
    },
  },

  // ============================================
  // 测试文件配置
  // ============================================
  {
    name: 'tests',
    files: ['**/__tests__/**'],
    rules: {
      'no-console': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      'no-unused-vars': 'off',
    },
  },

  // ============================================
  // Shared 包 - 无环境限制
  // ============================================
  {
    name: 'shared-package',
    files: ['packages/shared/**', 'eslint.config.js'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  // ============================================
  // JavaScript 文件
  // ============================================
  {
    name: 'javascript-files',
    files: ['*.js'],
    rules: {
      'no-unused-vars': ['error', { vars: 'all', args: 'none' }],
    },
  },

  // ============================================
  // Node 脚本
  // ============================================
  {
    name: 'node-scripts',
    files: [
      'eslint.config.js',
      'rollup*.config.js',
      'scripts/**',
      './*.{js,ts}',
      'packages/*/*.js',
    ],
    rules: {
      'no-restricted-globals': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
    },
  },

  // ============================================
  // 忽略文件
  // ============================================
  {
    name: 'ignores',
    ignores: IGNORED_PATTERNS,
  },

  // ============================================
  // 全局声明文件 - 禁用 no-unused-vars
  // ============================================
  {
    name: 'global-declarations',
    files: ['packages/global.d.ts'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
)
