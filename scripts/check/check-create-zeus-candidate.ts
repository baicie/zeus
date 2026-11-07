/**
 * Installs a create-zeus scaffold from the candidate tarballs in this
 * worktree, not from the registry beta. Every @zeus-js package is packed and
 * pinned through pnpm overrides, so a stale or missing tarball fails the gate.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { zeusFixedPackages } from '../release.config'

const root = path.resolve(import.meta.dirname, '../..')
const packageRoot = path.join(root, 'packages/devtools/create-zeus')
const output = path.join(root, 'temp/create-zeus-candidate')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-create-candidate-'))
const archives = path.join(work, 'archives')
const project = path.join(work, 'app')
const target = path.join(project, 'candidate-app')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()

fs.mkdirSync(archives)
fs.mkdirSync(project)
fs.mkdirSync(output, { recursive: true })

let passed = false
let failure: string | undefined
try {
  run('pnpm', ['-F', 'create-zeus', 'build'], root)
  const cliArchive = pack(packageRoot, archives)
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      `file:${cliArchive}`,
    ],
    project,
  )
  run(
    process.execPath,
    [
      path.join(project, 'node_modules/create-zeus/dist/index.js'),
      '--name',
      'candidate-app',
      '--template',
      'basic-ts',
    ],
    project,
  )
  const manifestPath = path.join(target, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    pnpm?: Record<string, unknown>
  }
  const overrides: Record<string, string> = {}
  const candidateNames = new Set([
    ...zeusFixedPackages,
    '@zeus-js/vite-plugin',
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])
  for (const name of candidateNames) {
    if (!name.startsWith('@zeus-js/')) continue
    const packageDir = findPackage(name)
    if (!packageDir) {
      throw new Error(`candidate package directory is missing: ${name}`)
    }
    overrides[name] = `file:${pack(packageDir, archives)}`
  }
  manifest.pnpm = { ...(manifest.pnpm ?? {}), overrides }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  run(
    'pnpm',
    [
      'install',
      '--ignore-scripts',
      '--no-frozen-lockfile',
      '--config.confirmModulesPurge=false',
    ],
    target,
  )
  run(
    process.execPath,
    [
      path.join(target, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '-p',
      'tsconfig.json',
    ],
    target,
  )
  run(
    process.execPath,
    [path.join(target, 'node_modules/vite/bin/vite.js'), 'build'],
    target,
  )
  if (!fs.existsSync(path.join(target, 'dist/index.html'))) {
    throw new Error('candidate scaffold build did not produce dist/index.html')
  }
  passed = true
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        schema: 'zeus.create-zeus-candidate/v1',
        sourceCommit,
        passed,
        ...(failure ? { error: failure } : {}),
      },
      null,
      2,
    )}\n`,
  )
  fs.rmSync(work, { recursive: true, force: true })
}

function findPackage(name: string): string | undefined {
  for (const file of packageJsonFiles(path.join(root, 'packages'))) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      name?: string
    }
    if (value.name === name) return path.dirname(file)
  }
  return undefined
}

function packageJsonFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...packageJsonFiles(absolute))
    else if (entry.isFile() && entry.name === 'package.json')
      files.push(absolute)
  }
  return files
}

function pack(directory: string, destination: string): string {
  const before = new Set(fs.readdirSync(destination))
  run('pnpm', ['pack', '--pack-destination', destination], directory)
  const created = fs
    .readdirSync(destination)
    .filter(name => name.endsWith('.tgz') && !before.has(name))
  if (created.length !== 1) {
    throw new Error(
      `expected one tarball from ${directory}, got ${created.length}`,
    )
  }
  return path.join(destination, created[0]!)
}

function run(command: string, args: readonly string[], cwd: string): void {
  const result = execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  void result
}
