import { readdirSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')

/**
 * Generate alias entries for all workspace packages.
 * Searches core/* and packages/* directories.
 */
const generateEntries = (): Record<string, string> => {
  const entries: Record<string, string> = {}

  for (const topDir of ['core', 'packages']) {
    const topPath = path.resolve(rootDir, topDir)
    if (!statSync(topPath).isDirectory()) continue

    for (const dir of readdirSync(topPath)) {
      const fullDir = path.resolve(topPath, dir)
      if (!statSync(fullDir).isDirectory()) continue

      const key = `@zeus-js/${dir}`
      if (key in entries) continue

      entries[key] = path.resolve(fullDir, 'src', 'index.ts')
    }
  }

  return entries
}

export const entries: Record<string, string> = generateEntries()
