import { defineConfig } from 'rolldown'
import { builtinModules } from 'node:module'

export default defineConfig({
  input:
    '../../vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions/src/index.ts',
  output: {
    file: 'dist/babel-plugin-jsx-dom-expressions.js',
    format: 'esm',
    sourcemap: 'inline',
  },
  external: [
    ...builtinModules,
    ...[
      '@babel/plugin-syntax-jsx',
      '@babel/helper-module-imports',
      '@babel/types',
      'html-entities',
    ],
  ],
})
