/**
 * `@zeus-js/compiler-native` must install and load, not merely exist (R22 TASK 33).
 *
 * `release:verify:published` asks the registry whether each package's version is
 * visible. That check passed on `0.2.0-rc.3`: every package it could see was
 * there, with matching integrity. It is not sufficient, and rc.3 is the
 * measurement —
 *
 * ```text
 * npm install @zeus-js/compiler-native@0.2.0-rc.3
 * → added 1 package
 * → require('@zeus-js/compiler-native')
 *   FAILED: Cannot find native binding.
 * ```
 *
 * The first reading of that was "four platform packages are unpublished, so npm
 * drops the whole optional group (cli#4828)". Measured, that is wrong. The same
 * install on **npm 11.13.0** installs `compiler-native` *and*
 * `compiler-native-darwin-arm64` and loads fine — from rc.3 itself, whose four
 * missing platform packages are not this machine's. On **npm 10.9.0**, the npm
 * bundled with Node 22.12, every optional entry is `UNMET` and only the wrapper
 * lands, and that happens for a canary whose seven platform packages are all
 * published too. The missing packages are a real publishing gap; they are not
 * the cause of this failure, and `0.2.0-rc.3` is usable on a current npm.
 *
 * So the check asserts the outcome a consumer gets (installed *and* loadable
 * *and* able to compile), and its failure message names the npm version rather
 * than guessing at the registry. Run it after a publish (`release.yml`,
 * `release-canary.yml`) and against a local registry in the recovery drills.
 *
 * ## Why it does not just `npm install`
 *
 * npm's optional-dependency handling is part of what is being tested, so the
 * install is npm's real one — no `--no-optional`, no `--omit=optional`. It does
 * pass `--ignore-scripts`: a platform package has no install script, and running
 * arbitrary postinstall code from a registry inside a release gate is a separate
 * decision nobody has made.
 *
 * ## Usage
 *
 * ```text
 * pnpm check:native-install --version 0.2.0-rc.3
 * pnpm check:native-install --version 0.2.0-rc.3 --registry http://127.0.0.1:4873
 * ```
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/native-install')
const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    registry: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
})
const version = values.version
if (!version) {
  throw new Error(
    'Usage: check-native-install --version <version> [--registry <url>] [--keep]',
  )
}
const registry = values.registry ?? 'https://registry.npmjs.org'
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-native-install-'))
const project = path.join(work, 'consumer')
const platform = platformPackage()
const platformName = `@zeus-js/compiler-native-${platform}`

fs.mkdirSync(project)
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  path.join(project, 'package.json'),
  `${JSON.stringify({ name: 'native-install-probe', private: true }, null, 2)}\n`,
)

const env: NodeJS.ProcessEnv = {
  ...process.env,
  CI: 'true',
  npm_config_cache:
    process.env.npm_config_cache ?? path.join(output, 'npm-cache'),
}
delete env.NODE_OPTIONS
delete env.NODE_PATH

let passed = false
let failure: string | undefined
const evidence: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  version,
  registry,
  platform,
  platformPackage: platformName,
  node: process.version,
}

try {
  // 1. The platform package must exist at this version. A missing one is what
  //    makes npm drop the entire optional group, and it deserves its own error
  //    rather than surfacing later as "Cannot find native binding".
  const platformVersion = execFileSync(
    'npm',
    [
      'view',
      `${platformName}@${version}`,
      'version',
      '--json',
      '--registry',
      registry,
    ],
    { cwd: project, env, encoding: 'utf8' },
  ).trim()
  evidence.platformVersion = platformVersion
  assert.equal(
    platformVersion,
    JSON.stringify(version),
    `${platformName}@${version} is not on ${registry}; npm drops the whole ` +
      `optional group when any entry is missing, so the wrapper cannot load`,
  )

  // 2. Install the wrapper the way a consumer does.
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      registry,
      `@zeus-js/compiler-native@${version}`,
    ],
    project,
  )

  // 3. The platform package must actually be in node_modules. This is the exact
  //    assertion that caught the defect in this check's first version — but the
  //    cause was not the one it looked like, so the message names the measured
  //    variables instead of guessing.
  const installed = fs
    .readdirSync(path.join(project, 'node_modules/@zeus-js'))
    .sort()
  evidence.installed = installed
  evidence.npm = execFileSync('npm', ['--version'], {
    cwd: project,
    env,
    encoding: 'utf8',
  }).trim()
  assert(
    installed.includes(`compiler-native-${platform}`),
    `npm installed [${installed.join(', ')}] but not ${platformName}.\n` +
      `  npm ${evidence.npm} on node ${process.version}\n` +
      '  Measured: npm 10.9.0 drops the whole optional group even when every\n' +
      '  platform package exists on the registry, while npm 11.13.0 installs\n' +
      '  them correctly on the same machine, same registry, same version. The\n' +
      '  wrapper then fails with "Cannot find native binding", which reads like\n' +
      '  a packaging defect and is an npm version. A modern npm is the first\n' +
      '  thing to rule out, not the last.',
  )

  // 4. Load it in a clean process, so the workspace cannot satisfy the import.
  const probe = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `
const { createRequire } = require('node:module');
const require_ = createRequire(process.argv[1] + '/package.json');
const compiler = require_('@zeus-js/compiler-native');
const entry = require_.resolve('@zeus-js/compiler-native');
process.stdout.write(JSON.stringify({
  entry,
  hasTransform: typeof compiler.transformModule === 'function',
}));
`,
        project,
      ],
      { cwd: project, env, encoding: 'utf8' },
    ),
  ) as { entry: string; hasTransform: boolean }
  evidence.entry = probe.entry
  assert(
    path.resolve(probe.entry).startsWith(fs.realpathSync(project) + path.sep),
    `the native compiler escaped the packed installation: ${probe.entry}`,
  )
  assert.equal(
    probe.hasTransform,
    true,
    'the installed binding does not expose transformModule',
  )

  // 5. Compile a component with it. Loading a `.node` and compiling are
  //    different failures — a binding built against the wrong ABI loads and then
  //    throws on first call.
  const compiled = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `
const { createRequire } = require('node:module');
const require_ = createRequire(process.argv[1] + '/package.json');
const compiler = require_('@zeus-js/compiler-native');
const result = compiler.transformModule({
  source: "export function App() { return <div id=\\"ok\\">native</div> }",
  filename: 'probe.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  sourceMap: false,
  hmr: false,
  delegateEvents: false,
});
process.stdout.write(JSON.stringify({
  diagnostics: result.diagnostics.map(d => d.code),
  emitted: typeof result.code === 'string' && result.code.length > 0,
}));
`,
        project,
      ],
      { cwd: project, env, encoding: 'utf8' },
    ),
  ) as { diagnostics: string[]; emitted: boolean }
  evidence.diagnostics = compiled.diagnostics
  evidence.emitted = compiled.emitted
  assert.deepEqual(
    compiled.diagnostics,
    [],
    `the packed compiler reported diagnostics: ${compiled.diagnostics.join(', ')}`,
  )
  assert(compiled.emitted, 'the packed compiler emitted no code')

  passed = true
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify({ ...evidence, passed, failure }, null, 2)}\n`,
  )
  if (passed && !values.keep) fs.rmSync(work, { recursive: true, force: true })
  else console.error(`Native install fixture retained at ${work}`)
}

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command !== process.execPath,
  })
}

/**
 * The platform package name for this machine.
 *
 * Mirrors `optionalDependencies` in `compiler-native/package.json`, which is the
 * set the wrapper can actually resolve. A machine outside those seven cannot run
 * this check, and saying so is better than failing as though the registry were
 * broken.
 */
function platformPackage(): string {
  const arch = process.arch
  if (process.platform === 'darwin') {
    if (arch === 'arm64' || arch === 'x64') return `darwin-${arch}`
  } else if (process.platform === 'linux') {
    const report = process.report?.getReport() as
      | { header?: { glibcVersionRuntime?: string } }
      | undefined
    const libc = report?.header?.glibcVersionRuntime ? 'gnu' : 'musl'
    if (arch === 'x64' && libc === 'gnu') return 'linux-x64-gnu'
    if (arch === 'x64' && libc === 'musl') return 'linux-x64-musl'
    if (arch === 'arm64' && libc === 'gnu') return 'linux-arm64-gnu'
  } else if (process.platform === 'win32') {
    if (arch === 'arm64') return 'win32-arm64-msvc'
    if (arch === 'x64') return 'win32-x64-msvc'
  }
  throw new Error(
    `no published native package for ${process.platform}-${process.arch}; ` +
      'the seven supported targets are darwin-arm64, darwin-x64, ' +
      'linux-arm64-gnu, linux-x64-gnu, linux-x64-musl, win32-arm64-msvc, ' +
      'win32-x64-msvc',
  )
}
