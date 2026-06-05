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

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { exec } from '../shared/utils'

interface ExamplePackageJson {
  name?: string
  scripts?: Record<string, string>
}

const buildFirst = ['@zeus-ui/headless']

function readExamples() {
  const examplesDir = join(process.cwd(), 'examples')

  return readdirSync(examplesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const packageJsonPath = join(examplesDir, entry.name, 'package.json')
      const packageJson = JSON.parse(
        readFileSync(packageJsonPath, 'utf8'),
      ) as ExamplePackageJson

      if (!packageJson.name) {
        throw new Error(
          `Missing package name: examples/${entry.name}/package.json`,
        )
      }

      if (!packageJson.scripts?.check || !packageJson.scripts?.build) {
        throw new Error(`Missing check/build scripts: ${packageJson.name}`)
      }

      return packageJson.name
    })
    .filter(name => !buildFirst.includes(name))
    .sort()
}

const examples = readExamples()

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
