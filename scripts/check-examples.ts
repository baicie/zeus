/**
 * Check all examples for TypeScript errors.
 * This script ensures each example can be type-checked independently.
 */

import { spawnSync } from 'node:child_process'

const examples = [
  '@zeus-js/example-counter',
  '@zeus-js/example-todo',
  '@zeus-js/example-web-component',
  '@zeus-js/example-context',
  '@zeus-js/example-light-dom-slots',
  '@zeus-js/example-project-board',
]

for (const name of examples) {
  console.log(`\n> checking ${name}\n`)

  const result = spawnSync('pnpm', ['-F', name, 'check'], {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    console.error(`\nFailed: ${name}\n`)
    process.exit(result.status ?? 1)
  }
}

console.log(`\nAll ${examples.length} examples passed.\n`)
