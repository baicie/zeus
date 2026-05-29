import { existsSync } from 'node:fs'
import path from 'node:path'

import { findWorkspacePackages } from '../shared/utils'

const packages = findWorkspacePackages()
  .filter(pkg => !pkg.packageJson.private)
  .filter(pkg => pkg.packageJson.exports)

let hasError = false

for (const pkg of packages) {
  const pkgJson = pkg.packageJson as {
    name: string
    exports?: Record<string, unknown>
  }

  if (!pkgJson.exports) {
    continue
  }

  checkExports(pkgJson.name, pkg.dir, pkgJson.exports)
}

if (hasError) {
  process.exit(1)
}

console.log('Package exports check passed.\n')

function checkExports(
  pkgName: string,
  pkgDir: string,
  exportsField: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(exportsField)) {
    checkExportValue(pkgName, pkgDir, key, value)
  }
}

function checkExportValue(
  pkgName: string,
  pkgDir: string,
  key: string,
  value: unknown,
): void {
  if (typeof value === 'string') {
    checkFile(pkgName, pkgDir, key, value)
    return
  }

  if (!value || typeof value !== 'object') return

  for (const [condition, target] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (typeof target === 'string') {
      checkFile(pkgName, pkgDir, `${key}:${condition}`, target)
    }

    if (target && typeof target === 'object') {
      checkExportValue(pkgName, pkgDir, `${key}:${condition}`, target)
    }
  }
}

function checkFile(
  pkgName: string,
  pkgDir: string,
  key: string,
  target: string,
): void {
  if (!target.startsWith('./')) return
  if (target.includes('*')) return

  const file = path.resolve(pkgDir, target)

  if (!existsSync(file)) {
    error(`${pkgName} export "${key}" points to missing file: ${target}`)
  }
}

function error(message: string): void {
  hasError = true
  console.error(message)
}
