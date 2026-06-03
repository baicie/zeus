// @ts-nocheck
// Must be defined before any zeus packages are loaded.
// @zeus-js/shared source uses `__DEV__` as a global identifier.
// When Node resolves @zeus-js/shared without a node_modules/@zeus-js symlink,
// it falls back to TS source. The smoke test runs outside vitest's define
// callback, so we polyfill __DEV__ here.
globalThis.__DEV__ = true

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { transformSync } from '@babel/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)

// --- 1. Verify no @babel/plugin-syntax-jsx in CJS output ---
const cjsFile = path.resolve(
  root,
  'packages/core/compiler/dist/compiler.cjs.js',
)

if (!fs.existsSync(cjsFile)) {
  console.error(`[check-compiler-cjs] CJS output not found at: ${cjsFile}`)
  console.error('[check-compiler-cjs] Run: pnpm build compiler -f cjs')
  process.exit(1)
}

const cjsCode = fs.readFileSync(cjsFile, 'utf-8')

if (cjsCode.includes('@babel/plugin-syntax-jsx')) {
  console.error(
    '[check-compiler-cjs] FAIL: CJS output should not contain @babel/plugin-syntax-jsx.',
  )
  process.exit(1)
}

console.log('[check-compiler-cjs] CJS output is clean (no syntax-jsx)')

// --- 2. Require CJS entry and run transform smoke test ---
const compilerEntry = path.resolve(root, 'packages/core/compiler/index.js')
const zeusCompiler = require(compilerEntry)
const plugin = zeusCompiler.default ?? zeusCompiler

const result = transformSync('const view = <div data-id="ok">ok</div>', {
  filename: 'input.jsx',
  babelrc: false,
  configFile: false,
  plugins: [[plugin, {}]],
})

if (!result?.code) {
  console.error(
    '[check-compiler-cjs] FAIL: empty transform result from CJS smoke test.',
  )
  process.exit(1)
}

// JSX compiled output should contain the _template runtime call.
// If the transform ran successfully, the output will include _template(`<div...>`).
// We verify compilation happened by checking for the template call, not by
// searching for `<div` (which legitimately appears inside template string literals).
if (!result?.code?.includes('_template(')) {
  console.error(
    '[check-compiler-cjs] FAIL: transform did not produce _template() call.',
  )
  console.error('Output:', result?.code)
  process.exit(1)
}

console.log('[check-compiler-cjs] ok')
