# Bundler Plugin

The Vite plugin orchestrates component analysis and output generation as part of your build.

## Setup

```ts
import { defineConfig } from 'vite'
import zeus, { componentLibrary } from '@zeus-js/web-c/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
        exclude: ['src/components/**/*.test.{ts,tsx}'],
      },
      plugins: componentLibrary({ targets: ['wc', 'react'] }),
    }),
  ],
})
```

## Options

```ts
interface ZeusPluginOptions {
  /** Component source globs */
  components: {
    include: string | string[]
    exclude?: string | string[]
  }

  /** Output generators */
  plugins: ZeusComponentPlugin[]
}
```

## Outputs

The `componentLibrary()` preset receives the component manifest and generates:

- Web Component JS files
- React/Vue wrapper components
- CSS, manifest, and TypeScript declaration files

## Writing an output plugin

An output plugin is a plain object, so it can live in any package:

```ts
import type { ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

export default function acmeJsonOutput(): ZeusComponentPlugin {
  return {
    apiVersion: 1,
    name: 'acme-output-json',
    setup(ctx) {
      ctx.outputs.register('acme:json', {
        outDir: 'acme',
        fileName: tag => `${tag}.json`,
      })
    },
    generateBundle(ctx) {
      return ctx.manifest.components.map(component => ({
        type: 'asset',
        fileName: ctx.outputs.join(
          'acme:json',
          ctx.outputs.getFileName('acme:json', component.tag),
        ),
        source: JSON.stringify(component),
      }))
    },
  }
}
```

The contract:

- `apiVersion` must equal `ZEUS_PLUGIN_API_VERSION` (currently `1`); a plugin
  written for another version fails the build with `ZEUS_PLUGIN_API_VERSION`.
- Hooks run in phases, each over all plugins in the order of the `plugins`
  array: `setup`, `buildStart`, `virtualModules`, then `generateBundle`.
- Third-party output kinds are namespaced (`vendor:name`) and must set
  `outDir`; built-in kinds such as `wc` and `react` have default directories.
  An unknown kind fails with `ZEUS_OUTPUT_CONFIG`.
- Each output kind belongs to one plugin, and each emitted file to one plugin.
  A second registration of a kind, or two plugins emitting the same file name,
  fails with `ZEUS_OUTPUT_CONFLICT`.

## Compatibility and trust

The current contract is `apiVersion: 1`. The built-in host matrix is Vite 8,
Rollup 4, and Rolldown 1; generated files must be ordinary Rollup-compatible
chunks or assets. The repository's `thirdPartyOutput.spec.ts` loads an output
plugin from an external temporary package and verifies namespaced outputs,
conflicts, file ownership, and manifest access.

Output plugins execute as JavaScript in the build process with the same filesystem
and network privileges as the application build. Zeus namespaces output kinds
and detects file conflicts, but this is not a sandbox. Install only plugins whose
source and release provenance you trust. A plugin can read project files and run
arbitrary Node.js code, so package reviews and lockfile pinning remain required.

A committed, copyable package lives at
`examples/fixtures/third-party-output-plugin`. Its Rollup test imports the package
through its own `package.json#exports`, discovers a component through the public
analyzer manifest, and verifies the emitted original output kind and asset.

## Dev mode

In development, the plugin analyzes components on-the-fly and registers custom elements automatically. Output files are generated only on build.

## Manifest

During build, a `zeus.components.json` manifest is written to the output directory:

```bash
dist/zeus.components.json
```

This file contains the full component manifest and can be consumed by documentation generators, IDE plugins, or custom tooling.
