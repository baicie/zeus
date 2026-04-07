import { createRequire } from 'node:module'
import type { RolldownOptions } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const external = [...Object.keys(pkg.dependencies || {})]

const banner = `/**
 * @zeus-js/babel-preset-zeus
 * MIT License
 */\n`

const esmConfig: RolldownOptions = {
  input: 'src/index.ts',
  external,
  plugins: [
    dts({
      tsconfig: './tsconfig.json',
    }),
  ],
  output: {
    dir: './dist/esm',
    entryFileNames: '[name].mjs',
    format: 'esm',
    sourcemap: true,
    banner,
  },
}

const cjsConfig: RolldownOptions = {
  input: 'src/index.ts',
  external,
  output: {
    dir: './dist/cjs',
    entryFileNames: '[name].cjs',
    format: 'cjs',
    sourcemap: true,
    exports: 'named',
    banner,
  },
}

export default [esmConfig, cjsConfig]
