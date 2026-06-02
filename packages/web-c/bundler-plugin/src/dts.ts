import fs from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'

import type { DtsAutoReason, DtsMode, ResolvedDts } from './types'

export interface ResolveDtsOptions {
  root: string
  mode?: DtsMode
  include: string[]
  exclude: string[]
}

export async function resolveDts(
  options: ResolveDtsOptions,
): Promise<ResolvedDts> {
  const mode = options.mode ?? 'auto'

  if (mode === true) {
    return {
      enabled: true,
      mode,
      reason: ['explicit-enabled'],
    }
  }

  if (mode === false) {
    return {
      enabled: false,
      mode,
      reason: ['explicit-disabled'],
    }
  }

  const reason: DtsAutoReason[] = []

  if (await packageDeclaresTypes(options.root)) {
    reason.push('package-types-field')
  }

  if (await hasTypeScriptDependency(options.root)) {
    reason.push('typescript-dependency')
  }

  if (await fileExists(path.join(options.root, 'tsconfig.json'))) {
    reason.push('tsconfig')
  }

  if (
    await hasTypeScriptSource({
      root: options.root,
      include: options.include,
      exclude: options.exclude,
    })
  ) {
    reason.push('typescript-source')
  }

  return {
    enabled: reason.length > 0,
    mode,
    reason,
  }
}

async function hasTypeScriptDependency(root: string): Promise<boolean> {
  const pkg = await readPackageJson(root)
  if (!pkg) return false

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  }

  return Boolean(deps.typescript)
}

async function packageDeclaresTypes(root: string): Promise<boolean> {
  const pkg = await readPackageJson(root)
  if (!pkg) return false

  if (pkg.types || pkg.typings) return true

  return hasTypesInExports(pkg.exports)
}

function hasTypesInExports(value: unknown): boolean {
  if (!value) return false

  if (typeof value !== 'object') {
    return false
  }

  if ('types' in value) {
    return true
  }

  return Object.values(value as Record<string, unknown>).some(hasTypesInExports)
}

async function hasTypeScriptSource(options: {
  root: string
  include: string[]
  exclude: string[]
}): Promise<boolean> {
  const files = await fg(options.include, {
    cwd: options.root,
    onlyFiles: true,
    absolute: false,
    ignore: options.exclude,
  })

  return files.some(file => file.endsWith('.ts') || file.endsWith('.tsx'))
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  types?: string
  typings?: string
  exports?: Record<string, unknown>
}

async function readPackageJson(root: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(root, 'package.json'), 'utf-8'),
    )
  } catch {
    return null
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}
