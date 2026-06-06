import { reactOutputTarget } from '@stencil/react-output-target'
import { Config } from '@stencil/core'
import { vueOutputTarget } from '@stencil/vue-output-target'

export const config: Config = {
  namespace: 'stencilWrapperDemo',
  srcDir: 'src',
  outputTargets: [
    reactOutputTarget({
      outDir: './src/generated/react',
    }),
    vueOutputTarget({
      componentCorePackage: '@zeus-js/example-stencil-wrapper',
      includeImportCustomElements: true,
      proxiesFile: './src/generated/vue/components.ts',
    }),
    {
      type: 'dist-custom-elements',
      customElementsExportBehavior: 'single-export-module',
      externalRuntime: false,
    },
    {
      type: 'dist',
      esmLoaderPath: '../loader',
    },
    {
      type: 'docs-json',
      file: './src/generated/custom-elements.json',
    },
  ],
}
