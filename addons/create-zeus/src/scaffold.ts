import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ScaffoldOptions {
  root: string
  projectName: string
  template: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const templateRoot = resolve(__dirname, '../templates', options.template)

  if (!existsSync(templateRoot)) {
    throw new Error(`Template "${options.template}" not found.`)
  }

  if (existsSync(options.root)) {
    rmSync(options.root, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(options.root, {
    recursive: true,
  })

  cpSync(templateRoot, options.root, {
    recursive: true,
  })

  patchPackageJson(options.root, options.projectName)
}

function patchPackageJson(root: string, projectName: string): void {
  const packageJsonPath = join(root, 'package.json')
  const raw = readFileSync(packageJsonPath, 'utf-8')
  const json = JSON.parse(raw) as Record<string, unknown>

  json.name = normalizePackageName(projectName)

  writeFileSync(packageJsonPath, `${JSON.stringify(json, null, 2)}\n`)
}

function normalizePackageName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}
