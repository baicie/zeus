import fs from 'node:fs/promises'
import path from 'node:path'

import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

export interface SbomComponent {
  readonly type: 'library'
  readonly name: string
  readonly version: string
  readonly 'bom-ref': string
  readonly licenses?: readonly { readonly license: { readonly id: string } }[]
}

export async function createSbom(
  packages: Awaited<ReturnType<typeof findWorkspacePackages>>,
): Promise<{
  bomFormat: 'CycloneDX'
  specVersion: '1.5'
  version: 1
  metadata: {
    timestamp: string
    tools: readonly { vendor: string; name: string; version: string }[]
  }
  components: readonly SbomComponent[]
}> {
  const timestamp =
    process.env.SOURCE_DATE_EPOCH === undefined
      ? new Date(0).toISOString()
      : new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp,
      tools: [{ vendor: 'Zeus', name: 'check-sbom', version: '1' }],
    },
    components: packages
      .map(pkg => ({
        type: 'library' as const,
        name: pkg.name,
        version: String(pkg.packageJson.version ?? '0.0.0'),
        'bom-ref': `${pkg.name}@${String(pkg.packageJson.version ?? '0.0.0')}`,
        ...(pkg.packageJson.license === 'MIT'
          ? { licenses: [{ license: { id: 'MIT' as const } }] }
          : {}),
      }))
      .sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref'])),
  }
}

export function sbomComponentsMatch(
  existing: unknown,
  expected: { readonly components: readonly Pick<SbomComponent, 'bom-ref'>[] },
): boolean {
  if (!isRecord(existing) || !Array.isArray(existing.components)) return false

  const actualRefs: string[] = []
  for (const component of existing.components) {
    if (!isRecord(component) || typeof component['bom-ref'] !== 'string') {
      return false
    }
    actualRefs.push(component['bom-ref'])
  }
  if (actualRefs.length === 0) return false

  const expectedRefs = expected.components
    .map(component => component['bom-ref'])
    .sort()
  actualRefs.sort()
  return (
    actualRefs.length === expectedRefs.length &&
    actualRefs.every((ref, index) => ref === expectedRefs[index])
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const output = path.resolve('temp/sbom/zeus.cdx.json')
  const sbom = await createSbom(findWorkspacePackages())
  if (check) {
    const existing = JSON.parse(await fs.readFile(output, 'utf8')) as unknown
    if (!sbomComponentsMatch(existing, sbom)) {
      throw new Error('SBOM is stale; run `pnpm check:sbom:write`.')
    }
    console.log(
      pico.green(`SBOM is current (${sbom.components.length} components).`),
    )
    return
  }
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(sbom, null, 2)}\n`)
  console.log(
    pico.green(`SBOM written to ${path.relative(process.cwd(), output)}.`),
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(
      pico.red(error instanceof Error ? error.message : String(error)),
    )
    process.exitCode = 1
  })
}
