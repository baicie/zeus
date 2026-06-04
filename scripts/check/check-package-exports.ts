import assert from 'node:assert'
import { existsSync } from 'node:fs'
import path from 'node:path'

import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

const allowWildcard = new Set<string>([
  // 尽量为空。如果临时保留某个包，必须写原因和 TODO。
])

// Document the invariant: allowWildcard should always be empty for published packages.
assert(
  allowWildcard.size === 0,
  'allowWildcard must be empty — all published packages must use explicit exports',
)

const packages = findWorkspacePackages()
  .filter(pkg => !pkg.packageJson.private)
  .filter(pkg => pkg.name.startsWith('@zeus-js/'))

let hasError = false

for (const pkg of packages) {
  const pkgJson = pkg.packageJson as {
    name: string
    exports?: Record<string, unknown>
  }

  if (!pkgJson.exports) {
    hasError = true
    console.error(
      pico.red(
        `${pkgJson.name}: missing package.json exports — all published @zeus-js/* packages must define exports`,
      ),
    )
    console.error(`  package: ${path.relative(process.cwd(), pkg.dir)}`)
    continue
  }

  if (
    Object.prototype.hasOwnProperty.call(pkgJson.exports, './*') &&
    !allowWildcard.has(pkgJson.name)
  ) {
    hasError = true
    console.error(
      pico.red(
        `${pkgJson.name}: exports must not contain "./*". Use explicit public subpaths.`,
      ),
    )
    console.error(`  package: ${path.relative(process.cwd(), pkg.dir)}`)
  }

  checkExports(pkgJson.name, pkg.dir, pkgJson.exports)
}

if (hasError) {
  process.exit(1)
}

console.log(pico.green('Package exports boundary check passed.\n'))

function checkExports(
  pkgName: string,
  pkgDir: string,
  exportsField: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(exportsField)) {
    if (!hasTypesTarget(value)) {
      error(`${pkgName} export "${key}" is missing "types" condition`)
    }
    checkExportValue(pkgName, pkgDir, key, value)
  }
}

function hasTypesTarget(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  const obj = value as Record<string, unknown>

  if (typeof obj.types === 'string') return true

  for (const nested of Object.values(obj)) {
    if (hasTypesTarget(nested)) return true
  }

  return false
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

  const conditions = Object.entries(value as Record<string, unknown>)
  checkConditionOrder(
    pkgName,
    key,
    conditions.map(([condition]) => condition),
  )

  for (const [condition, target] of conditions) {
    if (typeof target === 'string') {
      checkFile(pkgName, pkgDir, `${key}:${condition}`, target)
    }

    if (target && typeof target === 'object') {
      checkExportValue(pkgName, pkgDir, `${key}:${condition}`, target)
    }
  }
}

function checkConditionOrder(
  pkgName: string,
  key: string,
  conditions: string[],
): void {
  const nodeIndex = conditions.indexOf('node')
  if (nodeIndex === -1) return

  for (const condition of ['import', 'require']) {
    const conditionIndex = conditions.indexOf(condition)
    if (conditionIndex !== -1 && nodeIndex < conditionIndex) {
      error(
        `${pkgName} export "${key}" must place "${condition}" before "node" so public ${condition} resolution does not select the node fallback`,
      )
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
