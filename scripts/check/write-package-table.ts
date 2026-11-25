/**
 * Regenerates the version table in `docs/api/packages.md` from the manifests.
 *
 * ## Why a writer, not a hand edit
 *
 * `package-table.spec.ts` already regenerated the table and compared it — and
 * that is how this file came to exist: publishing one package left the table
 * saying `0.1.1-beta.14` while the manifest said `0.1.1-beta.15`, and the fix
 * for a derived document is to derive it, not to type the new number in.
 *
 * The table is a *source* contract: it describes the committed tree, so it is
 * written from the working manifests and must be committed with them. A
 * release that bumps a manifest without rerunning this leaves main red.
 *
 * ## What is derived and what is not
 *
 * Name, path and version come from `package.json`. The `说明` column is prose —
 * someone wrote it, and regenerating it would replace their words with a blank
 * or with something a script guessed. Existing descriptions are carried over by
 * package name; a new package gets an empty one, which is visible in the diff.
 *
 * Usage:
 *   tsx scripts/check/write-package-table.ts [--check]
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '../..')
const docPath = path.join(root, 'docs/api/packages.md')

const DOMAINS = [
  'core',
  'compiler',
  'features',
  'web-c',
  'tooling',
  'create',
] as const

interface Row {
  readonly name: string
  readonly dir: string
  readonly version: string
  readonly domain: string
}

/** Every publishable package, read from its manifest. */
export function publishablePackages(base = root): Row[] {
  const rows: Row[] = []

  for (const domain of DOMAINS) {
    const domainDir = path.join(base, 'packages', domain)

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
        domain,
      })
    }
  }

  return rows
}

/**
 * The `说明` text each package already had, keyed by name.
 *
 * Only the version table is read. The document has other tables that name the
 * same packages — chapter 5 lists each package's build artifacts — and reading
 * the whole file let the artifact table's rows overwrite the version table's
 * descriptions with empty strings. `@zeus-js/compiler` lost
 * "Rust-native JSX/TSX 编译器" that way.
 */
export function readDescriptions(document: string): Map<string, string> {
  const descriptions = new Map<string, string>()
  const lines = document.split('\n')
  const headerIndex = lines.findIndex(
    line => line.includes('| 包名') && line.includes('| 版本'),
  )

  if (headerIndex === -1) return descriptions

  let end = headerIndex + 2

  while (end < lines.length && lines[end].startsWith('|')) end += 1

  for (const line of lines.slice(headerIndex + 2, end)) {
    const cells = line.split('|').map(cell => cell.trim())

    if (cells.length < 6) continue

    const name = cells[1].match(/^`([^`]+)`$/)?.[1]

    if (!name) continue

    descriptions.set(name, cells[5] ?? '')
  }

  return descriptions
}

/** Renders one row with the column widths the table uses. */
function renderRow(row: Row, description: string): string {
  const name = `\`${row.name}\``
  const dir = `\`${row.dir}\``

  return `| ${name.padEnd(43)} | ${dir.padEnd(52)} | ${row.version.padEnd(13)} | ${row.domain.padEnd(8)} | ${description.padEnd(45)} |`
}

/**
 * Replaces the rows of the version table, leaving its header and title intact.
 *
 * The table is found by its header row rather than by line number: a line
 * number survives exactly one edit.
 */
export function regenerate(document: string, rows: readonly Row[]): string {
  const lines = document.split('\n')
  const headerIndex = lines.findIndex(
    line => line.includes('| 包名') && line.includes('| 版本'),
  )

  if (headerIndex === -1) {
    throw new Error(
      'could not find the version table header in docs/api/packages.md',
    )
  }

  let end = headerIndex + 2

  while (end < lines.length && lines[end].startsWith('|')) end += 1

  const byName = new Map(rows.map(row => [row.name, row]))

  /*
   * Existing rows keep their text and their position; only the version cell is
   * rewritten.
   *
   * A generator that re-renders every row produces a 70-line diff for a
   * one-line version change, and a diff that large hides the change a reviewer
   * needs to read. It also has no way to know why the rows are ordered the way
   * they are — they are grouped by domain, not sorted — and a script that
   * re-sorts them is expressing an opinion it was not asked for.
   *
   * Alignment is left alone for the same reason: the existing columns are
   * already aligned, and recomputing widths shifts every row when one name
   * grows.
   */
  const seen = new Set<string>()
  const updated = lines.slice(headerIndex + 2, end).map(line => {
    const cells = line.split('|')
    const name = cells[1]?.trim().match(/^`([^`]+)`$/)?.[1]

    if (!name) return line

    const row = byName.get(name)

    if (!row) return line

    seen.add(name)

    /* `| name | dir | version | type | description |` — version is cell 3. */
    const width = cells[3].length
    cells[3] = ` ${row.version.padEnd(width - 2)} `
    return cells.join('|')
  })

  /* Packages the table does not mention yet are appended, in name order. */
  const missing = rows
    .filter(row => !seen.has(row.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(row => renderRow(row, readDescriptions(document).get(row.name) ?? ''))

  return [
    ...lines.slice(0, headerIndex + 2),
    ...updated,
    ...missing,
    ...lines.slice(end),
  ].join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const checkOnly = process.argv.includes('--check')
  const current = fs.readFileSync(docPath, 'utf-8')
  const next = regenerate(current, publishablePackages())

  if (current === next) {
    console.log('the package table is up to date')
    process.exit(0)
  }

  if (checkOnly) {
    console.error(
      'the package table is stale; run without --check to rewrite it',
    )
    process.exit(1)
  }

  fs.writeFileSync(docPath, next)
  console.log(`rewrote ${path.relative(root, docPath)}`)
}
