/**
 * Build all public packages and link them to the local pnpm global store.
 *
 * Usage: pnpm run build-and-link
 *
 * Pipeline:
 *  1. Clean all dist folders
 *  2. Build rolldown packages (packages with buildOptions in package.json)
 *  3. Build tsup packages (create-zeus, zeus-ui)
 *  4. Build TypeScript declaration files
 *  5. Link all public packages globally via pnpm
 */

import {
  execFileSync,
  execSync,
  type ExecSyncOptions,
} from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import pico from 'picocolors'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = join(__dirname, '..')

/**
 * All public packages with their workspace paths.
 * Grouped by build system:
 *  - rolldown: packages built by `pnpm run build` (have buildOptions in package.json)
 *  - tsup: packages with their own tsup build script
 */
const PUBLIC_PACKAGES: Array<{ name: string; path: string }> = [
  // rolldown packages
  { name: '@zeus-js/shared', path: 'packages/core/shared' },
  { name: '@zeus-js/signal', path: 'packages/core/signal' },
  { name: '@zeus-js/runtime-dom', path: 'packages/core/runtime-dom' },
  { name: '@zeus-js/compiler', path: 'packages/core/compiler' },
  { name: '@zeus-js/zeus', path: 'packages/core/zeus' },
  { name: '@zeus-js/vite-plugin', path: 'packages/devtools/vite-plugin' },
  { name: '@zeus-js/bundler-plugin', path: 'packages/web-c/bundler-plugin' },
  {
    name: '@zeus-js/component-analyzer',
    path: 'packages/web-c/component-analyzer',
  },
  { name: '@zeus-js/component-dts', path: 'packages/web-c/component-dts' },
  { name: '@zeus-js/output-wc', path: 'packages/web-c/output-wc' },
  { name: '@zeus-js/output-icons', path: 'packages/web-c/output-icons' },
  { name: '@zeus-js/output-css', path: 'packages/web-c/output-css' },
  {
    name: '@zeus-js/output-react-wrapper',
    path: 'packages/web-c/output-react-wrapper',
  },
  {
    name: '@zeus-js/output-vue-wrapper',
    path: 'packages/web-c/output-vue-wrapper',
  },
  {
    name: '@zeus-js/preset-component-library',
    path: 'packages/web-c/preset-component-library',
  },
  { name: '@zeus-ui/registry', path: 'packages/create/registry' },
  // tsup packages (own build script)
  { name: 'create-zeus', path: 'packages/devtools/create-zeus' },
  { name: 'zeus-ui', path: 'packages/create/zeus-ui' },
]

// Packages that use tsup instead of rolldown
const TSUP_PACKAGES = new Set(['create-zeus', 'zeus-ui'])

function log(msg: string) {
  console.log(pico.cyan('[build-and-link] ') + msg)
}

function success(msg: string) {
  console.log(pico.green('[build-and-link] ') + msg)
}

function warn(msg: string) {
  console.log(pico.yellow('[build-and-link] ') + msg)
}

function error(msg: string) {
  console.error(pico.red('[build-and-link] ') + msg)
}

function execCmd(cmd: string, cwd: string = rootDir, label?: string) {
  log(`${label ? label + ': ' : ''}${cmd}`)
  try {
    const [file, ...args] = cmd.split(' ')
    execFileSync(file, args, { cwd, stdio: 'inherit' as const })
  } catch {
    error(`Command failed: ${cmd}`)
    process.exit(1)
  }
}

function cleanDists() {
  log('Cleaning dist folders...')
  let cleaned = 0
  for (const pkg of PUBLIC_PACKAGES) {
    const distPath = join(rootDir, pkg.path, 'dist')
    if (existsSync(distPath)) {
      rmSync(distPath, { recursive: true })
      cleaned++
    }
  }
  success(`Cleaned ${cleaned} dist folder(s)`)
}

function buildRolldownPackages() {
  log('Building rolldown packages...')
  execCmd('pnpm run build')
}

function buildTsupPackages() {
  log('Building tsup packages...')
  for (const pkg of PUBLIC_PACKAGES) {
    if (!TSUP_PACKAGES.has(pkg.name)) continue
    const pkgPath = join(rootDir, pkg.path)
    if (!existsSync(pkgPath)) {
      warn(`Package path not found: ${pkgPath}`)
      continue
    }
    execCmd('pnpm run build', pkgPath, pkg.name)
  }
}

function buildDts() {
  log('Building TypeScript declaration files...')
  execCmd('pnpm run build-dts')
}

function linkPackages() {
  log('Linking public packages globally...')

  // Get global pnpm store
  const globalDir = execSync('pnpm config get global-dir', {
    encoding: 'utf8',
  }).trim()

  for (const pkg of PUBLIC_PACKAGES) {
    const pkgFullPath = join(rootDir, pkg.path)
    if (!existsSync(pkgFullPath)) {
      warn(`Package path not found: ${pkgFullPath}, skipping link`)
      continue
    }

    log(`Linking ${pico.bold(pkg.name)} (${pkg.path})...`)
    try {
      execSync(
        `pnpm link --global-dir "${globalDir}" "${pkgFullPath}" --cwd "${rootDir}"`,
        {
          cwd: rootDir,
          stdio: 'pipe' as const,
          shell: true,
        } as unknown as ExecSyncOptions,
      )
    } catch {
      // Fallback: simple global link
      try {
        execSync(`pnpm link "${pkgFullPath}" --global`, {
          cwd: rootDir,
          stdio: 'pipe' as const,
          shell: true,
        } as unknown as ExecSyncOptions)
      } catch {
        warn(`Skipped linking ${pkg.name}`)
      }
    }
  }

  success('Linking complete.')
  console.log()
  log('Linked packages:')
  for (const pkg of PUBLIC_PACKAGES) {
    console.log(`  ${pico.green('+')} ${pico.bold(pkg.name)} (${pkg.path})`)
  }
}

function main() {
  console.log()
  log('='.repeat(60))
  log('Zeus - Build & Link All Public Packages')
  log('='.repeat(60))
  console.log()
  log(`Target packages (${PUBLIC_PACKAGES.length}):`)
  for (const pkg of PUBLIC_PACKAGES) {
    const builder = TSUP_PACKAGES.has(pkg.name) ? 'tsup' : 'rolldown'
    console.log(`  ${pico.gray(builder.padEnd(7))} ${pkg.name}`)
  }
  console.log()

  cleanDists()
  console.log()

  buildRolldownPackages()
  console.log()

  buildTsupPackages()
  console.log()

  buildDts()
  console.log()

  linkPackages()
  console.log()

  success('All public packages built and linked successfully!')
  console.log()
  log('You can now use these packages from any local project via:')
  log(`  ${pico.bold('pnpm add -w <package-name>')}`)
  log(
    `or by running ${pico.bold('pnpm link --global <package-path>')} in your project.`,
  )
  console.log()
}

main()
