// Builds the wasm32 compiler host and copies it next to the loader.
import { execFileSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

execFileSync(
  'cargo',
  [
    'build',
    '--package',
    'zeus_compiler_wasm',
    '--target',
    'wasm32-unknown-unknown',
    '--release',
    '--locked',
  ],
  { cwd: root, stdio: 'inherit' },
)
copyFileSync(
  new URL(
    'target/wasm32-unknown-unknown/release/zeus_compiler_wasm.wasm',
    `file://${root}`,
  ),
  new URL('../zeus-compiler.wasm', import.meta.url),
)
