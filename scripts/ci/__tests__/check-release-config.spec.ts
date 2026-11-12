/**
 * Tests for the release-config consistency check.
 *
 * The important cases are the drifts: a package added to one list and not the
 * other, a removal, a reorder, and a package that is both fixed and ignored.
 * The parser test guards the assumption the script makes about the shape of
 * `release.config.ts`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  checkReleaseConfig,
  parseFixedPackages,
  readFixedPackages,
} from '../check-release-config'

const root = path.resolve(import.meta.dirname, '../../..')

describe('checkReleaseConfig', () => {
  it('passes when the lists match exactly', () => {
    const result = checkReleaseConfig(['@zeus-js/a', '@zeus-js/b'], {
      fixed: [['@zeus-js/a', '@zeus-js/b']],
    })
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('fails when the repo has a package the changeset config does not', () => {
    const result = checkReleaseConfig(['@zeus-js/a', '@zeus-js/b'], {
      fixed: [['@zeus-js/a']],
    })
    expect(result.ok).toBe(false)
    expect(result.problems[0]!.message).toContain(
      '@zeus-js/b is in zeusFixedPackages but missing from .changeset',
    )
  })

  it('fails when the changeset config has a package the repo does not', () => {
    const result = checkReleaseConfig(['@zeus-js/a'], {
      fixed: [['@zeus-js/a', '@zeus-js/gone']],
    })
    expect(result.ok).toBe(false)
    expect(result.problems[0]!.message).toContain(
      '@zeus-js/gone is in .changeset/config.json fixed but not in',
    )
  })

  it('fails on a reorder, because the two lists are compared in order', () => {
    const result = checkReleaseConfig(['@zeus-js/a', '@zeus-js/b'], {
      fixed: [['@zeus-js/b', '@zeus-js/a']],
    })
    expect(result.ok).toBe(false)
    expect(result.problems[0]!.message).toContain('different order')
  })

  it('fails when there is no fixed group at all', () => {
    const result = checkReleaseConfig(['@zeus-js/a'], {})
    expect(result.ok).toBe(false)
    expect(result.problems[0]!.message).toContain('no `fixed` group')
  })

  it('fails when the fixed group and the ignore list overlap', () => {
    const result = checkReleaseConfig(['@zeus-js/a', '@zeus-js/b'], {
      fixed: [['@zeus-js/a', '@zeus-js/b']],
      ignore: ['@zeus-js/b'],
    })
    expect(result.ok).toBe(false)
    expect(result.problems[0]!.message).toContain('both a fixed package and')
  })
})

describe('parseFixedPackages', () => {
  it('reads a flat list of string literals', () => {
    const source = `
export const zeusFixedPackages = [
  '@zeus-js/a',
  '@zeus-js/b',
]
`
    expect(parseFixedPackages(source)).toEqual(['@zeus-js/a', '@zeus-js/b'])
  })

  it('refuses an entry that is not a plain literal', () => {
    const source = `export const zeusFixedPackages = [
  '@zeus-js/a',
  ...extra,
]`
    expect(() => parseFixedPackages(source)).toThrow(/non-literal entry/)
  })

  it('throws when the literal is gone', () => {
    expect(() => parseFixedPackages('export const other = []')).toThrow(
      /no `zeusFixedPackages = \[` literal/,
    )
  })
})

describe('the repository itself', () => {
  it('has matching lists right now', () => {
    const fixed = readFixedPackages(root)
    const changeset = JSON.parse(
      readFileSync(path.join(root, '.changeset/config.json'), 'utf8'),
    ) as { fixed: string[][] }
    const result = checkReleaseConfig(fixed, changeset)
    expect(result.problems).toEqual([])
    expect(fixed.length).toBe(changeset.fixed[0]!.length)
  })
})
