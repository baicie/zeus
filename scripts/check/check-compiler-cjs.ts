// @ts-nocheck

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const root = path.resolve(__dirname, '../..')
const cjsFile = path.resolve(root, 'packages/core/compiler/dist/compiler.cjs')

if (!fs.existsSync(cjsFile)) {
  console.error(`[check-cjs:compiler] CJS output not found at: ${cjsFile}`)
  console.error('[check-cjs:compiler] Run: pnpm build')
  process.exit(1)
}

const compilerEntry = path.resolve(root, 'packages/core/compiler/index.cjs')
const compiler = require(compilerEntry)
const transformModule = compiler.transformModule ?? compiler.default

if (typeof transformModule !== 'function') {
  console.error(
    '[check-cjs:compiler] FAIL: transformModule is missing from the CJS entry.',
  )
  process.exit(1)
}

const result = transformModule({
  source: 'const view = <div data-id="ok">ok</div>',
  filename: 'input.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: true,
})

if (!result?.code?.includes('template')) {
  console.error(
    '[check-cjs:compiler] FAIL: transformModule did not produce native code.',
  )
  console.error('Output:', result)
  process.exit(1)
}

console.log('[check-cjs:compiler] ok')
