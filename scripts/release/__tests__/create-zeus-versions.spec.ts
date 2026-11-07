import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { syncCreateZeusVersions } from '../create-zeus-versions'

const roots: string[] = []

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-create-versions-'))
  roots.push(root)
  const templates = path.join(root, 'packages/devtools/create-zeus/templates')
  fs.mkdirSync(path.join(templates, 'basic-ts'), { recursive: true })
  fs.mkdirSync(path.join(templates, 'webc-consumer-ts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'packages/devtools/vite-plugin'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(root, 'packages/devtools/vite-plugin/package.json'),
    JSON.stringify({ name: '@zeus-js/vite-plugin', version: '0.0.6' }),
  )
  fs.writeFileSync(
    path.join(templates, 'basic-ts/package.json'),
    JSON.stringify({
      dependencies: { '@zeus-js/zeus': '0.1.1-beta.20' },
      devDependencies: { '@zeus-js/vite-plugin': '0.0.5' },
    }),
  )
  fs.writeFileSync(
    path.join(templates, 'webc-consumer-ts/package.json'),
    JSON.stringify({
      dependencies: { '@zeus-web/button': '0.1.0-beta.34' },
    }),
  )
  return root
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('create-zeus template version sync', () => {
  it('reports stale Core, vite-plugin and UI pins without mutating in check mode', () => {
    const root = fixture()
    const basic = path.join(
      root,
      'packages/devtools/create-zeus/templates/basic-ts/package.json',
    )
    const before = fs.readFileSync(basic, 'utf8')
    const mismatches = syncCreateZeusVersions({
      root,
      coreVersion: '0.2.0-rc.0',
      uiVersion: '0.1.0-rc.0',
      check: true,
    })

    const relative = (...parts: string[]) => path.join(...parts)
    expect(mismatches).toEqual(
      expect.arrayContaining([
        `${relative('packages', 'devtools', 'create-zeus', 'templates', 'basic-ts', 'package.json')}: @zeus-js/zeus 0.1.1-beta.20 != 0.2.0-rc.0`,
        `${relative('packages', 'devtools', 'create-zeus', 'templates', 'basic-ts', 'package.json')}: @zeus-js/vite-plugin 0.0.5 != 0.0.6`,
        `${relative('packages', 'devtools', 'create-zeus', 'templates', 'webc-consumer-ts', 'package.json')}: @zeus-web/button 0.1.0-beta.34 != 0.1.0-rc.0`,
      ]),
    )
    expect(fs.readFileSync(basic, 'utf8')).toBe(before)
  })

  it('rewrites every pin when check mode is off', () => {
    const root = fixture()
    const mismatches = syncCreateZeusVersions({
      root,
      coreVersion: '0.2.0-rc.0',
      uiVersion: '0.1.0-rc.0',
    })
    expect(mismatches).toHaveLength(3)
    const basic = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'packages/devtools/create-zeus/templates/basic-ts/package.json',
        ),
        'utf8',
      ),
    ) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(basic.dependencies['@zeus-js/zeus']).toBe('0.2.0-rc.0')
    expect(basic.devDependencies['@zeus-js/vite-plugin']).toBe('0.0.6')
    const consumer = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'packages/devtools/create-zeus/templates/webc-consumer-ts/package.json',
        ),
        'utf8',
      ),
    ) as { dependencies: Record<string, string> }
    expect(consumer.dependencies['@zeus-web/button']).toBe('0.1.0-rc.0')
  })
})
