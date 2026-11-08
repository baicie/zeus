import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkUiPairing } from '../check-ui-pairing'

const roots: string[] = []

function fixture(dependency: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-ui-pairing-'))
  roots.push(root)
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'zeus-ui', version: '0.2.0-rc.0' }),
  )
  fs.mkdirSync(path.join(root, 'packages', 'button'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'packages', 'button', 'package.json'),
    JSON.stringify({
      name: '@zeus-web/button',
      version: '0.2.0-rc.0',
      peerDependencies: { '@zeus-js/zeus': dependency },
    }),
  )
  return root
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('Core/UI pairing', () => {
  it('passes when every UI package pins the exact Core candidate', () => {
    const result = checkUiPairing({
      uiRoot: fixture('0.2.0-rc.0'),
      coreVersion: '0.2.0-rc.0',
    })
    expect(result.uiVersion).toBe('0.2.0-rc.0')
    expect(result.mismatches).toEqual([])
  })

  it('rejects an old beta pin and a missing UI checkout', () => {
    const result = checkUiPairing({
      uiRoot: fixture('0.1.1-beta.20'),
      coreVersion: '0.2.0-rc.0',
    })
    expect(result.mismatches).toEqual([
      '@zeus-web/button: @zeus-js/zeus 0.1.1-beta.20 != 0.2.0-rc.0',
    ])
    expect(
      checkUiPairing({
        uiRoot: path.join(os.tmpdir(), 'zeus-ui-missing'),
        coreVersion: '0.2.0-rc.0',
      }).mismatches[0],
    ).toContain('UI checkout is missing')
  })
})
