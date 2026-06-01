import fs from 'node:fs/promises'
import path from 'node:path'

export async function detectFramework(
  cwd = process.cwd(),
): Promise<'react' | 'vue' | null> {
  const pkg = await readPackageJson(cwd)

  if (!pkg) return null

  const deps: Record<string, string> = {
    ...((pkg.dependencies as Record<string, string> | undefined) ?? {}),
    ...((pkg.devDependencies as Record<string, string> | undefined) ?? {}),
  }

  if (deps.vue) return 'vue'
  if (deps.react) return 'react'

  return null
}

export async function readPackageJson(
  cwd = process.cwd(),
): Promise<{
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
} | null> {
  try {
    const source = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
    return JSON.parse(source)
  } catch {
    return null
  }
}
