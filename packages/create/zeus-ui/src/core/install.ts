import { spawn, spawnSync } from 'node:child_process'

export async function detectPackageManager(): Promise<'pnpm' | 'yarn' | 'npm'> {
  try {
    const { execSync } = await import('node:child_process')
    if (!execSync('pnpm --version', { stdio: 'ignore' })) return 'pnpm'
  } catch {}
  try {
    const { execSync } = await import('node:child_process')
    if (!execSync('yarn --version', { stdio: 'ignore' })) return 'yarn'
  } catch {}
  return 'npm'
}

export async function installDependencies(
  deps: string[],
  options: {
    dev?: boolean
  } = {},
): Promise<void> {
  if (!deps.length) return

  const pm = await detectPackageManager()

  const args =
    pm === 'pnpm'
      ? ['add', options.dev ? '-D' : '', ...deps].filter(Boolean)
      : ['install', options.dev ? '--save-dev' : '', ...deps].filter(Boolean)

  const result = spawn(pm, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  return new Promise((resolve, reject) => {
    result.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Failed to install dependencies: ${deps.join(', ')}`))
      } else {
        resolve()
      }
    })
  })
}

export function installDependenciesSync(
  deps: string[],
  options: {
    dev?: boolean
  } = {},
): void {
  if (!deps.length) return

  const pm =
    spawnSync('pnpm', ['--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    }).status === 0
      ? 'pnpm'
      : 'npm'

  const args =
    pm === 'pnpm'
      ? ['add', options.dev ? '-D' : '', ...deps].filter(Boolean)
      : ['install', options.dev ? '--save-dev' : '', ...deps].filter(Boolean)

  const result = spawnSync(pm, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(`Failed to install dependencies: ${deps.join(', ')}`)
  }
}
