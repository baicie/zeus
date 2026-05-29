import * as path from 'node:path'

import { findWorkspacePackages } from './utils'

/**
 * Generate alias entries for all workspace packages.
 * Uses findWorkspacePackages() to avoid duplicating directory scanning logic.
 */
const generateEntries = (): Record<string, string> => {
  const entries: Record<string, string> = {}

  for (const pkg of findWorkspacePackages()) {
    if (pkg.name in entries) continue
    entries[pkg.name] = path.resolve(pkg.dir, 'src', 'index.ts')
  }

  return entries
}

export const entries: Record<string, string> = generateEntries()
