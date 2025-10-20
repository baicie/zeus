// @ts-check
import { exec } from './utils.js'

exec('pnpm', ['build', 'zeus', '-f', 'global-runtime']).then(() => {
  const errors = []

  if (errors.length) {
    throw new Error(
      `Found the following treeshaking errors:\n\n- ${errors.join('\n\n- ')}`,
    )
  }
})
