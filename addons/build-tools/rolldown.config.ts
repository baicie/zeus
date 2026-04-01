import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'
import pkg from './package.json'
import globPkg from 'fast-glob'
const { globSync } = globPkg

const external = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.optionalDependencies),
]

const plugins = [
  dts({
    tsconfig: './tsconfig.json',
  }),
]

const inputs = globSync('./src/adapters/*.ts')

export default defineConfig([
  {
    input: inputs,
    output: {
      dir: './dist/esm',
      entryFileNames: '[name].mjs',
      chunkFileNames: 'chunk/[name]-[hash].mjs',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: inputs,
    output: {
      dir: './dist/cjs',
      entryFileNames: '[name].cjs',
      chunkFileNames: 'chunk/[name]-[hash].cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    external,
  },
])
