import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const expectedVersion = readJson(path.join(root, 'package.json')).version
const requireBinaries = process.argv.includes('--require-binaries')
const selectedPackage = readOption('--package')

const packages = [
  ['compiler-native-darwin-arm64', 'zeus-compiler-native.darwin-arm64.node'],
  ['compiler-native-darwin-x64', 'zeus-compiler-native.darwin-x64.node'],
  [
    'compiler-native-linux-arm64-gnu',
    'zeus-compiler-native.linux-arm64-gnu.node',
  ],
  ['compiler-native-linux-x64-gnu', 'zeus-compiler-native.linux-x64-gnu.node'],
  [
    'compiler-native-linux-x64-musl',
    'zeus-compiler-native.linux-x64-musl.node',
  ],
  [
    'compiler-native-win32-arm64-msvc',
    'zeus-compiler-native.win32-arm64-msvc.node',
  ],
  [
    'compiler-native-win32-x64-msvc',
    'zeus-compiler-native.win32-x64-msvc.node',
  ],
] as const

const wrapper = readJson(
  path.join(root, 'packages/core/compiler-native/package.json'),
)
const wrapperPublishConfig = wrapper.publishConfig as
  | { provenance?: unknown }
  | undefined
const wrapperRepository = wrapper.repository as { url?: unknown } | undefined
if (
  wrapper.version !== expectedVersion ||
  wrapperPublishConfig?.provenance !== true ||
  wrapper.license !== 'MIT' ||
  !wrapperRepository?.url
) {
  throw new Error('@zeus-js/compiler-native: invalid publish metadata')
}
for (const file of ['index.js', 'index.d.ts', 'README.md', 'LICENSE']) {
  if (!fs.existsSync(path.join(root, 'packages/core/compiler-native', file))) {
    throw new Error(`@zeus-js/compiler-native: missing ${file}`)
  }
}

for (const [name, binary] of packages) {
  if (selectedPackage && selectedPackage !== name) continue
  const directory = path.join(root, 'packages/core', name)
  const manifest = readJson(path.join(directory, 'package.json'))
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `${manifest.name}: version ${manifest.version} != ${expectedVersion}`,
    )
  }
  const repository = manifest.repository as { url?: unknown } | undefined
  if (manifest.license !== 'MIT' || !repository?.url) {
    throw new Error(`${manifest.name}: missing license or repository metadata`)
  }
  const publishConfig = manifest.publishConfig as
    | { provenance?: unknown }
    | undefined
  if (publishConfig?.provenance !== true) {
    throw new Error(`${manifest.name}: publishConfig.provenance must be true`)
  }
  const exportsField = manifest.exports as
    | { '.': { types?: unknown } }
    | undefined
  if (!exportsField?.['.']?.types) {
    throw new Error(`${manifest.name}: missing typed exports`)
  }
  for (const file of ['index.js', 'index.d.ts', 'README.md', 'LICENSE']) {
    if (!fs.existsSync(path.join(directory, file))) {
      throw new Error(`${manifest.name}: missing ${file}`)
    }
  }
  if (requireBinaries && !fs.existsSync(path.join(directory, binary))) {
    throw new Error(`${manifest.name}: missing ${binary}`)
  }
}

console.log(
  `[native] package metadata passed${requireBinaries ? ' with binaries' : ''}`,
)

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
