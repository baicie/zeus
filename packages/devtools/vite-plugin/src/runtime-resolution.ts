import path from 'node:path'

export function resolveRuntimeDOMEntryFromPackage(
  packageEntry: string,
): string {
  return path.join(
    path.dirname(packageEntry),
    'dist/runtime-dom.esm-bundler.js',
  )
}
