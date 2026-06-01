import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pico from 'picocolors'

export type MarkRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>
export type PackageFormat =
  | 'cjs'
  | 'esm-bundler'
  | 'global'
  | 'global-runtime'
  | 'esm-browser'
  | 'esm-bundler-runtime'
  | 'esm-browser-runtime'

const require = createRequire(import.meta.url)

export interface WorkspacePackage {
  name: string
  dir: string
  relativeDir: string
  shortName: string
  packageJson: Record<string, unknown>
}

const _rootDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

export function getRootDir(): string {
  return _rootDir
}

export function findWorkspacePackages(): WorkspacePackage[] {
  const results: WorkspacePackage[] = []
  const seen = new Set<string>()

  const addPackage = (dir: string, relativeDir: string): void => {
    const pkgJsonPath = path.resolve(dir, 'package.json')
    if (!fs.existsSync(pkgJsonPath) || seen.has(dir)) return

    try {
      const packageJson = require(pkgJsonPath) as Record<string, unknown>
      results.push({
        name: packageJson.name as string,
        dir,
        relativeDir,
        shortName: path.basename(dir),
        packageJson,
      })
      seen.add(dir)
    } catch (error) {
      throw Object.assign(
        new Error(`Failed to read workspace package: ${pkgJsonPath}`),
        { cause: error },
      )
    }
  }

  const scanRoot = (relativeRoot: string): void => {
    const rootPath = path.resolve(_rootDir, relativeRoot)
    if (!fs.existsSync(rootPath)) return

    addPackage(rootPath, relativeRoot)

    if (fs.existsSync(path.resolve(rootPath, 'package.json'))) return

    for (const name of fs.readdirSync(rootPath)) {
      const entryPath = path.resolve(rootPath, name)
      if (!fs.statSync(entryPath).isDirectory()) continue
      addPackage(entryPath, path.join(relativeRoot, name))
    }
  }

  scanRoot('packages/core')
  scanRoot('packages/devtools')
  scanRoot('packages/web-c')
  scanRoot('packages/create')
  scanRoot('benchmarks')
  scanRoot('examples')
  scanRoot('docs')

  return results
}

/**
 * Resolve the directory of a workspace package by its short name (e.g., "signal").
 */
export function resolvePackageDir(pkgShortName: string): string | null {
  const pkg = findWorkspacePackages().find(p => p.shortName === pkgShortName)
  return pkg?.dir ?? null
}

/**
 * Get all packages that have buildOptions (i.e., are buildable).
 */
export function getBuildablePackages(): WorkspacePackage[] {
  return findWorkspacePackages().filter(pkg => {
    return !pkg.packageJson.private && pkg.packageJson.buildOptions
  })
}

/**
 * Get all buildable package short names (for the build script targets).
 */
export const targets: string[] = (() => {
  return getBuildablePackages().map(p => p.shortName)
})()

export function fuzzyMatchTarget(
  partialTargets: ReadonlyArray<string>,
  includeAllMatching: boolean | undefined,
): string[] {
  const matched: string[] = []
  partialTargets.forEach(partialTarget => {
    for (const target of targets) {
      if (target.match(partialTarget)) {
        matched.push(target)
        if (!includeAllMatching) {
          break
        }
      }
    }
  })
  if (matched.length) {
    return matched
  } else {
    console.log()
    console.error(
      `  ${pico.white(pico.bgRed(' ERROR '))} ${pico.red(
        `Target ${pico.underline(partialTargets.toString())} not found!`,
      )}`,
    )
    console.log()
    process.exit(1)
  }
}

export async function exec(
  command: string,
  args: ReadonlyArray<string>,
  options: object,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32'
    const normalizedArgs = args.filter(Boolean)

    const spawnCommand = isWin ? 'cmd.exe' : command
    const spawnArgs = isWin
      ? ['/d', '/s', '/c', command, ...normalizedArgs]
      : normalizedArgs

    const _process = spawn(spawnCommand, spawnArgs, {
      stdio: [
        'ignore', // stdin
        'pipe', // stdout
        'pipe', // stderr
      ],
      ...options,
      shell: false,
    })

    const stderrChunks: Buffer[] = []
    const stdoutChunks: Buffer[] = []

    _process.stderr?.on('data', chunk => {
      stderrChunks.push(chunk)
    })

    _process.stdout?.on('data', chunk => {
      stdoutChunks.push(chunk)
    })

    _process.on('error', error => {
      reject(error)
    })

    _process.on('exit', code => {
      const ok = code === 0
      const stderr = Buffer.concat(stderrChunks).toString().trim()
      const stdout = Buffer.concat(stdoutChunks).toString().trim()

      if (ok) {
        const result = { ok, code, stderr, stdout }
        resolve(result)
      } else {
        reject(
          new Error(
            `Failed to execute command: ${command} ${normalizedArgs.join(
              ' ',
            )}: ${stderr || stdout}`,
          ),
        )
      }
    })
  })
}
