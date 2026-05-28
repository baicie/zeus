import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..', '..')

const packages = [
  'packages/zeus/package.json',
  'packages/signal/package.json',
  'packages/runtime-dom/package.json',
  'packages/compiler/package.json',
  'packages/vite-plugin/package.json',
]

let hasError = false

for (const pkgPath of packages) {
  const fullPath = resolve(root, pkgPath)
  const pkg = JSON.parse(readFileSync(fullPath, 'utf-8')) as {
    name: string
    exports?: Record<string, unknown>
  }

  if (!pkg.exports) {
    error(`${pkg.name}: missing exports`)
    continue
  }

  checkExports(pkg.name, dirname(fullPath), pkg.exports)
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

  const file = resolve(pkgDir, target)

  if (!existsSync(file)) {
    error(`${pkgName} export "${key}" points to missing file: ${target}`)
  }
}

function error(message: string): void {
  hasError = true
  console.error(message)
}
