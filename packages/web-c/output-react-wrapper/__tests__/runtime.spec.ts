import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const consumerRequire = createRequire(
  process.env.ZEUS_REACT_CONSUMER_PACKAGE ??
    new URL('../../../../examples/react-wrapper/package.json', import.meta.url),
)
const fixture = fileURLToPath(
  new URL('./fixtures/react-runtime-consumer.mjs', import.meta.url),
)

describe('React runtime consumer', () => {
  it.each(['server', 'browser'])(
    'supports a real %s consumer without test globals',
    mode => {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          fixture,
          mode,
          consumerRequire.resolve('react'),
          consumerRequire.resolve('react-dom/server'),
          consumerRequire.resolve('react-dom/client'),
        ],
        { encoding: 'utf8', timeout: 15000 },
      )

      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe('')
      expect(result.status, result.stdout).toBe(0)
      expect(result.stdout).toContain(`${mode}: ok`)
    },
  )
})
