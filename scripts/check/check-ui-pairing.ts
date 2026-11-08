/**
 * Joint Core/UI release gate. The paired UI checkout must pin every
 * @zeus-js/* dependency to the exact Core candidate version. This prevents a
 * Core RC from being tagged with a UI that still targets an old beta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export interface UiPairingResult {
  readonly uiVersion?: string
  readonly mismatches: readonly string[]
}

export function checkUiPairing(input: {
  readonly uiRoot: string
  readonly coreVersion: string
}): UiPairingResult {
  const uiRoot = path.resolve(input.uiRoot)
  const rootManifest = path.join(uiRoot, 'package.json')
  if (!fs.existsSync(rootManifest)) {
    return { mismatches: [`UI checkout is missing: ${rootManifest}`] }
  }
  const uiVersion = (
    JSON.parse(fs.readFileSync(rootManifest, 'utf8')) as { version?: string }
  ).version
  const mismatches: string[] = []
  for (const file of packageFiles(path.join(uiRoot, 'packages'))) {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      name?: string
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
      peerDependencies?: Record<string, unknown>
    }
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ] as const) {
      const dependencies = manifest[field]
      if (!dependencies) continue
      for (const [name, version] of Object.entries(dependencies)) {
        if (!name.startsWith('@zeus-js/')) continue
        if (version !== input.coreVersion) {
          mismatches.push(
            `${manifest.name ?? path.relative(uiRoot, file)}: ${name} ${String(version)} != ${input.coreVersion}`,
          )
        }
      }
    }
  }
  return {
    ...(uiVersion ? { uiVersion } : {}),
    mismatches,
  }
}

function packageFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...packageFiles(absolute))
    else if (entry.isFile() && entry.name === 'package.json')
      files.push(absolute)
  }
  return files
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'ui-root': { type: 'string' },
      'core-version': { type: 'string' },
    },
  })
  const coreVersion =
    values['core-version'] ??
    (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string })
      .version
  const uiRoot = values['ui-root'] ?? process.env.ZEUS_UI_ROOT
  if (!uiRoot) throw new Error('--ui-root or ZEUS_UI_ROOT is required')
  const result = checkUiPairing({ uiRoot, coreVersion })
  for (const mismatch of result.mismatches) {
    console.error(`MISMATCH ${mismatch}`)
  }
  console.log(
    `UI pairing ${result.mismatches.length === 0 ? 'PASS' : 'FAIL'}: UI ${result.uiVersion ?? 'unknown'} vs Core ${coreVersion}`,
  )
  if (result.mismatches.length > 0) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
