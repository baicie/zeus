import fs from 'node:fs'
import path from 'node:path'

import pico from 'picocolors'
import prettier from 'prettier'

import { findWorkspacePackages } from '../shared/utils'

interface ApiEntry {
  pkgName: string
  subpath: string
  dtsFile: string
  snapshotFile: string
}

const repoRoot = path.resolve(import.meta.dirname, '../..')

async function normalizeDts(input: string) {
  const stripped = input
    .replace(/\r\n/g, '\n')
    .replace(/\/\/# sourceMappingURL=.*$/gm, '')
    .trim()

  const formatted = await prettier.format(stripped, {
    parser: 'typescript',
    semi: false,
    singleQuote: true,
    printWidth: 80,
    proseWrap: 'preserve',
  })

  return formatted.trim()
}

function normalizeSnapshotSubpath(subpath: string) {
  return subpath === '.'
    ? 'main'
    : subpath.replace(/^\.\//, '').replace(/[\\/]/g, '-')
}

function findTypesTarget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null

  const obj = value as Record<string, unknown>

  if (typeof obj.types === 'string') return obj.types

  for (const key of ['import', 'require', 'node', 'default']) {
    const nested = obj[key]
    const found = findTypesTarget(nested)
    if (found) return found
  }

  return null
}

function cleanSnapshotDir(expectedFiles: Set<string>) {
  const dir = path.join(repoRoot, 'docs/api/snapshots')
  if (!fs.existsSync(dir)) return

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.api.md')) continue

    const fullPath = path.join(dir, file)
    if (!expectedFiles.has(fullPath)) {
      fs.unlinkSync(fullPath)
      console.log(
        pico.yellow(`removed stale ${path.relative(repoRoot, fullPath)}`),
      )
    }
  }
}

function collectApiEntries(pkg: {
  name: string
  dir: string
  packageJson: Record<string, unknown>
}): ApiEntry[] {
  const exportsField = pkg.packageJson.exports as
    | Record<string, unknown>
    | undefined
  const entries: ApiEntry[] = []

  if (!exportsField) return entries

  for (const [subpath, value] of Object.entries(exportsField)) {
    const typesPath = findTypesTarget(value)

    if (!typesPath) continue

    const normalizedSubpath = normalizeSnapshotSubpath(subpath)
    const fileName = `${pkg.name
      .replace('@zeus-js/', '')
      .replace(/\//g, '-')}.${normalizedSubpath}.api.md`

    entries.push({
      pkgName: pkg.name,
      subpath,
      dtsFile: path.join(pkg.dir, typesPath),
      snapshotFile: path.join(repoRoot, 'docs/api/snapshots', fileName),
    })
  }

  return entries
}

function shouldSnapshotPackage(pkg: {
  name: string
  packageJson: Record<string, unknown>
}): boolean {
  if (pkg.packageJson.private) return false
  if (!pkg.name.startsWith('@zeus-js/')) return false
  if (!pkg.packageJson.exports) return false
  return true
}

function createMarkdownCodeFence(content: string): string {
  const backtickRuns = content.match(/`+/g) ?? []

  const maxBacktickRun = backtickRuns.reduce(
    (max, run) => Math.max(max, run.length),
    0,
  )

  return '`'.repeat(Math.max(3, maxBacktickRun + 1))
}

function toSnapshot(pkgName: string, subpath: string, normalizedDts: string) {
  const subpathLabel = subpath === '.' ? 'main' : subpath
  const fence = createMarkdownCodeFence(normalizedDts)

  return `# ${pkgName} (${subpathLabel}) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run \`pnpm api:snapshot\` to update.

${fence}ts
${normalizedDts}
${fence}
`
}

function checkRelativeTypeImports(target: ApiEntry, dts: string) {
  const staticImportRE = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g
  const dynamicImportRE = /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g
  const dtsDir = path.dirname(target.dtsFile)

  for (const re of [staticImportRE, dynamicImportRE]) {
    for (const match of dts.matchAll(re)) {
      const specifier = match[1]
      const candidates = [
        path.resolve(dtsDir, `${specifier}.d.ts`),
        path.resolve(dtsDir, specifier, 'index.d.ts'),
      ]

      if (!candidates.some(p => fs.existsSync(p))) {
        throw new Error(
          `API snapshot for ${target.pkgName} (${target.subpath}) has unresolved relative type import: ${specifier}`,
        )
      }
    }
  }
}

async function main() {
  const packages = findWorkspacePackages()
  const targets: ApiEntry[] = []

  for (const pkg of packages) {
    if (!shouldSnapshotPackage(pkg)) continue

    const entries = collectApiEntries(pkg)
    targets.push(...entries)
  }

  fs.mkdirSync(path.join(repoRoot, 'docs/api/snapshots'), {
    recursive: true,
  })

  const expectedFiles = new Set(targets.map(t => t.snapshotFile))
  cleanSnapshotDir(expectedFiles)

  for (const target of targets) {
    if (!fs.existsSync(target.dtsFile)) {
      throw new Error(
        `Missing declaration file for ${target.pkgName} (${target.subpath}): ${target.dtsFile}. Run pnpm build-dts first.`,
      )
    }

    const dts = fs.readFileSync(target.dtsFile, 'utf-8')
    const normalizedDts = await normalizeDts(dts)

    if (!normalizedDts) {
      throw new Error(
        `Empty declaration file for ${target.pkgName} (${target.subpath}): ${target.dtsFile}`,
      )
    }

    checkRelativeTypeImports(target, normalizedDts)

    const snapshot = toSnapshot(target.pkgName, target.subpath, normalizedDts)

    fs.writeFileSync(target.snapshotFile, snapshot)
    console.log(
      pico.green(`updated ${path.relative(repoRoot, target.snapshotFile)}`),
    )
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
