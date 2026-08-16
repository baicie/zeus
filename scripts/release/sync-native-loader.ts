import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { writeJsBinding } from '@napi-rs/cli'

export async function syncNativeLoader(
  version: string,
  root = path.resolve(import.meta.dirname, '../..'),
): Promise<void> {
  await writeJsBinding({
    platform: true,
    noJsBinding: false,
    idents: ['transformModule'],
    jsBinding: 'index.js',
    esm: false,
    binaryName: 'zeus-compiler-native',
    packageName: '@zeus-js/compiler-native',
    version,
    outputDir: path.join(root, 'packages/core/compiler-native'),
  })
}

async function main(): Promise<void> {
  const version = process.argv[2]
  if (!version) throw new Error('Usage: sync-native-loader <version>')
  await syncNativeLoader(version)
  console.log(`[native] synchronized generated loader for ${version}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
