import type { ZeusBuildContext, ZeusOutputPlugin } from '../types'

export interface ManifestOutputOptions {
  fileName?: string
  pretty?: boolean
}

export default function manifestOutput(
  options: ManifestOutputOptions = {},
): ZeusOutputPlugin {
  const fileName = options.fileName ?? 'zeus.components.json'
  const pretty = options.pretty ?? true

  return {
    name: 'zeus-output-manifest',

    generateBundle(ctx: ZeusBuildContext) {
      return [
        {
          type: 'asset',
          fileName,
          source: JSON.stringify(ctx.manifest, null, pretty ? 2 : 0),
        },
      ]
    },
  }
}
