#!/usr/bin/env tsx

import { execSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const packagesDir = resolve('packages')

function buildPackages() {
  console.log('🏗️  Building packages...')

  const packages = readdirSync(packagesDir)
    .filter(dir => statSync(join(packagesDir, dir)).isDirectory())
    .filter(dir => dir !== 'global.d.ts')

  for (const pkg of packages) {
    const pkgPath = join(packagesDir, pkg)
    console.log(`📦 Building ${pkg}...`)

    try {
      execSync('npm run build', {
        cwd: pkgPath,
        stdio: 'inherit',
      })
      console.log(`✅ ${pkg} built successfully`)
    } catch (error) {
      console.error(`❌ Failed to build ${pkg}:`, error)
    }
  }

  console.log('🎉 All packages built!')
}

buildPackages()
