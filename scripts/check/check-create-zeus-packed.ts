import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const packageRoot = path.join(root, 'packages/devtools/create-zeus')
const output = path.join(root, 'temp/create-zeus-packed')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-create-packed-'))
const archives = path.join(work, 'archives')
const project = path.join(work, 'app')
const target = path.join(project, 'basic-app')
const env: NodeJS.ProcessEnv = {
  ...process.env,
  CI: 'true',
  npm_config_cache:
    process.env.npm_config_cache ?? path.join(output, 'npm-cache'),
}
delete env.NODE_OPTIONS
delete env.NODE_PATH
delete env.TSX_TSCONFIG_PATH

fs.mkdirSync(archives)
fs.mkdirSync(project)
fs.mkdirSync(output, { recursive: true })

let passed = false
let failure: string | undefined
let archiveHash = ''

try {
  run('pnpm', ['-F', 'create-zeus', 'build'], root)
  run('pnpm', ['pack', '--pack-destination', archives], packageRoot)
  const archive = fs
    .readdirSync(archives)
    .find(name => name.startsWith('create-zeus-') && name.endsWith('.tgz'))
  assert(archive, 'create-zeus tarball was not created')
  const archivePath = path.join(archives, archive)
  archiveHash = createHash('sha256')
    .update(fs.readFileSync(archivePath))
    .digest('hex')

  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      'https://registry.npmjs.org',
      `file:${archivePath}`,
    ],
    project,
  )

  const cli = path.join(project, 'node_modules/create-zeus/dist/index.js')
  assert(fs.existsSync(cli), 'packed create-zeus CLI is missing')
  run(
    process.execPath,
    [cli, '--name', 'basic-app', '--template', 'basic-ts'],
    project,
  )

  const manifestPath = path.join(target, 'package.json')
  assert(fs.existsSync(manifestPath), 'packed CLI did not scaffold the target')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    name?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  assert.equal(manifest.name, 'basic-app')
  for (const [name, version] of Object.entries({
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  })) {
    assert(
      !version.startsWith('workspace:') && !version.startsWith('file:'),
      `${name} uses a non-publishable dependency: ${version}`,
    )
  }

  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      'https://registry.npmjs.org',
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
  assert(
    fs.existsSync(path.join(target, 'dist/index.html')),
    'packed CLI template production build is missing dist/index.html',
  )
  passed = true
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error)
  throw error
} finally {
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        sourceCommit,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        source: 'candidate create-zeus tarball installed outside the workspace',
        archiveHash,
        project,
        checks: [
          'packed CLI install',
          'non-interactive scaffold',
          'no workspace/file dependencies',
          'registry dependency install',
          'typecheck',
          'production build',
        ],
        passed,
        failure,
      },
      null,
      2,
    )}\n`,
  )
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else console.error(`Failed packed create-zeus fixture retained at ${work}`)
}

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command !== process.execPath,
  })
}
