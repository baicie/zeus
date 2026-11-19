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
  /*
   * The Cargo workspace carries its own version, and it drifted from the npm
   * one in practice: measured `0.1.1-beta.0` against packages at
   * `0.1.1-beta.20`. The rehearsal now moves it with everything else.
   */
  fs.writeFileSync(
    path.join(root, 'Cargo.toml'),
    '[workspace]\nmembers = ["crates/a"]\n\n[workspace.package]\nversion = "0.1.1-beta.0"\nedition = "2024"\n',
  )
  writeJson(root, 'packages/tooling/vite-plugin/package.json', {
    name: '@zeus-js/vite-plugin',
    version: '0.0.5',
  })
  writeJson(
    root,
    'packages/create/create-zeus/templates/basic-ts/package.json',
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
    'packages/create/create-zeus/templates/webc-consumer-ts/package.json',
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

  it('rewrites only the fixed release group', () => {
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
    /*
     * `@zeus-js/vite-plugin` has its own tag line (`vite-plugin@*`,
     * `devtools-release.yml`) and stays where it is across a Core switch.
     */
    expect(
      readJson(root, 'packages/tooling/vite-plugin/package.json').version,
    ).toBe('0.0.5')
    expect(readJson(root, 'packages/core/not-fixed/package.json').version).toBe(
      '0.1.1-beta.20',
    )
    /*
     * The root manifest moves too. Leaving it behind produced a tree whose 32
     * packages claimed one version and whose repository claimed another, and
     * the rehearsal reported success because it never looked at the root.
     */
    expect(readJson(root, 'package.json').version).toBe('0.2.0-rc.0')

    const versionEdits = report.edits.filter(
      edit => edit.kind === 'package-version',
    )
    expect(versionEdits.map(edit => edit.packageName).sort()).toEqual([
      '(cargo workspace)',
      '(root)',
      '@zeus-js/signal',
      '@zeus-js/zeus',
    ])
    for (const edit of versionEdits) {
      /*
       * Cargo's workspace version is `0.1.1-beta.0` while the npm packages are
       * `0.1.1-beta.20` — the drift that made 0.2.0-rc.0 rehearsal produce a
       * tree claiming two different versions. The `before` for that edit is
       * therefore its own value, not the packages'.
       */
      const expected =
        edit.packageName === '(cargo workspace)'
          ? '0.1.1-beta.0'
          : '0.1.1-beta.20'
      expect(edit.before).toBe(expected)
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
      'packages/create/create-zeus/templates/basic-ts/package.json',
    )
    expect(basic.dependencies?.['@zeus-js/zeus']).toBe('0.2.0-rc.0')
    expect(basic.dependencies?.['@zeus-web/button']).toBe('0.1.0-beta.34')
    expect(basic.dependencies?.['left-pad']).toBe('1.3.0')
    /*
     * The vite-plugin pin follows that package's own manifest, not the Core
     * version — `create-zeus-versions` reconciles it and would otherwise fail
     * on the tree this function just wrote.
     */
    expect(basic.devDependencies?.['@zeus-js/vite-plugin']).toBe('0.0.5')
    expect(basic.devDependencies?.typescript).toBe('^5.0.0')

    const consumer = readJson(
      root,
      'packages/create/create-zeus/templates/webc-consumer-ts/package.json',
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
      'Cargo.toml',
      'package.json',
      'packages/core/signal/package.json',
      'packages/core/zeus/package.json',
      'packages/create/create-zeus/templates/basic-ts/package.json',
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
        edit.kind === 'template-pin' && edit.packageName === '@zeus-js/zeus',
    )
    expect(templateEdit).toMatchObject({
      file: 'packages/create/create-zeus/templates/basic-ts/package.json',
      field: 'dependencies.@zeus-js/zeus',
      before: '0.1.1-beta.20',
      after: '0.2.0-rc.0',
    })

    /*
     * The vite-plugin pin is reconciled by `create-zeus-versions` against that
     * package's own manifest, so this function must not touch it. An edit here
     * would make the two disagree.
     */
    expect(
      report.edits.filter(edit => edit.packageName === '@zeus-js/vite-plugin'),
    ).toEqual([])
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
      'packages/create/create-zeus/templates/basic-ts/package.json',
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
        'packages/create/create-zeus/templates/basic-ts/package.json',
      ).dependencies?.['@zeus-js/zeus'],
    ).toBe('workspace:*')
    expect(report.skippedPins).toContainEqual({
      file: 'packages/create/create-zeus/templates/basic-ts/package.json',
      packageName: '@zeus-js/zeus',
      field: 'dependencies',
      before: 'workspace:*',
      reason: 'not an exact version pin; left unchanged',
    })
  })
})

describe('root and Cargo versions', () => {
  /*
   * Measured while rehearsing 0.2.0-rc.0: the function moved all 32 published
   * packages and left the root `package.json` at `0.1.1-beta.20` and
   * `Cargo.toml`'s `[workspace.package] version` at `0.1.1-beta.0`. It reported
   * success, because every version it *looked at* matched.
   *
   * A release that ships 32 packages at one version while the repository claims
   * another produces artifacts nobody can trace to a single tree.
   */
  it('moves the root manifest with the packages', () => {
    const root = fixture()
    applyVersionRehearsal({ root, version: '0.2.0-rc.0', fixedPackages: FIXED })
    expect(readJson(root, 'package.json').version).toBe('0.2.0-rc.0')
  })

  it('moves the Cargo workspace version', () => {
    const root = fixture()
    const report = applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    const cargo = fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8')
    expect(cargo).toContain('version = "0.2.0-rc.0"')
    expect(cargo).not.toContain('0.1.1-beta.0')
    expect(
      report.edits.some(edit => edit.packageName === '(cargo workspace)'),
    ).toBe(true)
  })

  it('records the root edit so a report can name it', () => {
    const root = fixture()
    const report = applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    const rootEdit = report.edits.find(edit => edit.packageName === '(root)')
    expect(rootEdit).toMatchObject({
      before: '0.1.1-beta.20',
      after: '0.2.0-rc.0',
    })
  })

  it('tolerates a tree with no Cargo manifest', () => {
    const root = fixture()
    fs.rmSync(path.join(root, 'Cargo.toml'))
    const report = applyVersionRehearsal({
      root,
      version: '0.2.0-rc.0',
      fixedPackages: FIXED,
    })
    expect(
      report.edits.some(edit => edit.packageName === '(cargo workspace)'),
    ).toBe(false)
    expect(readJson(root, 'package.json').version).toBe('0.2.0-rc.0')
  })

  /*
   * A `[workspace.package]` with no version line is not a reason to skip — it
   * is the exact failure this function was written to remove. The run would
   * rewrite every package, leave Cargo behind, and report success because
   * every version it looked at matched.
   */
  it('fails loudly when [workspace.package] has no version line', () => {
    const root = fixture()
    fs.writeFileSync(
      path.join(root, 'Cargo.toml'),
      '[workspace.package]\nedition = "2024"\n',
    )
    expect(() =>
      applyVersionRehearsal({
        root,
        version: '0.2.0-rc.0',
        fixedPackages: FIXED,
      }),
    ).toThrow(/no "version" line under \[workspace\.package\]/)
  })

  /*
   * Measured: `[\s\S]*?` does not stop at the next table header, so a
   * `[workspace.package]` without a version line let the lazy match walk into
   * the section below and rewrite *that* version. One edit was recorded and
   * the run reported success, with the file now claiming the RC version in a
   * section that must not carry it.
   */
  it('does not rewrite a later section when [workspace.package] has no version line', () => {
    const root = fixture()
    fs.writeFileSync(
      path.join(root, 'Cargo.toml'),
      '[workspace.package]\nedition = "2024"\n\n[package]\nname = "later"\nversion = "9.9.9"\n',
    )
    expect(() =>
      applyVersionRehearsal({
        root,
        version: '0.2.0-rc.0',
        fixedPackages: FIXED,
      }),
    ).toThrow()
    const cargo = fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8')
    expect(cargo).toContain('version = "9.9.9"')
    expect(cargo).not.toContain('0.2.0-rc.0')
  })

  /*
   * Collecting the plan must not write anything, so a malformed Cargo.toml
   * leaves the tree exactly as it was rather than half-bumped.
   */
  it('writes no file at all when the plan cannot be collected', () => {
    const root = fixture()
    fs.writeFileSync(
      path.join(root, 'Cargo.toml'),
      '[workspace.package]\nedition = "2024"\n',
    )
    expect(() =>
      applyVersionRehearsal({
        root,
        version: '0.2.0-rc.0',
        fixedPackages: FIXED,
      }),
    ).toThrow()
    expect(readJson(root, 'package.json').version).toBe('0.1.1-beta.20')
    expect(readJson(root, 'packages/core/zeus/package.json').version).toBe(
      '0.1.1-beta.20',
    )
  })
})
