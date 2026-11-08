/**
 * Prepares the isolated tarball registry used by the create-zeus candidate
 * matrix. It packs the Core release group once, validates the packed
 * manifests, writes `candidates.json`, and injects the Core candidate
 * overrides into the paired UI checkout before the UI is installed/built.
 *
 * Run after Core `pnpm build` and `pnpm build-dts` and after building the host
 * native binary. The final matrix reads the same archives, so the UI and every
 * template resolve the exact same Core tarballs even when the UI pins an
 * unpublished RC.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  assertCandidateInputsBuilt,
  assertCurrentNativeBinary,
  discoverWorkspacePackages,
  toFileSpec,
} from '../release/create-zeus-candidate-matrix'
import { zeusFixedPackages } from '../release.config'

import type { PackageManifest } from '../release/create-zeus-candidate-matrix'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/create-zeus-candidate')
const { values } = parseArgs({
  options: {
    'ui-root': { type: 'string' },
    archives: { type: 'string' },
  },
})
const archives = values.archives
  ? path.resolve(root, values.archives)
  : path.join(os.tmpdir(), 'zeus-create-zeus-candidate-archives')
const uiRoot = values['ui-root']
  ? path.resolve(root, values['ui-root'])
  : undefined
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const coreVersion = (
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    version: string
  }
).version

fs.rmSync(archives, { recursive: true, force: true })
fs.mkdirSync(archives, { recursive: true })
fs.mkdirSync(output, { recursive: true })

assertCandidateInputsBuilt(root)
assertCurrentNativeBinary(root)

const packages = discoverWorkspacePackages(root)
const candidateNames = [...zeusFixedPackages, '@zeus-js/vite-plugin']
const entries = candidateNames.map(name => {
  const workspacePackage = packages.get(name)
  if (!workspacePackage) {
    throw new Error(`candidate Core package directory is missing: ${name}`)
  }
  if (
    name !== '@zeus-js/vite-plugin' &&
    workspacePackage.version !== coreVersion
  ) {
    throw new Error(
      `${name} version ${workspacePackage.version} != Core ${coreVersion}`,
    )
  }
  return packCandidate(workspacePackage.directory, name)
})

const candidates = {
  schema: 'zeus.create-zeus-candidate-archives/v1',
  sourceCommit,
  coreVersion,
  vitePluginVersion: packages.get('@zeus-js/vite-plugin')!.version,
  packages: entries,
}
fs.writeFileSync(
  path.join(output, 'candidates.json'),
  `${JSON.stringify(candidates, null, 2)}\n`,
)

let uiOverridesWritten = false
if (uiRoot) {
  const manifestPath = path.join(uiRoot, 'package.json')
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  ) as PackageManifest
  const pnpm = isRecord(manifest.pnpm) ? manifest.pnpm : {}
  const overrides = isRecord(pnpm.overrides)
    ? (pnpm.overrides as Record<string, string>)
    : {}
  for (const entry of entries) {
    if (entry.name.startsWith('@zeus-js/')) {
      overrides[entry.name] = toFileSpec(entry.file)
    }
  }
  manifest.pnpm = { ...pnpm, overrides }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  uiOverridesWritten = true
}

fs.writeFileSync(
  path.join(output, 'prepare.json'),
  `${JSON.stringify(
    {
      schema: 'zeus.create-zeus-candidate-prepare/v1',
      sourceCommit,
      coreVersion,
      platform: process.platform,
      arch: process.arch,
      archives,
      uiOverridesWritten,
      packages: entries.map(entry => ({
        name: entry.name,
        version: entry.version,
        file: path.basename(entry.file),
        sha256: entry.sha256,
      })),
    },
    null,
    2,
  )}\n`,
)

function packCandidate(
  directory: string,
  name: string,
): { name: string; version: string; file: string; sha256: string } {
  const before = new Set(fs.readdirSync(archives))
  const packed = JSON.parse(
    run('pnpm', ['pack', '--pack-destination', archives, '--json'], directory),
  ) as {
    name: string
    version: string
    filename: string
    files: Array<{ path: string }>
  }
  if (packed.name !== name) {
    throw new Error(`packed ${packed.name}, expected ${name}`)
  }
  const file = path.isAbsolute(packed.filename)
    ? packed.filename
    : path.join(directory, packed.filename)
  if (!fs.existsSync(file)) {
    throw new Error(`pnpm pack did not produce ${file}`)
  }
  const created = fs
    .readdirSync(archives)
    .filter(entry => entry.endsWith('.tgz') && !before.has(entry))
  if (created.length !== 1) {
    throw new Error(`expected one tarball for ${name}, got ${created.length}`)
  }
  const packedManifest = JSON.parse(
    run('tar', ['-xOf', file, 'package/package.json'], archives),
  ) as PackageManifest
  if (
    packedManifest.name !== packed.name ||
    packedManifest.version !== packed.version
  ) {
    throw new Error(`packed manifest mismatch for ${name}`)
  }
  const files = new Set(packed.files.map(entry => entry.path))
  for (const dependency of dependencySpecs(packedManifest)) {
    if (dependency.startsWith('workspace:')) {
      throw new Error(`${name} packed manifest still contains workspace:`)
    }
    if (dependency.startsWith('catalog:')) {
      throw new Error(`${name} packed manifest still contains catalog:`)
    }
    if (dependency.startsWith('file:')) {
      throw new Error(`${name} packed manifest still contains file:`)
    }
  }
  for (const target of exportTargets(packedManifest.exports)) {
    const relative = target.replace(/^\.\//, '')
    if (!files.has(relative)) {
      throw new Error(`${name} packed manifest exports missing ${relative}`)
    }
  }
  return {
    name: packed.name,
    version: packed.version,
    file,
    sha256: sha256File(file),
  }
}

function dependencySpecs(manifest: PackageManifest): string[] {
  return ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap(
    field => Object.values(manifest[field] ?? {}),
  )
}

function exportTargets(
  value: unknown,
  targets: Set<string> = new Set(),
): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('./') && !value.includes('*')) targets.add(value)
    return [...targets]
  }
  if (Array.isArray(value)) {
    for (const item of value) exportTargets(item, targets)
    return [...targets]
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) exportTargets(item, targets)
  }
  return [...targets]
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function run(command: string, args: string[], cwd: string): string {
  const shell = process.platform === 'win32' && command !== process.execPath
  const finalArgs = shell
    ? args.map(argument =>
        /[\s"]/u.test(argument)
          ? `"${argument.replace(/"/g, '\\"')}"`
          : argument,
      )
    : args
  return execFileSync(command, finalArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
  })
}
