import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

function resolveRuntimeEntryFromPackage(
  packageEntry: string,
  outputFile: string,
): string {
  let current = path.dirname(packageEntry)
  let packageJSON: string | undefined
  while (true) {
    const candidate = path.join(current, 'package.json')
    if (existsSync(candidate)) {
      packageJSON = candidate
      break
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  if (!packageJSON) {
    throw new Error(`Cannot find package.json for ${packageEntry}`)
  }

  return realpathSync(path.join(path.dirname(packageJSON), 'dist', outputFile))
}

function resolveRuntimeEntry(
  packageName: string,
  outputFile: string,
  root: string | undefined,
): string | undefined {
  const projectRoot = path.resolve(process.cwd(), root ?? '.')
  const projectRequire = createRequire(path.join(projectRoot, '__zeus__.cjs'))

  try {
    const runtimePackage = projectRequire.resolve(packageName)

    return resolveRuntimeEntryFromPackage(runtimePackage, outputFile)
  } catch {
    // The common app shape depends only on @zeus-js/zeus. Resolve its
    // nested runtime dependency from the Zeus package location.
  }

  try {
    const zeusEntry = projectRequire.resolve('@zeus-js/zeus')
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
