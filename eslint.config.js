import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'
import { builtinModules } from 'node:module'
import { defineConfig } from 'eslint/config'

// 禁止使用的语法
const BANNED_SYNTAX = {
  banConstEnum: {
    selector: 'TSEnumDeclaration[const=true]',
    message:
      'Please use non-const enums. This project automatically inlines enums.',
  },
  banObjectRestSpread: {
    selector: 'ObjectPattern > RestElement',
    message:
      'Our output target is ES2016, and object rest spread results in verbose helpers and should be avoided.',
  },
  banObjectSpread: {
    selector: 'ObjectExpression > SpreadElement',
    message:
      'esbuild transpiles object spread into very verbose inline helpers.\n' +
      'Please use the `extend` helper from @zeus-js/shared instead.',
  },
  banAwait: {
    selector: 'AwaitExpression',
    message:
      'Our output target is ES2016, so async/await syntax should be avoided.',
  },
  banOptionalChaining: {
    selector: 'ChainExpression',
    message:
      'Our output target is ES2016, and optional chaining results in verbose helpers and should be avoided.',
  },
}

// 全局环境限制
const NODE_GLOBALS = ['window', 'document']
const BROWSER_GLOBALS = ['module', 'require']

// 共享规则
const SHARED_RULES = {
  'no-debugger': 'error',
  'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
  'no-restricted-globals': ['error', ...NODE_GLOBALS, ...BROWSER_GLOBALS],
  'no-restricted-syntax': ['error', ...Object.values(BANNED_SYNTAX)],
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

// 测试文件规则
const TEST_RULES = {
  'no-console': 'off',
  'no-restricted-globals': 'off',
  'no-restricted-syntax': 'off',
  'no-unused-vars': 'off',
  'vitest/no-disabled-tests': 'error',
  'vitest/no-focused-tests': 'error',
}

// 忽略文件
const IGNORED_PATTERNS = [
  '**/dist/',
  '**/temp/',
  '**/coverage/',
  '.idea/',
  'examples',
  'target',
  'packages/compiler-core/src/binding.*',
  'packages/compiler-core/src/wasi-worker*',
  'packages/compiler-core/src/browser.*',
  'packages/compiler-core/src/zeusjs-binding.*',
]

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
  },

  // ============================================
  // 测试文件配置
  // ============================================
  {
    name: 'tests',
    files: [
      '**/__tests__/**',
      'packages-private/dts-test/**',
      'packages-private/dts-build-test/**',
      'addons/**/__tests__/**',
    ],
    plugins: { vitest },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    rules: TEST_RULES,
  },

  // ============================================
  // Playground - 允许所有语法
  // ============================================
  {
    name: 'playground',
    files: ['playground/**'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
    },
  },

  // ============================================
  // 工具脚本 - 允许所有语法
  // ============================================
  {
    name: 'tools',
    files: ['tools/**'],
    rules: {
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
  // 运行时包 (DOM 环境)
  // ============================================
  {
    name: 'runtime-packages',
    files: ['packages/{zeus,runtime-core,runtime-dom}/**'],
    rules: {
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
    },
  },

  // ============================================
  // 编译器包 (Node 环境)
  // ============================================
  {
    name: 'compiler-packages',
    files: ['packages/compiler-*/**'],
    rules: {
      'no-restricted-globals': ['error', ...NODE_GLOBALS],
      'no-restricted-syntax': ['error', BANNED_SYNTAX.banConstEnum],
      'no-console': 'off',
    },
  },

  // ============================================
  // Addons - Router (浏览器环境)
  // ============================================
  {
    name: 'addons-router',
    files: ['addons/router/**'],
    rules: {
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
    },
  },

  // ============================================
  // Addons - Bundle Plugin (Node 环境)
  // ============================================
  {
    name: 'addons-bundle-plugin',
    files: ['addons/bundle-plugin/**'],
    rules: {
      'no-restricted-globals': ['error', ...NODE_GLOBALS],
      'no-restricted-syntax': ['error', BANNED_SYNTAX.banConstEnum],
      'no-console': 'off',
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
      'packages/{zeus,runtime-core,runtime-dom}/*/*.js',
      'addons/*/*.{js,ts}',
      'addons/*/rolldown.config.ts',
    ],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': ['error', BANNED_SYNTAX.banConstEnum],
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
)
