/**
 * Check and build all examples.
 * This script ensures each example:
 * 1. Passes type-checking (tsc --noEmit)
 * 2. Can be built successfully (vite build)
 * Building validates the full Vite plugin production path, which tsc alone cannot.
 *
 * NOTE: packages must be built before running this script (build already happens
 * as the first step of release-precheck). If running standalone, pass --build-first
 * to let this script run the build itself.
 */

import { exec } from '../shared/utils'

const buildFirst = ['@zeus-ui/headless']

const examples = [
  '@zeus-js/example-counter',
  '@zeus-js/example-todo',
  '@zeus-js/example-web-component',
  '@zeus-js/example-react-wrapper',
  '@zeus-js/example-vue-wrapper',
  '@zeus-js/example-registry-react',
  '@zeus-js/example-registry-vue',
  '@zeus-js/example-icons-no-runtime',
  '@zeus-js/example-context',
  '@zeus-js/example-light-dom-slots',
  '@zeus-js/example-project-board',

  '@zeus-js/example-headless-demo',
  '@zeus-js/example-use-headless-react',
  '@zeus-js/example-use-headless-vue',
  '@zeus-js/example-use-headless-cli',
]

const phases: Array<[string, string]> = [
  ['check', 'type-check'],
  ['build', 'build'],
]

async function run() {
  if (process.argv.includes('--build-first')) {
    console.log('\n> pnpm build\n')
    await exec('pnpm', ['build'], { stdio: 'inherit' })
  }

  for (const name of buildFirst) {
    console.log(`\n> [fixture build] ${name}\n`)
    await exec('pnpm', ['-F', name, 'check'], { stdio: 'inherit' })
    await exec('pnpm', ['-F', name, 'build'], { stdio: 'inherit' })
  }

  for (const name of examples) {
    for (const [cmd, label] of phases) {
      console.log(`\n> [${label}] ${name}\n`)
      await exec('pnpm', ['-F', name, cmd], { stdio: 'inherit' })
    }
  }

  console.log(`\nAll examples passed check + build.\n`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
