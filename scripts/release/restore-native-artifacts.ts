import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const artifactRoot = path.resolve(
  root,
  readOption('--from') ?? 'temp/native-artifacts',
)

const targets = [
  ['aarch64-apple-darwin', 'compiler-native-darwin-arm64', 'darwin-arm64'],
  ['x86_64-apple-darwin', 'compiler-native-darwin-x64', 'darwin-x64'],
  [
    'aarch64-unknown-linux-gnu',
    'compiler-native-linux-arm64-gnu',
    'linux-arm64-gnu',
  ],
  [
    'x86_64-unknown-linux-gnu',
    'compiler-native-linux-x64-gnu',
    'linux-x64-gnu',
  ],
  [
    'x86_64-unknown-linux-musl',
    'compiler-native-linux-x64-musl',
    'linux-x64-musl',
  ],
  [
    'aarch64-pc-windows-msvc',
    'compiler-native-win32-arm64-msvc',
    'win32-arm64-msvc',
  ],
  [
    'x86_64-pc-windows-msvc',
    'compiler-native-win32-x64-msvc',
    'win32-x64-msvc',
  ],
] as const

if (!fs.existsSync(artifactRoot)) {
  throw new Error(`Native artifact directory does not exist: ${artifactRoot}`)
}

for (const [target, packageName, platformName] of targets) {
  const artifactDir = path.join(artifactRoot, `compiler-native-${target}`)
  const binary = findBinary(artifactDir)
  if (!binary) {
    throw new Error(`Missing native artifact for ${target} in ${artifactDir}`)
  }
  const destination = path.join(
    root,
    `packages/core/${packageName}/zeus-compiler-native.${platformName}.node`,
  )
  fs.copyFileSync(binary, destination)
  console.log(
    `[native] restored ${target} -> ${path.relative(root, destination)}`,
  )
}

function findBinary(directory: string): string | undefined {
  if (!fs.existsSync(directory)) return undefined
  const matches: string[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = findBinary(entryPath)
      if (nested) matches.push(nested)
    } else if (entry.name.endsWith('.node')) {
      matches.push(entryPath)
    }
  }
  return matches.length === 1 ? matches[0] : undefined
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}
