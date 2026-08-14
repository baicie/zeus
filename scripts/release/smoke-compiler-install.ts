import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import pico from 'picocolors'

const root = path.resolve(import.meta.dirname, '../..')
const registry = readOption('--registry') ?? 'https://registry.npmjs.org'
const version = readOption('--version')
const localPackage = readOption('--local-package')
const expectedPackage = readOption('--expected-platform-package')

if (Boolean(version) === Boolean(localPackage)) {
  throw new Error(
    'Pass exactly one of --version <version> or --local-package <package-short-name>',
  )
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-compiler-smoke-'))
const tarballDir = path.join(tempRoot, 'tarballs')
const projectDir = path.join(tempRoot, 'project')
fs.mkdirSync(tarballDir)
fs.mkdirSync(projectDir)

try {
  const installSpecs = version
    ? [`@zeus-js/compiler@${version}`]
    : createLocalTarballs(localPackage!, tarballDir)

  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n',
  )
  fs.copyFileSync(
    path.join(root, 'scripts/release/compiler-smoke-runner.mjs'),
    path.join(projectDir, 'compiler-smoke-runner.mjs'),
  )

  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      registry,
      ...installSpecs,
    ],
    projectDir,
  )

  if (expectedPackage) {
    const manifest = path.join(
      projectDir,
      'node_modules',
      ...expectedPackage.split('/'),
      'package.json',
    )
    if (!fs.existsSync(manifest)) {
      throw new Error(
        `Expected installed native package is missing: ${expectedPackage}`,
      )
    }
  }

  run('node', ['compiler-smoke-runner.mjs'], projectDir, {
    ...process.env,
    NAPI_RS_ENFORCE_VERSION_CHECK: '1',
  })
  console.log(
    pico.green(
      `Compiler install smoke passed (${version ? `registry ${version}` : `local ${localPackage}`}).`,
    ),
  )
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}

function createLocalTarballs(
  platformPackage: string,
  destination: string,
): string[] {
  const packages = ['compiler-native', platformPackage, 'compiler']
  const archives = packages.map(pkg => pack(pkg, destination))
  const byName = new Map(
    archives.map(archive => [readPackedName(archive), archive]),
  )
  const expectedNames = [
    '@zeus-js/compiler-native',
    `@zeus-js/${platformPackage}`,
    '@zeus-js/compiler',
  ]
  return expectedNames.map(name => {
    const archive = byName.get(name)
    if (!archive) throw new Error(`npm pack did not produce ${name}`)
    return archive
  })
}

function pack(shortName: string, destination: string): string {
  const packageDir = path.join(root, 'packages/core', shortName)
  const before = new Set(fs.readdirSync(destination))
  run('pnpm', ['pack', '--pack-destination', destination], packageDir)
  const created = fs
    .readdirSync(destination)
    .filter(file => !before.has(file) && file.endsWith('.tgz'))
  if (created.length !== 1) {
    throw new Error(
      `Expected one tarball for ${shortName}, found ${created.length}`,
    )
  }
  return path.join(destination, created[0])
}

function readPackedName(archive: string): string {
  const output = execFileSync(
    'tar',
    ['-xOf', archive, 'package/package.json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  return (JSON.parse(output) as { name: string }).name
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}
