/**
 * Joint Core/UI release gate.
 *
 * A matching UI version is not enough: the UI checkout must be the exact,
 * approved commit, at the approved version, with every `@zeus-js/*` dependency
 * pinned to the Core candidate. The commit and source-tree SHA are recorded as
 * release evidence so a moving `main` can never be published.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export interface UiPairingInput {
  readonly uiRoot: string
  readonly coreVersion: string
  readonly expectedUiCommit?: string
  readonly expectedUiVersion?: string
  /** Release mode: require a clean git checkout at the expected commit. */
  readonly requireCommit?: boolean
}

export interface UiPairingResult {
  readonly uiVersion?: string
  readonly uiCommit?: string
  readonly uiSourceTreeSha?: string
  readonly mismatches: readonly string[]
  readonly warnings: readonly string[]
}

const FULL_SHA = /^[0-9a-f]{40}$/i

export function checkUiPairing(input: UiPairingInput): UiPairingResult {
  const uiRoot = path.resolve(input.uiRoot)
  const rootManifest = path.join(uiRoot, 'package.json')
  if (!fs.existsSync(rootManifest)) {
    return {
      mismatches: [`UI checkout is missing: ${rootManifest}`],
      warnings: [],
    }
  }
  const mismatches: string[] = []
  const warnings: string[] = []
  const rootPackage = readManifest(rootManifest)
  const uiVersion = rootPackage?.version

  if (input.expectedUiVersion && uiVersion !== input.expectedUiVersion) {
    mismatches.push(
      `UI version ${uiVersion ?? 'unknown'} != approved ${input.expectedUiVersion}`,
    )
  }

  const git = readGitState(uiRoot)
  const requiresIdentity =
    input.requireCommit === true || !!input.expectedUiCommit
  if (requiresIdentity && !git.commit) {
    mismatches.push(`UI checkout at ${uiRoot} is not a git repository`)
  } else if (git.commit) {
    if (
      input.expectedUiCommit &&
      git.commit.toLowerCase() !== input.expectedUiCommit.toLowerCase()
    ) {
      mismatches.push(
        `UI commit ${git.commit} != approved ${input.expectedUiCommit}`,
      )
    }
    if (input.requireCommit) {
      if (!input.expectedUiCommit) {
        mismatches.push('release pairing requires an approved UI commit')
      } else if (!FULL_SHA.test(input.expectedUiCommit)) {
        mismatches.push('approved UI commit must be a full 40-character SHA')
      }
      if (!git.sourceTreeSha) {
        mismatches.push('UI source tree SHA cannot be read')
      }
      if (git.dirty.length > 0) {
        mismatches.push(
          `UI checkout is dirty: ${git.dirty.slice(0, 5).join(', ')}`,
        )
      }
    }
  }
  if (uiVersion && uiVersion.includes('-') && !uiVersion.includes('rc.')) {
    warnings.push(
      `UI version ${uiVersion} is a prerelease; confirm the paired channel`,
    )
  }

  const manifests = [
    rootManifest,
    ...packageFiles(path.join(uiRoot, 'packages')),
  ]
  for (const file of manifests) {
    const manifest = readManifest(file)
    if (!manifest) continue
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
    ...(git.commit ? { uiCommit: git.commit } : {}),
    ...(git.sourceTreeSha ? { uiSourceTreeSha: git.sourceTreeSha } : {}),
    mismatches,
    warnings,
  }
}

function readManifest(file: string):
  | {
      name?: string
      version?: string
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
      peerDependencies?: Record<string, unknown>
    }
  | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as {
      name?: string
      version?: string
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
      peerDependencies?: Record<string, unknown>
    }
  } catch {
    return undefined
  }
}

function readGitState(root: string): {
  commit?: string
  sourceTreeSha?: string
  dirty: string[]
} {
  const git = (args: string[]): string | undefined => {
    try {
      return execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return undefined
    }
  }
  const commit = git(['rev-parse', 'HEAD'])
  const sourceTreeSha = git(['rev-parse', 'HEAD^{tree}'])
  const status = git(['status', '--porcelain', '--untracked-files=no'])
  return {
    ...(commit ? { commit } : {}),
    ...(sourceTreeSha ? { sourceTreeSha } : {}),
    dirty: status ? status.split('\n').filter(Boolean) : [],
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
      'ui-commit': { type: 'string' },
      'ui-version': { type: 'string' },
      'require-commit': { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  })
  const coreVersion =
    values['core-version'] ??
    (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string })
      .version
  const uiRoot = values['ui-root'] ?? process.env.ZEUS_UI_ROOT
  if (!uiRoot) throw new Error('--ui-root or ZEUS_UI_ROOT is required')
  const result = checkUiPairing({
    uiRoot,
    coreVersion,
    ...(values['ui-commit'] ? { expectedUiCommit: values['ui-commit'] } : {}),
    ...(values['ui-version']
      ? { expectedUiVersion: values['ui-version'] }
      : {}),
    requireCommit: values['require-commit'] === true,
  })
  if (values.out) {
    const output = path.resolve(values.out)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(
      output,
      `${JSON.stringify(
        {
          schema: 'zeus.ui-pairing/v1',
          coreVersion,
          approvedUiCommit: values['ui-commit'],
          approvedUiVersion: values['ui-version'],
          ...result,
          passed: result.mismatches.length === 0,
        },
        null,
        2,
      )}\n`,
    )
  }
  for (const warning of result.warnings) console.warn(`WARNING ${warning}`)
  for (const mismatch of result.mismatches) {
    console.error(`MISMATCH ${mismatch}`)
  }
  console.log(
    `UI pairing ${result.mismatches.length === 0 ? 'PASS' : 'FAIL'}: UI ${result.uiVersion ?? 'unknown'}@${result.uiCommit?.slice(0, 12) ?? 'unknown'} vs Core ${coreVersion}`,
  )
  if (result.mismatches.length > 0) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
