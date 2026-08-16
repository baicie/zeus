import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const nativeRoot = path.join(root, 'packages/core/compiler-native')
type Target =
  | 'aarch64-apple-darwin'
  | 'x86_64-apple-darwin'
  | 'aarch64-unknown-linux-gnu'
  | 'x86_64-unknown-linux-gnu'
  | 'x86_64-unknown-linux-musl'
  | 'aarch64-pc-windows-msvc'
  | 'x86_64-pc-windows-msvc'

const targets = new Map([
  ['aarch64-apple-darwin', ['compiler-native-darwin-arm64', 'darwin-arm64']],
  ['x86_64-apple-darwin', ['compiler-native-darwin-x64', 'darwin-x64']],
  [
    'aarch64-unknown-linux-gnu',
    ['compiler-native-linux-arm64-gnu', 'linux-arm64-gnu'],
  ],
  [
    'x86_64-unknown-linux-gnu',
    ['compiler-native-linux-x64-gnu', 'linux-x64-gnu'],
  ],
  [
    'x86_64-unknown-linux-musl',
    ['compiler-native-linux-x64-musl', 'linux-x64-musl'],
  ],
  [
    'aarch64-pc-windows-msvc',
    ['compiler-native-win32-arm64-msvc', 'win32-arm64-msvc'],
  ],
  [
    'x86_64-pc-windows-msvc',
    ['compiler-native-win32-x64-msvc', 'win32-x64-msvc'],
  ],
] as const)

const targetValue = readOption('--target') ?? process.env.NATIVE_TARGET
if (!targetValue || !targets.has(targetValue as Target)) {
  throw new Error(
    `Pass a supported --target: ${Array.from(targets.keys()).join(', ')}`,
  )
}
const target = targetValue as Target

const [packageName, platformName] = targets.get(target)!
const packageDir = path.join(root, `packages/core/${packageName}`)
const outputDir = path.join(root, 'temp/native', target)
const buildEnvironment = { ...process.env }
if (target === 'x86_64-unknown-linux-musl') {
  buildEnvironment.CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER ??= 'musl-gcc'
}
fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
execFileSync(
  pnpm,
  [
    'exec',
    'napi',
    'build',
    '--platform',
    '--release',
    '--target',
    target,
    '--output-dir',
    outputDir,
    '--js',
    'index.js',
    '--dts',
    'index.d.ts',
  ],
  {
    cwd: nativeRoot,
    env: buildEnvironment,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

const binaries = fs
  .readdirSync(outputDir)
  .filter(file => file.endsWith('.node'))
if (binaries.length !== 1) {
  throw new Error(
    `Expected one native binary for ${target}, found: ${binaries.join(', ') || '(none)'}`,
  )
}

const destination = path.join(
  packageDir,
  `zeus-compiler-native.${platformName}.node`,
)
fs.copyFileSync(path.join(outputDir, binaries[0]), destination)
console.log(`[native] ${target} -> ${path.relative(root, destination)}`)

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
