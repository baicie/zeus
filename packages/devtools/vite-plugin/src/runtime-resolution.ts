import { realpathSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

function resolveRuntimeDOMEntryFromPackage(packageEntry: string): string {
  const packageJSON = findPackageJSON('.', pathToFileURL(packageEntry))
  if (!packageJSON) {
    throw new Error(`Cannot find package.json for ${packageEntry}`)
  }

  return path.join(path.dirname(packageJSON), 'dist/runtime-dom.esm-bundler.js')
}

export function resolveRuntimeDOMEntry(
  root: string | undefined,
): string | undefined {
  const projectRoot = path.resolve(process.cwd(), root ?? '.')

  try {
    const runtimeDomPackage = require.resolve('@zeus-js/runtime-dom', {
      paths: [projectRoot],
    })

    return resolveRuntimeDOMEntryFromPackage(runtimeDomPackage)
  } catch {
    // The common app shape depends only on @zeus-js/zeus. Resolve its
    // nested runtime-dom dependency from the Zeus package location.
  }

  try {
    const zeusEntry = require.resolve('@zeus-js/zeus', {
      paths: [projectRoot],
    })
    const runtimeDomPackage = createRequire(realpathSync(zeusEntry)).resolve(
      '@zeus-js/runtime-dom',
    )

    return resolveRuntimeDOMEntryFromPackage(runtimeDomPackage)
  } catch {
    return undefined
  }
}
