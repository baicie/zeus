import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

const EXPECTED_REPOSITORY_URL = 'https://github.com/baicie/zeus'

let hasError = false

for (const pkg of findWorkspacePackages()) {
  if (pkg.packageJson.private) continue
  if (!pkg.name.startsWith('@zeus-js/')) continue

  const repository = pkg.packageJson.repository as
    | { type?: string; url?: string; directory?: string }
    | undefined

  if (!repository?.url) {
    console.error(pico.red(`${pkg.name}: missing repository.url`))
    hasError = true
    continue
  }

  if (repository.url !== EXPECTED_REPOSITORY_URL) {
    console.error(
      pico.red(
        `${pkg.name}: repository.url must be ${EXPECTED_REPOSITORY_URL}, got ${repository.url}`,
      ),
    )
    hasError = true
  }
}

if (hasError) process.exit(1)

console.log(pico.green('Package repository metadata check passed.'))
