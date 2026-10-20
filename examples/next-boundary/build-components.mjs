import { rollup } from 'rollup'
import zeus from '@zeus-js/bundler-plugin/rollup'
import { componentLibrary } from '@zeus-js/web-c'

const bundle = await rollup({
  input: 'components/index.ts',
  external: id => /^(react|vue|@zeus-js\/)/.test(id),
  plugins: [
    zeus({
      root: process.cwd(),
      transpile: true,
      dts: true,
      components: { include: ['components/counter.tsx'] },
      plugins: componentLibrary({ targets: ['wc', 'react'], styles: false }),
    }),
  ],
})
try {
  await bundle.write({ dir: 'dist', format: 'esm' })
} finally {
  await bundle.close()
}
