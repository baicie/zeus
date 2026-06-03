import fs from 'node:fs'
import path from 'node:path'

import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

interface SnapshotPackage {
  name: string
  distDts: string
  snapshot: string
}

const repoRoot = path.resolve(import.meta.dirname, '../..')

const includePackages = new Set([
  '@zeus-js/zeus',
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/compiler',
  '@zeus-js/output-wc',
  '@zeus-js/bundler-plugin',
  '@zeus-js/component-analyzer',
  '@zeus-js/component-dts',
  '@zeus-js/preset-component-library',
])

function normalizeDts(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\/\/# sourceMappingURL=.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getPackageDtsFile(pkg: {
  name: string
  dir: string
  packageJson: Record<string, unknown>
}): string | null {
  const types = pkg.packageJson.types as string | undefined
  if (!types) return null

  return path.join(pkg.dir, types)
}

function getSnapshotFile(pkgName: string) {
  const fileName = pkgName.replace('@zeus-js/', '').replace(/\//g, '-')
  return path.join(repoRoot, 'docs/api/snapshots', `${fileName}.api.md`)
}

function toSnapshot(pkgName: string, dts: string) {
  return `# ${pkgName} API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run \`pnpm api:snapshot\` to update.

\`\`\`ts
${normalizeDts(dts)}
\`\`\`
`
}

async function main() {
  const packages = findWorkspacePackages()
  const targets: SnapshotPackage[] = []

  for (const pkg of packages) {
    if (!includePackages.has(pkg.name)) continue

    const dtsFile = getPackageDtsFile(pkg)
    if (!dtsFile || !fs.existsSync(dtsFile)) {
      throw new Error(
        `Missing declaration file for ${pkg.name}. Run pnpm build-dts first.`,
      )
    }

    targets.push({
      name: pkg.name,
      distDts: dtsFile,
      snapshot: getSnapshotFile(pkg.name),
    })
  }

  fs.mkdirSync(path.join(repoRoot, 'docs/api/snapshots'), {
    recursive: true,
  })

  for (const target of targets) {
    const dts = fs.readFileSync(target.distDts, 'utf-8')
    const snapshot = toSnapshot(target.name, dts)

    fs.writeFileSync(target.snapshot, snapshot)
    console.log(
      pico.green(`updated ${path.relative(repoRoot, target.snapshot)}`),
    )
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
