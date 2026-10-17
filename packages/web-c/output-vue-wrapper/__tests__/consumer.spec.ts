import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('Vue runtime consumer', () => {
  it.each(['server', 'browser'])(
    'supports a real %s consumer',
    mode => {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          fileURLToPath(
            new URL('./fixtures/vue-runtime-consumer.mjs', import.meta.url),
          ),
          mode,
        ],
        { encoding: 'utf8', timeout: 15000 },
      )
      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe('')
      expect(result.status, result.stdout).toBe(0)
      expect(result.stdout).toContain(`${mode}: ok`)
    },
    30000,
  )
})
