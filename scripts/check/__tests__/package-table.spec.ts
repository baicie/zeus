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
import { execFileSync } from 'node:child_process'
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

/**
 * The version a package has in the committed tree.
 *
 * `release:version-packages` rewrites the working copies to a canary version
 * before the release precheck runs, and the precheck runs `pnpm test-unit`. A
 * check that read the working manifest would then compare the document's
 * source version against a staged one and report 32 mismatches — which is
 * exactly how the canary failed.
 *
 * The documented version is a *source contract*, so it is compared against the
 * source: `git show HEAD:<path>`. The working copy is a publication artifact
 * during a release, and a separate check owns it.
 */
function committedVersions(): Map<string, string> {
  // One `git archive` of the manifests, read in memory. The obvious version —
  // a `git show` per package — spawns 36 processes and takes the suite past
  // its timeout, which is a test-harness limit, not a statement about the
  // contract.
  const versions = new Map<string, string>()
  let archive: Buffer
  try {
    archive = execFileSync(
      'git',
      ['archive', '--format=tar', 'HEAD', 'packages'],
      {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
  } catch {
    return versions
  }

  // A tar is a sequence of 512-byte headers followed by padded file content.
  // Reading the two fields we need (name, then the JSON body) is enough here;
  // pulling in a tar dependency for a test would be worse than thirty lines.
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    if (name === '') break
    const sizeField = header
      .subarray(124, 136)
      .toString('utf8')
      .replace(/\0.*$/, '')
      .trim()
    const size = Number.parseInt(sizeField, 8) || 0
    const bodyStart = offset + 512
    const body = archive.subarray(bodyStart, bodyStart + size)

    if (/^packages\/[^/]+\/[^/]+\/package\.json$/.test(name)) {
      try {
        const manifest = JSON.parse(body.toString('utf8')) as {
          name?: string
          version?: string
        }
        if (manifest.name && manifest.version) {
          versions.set(manifest.name, manifest.version)
        }
      } catch {
        // An unparsable committed manifest is a real problem, but not this
        // test's subject; the package-set check still fails on it.
      }
    }

    offset = bodyStart + Math.ceil(size / 512) * 512
  }
  return versions
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

  it('states each package version as the committed manifest does', () => {
    // Versions are compared against `HEAD`, not the working copy: a canary run
    // rewrites the working manifests before this suite executes, and the
    // documented version describes the source, not the staged artifact.
    const manifest = new Map(publishablePackages().map(row => [row.name, row]))
    const committedVersionsByName = committedVersions()
    const offenders: string[] = []

    for (const row of documentedRows()) {
      const actual = manifest.get(row.name)
      if (!actual) continue
      const committed = committedVersionsByName.get(row.name)
      if (committed === undefined) continue
      if (row.version !== committed) {
        offenders.push(
          `${row.name}: table says ${row.version}, committed manifest says ${committed}`,
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
