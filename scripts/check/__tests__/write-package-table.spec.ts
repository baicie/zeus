import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  publishablePackages,
  readDescriptions,
  regenerate,
} from '../write-package-table'

const root = path.resolve(import.meta.dirname, '../../..')
const docPath = path.join(root, 'docs/api/packages.md')

const DOC = fs.readFileSync(docPath, 'utf-8')

/**
 * The table generator must be able to rewrite what it derived, and must leave
 * everything a person wrote alone.
 */
describe('the package table generator', () => {
  it('produces no change when run against the committed table', () => {
    /*
     * The whole point: a release that bumps a manifest reruns this and the diff
     * is exactly the version. A generator that always reports a difference
     * would be rerun by nobody.
     */
    expect(regenerate(DOC, publishablePackages(root))).toBe(DOC)
  })

  it('is idempotent across two runs', () => {
    /* Task A3: consecutive generation must agree. */
    const once = regenerate(DOC, publishablePackages(root))
    const twice = regenerate(once, publishablePackages(root))

    expect(twice).toBe(once)
  })

  it('changes only the version cell when one version moves', () => {
    /*
     * A 70-line diff for a one-line change is what the first version of this
     * generator produced, by re-rendering and re-sorting every row. It hid the
     * change a reviewer needed to look at.
     */
    const rows = publishablePackages(root).map(row =>
      row.name === '@zeus-js/devtools-consumer'
        ? { ...row, version: '9.9.9-test' }
        : row,
    )

    const next = regenerate(DOC, rows)
    const before = DOC.split('\n')
    const after = next.split('\n')

    expect(after.length).toBe(before.length)

    const changed = before
      .map((line, index) => (line === after[index] ? null : index))
      .filter((index): index is number => index !== null)

    expect(changed.length, 'exactly one line should move').toBe(1)
    expect(after[changed[0]!]).toContain('9.9.9-test')
  })

  it('keeps the prose description of every package', () => {
    /*
     * The description column is written by people. The generator reads it back
     * by package name, and an early version read the whole document — where
     * chapter 5 lists build artifacts under the same package names — so the
     * artifact table's empty cells overwrote the version table's prose.
     */
    const descriptions = readDescriptions(DOC)

    expect(descriptions.get('@zeus-js/compiler')).toBe(
      'Rust-native JSX/TSX 编译器',
    )
    expect(descriptions.get('@zeus-js/zeus')).toBe('统一入口，导出所有公共 API')

    const regenerated = readDescriptions(
      regenerate(DOC, publishablePackages(root)),
    )

    for (const [name, text] of descriptions) {
      expect(regenerated.get(name), `${name} lost its description`).toBe(text)
    }
  })

  it('appends a package the table does not mention yet', () => {
    const rows = [
      ...publishablePackages(root),
      {
        name: '@zeus-js/brand-new',
        dir: 'packages/core/brand-new',
        version: '1.0.0',
        domain: 'core',
      },
    ]

    const next = regenerate(DOC, rows)

    expect(next).toContain('@zeus-js/brand-new')
    expect(next).toContain('1.0.0')
  })

  it('drops nothing when a package disappears from the manifest list', () => {
    /*
     * The generator only writes; it does not decide that a row is stale. A
     * package removed from the workspace leaves its row alone, and
     * `package-table.spec.ts` reports the mismatch — the check owns that
     * judgement, not the writer.
     */
    const rows = publishablePackages(root).filter(
      row => row.name !== '@zeus-js/zeus',
    )

    expect(regenerate(DOC, rows)).toBe(DOC)
  })

  it('leaves a document it cannot understand alone', () => {
    expect(() => regenerate('# no table here', [])).toThrow(
      /could not find the version table header/,
    )
  })
})
