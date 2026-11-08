import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  applyVersionRehearsal,
  assertRcVersion,
  collectVersionRehearsal,
} from '../version-rehearsal'

const roots: string[] = []
const FIXED = ['@zeus-js/zeus', '@zeus-js/signal'] as const

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function writeJson(root: string, relativeFile: string, value: unknown): string {
  const file = path.join(root, relativeFile)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  return file
}

interface TestManifest {
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readJson(root: string, relativeFile: string): TestManifest {
  return JSON.parse(
    fs.readFileSync(path.join(root, relativeFile), 'utf8'),
  ) as TestManifest
}

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-version-rehearsal-'))
  roots.push(root)
  writeJson(root, 'package.json', {
    name: 'root',
    version: '0.1.1-beta.20',
    private: true,
  })
  writeJson(root, 'packages/core/zeus/package.json', {
    name: '@zeus-js/zeus',
    version: '0.1.1-beta.20',
    dependencies: { '@zeus-js/signal': 'workspace:*' },
  })
  writeJson(root, 'packages/core/signal/package.json', {
    name: '@zeus-js/signal',
    version: '0.1.1-beta.20',
  })
  writeJson(root, 'packages/core/not-fixed/package.json', {
    name: '@zeus-js/not-fixed',
    version: '0.1.1-beta.20',
  })
  writeJson(root, 'packages/devtools/vite-plugin/package.json', {
    name: '@zeus-js/vite-plugin',
    version: '0.0.5',
  })
  writeJson(
    root,
    'packages/devtools/create-zeus/templates/basic-ts/package.json',
    {
      name: 'my-zeus-app',
      dependencies: {
        '@zeus-js/zeus': '0.1.1-beta.20',
        '@zeus-web/button': '0.1.0-beta.34',
        'left-pad': '1.3.0',
      },
      devDependencies: {
        '@zeus-js/vite-plugin': '0.0.5',
        typescript: '^5.0.0',
      },
    },
  )
  writeJson(
    root,
    'packages/devtools/create-zeus/templates/webc-consumer-ts/package.json',
    {
      name: 'my-zeus-webc-consumer',
      dependencies: { '@zeus-web/button': '0.1.0-beta.34' },
    },
  )
  return root
}

describe('version rehearsal', () => {
  it('accepts concrete RC versions and rejects everything else', () => {
    expect(() => assertRcVersion('0.2.0-rc.0')).not.toThrow()
    expect(() => assertRcVersion('1.2.3-rc.10')).not.toThrow()
    expect(() => assertRcVersion('0.2.0')).toThrow(/RC version/)
    expect(() => assertRcVersion('0.2.0-beta.0')).toThrow(/RC version/)
    expect(() => assertRcVersion('0.2.0-rc')).toThrow(/RC version/)
    expect(() => assertRcVersion('v0.2.0-rc.0')).toThrow(/RC version/)

    const root = fixture()
    expect(() =>
      collectVersionRehearsal({
        root,
        version: '0.2.0',
        fixedPackages: FIXED,
      }),
    ).toThrow(/RC version/)
  })

  it('rewrites only the fixed release group plus vite-plugin', () => {
    const root = fixture()
    const report = applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })

    expect(readJson(root, 'packages/core/zeus/package.json').version).toBe(
      '0.2.0-rc.0',
    )
    expect(readJson(root, 'packages/core/signal/package.json').version).toBe(
      '0.2.0-rc.0',
    )
    expect(
      readJson(root, 'packages/devtools/vite-plugin/package.json').version,
    ).toBe('0.2.0-rc.0')
    expect(readJson(root, 'packages/core/not-fixed/package.json').version).toBe(
      '0.1.1-beta.20',
    )
    expect(readJson(root, 'package.json').version).toBe('0.1.1-beta.20')

    const versionEdits = report.edits.filter(
      edit => edit.kind === 'package-version',
    )
    expect(versionEdits.map(edit => edit.packageName).sort()).toEqual([
      '@zeus-js/signal',
      '@zeus-js/vite-plugin',
      '@zeus-js/zeus',
    ])
    for (const edit of versionEdits) {
      expect(edit.before).toBe(
        edit.packageName === '@zeus-js/vite-plugin' ? '0.0.5' : '0.1.1-beta.20',
      )
      expect(edit.after).toBe('0.2.0-rc.0')
    }
  })

  it('rewrites every exact @zeus-js template pin and preserves other deps', () => {
    const root = fixture()
    applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })

    const basic = readJson(
      root,
      'packages/devtools/create-zeus/templates/basic-ts/package.json',
    )
    expect(basic.dependencies?.['@zeus-js/zeus']).toBe('0.2.0-rc.0')
    expect(basic.dependencies?.['@zeus-web/button']).toBe('0.1.0-beta.34')
    expect(basic.dependencies?.['left-pad']).toBe('1.3.0')
    expect(basic.devDependencies?.['@zeus-js/vite-plugin']).toBe('0.2.0-rc.0')
    expect(basic.devDependencies?.typescript).toBe('^5.0.0')

    const consumer = readJson(
      root,
      'packages/devtools/create-zeus/templates/webc-consumer-ts/package.json',
    )
    expect(consumer.dependencies?.['@zeus-web/button']).toBe('0.1.0-beta.34')
  })

  it('reports before/after values for every rewritten file', () => {
    const root = fixture()
    const report = applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })

    expect(report.schema).toBe('zeus.version-rehearsal/v1')
    expect(report.version).toBe('0.2.0-rc.0')
    expect(report.modifiedFiles.map(file => file.file).sort()).toEqual([
      'packages/core/signal/package.json',
      'packages/core/zeus/package.json',
      'packages/devtools/create-zeus/templates/basic-ts/package.json',
      'packages/devtools/vite-plugin/package.json',
    ])

    const zeusEdit = report.edits.find(
      edit =>
        edit.kind === 'package-version' && edit.packageName === '@zeus-js/zeus',
    )
    expect(zeusEdit).toMatchObject({
      file: 'packages/core/zeus/package.json',
      before: '0.1.1-beta.20',
      after: '0.2.0-rc.0',
    })

    const templateEdit = report.edits.find(
      edit =>
        edit.kind === 'template-pin' &&
        edit.packageName === '@zeus-js/vite-plugin',
    )
    expect(templateEdit).toMatchObject({
      file: 'packages/devtools/create-zeus/templates/basic-ts/package.json',
      field: 'devDependencies.@zeus-js/vite-plugin',
      before: '0.0.5',
      after: '0.2.0-rc.0',
    })
  })

  it('rejects duplicate workspace package names', () => {
    const root = fixture()
    writeJson(root, 'packages/core/duplicate/package.json', {
      name: '@zeus-js/zeus',
      version: '9.9.9',
    })

    expect(() =>
      collectVersionRehearsal({
        root,
        version: '0.2.0-rc.0',
        fixedPackages: FIXED,
      }),
    ).toThrow(/duplicate workspace package @zeus-js\/zeus/)
  })

  it('rejects a fixed release package that is missing from the workspace', () => {
    const root = fixture()

    expect(() =>
      collectVersionRehearsal({
        root,
        version: '0.2.0-rc.0',
        fixedPackages: [...FIXED, '@zeus-js/missing'],
      }),
    ).toThrow(/missing from the workspace: @zeus-js\/missing/)
  })

  it('leaves non-exact pins untouched and reports why', () => {
    const root = fixture()
    writeJson(
      root,
      'packages/devtools/create-zeus/templates/basic-ts/package.json',
      {
        name: 'my-zeus-app',
        dependencies: { '@zeus-js/zeus': 'workspace:*' },
      },
    )

    const report = applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })

    expect(
      readJson(
        root,
        'packages/devtools/create-zeus/templates/basic-ts/package.json',
      ).dependencies?.['@zeus-js/zeus'],
    ).toBe('workspace:*')
    expect(report.skippedPins).toContainEqual({
      file: 'packages/devtools/create-zeus/templates/basic-ts/package.json',
      packageName: '@zeus-js/zeus',
      field: 'dependencies',
      before: 'workspace:*',
      reason: 'not an exact version pin; left unchanged',
    })
  })
})
