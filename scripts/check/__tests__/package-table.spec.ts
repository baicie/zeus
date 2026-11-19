/**
 * The package table in `docs/api/packages.md` must match the manifests.
 *
 * It was hand-maintained and drifted in both directions: every row still said
 * `0.1.1-beta.20` while the tree was on `0.2.0-rc.3`, and half the paths named
 * pre-R16.0 directories. A version table nobody checks is worse than no table —
 * an agent reading it gets a confident wrong answer.
 *
 * The check regenerates the table from `package.json` files and compares. The
 * "说明" column is prose and is not compared; everything that can be derived is.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const docPath = path.join(root, 'docs/api/packages.md')

const DOMAINS = ['core', 'compiler', 'features', 'web-c', 'tooling', 'create']

interface Row {
  readonly name: string
  readonly dir: string
  readonly version: string
}

/** Every publishable package, read from its manifest. */
function publishablePackages(): Row[] {
  const rows: Row[] = []
  for (const domain of DOMAINS) {
    const domainDir = path.join(root, 'packages', domain)
    if (!fs.existsSync(domainDir)) continue
    for (const entry of fs.readdirSync(domainDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue
      const manifestPath = path.join(domainDir, entry.name, 'package.json')
      if (!fs.existsSync(manifestPath)) continue
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        name?: string
        version?: string
        private?: boolean
      }
      if (!manifest.name || manifest.private === true) continue
      rows.push({
        name: manifest.name,
        dir: `packages/${domain}/${entry.name}`,
        version: manifest.version ?? '0.0.0',
      })
    }
  }
  return rows
}

/** Rows as the document states them. */
function documentedRows(): Row[] {
  const document = fs.readFileSync(docPath, 'utf-8')
  const rows: Row[] = []
  for (const line of document.split('\n')) {
    // | `name` | `path` | version | type | description |
    const cells = line.split('|').map(cell => cell.trim())
    if (cells.length < 6) continue
    const name = cells[1].match(/^`([^`]+)`$/)?.[1]
    const dir = cells[2].match(/^`([^`]+)`$/)?.[1]
    const version = cells[3]
    if (!name || !dir || !version || !/^\d/.test(version)) continue
    rows.push({ name, dir, version })
  }
  return rows
}

describe('docs/api/packages.md', () => {
  it('lists exactly the publishable packages', () => {
    const manifest = publishablePackages().sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    const documented = documentedRows().sort((a, b) =>
      a.name.localeCompare(b.name),
    )

    const missing = manifest.filter(
      row => !documented.some(entry => entry.name === row.name),
    )
    const extra = documented.filter(
      row => !manifest.some(entry => entry.name === row.name),
    )

    expect(
      { missing: missing.map(r => r.name), extra: extra.map(r => r.name) },
      'the table must list every publishable package and nothing else',
    ).toEqual({ missing: [], extra: [] })
  })

  it('states each package version and path as the manifest does', () => {
    const manifest = new Map(publishablePackages().map(row => [row.name, row]))
    const offenders: string[] = []

    for (const row of documentedRows()) {
      const actual = manifest.get(row.name)
      if (!actual) continue
      if (row.version !== actual.version) {
        offenders.push(
          `${row.name}: table says ${row.version}, manifest says ${actual.version}`,
        )
      }
      if (row.dir !== actual.dir) {
        offenders.push(
          `${row.name}: table says ${row.dir}, manifest says ${actual.dir}`,
        )
      }
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `The table is derived from manifests; update it rather than the document:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
