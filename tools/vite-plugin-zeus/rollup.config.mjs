import { defineConfig } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import terser from '@rollup/plugin-terser'
import { visualizer } from 'rollup-plugin-visualizer'

const external = [
  'vite',
  '@zeus-js/compiler-core',
  '@zeus-js/compiler-dom',
  /node_modules/,
]

// 共享的插件配置
const plugins = [
  resolve({
    preferBuiltins: true,
  }),
  commonjs(),
  json(),
  typescript({
    tsconfig: './tsconfig.json',
    sourceMap: true,
    declaration: true,
    declarationDir: './dist',
  }),
  visualizer({
    filename: 'dist/stats.html',
    open: false,
    gzipSize: true,
    brotliSize: true,
    template: 'treemap',
  }),
]

export default defineConfig([
  // ESM 构建
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.mjs',
      format: 'esm',
      sourcemap: true,
      inlineDynamicImports: true,
    },
    external,
    plugins,
  },
  // CJS 构建
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true,
      exports: 'named',
    },
    external,
    plugins,
  },
  // 生产环境 CJS 构建 (压缩版)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.prod.cjs',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true,
      exports: 'named',
    },
    external,
    plugins: [...plugins, terser()],
  },
])
