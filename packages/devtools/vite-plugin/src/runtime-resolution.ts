import { realpathSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

function resolveRuntimeEntryFromPackage(
  packageEntry: string,
  outputFile: string,
): string {
  const packageJSON = findPackageJSON('.', pathToFileURL(packageEntry))
  if (!packageJSON) {
    throw new Error(`Cannot find package.json for ${packageEntry}`)
  }

  return path.join(path.dirname(packageJSON), 'dist', outputFile)
}

function resolveRuntimeEntry(
  packageName: string,
  outputFile: string,
  root: string | undefined,
): string | undefined {
  const projectRoot = path.resolve(process.cwd(), root ?? '.')

  try {
    const runtimePackage = require.resolve(packageName, {
      paths: [projectRoot],
    })

    return resolveRuntimeEntryFromPackage(runtimePackage, outputFile)
  } catch {
    // The common app shape depends only on @zeus-js/zeus. Resolve its
    // nested runtime dependency from the Zeus package location.
  }

  try {
    const zeusEntry = require.resolve('@zeus-js/zeus', {
      paths: [projectRoot],
    })
    const runtimePackage = createRequire(realpathSync(zeusEntry)).resolve(
      packageName,
    )

    return resolveRuntimeEntryFromPackage(runtimePackage, outputFile)
  } catch {
    return undefined
  }
}

export function resolveRuntimeDOMEntry(
  root: string | undefined,
): string | undefined {
  return resolveRuntimeEntry(
    '@zeus-js/runtime-dom',
    'runtime-dom.esm-bundler.js',
    root,
  )
}

export function resolveRuntimeSSREntry(
  root: string | undefined,
): string | undefined {
  return resolveRuntimeEntry(
    '@zeus-js/runtime-ssr',
    'runtime-ssr.esm-bundler.js',
    root,
  )
}
