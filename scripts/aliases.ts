import { readdirSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve entry file path for a package
 */
const resolveEntryForPkg = (pkgName: string): string =>
  path.resolve(
    fileURLToPath(import.meta.url),
    `../../packages/${pkgName}/src/index.ts`,
  )

/**
 * Get all package directories
 */
const getPackageDirs = (): string[] => {
  const packagesUrl = new URL('../packages', import.meta.url)
  return readdirSync(packagesUrl)
}

/**
 * Generate alias entries for packages
 */
const generateEntries = (): Record<string, string> => {
  const entries: Record<string, string> = {}

  for (const dir of getPackageDirs()) {
    const key = `@zeus-js/${dir}`
    const packageUrl = new URL(`../packages/${dir}`, import.meta.url)

    if (!(key in entries) && statSync(packageUrl).isDirectory()) {
      entries[key] = resolveEntryForPkg(dir)
    }
  }

  return entries
}

export const entries: Record<string, string> = generateEntries()
