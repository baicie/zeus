import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { syncNativeLoader } from '../sync-native-loader'

describe('syncNativeLoader', () => {
  it('generates a strict native package version check for the release version', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zeus-native-loader-'))
    mkdirSync(join(root, 'packages/core/compiler-native'), { recursive: true })

    try {
      await syncNativeLoader('0.1.1-beta.1', root)
      const loader = readFileSync(
        join(root, 'packages/core/compiler-native/index.js'),
        'utf8',
      )

      expect(loader).toContain("bindingPackageVersion !== '0.1.1-beta.1'")
      expect(loader).toContain(
        "require('@zeus-js/compiler-native-linux-x64-gnu')",
      )
      expect(loader).toContain('NAPI_RS_ENFORCE_VERSION_CHECK')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
