import { rollup } from 'rollup'
import zeus from '@zeus-js/bundler-plugin/rollup'
import { componentLibrary } from '@zeus-js/web-c'

const bundle = await rollup({
  input: 'src/index.ts',
  external: id => /^(react|vue|@zeus-js\/)/.test(id) && !id.startsWith('zeus:'),
  plugins: [
    zeus({
      root: process.cwd(),
      transpile: true,
      dts: true,
      components: { include: ['src/component.tsx'] },
      plugins: componentLibrary({ styles: false }),
    }),
  ],
})
await bundle.write({ dir: 'dist', format: 'esm' })
await bundle.close()
