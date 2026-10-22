import { createHash } from 'node:crypto'

export function verifyGoldenComponentManifest(
  content: string,
  packageName: string,
  expectedSha256: string,
): string {
  const manifest = JSON.parse(content) as {
    schemaVersion?: unknown
    components?: unknown
  } | null
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.components) ||
    manifest.components.length === 0
  ) {
    throw new Error(
      `${packageName} does not contain a valid Component Manifest v1`,
    )
  }
  if (
    !manifest.components.every(component => {
      const tag = (component as { tag?: unknown } | null)?.tag
      return typeof tag === 'string' && tag.startsWith('zw-')
    })
  ) {
    throw new Error(
      `${packageName} manifest contains an invalid custom-element tag`,
    )
  }
  const digest = createHash('sha256').update(content).digest('hex')
  if (digest !== expectedSha256) {
    throw new Error(
      `${packageName} Component Manifest differs from the frozen Golden contract`,
    )
  }
  return digest
}
