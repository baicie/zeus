import { defineConfig } from 'rollup'
import { zeusRollupPlugin } from '@zeus/compiler'

export default defineConfig([
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.mjs',
        format: 'es',
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
      },
    ],
    plugins: [zeusRollupPlugin()],
  },
])
