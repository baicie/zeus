/**
 * Bundles a Node server entry into one ESM file for the runtime image.
 *
 * The production images used to copy the whole pnpm workspace
 * (`node_modules` + `packages/`) into the runtime stage and start the server
 * through `tsx`, which put 500 MB of build tooling into every deployment and
 * made a cross-registry mirror take minutes. Both servers import nothing but
 * `node:*` builtins, so a single bundled file is equivalent and needs no
 * `node_modules` at all.
 *
 * `node:*` stays external: those are builtins, resolved by the runtime.
 * `import.meta.url` / `import.meta.dirname` are preserved by rolldown, and the
 * output keeps the same directory shape as the source (`<dir>/index.js` next
 * to `../dist`) so relative static-asset lookup still works.
 */
import path from 'node:path'
import { parseArgs } from 'node:util'

import { rolldown } from 'rolldown'

interface BundleOptions {
  readonly entry: string
  readonly outfile: string
}

export async function bundleServer(options: BundleOptions): Promise<void> {
  const bundle = await rolldown({
    input: path.resolve(options.entry),
    platform: 'node',
    // Builtins are provided by Node; never inline them.
    external: [/^node:/],
    resolve: {
      conditionNames: ['node', 'import', 'default'],
    },
  })
  try {
    await bundle.write({
      file: path.resolve(options.outfile),
      format: 'esm',
      sourcemap: false,
    })
  } finally {
    await bundle.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      entry: { type: 'string' },
      outfile: { type: 'string' },
    },
  })
  if (!values.entry || !values.outfile) {
    throw new Error('--entry and --outfile are required')
  }
  await bundleServer({ entry: values.entry, outfile: values.outfile })
  console.info(`bundled ${values.entry} -> ${values.outfile}`)
}
