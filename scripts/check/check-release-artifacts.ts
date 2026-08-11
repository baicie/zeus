import pico from 'picocolors'

import { readPackedFiles } from './check-packed-files'
import {
  findMissingRequiredPaths,
  normalizePath,
} from './release-artifact-utils'
import { zeusFixedPackages } from '../release.config'
import { findWorkspacePackages, type WorkspacePackage } from '../shared/utils'

export function getReleasePackages(
  packages = findWorkspacePackages(),
): WorkspacePackage[] {
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]))
  return zeusFixedPackages.map(name => {
    const pkg = byName.get(name)
    if (!pkg) throw new Error(`Missing fixed release package: ${name}`)
    return pkg
  })
}

function main(): void {
  const requireBinaries = process.argv.includes('--require-binaries')
  const selectedPackage = readOption('--package')
  const packages = getReleasePackages().filter(pkg => {
    return (
      !selectedPackage ||
      pkg.name === selectedPackage ||
      pkg.shortName === selectedPackage
    )
  })
  if (packages.length === 0) {
    throw new Error(`Unknown release package: ${selectedPackage}`)
  }
  let hasError = false

  for (const pkg of packages) {
    const files = pkg.packageJson.files
    if (!Array.isArray(files) || files.some(file => typeof file !== 'string')) {
      hasError = true
      console.error(
        pico.red(`${pkg.name}: package.json.files must be a string[]`),
      )
      continue
    }

    try {
      const packedFiles = readPackedFiles(pkg.dir)
      const missing = findMissingRequiredPaths(packedFiles, files, {
        requireBinaries,
      })
      if (missing.length > 0) {
        hasError = true
        console.error(
          pico.red(
            `${pkg.name}: required files are not present in the npm tarball: ${missing.join(', ')}`,
          ),
        )
      }
      if (requireBinaries && pkg.name.startsWith('@zeus-js/compiler-native-')) {
        if (!packedFiles.some(file => normalizePath(file).endsWith('.node'))) {
          hasError = true
          console.error(
            pico.red(`${pkg.name}: native tarball contains no .node binary`),
          )
        }
      }
    } catch (error) {
      hasError = true
      console.error(
        pico.red(
          `${pkg.name}: npm pack failed (${error instanceof Error ? error.message : String(error)})`,
        ),
      )
    }
  }

  if (hasError) process.exit(1)

  console.log(
    pico.green(
      `Release package tarballs passed (${packages.length} packages${requireBinaries ? ', native binaries required' : ''}).`,
    ),
  )
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}

main()
