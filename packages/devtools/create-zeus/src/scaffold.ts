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

import { inspectScaffoldTarget } from './target'

export interface ScaffoldOptions {
  root: string
  projectName: string
  template: string
  force?: boolean
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  if (
    ![
      'basic-ts',
      'application-ts',
      'component-library-ts',
      'web-component-ts',
    ].includes(options.template)
  ) {
    throw new Error(`Template "${options.template}" not found.`)
  }
  const templateRoot = resolve(__dirname, '../templates', options.template)

  if (!existsSync(templateRoot)) {
    throw new Error(`Template "${options.template}" not found.`)
  }

  const target = inspectScaffoldTarget(options.root, [templateRoot])
  if (target.nonEmpty && options.force !== true) {
    throw new Error(
      `Directory "${target.root}" is not empty. Use --force to explicitly replace its contents.`,
    )
  }

  if (target.nonEmpty) {
    rmSync(target.root, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(target.root, {
    recursive: true,
  })

  cpSync(templateRoot, target.root, {
    recursive: true,
  })

  patchPackageJson(target.root, options.projectName)
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
