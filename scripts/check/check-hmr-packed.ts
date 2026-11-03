import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/hmr-packed')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-hmr-packed-'))
const archives = path.join(work, 'tarballs')
const project = path.join(work, 'app')
const platform = platformPackage()
const selected = [
  'core/shared',
  'core/signal',
  'core/runtime-dom',
  'core/runtime-ssr',
  'core/zeus',
  'core/compiler',
  'core/compiler-native',
  `core/compiler-native-${platform}`,
  'devtools/vite-plugin',
]
const packages: Record<string, string> = {}
const hashes: Record<string, string> = {}
const installed: Record<string, { version: string; entry: string }> = {}
let passed = false
let failure: string | undefined
fs.mkdirSync(archives)
fs.mkdirSync(project)
fs.mkdirSync(output, { recursive: true })
const env: NodeJS.ProcessEnv = {
  ...process.env,
  CI: 'true',
  npm_config_cache:
    process.env.npm_config_cache ?? path.join(output, 'npm-cache'),
}
delete env.NODE_OPTIONS
delete env.NODE_PATH
delete env.TSX_TSCONFIG_PATH

try {
  const binary = path.join(
    root,
    'packages/core',
    `compiler-native-${platform}`,
    `zeus-compiler-native.${platform}.node`,
  )
  assert(
    fs.existsSync(binary),
    `Build the host platform package before this gate: missing ${binary}`,
  )
  for (const directory of selected) {
    const cwd = path.join(root, 'packages', directory)
    const manifest = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
    )
    run('pnpm', ['pack', '--pack-destination', archives], cwd)
    const archive = path.join(
      archives,
      `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`,
    )
    packages[manifest.name] = `file:${archive}`
    hashes[manifest.name] = createHash('sha256')
      .update(fs.readFileSync(archive))
      .digest('hex')
  }
  const requireFromRoot = createRequire(
    path.join(root, 'examples/counter/package.json'),
  )
  const viteVersion = (
    requireFromRoot('vite/package.json') as { version: string }
  ).version
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify(
      {
        name: 'zeus-hmr-packed-consumer',
        private: true,
        type: 'module',
        dependencies: { ...packages, vite: viteVersion },
        overrides: packages,
      },
      null,
      2,
    ),
  )
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
    project,
  )
  fs.writeFileSync(
    path.join(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { jsx: 'preserve', jsxImportSource: '@zeus-js/zeus' },
    }),
  )
  // The verifier itself uses the workspace tsx loader. Resolve package entries
  // in a clean Node process so TypeScript aliases cannot leak into this gate.
  const entries = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `
const fs = require('node:fs');
const names = JSON.parse(process.argv[1]);
process.stdout.write(JSON.stringify(Object.fromEntries(names.map(name => [name, fs.realpathSync(require.resolve(name))]))));
`,
        JSON.stringify(Object.keys(packages)),
      ],
      { cwd: project, env, encoding: 'utf8' },
    ),
  ) as Record<string, string>
  for (const name of Object.keys(packages)) {
    const entry = entries[name]
    assert(
      entry.startsWith(fs.realpathSync(project) + path.sep),
      `${name} escaped the packed installation: ${entry}`,
    )
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(project, 'node_modules', name, 'package.json'),
        'utf8',
      ),
    )
    installed[name] = { version: manifest.version, entry }
  }
  run(
    process.execPath,
    [
      path.join(root, 'node_modules/tsx/dist/cli.mjs'),
      path.join(root, 'scripts/check/check-hmr-browser.ts'),
    ],
    project,
    {
      ...env,
      TSX_TSCONFIG_PATH: path.join(project, 'tsconfig.json'),
      ZEUS_HMR_CONSUMER_ROOT: project,
      ZEUS_HMR_OUTPUT_DIR: path.join(output, 'browser'),
    },
  )
  passed = true
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        platform,
        node: process.version,
        source:
          'candidate pnpm pack tarballs, isolated npm installation, public package entries',
        project,
        hashes,
        installed,
        passed,
        failure,
      },
      null,
      2,
    )}\n`,
  )
  if (passed) fs.rmSync(work, { recursive: true, force: true })
  else console.error(`Failed HMR packed fixture retained at ${work}`)
}

function run(
  command: string,
  args: string[],
  cwd: string,
  environment = env,
): void {
  execFileSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command !== process.execPath,
  })
}

function platformPackage(): string {
  if (process.platform === 'darwin') return `darwin-${process.arch}`
  if (process.platform === 'linux')
    return `linux-${process.arch}-${'glibcVersionRuntime' in (process.report.getReport() as { header: object }).header ? 'gnu' : 'musl'}`
  if (process.platform === 'win32') return `win32-${process.arch}-msvc`
  throw new Error(
    `Unsupported HMR smoke platform: ${process.platform}-${process.arch}`,
  )
}
