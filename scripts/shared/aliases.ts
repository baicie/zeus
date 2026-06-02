import * as path from 'node:path'

import { findWorkspacePackages } from './utils'

/**
 * Generate alias entries for all workspace packages.
 * Uses findWorkspacePackages() to avoid duplicating directory scanning logic.
 */
const generateEntries = (): Record<string, string> => {
  const entries: Record<string, string> = {}

  for (const pkg of findWorkspacePackages()) {
    if (pkg.name === '@zeus-js/zeus') {
      entries['@zeus-js/zeus/jsx'] = path.resolve(pkg.dir, 'src', 'jsx.d.ts')
      entries['@zeus-js/zeus/jsx-runtime'] = path.resolve(
        pkg.dir,
        'src',
        'jsx-runtime.ts',
      )
      entries['@zeus-js/zeus/jsx-dev-runtime'] = path.resolve(
        pkg.dir,
        'src',
        'jsx-dev-runtime.ts',
      )
    }

    if (pkg.name in entries) continue
    entries[pkg.name] = path.resolve(pkg.dir, 'src', 'index.ts')
  }

  return entries
}

export const entries: Record<string, string> = generateEntries()
