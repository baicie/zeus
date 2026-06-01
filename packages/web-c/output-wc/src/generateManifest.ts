import type { ComponentManifest } from '@zeus-js/component-analyzer'

export function generateZeusComponentsManifest(
  manifest: ComponentManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
